import { fetchManagedRoster } from '../js/accountContextService.js';
import { createManagedRosterAdminService } from '../js/managedRosterAdminService.js';

// All selectors derive from effective server scopes, including CA's derived teams.
export function useManagedRoster({ auth, mode, load = fetchManagedRoster,
  adminService = createManagedRosterAdminService({auth}), onUpdated = () => {},
  createRequestId = () => globalThis.crypto?.randomUUID?.() } = {}) {
  const organizationId = Vue.ref(''), teamId = Vue.ref('');
  const rows = Vue.ref([]), nextAfter = Vue.ref(null), loading = Vue.ref(false);
  const error = Vue.ref(''), denied = Vue.ref(false);
  const writeBusy = Vue.ref(false), writeError = Vue.ref(''), writeNotice = Vue.ref('');
  const registrationOpen = Vue.ref(false);
  const registration = Vue.ref({ teamId:'', name:'', jersey:'', reason:'', requestKey:'' });
  const pendingChange = Vue.ref(null);
  const role = Vue.computed(() => mode.value === 'admin' ? 'club_admin' : mode.value === 'manager' ? 'manager' : '');
  const organizations = Vue.computed(() => (auth.accountContext.value?.organizations || [])
    .filter(row => row.roles.includes(role.value)));
  const teams = Vue.computed(() => (auth.accountContext.value?.teams || [])
    .filter(row => row.organization_id === organizationId.value && row.roles.includes(role.value)));
  let generation = 0, request = null, writeRequest = null;
  function clear() {
    generation++;
    request?.abort(); request = null;
    writeRequest?.abort(); writeRequest = null;
    rows.value = []; nextAfter.value = null; loading.value = false;
    error.value = ''; denied.value = false;
    writeBusy.value = false; writeError.value = ''; writeNotice.value = '';
    registrationOpen.value = false;
    registration.value = { teamId:'', name:'', jersey:'', reason:'', requestKey:'' };
    pendingChange.value = null;
  }
  function reset() { clear(); organizationId.value = ''; teamId.value = ''; }
  function chooseOrganization(id) {
    if (!organizations.value.some(row => row.id === id)) return false;
    clear(); organizationId.value = id;
    teamId.value = role.value === 'manager' ? (teams.value[0]?.id || '') : '';
    return true;
  }
  function chooseTeam(id) {
    if (!(role.value === 'club_admin' && id === '') && !teams.value.some(row => row.id === id)) return false;
    clear(); teamId.value = id;
    return true;
  }
  function initialize() {
    reset();
    if (organizations.value.length) chooseOrganization(organizations.value[0].id);
  }
  async function fetchPage(append = false) {
    if (!role.value || auth.authError.value || !organizationId.value || writeBusy.value ||
        (role.value === 'manager' && !teamId.value) || loading.value ||
        (append && !nextAfter.value)) return;
    if (!append) clear();
    const identity = auth.captureIdentity(), revision = generation;
    const args = { role: role.value, organizationId: organizationId.value, teamId: teamId.value || null,
      after: append ? nextAfter.value : null };
    const controller = new AbortController(); request = controller;
    const current = () => revision === generation && request === controller && auth.isCurrentIdentity(identity) && role.value === args.role;
    loading.value = true; error.value = ''; denied.value = false;
    try {
      const page = await load(auth.accountContext.value, args, { signal: controller.signal });
      if (!current()) return;
      const prior = new Set(rows.value.map(row => row.id));
      if (append && page.rows.some(row => prior.has(row.id))) throw new Error('Roster changed; refresh your selected scope.');
      rows.value = append ? [...rows.value, ...page.rows] : page.rows;
      nextAfter.value = page.nextAfter;
    } catch (cause) {
      if (!current()) return;
      rows.value = []; nextAfter.value = null;
      denied.value = cause.status === 403;
      error.value = denied.value ? 'Access is no longer available. Refresh account permissions.' : 'Could not load the authorized roster. Please retry.';
      if (denied.value) { organizationId.value = ''; teamId.value = ''; }
    } finally {
      if (current()) { loading.value = false; request = null; }
    }
  }
  function openRegistration() {
    if (loading.value || writeBusy.value || denied.value || !teams.value.length) return false;
    const requestKey = createRequestId();
    if (!requestKey) { writeError.value = 'This browser cannot safely create a unique registration request.'; return false; }
    writeError.value = ''; writeNotice.value = ''; pendingChange.value = null;
    registration.value = { teamId: role.value === 'manager' ? teamId.value :
      (teams.value.length === 1 ? teams.value[0].id : ''),
      name:'', jersey:'', reason:'', requestKey };
    registrationOpen.value = true;
    return true;
  }
  function cancelRegistration() {
    if (writeBusy.value) return;
    registrationOpen.value = false;
    registration.value = { teamId:'', name:'', jersey:'', reason:'', requestKey:'' };
    writeError.value = '';
  }
  function prepareRosterChange(row, targetTeamId) {
    if (loading.value || writeBusy.value || denied.value || !row ||
        !rows.value.some(existing => existing.id === row.id) ||
        !teams.value.some(team => team.id === targetTeamId)) return false;
    const add = !row.team_ids.includes(targetTeamId);
    if (role.value === 'manager' && add) return false; // No cross-team discovery for Managers.
    cancelRegistration();
    const team = teams.value.find(team => team.id === targetTeamId);
    pendingChange.value = { playerId:row.id, playerName:row.preferred_name || 'Player',
      teamId:targetTeamId, teamName:team.name, add, reason:'' };
    return true;
  }
  function cancelRosterChange() {
    if (!writeBusy.value) { pendingChange.value = null; writeError.value = ''; }
  }
  async function runWrite(action, success) {
    if (!role.value || !organizationId.value || auth.authError.value ||
        denied.value || loading.value || writeBusy.value) return false;
    const identity = auth.captureIdentity(), revision = generation;
    const scoped = { role:role.value, organizationId:organizationId.value, teamId:teamId.value };
    const controller = new AbortController(); writeRequest = controller;
    const current = () => revision === generation && writeRequest === controller &&
      auth.isCurrentIdentity(identity) && role.value === scoped.role &&
      organizationId.value === scoped.organizationId && teamId.value === scoped.teamId;
    writeBusy.value = true; writeError.value = ''; writeNotice.value = '';
    try {
      await action({ signal:controller.signal });
      if (!current()) return false;
      writeRequest = null; writeBusy.value = false;
      registrationOpen.value = false; pendingChange.value = null;
      onUpdated();
      await fetchPage();
      if (auth.isCurrentIdentity(identity) && role.value === scoped.role &&
          organizationId.value === scoped.organizationId && teamId.value === scoped.teamId) {
        if (!error.value) writeNotice.value = success;
        else writeError.value = 'The change was submitted, but the roster could not be refreshed. Refresh before continuing.';
      }
      return true;
    } catch (cause) {
      if (!current()) return false;
      if (cause.name === 'AbortError') return false;
      if (cause.status === 401 || cause.status === 403) {
        clear();
        denied.value = true;
        organizationId.value = ''; teamId.value = '';
        error.value = 'Roster permission changed. Refresh account permissions.';
        return false;
      }
      writeError.value = cause.message || 'Roster update could not be confirmed. Refresh before retrying.';
      if (cause.status === 409) pendingChange.value = null;
      return false;
    } finally {
      if (writeRequest === controller) { writeRequest = null; writeBusy.value = false; }
    }
  }
  async function registerPlayer() {
    if (!registrationOpen.value) return false;
    const entry = { ...registration.value };
    const args = { role:role.value, organizationId:organizationId.value, teamId:entry.teamId,
      name:entry.name, jersey:entry.jersey, reason:entry.reason, requestKey:entry.requestKey };
    return runWrite(options => adminService.registerPlayer(args, options), 'Player registered in the selected team.');
  }
  async function commitRosterChange() {
    const pending = pendingChange.value;
    if (!pending) return false;
    const args = { role:role.value, organizationId:organizationId.value, teamId:pending.teamId,
      playerId:pending.playerId, add:pending.add, reason:pending.reason, rows:rows.value };
    return runWrite(options => adminService.setRoster(args, options),
      pending.add ? 'Player assigned to the selected team.' : 'Team assignment ended; player history preserved.');
  }
  return { role, organizations, teams, organizationId, teamId, rows, loading, error, denied, nextAfter,
    writeBusy, writeError, writeNotice, registrationOpen, registration, pendingChange,
    reset, clear, initialize, chooseOrganization, chooseTeam, fetchPage,
    openRegistration, cancelRegistration, registerPlayer,
    prepareRosterChange, cancelRosterChange, commitRosterChange };
}
