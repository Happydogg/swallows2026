// SDL-UX-002-ADMIN-01: scoped roster writes. The server is the authorization boundary.
// Do not use direct player-table CRUD or the disabled pilot/media gate.
import { supabaseClient } from './config.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const inputError = message => Object.assign(new Error(message), { status: 400 });
const scopeError = () => Object.assign(new Error('The selected scope does not permit this action.'), { status: 403 });
const cancelled = () => new DOMException('Account or scope changed.', 'AbortError');
const safeString = value => typeof value === 'string' ? value.trim() : '';

export function createManagedRosterAdminService({ auth, client = supabaseClient } = {}) {
  const authorizeScope = ({ role, organizationId, teamId }) => {
    const context = auth?.accountContext?.value;
    if (!context || !['club_admin', 'manager'].includes(role) ||
        !context.roles?.includes(role) ||
        !context.organizations?.some(org => org.id === organizationId && org.roles.includes(role)) ||
        !context.teams?.some(team => team.id === teamId && team.organization_id === organizationId &&
          team.roles.includes(role))) throw scopeError();
  };
  const checkReason = value => {
    const reason = safeString(value);
    if (reason.length < 1 || reason.length > 500) throw inputError('Enter a reason of up to 500 characters.');
    return reason;
  };
  const rpc = async (name, args, signal) => {
    const identity = auth.captureIdentity();
    if (signal?.aborted || !auth.isCurrentIdentity(identity)) throw cancelled();
    let request = client.rpc(name, args);
    if (signal && typeof request.abortSignal === 'function') request = request.abortSignal(signal);
    const { data, error } = await request;
    if (signal?.aborted || !auth.isCurrentIdentity(identity)) throw cancelled();
    if (error) {
      const status = ({ '42501':403, PGRST301:401, PT409:409, '22023':400 })[error.code] ||
        (error.status === 401 || error.status === 403 || error.status === 409 ? error.status : 503);
      const message = ({
        401:'Your session must be verified again.',
        403:'This account no longer has permission for the selected roster.',
        409:'The roster changed. Refresh it before making another change.',
        400:'The submitted roster information is invalid.'
      })[status] || 'The roster change could not be confirmed. Refresh before retrying.';
      throw Object.assign(new Error(message), { status });
    }
    return data;
  };
  const registerPlayer = async ({ role, organizationId, teamId, name, jersey, requestKey, reason }, options = {}) => {
    authorizeScope({ role, organizationId, teamId });
    const preferredName = safeString(name), number = safeString(jersey);
    if (preferredName.length < 1 || preferredName.length > 120) throw inputError('Enter a player name of up to 120 characters.');
    if (!/^[0-9]{1,2}$/.test(number)) throw inputError('Enter a one- or two-digit jersey number.');
    if (!UUID.test(requestKey || '')) throw inputError('A valid registration request key is required.');
    const result = await rpc('sdl_v5_register_player', {
      p_team: teamId, p_name: preferredName, p_jersey: number,
      p_request: requestKey, p_reason: checkReason(reason)
    }, options.signal);
    if (!UUID.test(result || '')) throw new Error('Unexpected registration response. Refresh the roster.');
    return result;
  };
  const setRoster = async ({ role, organizationId, teamId, playerId, add, reason, rows }, options = {}) => {
    authorizeScope({ role, organizationId, teamId });
    const player = (rows || []).find(row => row.id === playerId && row.organization_id === organizationId);
    if (!player || !UUID.test(playerId || '') || typeof add !== 'boolean') throw scopeError();
    const assigned = player.team_ids?.includes(teamId) === true;
    if (assigned === add) throw Object.assign(new Error('Roster state changed. Refresh before continuing.'), { status: 409 });
    // Managers only discover existing assigned-team players. Another-team additions
    // need a separately authorized discovery workflow, not an inferred player ID.
    if (role === 'manager' && add) throw scopeError();
    return rpc('sdl_v5_set_roster', {
      p_player: playerId, p_team: teamId, p_add: add, p_reason: checkReason(reason)
    }, options.signal);
  };
  return { registerPlayer, setRoster };
}
