// SDL-004-RBAC-07. Presentation data only; the database authorizes each request.
import { supabaseClient } from './config.js';

const ROLES = ['platform_admin', 'club_admin', 'manager', 'coach', 'guardian'];
const validId = value => typeof value === 'string' && value.length > 0;
const text = value => typeof value === 'string' ? value : '';
const invalid = () => new Error('Unexpected account or roster response. Refresh your account permissions.');
function roles(value) {
  if (!Array.isArray(value) || value.some(role => !ROLES.includes(role))) throw invalid();
  return [...new Set(value)];
}
function requireArray(value) {
  if (!Array.isArray(value)) throw invalid();
  return value;
}
async function rpc(client, name, args, signal) {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  let request = args === undefined ? client.rpc(name) : client.rpc(name, args);
  if (signal && typeof request.abortSignal === 'function') request = request.abortSignal(signal);
  const { data, error } = await request;
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (error) throw Object.assign(new Error(error.message || 'Authorized data is unavailable.'), {
    status: error.code === '42501' || error.status === 401 || error.status === 403 ? 403 : 503
  });
  return data;
}

export async function fetchAccountContext(userId, { client = supabaseClient, signal } = {}) {
  const data = await rpc(client, 'sdl_v5_account_context', undefined, signal);
  if (data?.version !== 1 || data.user_id !== userId || !validId(userId)) throw invalid();
  const accountRoles = roles(data.roles);
  const organizations = requireArray(data.organizations).map(row => {
    if (!validId(row?.id)) throw invalid();
    const scoped = roles(row.roles);
    if (!scoped.length || scoped.some(role => !accountRoles.includes(role))) throw invalid();
    return { id: row.id, name: text(row.name), roles: scoped };
  });
  const teams = requireArray(data.teams).map(row => {
    const org = organizations.find(org => org.id === row?.organization_id);
    if (!validId(row?.id) || !org) throw invalid();
    const scoped = roles(row.roles);
    if (!scoped.length || scoped.some(role => !org.roles.includes(role))) throw invalid();
    return { id: row.id, organization_id: org.id, name: text(row.name), roles: scoped };
  });
  if (new Set(organizations.map(row => row.id)).size !== organizations.length ||
      new Set(teams.map(row => row.id)).size !== teams.length) throw invalid();
  const membership = (rows, field) => requireArray(rows).map(row => {
    if (!validId(row?.[field]) || typeof row.role !== 'string') throw invalid();
    return { [field]: row[field], role: row.role, status: 'active' };
  });
  const direct = data.direct_memberships;
  if (!Number.isSafeInteger(direct?.guardian_links) || direct.guardian_links < 0) throw invalid();
  return {
    version: 1, user_id: userId, roles: accountRoles, organizations, teams,
    direct_memberships: { organizations: membership(direct.organizations, 'organization_id'),
      teams: membership(direct.teams, 'team_id'), guardian_links: direct.guardian_links },
    // The restricted frontend does not activate platform workspaces.
    platform: { view: data.platform?.view === true, export: data.platform?.export === true,
      sensitive_write: data.platform?.sensitive_write === true }
  };
}

export async function fetchManagedRoster(context, { role, organizationId, teamId = null, after = null, limit = 100 },
  { client = supabaseClient, signal } = {}) {
  // Only the newly approved CA/TM UI is connected here. No Platform Admin route.
  if (!['club_admin', 'manager'].includes(role) || !context?.roles?.includes(role) ||
      !context.organizations.some(row => row.id === organizationId && row.roles.includes(role))) throw invalid();
  const teams = context.teams.filter(row => row.organization_id === organizationId && row.roles.includes(role));
  if ((role === 'manager' && !teamId) || (teamId && !teams.some(row => row.id === teamId))) throw invalid();
  if ((after !== null && !validId(after)) || !Number.isInteger(limit) || limit < 1 || limit > 200) throw invalid();
  const data = await rpc(client, 'sdl_v5_authorized_roster', {
    p_role: role, p_organization: organizationId, p_team: teamId, p_after: after, p_limit: limit
  }, signal);
  if (data?.version !== 1 || data.role !== role || !Array.isArray(data.rows) || data.rows.length > limit) throw invalid();
  let previous = after;
  const rows = data.rows.map(row => {
    if (!validId(row?.id) || row.organization_id !== organizationId ||
        (previous && row.id <= previous)) throw invalid();
    previous = row.id;
    const teamIds = requireArray(row.team_ids);
    if (teamIds.some(id => !teams.some(team => team.id === id) || (teamId && id !== teamId)) ||
        (teamId && !teamIds.includes(teamId))) throw invalid();
    return { id: row.id, preferred_name: text(row.preferred_name), jersey: typeof row.jersey==='number' ? String(row.jersey) : text(row.jersey),
      position: text(row.position), throws: text(row.throws), bats: text(row.bats),
      organization_id: organizationId, team_ids: [...new Set(teamIds)],
      team_name: teams.filter(team => teamIds.includes(team.id)).map(team => team.name).join(', ') };
  });
  if (data.next_after !== null && (rows.length !== limit || !validId(data.next_after) ||
      data.next_after !== rows[rows.length - 1]?.id || data.next_after === after)) throw invalid();
  return { rows, nextAfter: data.next_after };
}
