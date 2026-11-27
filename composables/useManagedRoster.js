import { fetchManagedRoster } from '../js/accountContextService.js';

// All selectors derive from effective scopes, including CA's derived teams.
export function useManagedRoster({ auth, mode, load = fetchManagedRoster }) {
  const organizationId = Vue.ref(''), teamId = Vue.ref('');
  const rows = Vue.ref([]), nextAfter = Vue.ref(null), loading = Vue.ref(false);
  const error = Vue.ref(''), denied = Vue.ref(false);
  const role = Vue.computed(() => mode.value === 'admin' ? 'club_admin' : mode.value === 'manager' ? 'manager' : '');
  const organizations = Vue.computed(() => (auth.accountContext.value?.organizations || [])
    .filter(row => row.roles.includes(role.value)));
  const teams = Vue.computed(() => (auth.accountContext.value?.teams || [])
    .filter(row => row.organization_id === organizationId.value && row.roles.includes(role.value)));
  let generation = 0, request = null;
  function clear() {
    generation++;
    request?.abort(); request = null;
    rows.value = []; nextAfter.value = null; loading.value = false;
    error.value = ''; denied.value = false;
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
    if (!role.value || auth.authError.value || !organizationId.value ||
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
  return { role, organizations, teams, organizationId, teamId, rows, loading, error, denied, nextAfter,
    reset, clear, initialize, chooseOrganization, chooseTeam, fetchPage };
}
