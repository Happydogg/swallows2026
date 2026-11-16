// SDL-004-005: staging authentication/read-only workspace.
// Server RLS, not this client state, determines data access.
import { supabaseClient } from '../js/config.js';
const { ref, computed } = Vue;

export function useAuthSession() {
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

  async function refreshIdentity() {
    // getUser verifies the JWT with the authentication server.
    const { data, error } = await supabaseClient.auth.getUser();
    if (error || !data?.user) {
      authUser.value = null;
      orgMemberships.value = [];
      teamMemberships.value = [];
      guardianLinks.value = [];
      return;
    }
    authUser.value = data.user;
    const results = await Promise.all([
      supabaseClient.from('organization_memberships').select('organization_id, role, status'),
      supabaseClient.from('team_memberships').select('team_id, role, status'),
      supabaseClient.from('athlete_guardians').select('athlete_id, relationship, status')
    ]);
    const failure = results.find(r => r.error);
    if (failure) {
      authError.value = failure.error.message;
      orgMemberships.value = [];
      teamMemberships.value = [];
      guardianLinks.value = [];
      return;
    }
    orgMemberships.value = results[0].data || [];
    teamMemberships.value = results[1].data || [];
    guardianLinks.value = results[2].data || [];
  }

  async function initializeAuth() {
    authReady.value = false;
    try { await refreshIdentity(); }
    catch (error) { authError.value = error.message || 'Authentication could not be verified'; }
    finally { authReady.value = true; }
  }

  async function signIn() {
    authError.value = '';
    authBusy.value = true;
    try {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: loginEmail.value.trim(), password: loginPassword.value
      });
      if (error) throw error;
      loginPassword.value = '';
      await refreshIdentity();
      if (!authUser.value) throw new Error('Could not verify the signed-in user');
    } catch (error) {
      authError.value = error.message || 'Sign-in failed';
    } finally { authBusy.value = false; authReady.value = true; }
  }

  async function signOut() {
    authError.value = '';
    authBusy.value = true;
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      authUser.value = null;
      orgMemberships.value = [];
      teamMemberships.value = [];
      guardianLinks.value = [];
    } catch (error) { authError.value = error.message || 'Sign-out failed'; }
    finally { authBusy.value = false; }
  }

  return {
    authReady, authUser, authError, authBusy, loginEmail, loginPassword,
    orgMemberships, teamMemberships, guardianLinks,
    isTeamCoach, isVerifiedGuardian, initializeAuth, signIn, signOut
  };
}
