// SDL-004-005: staging authentication/read-only workspace.
// Server RLS, not this client state, determines data access.
import { supabaseClient } from '../js/config.js';
const { ref, computed } = Vue;

export function useAuthSession({ onIdentityChange = () => {}, onAuthenticated = async () => {} } = {}) {
  const authReady = ref(false);
  const authUser = ref(null);
  const authError = ref('');
  const authBusy = ref(false);
  const loginEmail = ref('');
  const loginPassword = ref('');
  const orgMemberships = ref([]);
  const teamMemberships = ref([]);
  const guardianLinks = ref([]);

  const isTeamCoach = computed(() => teamMemberships.value.some(m => m.role === 'coach' && m.status === 'active'));
  const isVerifiedGuardian = computed(() => guardianLinks.value.some(m => m.status === 'verified'));

  // Every session transition invalidates work started by the previous session,
  // even when a user signs out and back in with the same account.
  let sessionVersion = 0;
  let actionVersion = 0;
  let refreshTimer = null;
  let subscription = null;
  let disposed = false;

  const captureIdentity = () => ({ version: sessionVersion, userId: authUser.value?.id });
  const isCurrentIdentity = identity => !disposed && Boolean(identity.userId) &&
    identity.version === sessionVersion && identity.userId === authUser.value?.id;

  function invalidateIdentity() {
    sessionVersion++;
    clearTimeout(refreshTimer);
    refreshTimer = null;
    authUser.value = null;
    orgMemberships.value = [];
    teamMemberships.value = [];
    guardianLinks.value = [];
    loginPassword.value = '';
    authError.value = '';
    onIdentityChange();
    return sessionVersion;
  }

  async function refreshIdentity(version) {
    const current = () => !disposed && version === sessionVersion;
    try {
      // getUser verifies the JWT with the authentication server.
      const { data, error } = await supabaseClient.auth.getUser();
      if (!current() || error || !data?.user) return;
      const results = await Promise.all([
        supabaseClient.from('organization_memberships').select('organization_id, role, status'),
        supabaseClient.from('team_memberships').select('team_id, role, status'),
        supabaseClient.from('athlete_guardians').select('athlete_id, relationship, status')
      ]);
      if (!current()) return;
      authUser.value = data.user;
      const failure = results.find(r => r.error);
      if (failure) authError.value = failure.error.message;
      else {
        orgMemberships.value = results[0].data || [];
        teamMemberships.value = results[1].data || [];
        guardianLinks.value = results[2].data || [];
      }
      authReady.value = true;
      await onAuthenticated();
    } catch (error) {
      if (current()) authError.value = error.message || 'Authentication could not be verified';
    } finally {
      if (current()) authReady.value = true;
    }
  }

  function handleAuthChange(_event, session) {
    if (disposed) return;
    actionVersion++;
    authBusy.value = false;
    const version = invalidateIdentity();
    authReady.value = !session;
    if (session) {
      // Supabase invokes auth listeners while holding its auth lock. Never await
      // getUser or another Supabase request inside the listener itself.
      refreshTimer = setTimeout(() => { refreshTimer = null; void refreshIdentity(version); }, 0);
    }
  }

  async function initializeAuth() {
    if (disposed) return;
    if (!subscription) {
      subscription = supabaseClient.auth.onAuthStateChange(handleAuthChange).data.subscription;
    }
    authReady.value = false;
    await refreshIdentity(invalidateIdentity());
  }

  async function signIn() {
    if (disposed) return;
    const credentials = { email: loginEmail.value.trim(), password: loginPassword.value };
    const action = ++actionVersion;
    const version = invalidateIdentity();
    authBusy.value = true;
    authReady.value = false;
    try {
      const { error } = await supabaseClient.auth.signInWithPassword(credentials);
      if (version !== sessionVersion || disposed) return;
      if (error) throw error;
      // Normally SIGNED_IN schedules verification. This also supports clients
      // that do not emit an event when an existing session is reused.
      await refreshIdentity(version);
      if (version === sessionVersion && !authUser.value) throw new Error('Could not verify the signed-in user');
    } catch (error) {
      if (version === sessionVersion && !disposed) authError.value = error.message || 'Sign-in failed';
    } finally {
      if (action === actionVersion) authBusy.value = false;
      if (version === sessionVersion && !disposed) authReady.value = true;
    }
  }

  async function signOut() {
    if (disposed) return;
    const action = ++actionVersion;
    invalidateIdentity();
    const version = sessionVersion;
    authReady.value = true;
    authBusy.value = true;
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
    } catch (error) {
      if (!disposed && version === sessionVersion) authError.value = error.message || 'Sign-out failed';
    } finally {
      if (action === actionVersion) authBusy.value = false;
    }
  }

  function disposeAuth() {
    disposed = true;
    actionVersion++;
    authBusy.value = false;
    invalidateIdentity();
    subscription?.unsubscribe();
    subscription = null;
  }

  return {
    authReady, authUser, authError, authBusy, loginEmail, loginPassword,
    orgMemberships, teamMemberships, guardianLinks,
    isTeamCoach, isVerifiedGuardian, initializeAuth, signIn, signOut,
    captureIdentity, isCurrentIdentity, disposeAuth
  };
}
