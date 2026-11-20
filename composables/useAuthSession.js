// SDL-004-005: staging authentication/read-only workspace.
// Server RLS, not this client state, determines data access.
import { SUBMISSION_FEATURES_ENABLED, supabaseClient } from '../js/config.js';
const { ref, computed } = Vue;

export function useAuthSession({ onIdentityChange = () => {}, onAuthenticated = async () => {}, onInvitation=()=>{} } = {}) {
  const authReady = ref(false);
  const authUser = ref(null);
  const authError = ref('');
  const authNotice = ref('');
  const authBusy = ref(false);
  const authMethod = ref('email');
  const loginEmail = ref('');
  const loginPassword = ref('');
  const loginPhone = ref('');
  const loginOtpCode = ref('');
  const otpSent = ref(false);
  const inviteCode = ref('');
  const inviteEmail = ref('');
  const orgMemberships = ref([]);
  const teamMemberships = ref([]);
  const guardianLinks = ref([]);

  const isTeamCoach = computed(() => teamMemberships.value.some(m => m.role === 'coach' && m.status === 'active'));
  const isOrgAdmin = computed(() => orgMemberships.value.some(m => m.role === 'admin' && m.status === 'active'));
  const isVerifiedGuardian = computed(() => guardianLinks.value.some(m => m.status === 'verified'));
  const isParentOnly = computed(() => !isTeamCoach.value && !isOrgAdmin.value && isVerifiedGuardian.value);

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
    const previousId=authUser.value?.id;
    sessionVersion++;
    clearTimeout(refreshTimer);
    refreshTimer = null;
    authUser.value = null;
    orgMemberships.value = [];
    teamMemberships.value = [];
    guardianLinks.value = [];
    loginPassword.value = '';
    loginPhone.value = '';
    loginOtpCode.value = '';
    otpSent.value = false;
    inviteCode.value = '';
    inviteEmail.value = '';
    authError.value = '';
    authNotice.value = '';
    onIdentityChange({userId:previousId});
    return sessionVersion;
  }

  function setAuthMethod(method) {
    if (!['email', 'phone', 'otp', 'invite'].includes(method)) return;
    authMethod.value = method;
    authError.value = '';
    authNotice.value = '';
  }

  function requestPhoneOtp() {
    if (disposed || authBusy.value) return;
    authError.value = '';
    authNotice.value = '';
    const phone = loginPhone.value.trim();
    if (!/^\+?[0-9\s()-]{8,20}$/.test(phone)) {
      authError.value = 'Enter a valid mobile phone number including country code (e.g. +852 9000 0000).';
      return;
    }
    authNotice.value = 'Phone OTP sign-in awaits SMS/WhatsApp provider configuration and backend verification. Please use email and password during staging.';
  }

  function verifyOtpCode() {
    if (disposed || authBusy.value) return;
    authError.value = '';
    authNotice.value = '';
    const code = loginOtpCode.value.trim();
    if (!/^[0-9]{6}$/.test(code)) {
      authError.value = 'Enter the 6-digit verification code.';
      return;
    }
    authNotice.value = 'One-time code verification awaits backend OTP provider integration. Please sign in with email and password.';
  }

  function redeemInvitation() {
    if (disposed || authBusy.value) return;
    authError.value = '';
    authNotice.value = '';
    const code = inviteCode.value.trim();
    if (!code || code.length < 6) {
      authError.value = 'Enter a valid club invitation code provided by your team administrator.';
      return;
    }
    if(SUBMISSION_FEATURES_ENABLED){
      if(!/^[a-f0-9]{64}$/.test(code)){authError.value='Enter the complete secure invitation token from your club link.';return;}
      onInvitation(code);if(inviteEmail.value.trim())loginEmail.value=inviteEmail.value.trim();setAuthMethod('email');
      authNotice.value='Sign in with your invited verified email, then accept the invitation in the family workspace.';return;
    }
    authNotice.value = 'Invitation-based guardian onboarding awaits backend redemption endpoint (/v2/onboarding/invitations/redeem). Client-side parent-to-child linking is disabled for security.';
  }

  async function refreshIdentity(version,notify=true) {
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
      if(notify)await onAuthenticated();
    } catch (error) {
      if (current()) authError.value = error.message || 'Authentication could not be verified';
    } finally {
      if (current()) authReady.value = true;
    }
  }

  // Supabase emits SIGNED_IN when a tab regains focus, and TOKEN_REFRESHED as
  // tokens rotate. Neither event alone is a sign-out or an account switch.
  // No authorization is decided here: every data endpoint still checks the JWT.
  let pendingEventUserId = null;
  function handleAuthChange(event, session) {
    if (disposed) return;
    const incomingId = session?.user?.id || null;
    if (event === 'SIGNED_OUT' || !incomingId) {
      // A true sign-out is synchronous so stale private screens disappear now.
      pendingEventUserId = null;
      actionVersion++;
      authBusy.value = false;
      invalidateIdentity();
      authReady.value = true;
      return;
    }
    if (authUser.value?.id === incomingId && authReady.value && !authError.value) {
      // Keep the mounted roster, player selection, videos and loaded GPU state.
      // Same-user auth refresh is not evidence of a changed authorization grant.
      authUser.value = session.user;
      return;
    }
    if (pendingEventUserId === incomingId && !authUser.value && !authReady.value) {
      // Multiple initial notifications for the same pending identity coalesce.
      return;
    }
    actionVersion++;
    authBusy.value = false;
    const version = invalidateIdentity();
    pendingEventUserId = incomingId;
    authReady.value = false;
    // Avoid Supabase's auth lock: do not await a database request in this callback.
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshIdentity(version).finally(() => {
        if (version === sessionVersion) pendingEventUserId = null;
      });
    }, 0);
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

  async function registerEmail() {
    if(disposed||authBusy.value)return;
    if(!SUBMISSION_FEATURES_ENABLED){authNotice.value='Account registration awaits approved pilot deployment. Existing email sign-in remains available.';return;}
    const credentials={email:loginEmail.value.trim(),password:loginPassword.value};
    if(!credentials.email||credentials.password.length<12){authError.value='Enter your invited email and a password of at least 12 characters.';return;}
    const version=sessionVersion;authBusy.value=true;authError.value='';
    try{const {error}=await supabaseClient.auth.signUp(credentials);if(error)throw error;
      if(!disposed&&version===sessionVersion)authNotice.value='Check your email to confirm your account, then sign in and accept the club invitation.';
    }catch(error){if(!disposed&&version===sessionVersion)authError.value=error.message||'Registration failed';}
    finally{if(!disposed&&version===sessionVersion){loginPassword.value='';authBusy.value=false;}}
  }
  const reloadMemberships=()=>refreshIdentity(sessionVersion,false);

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
    authReady, authUser, authError, authNotice, authBusy,
    authMethod, setAuthMethod,
    loginEmail, loginPassword, loginPhone, loginOtpCode, otpSent,
    inviteCode, inviteEmail,
    requestPhoneOtp, verifyOtpCode, redeemInvitation,
    orgMemberships, teamMemberships, guardianLinks,
    isTeamCoach, isOrgAdmin, isVerifiedGuardian, isParentOnly,
    initializeAuth, signIn, signOut, registerEmail,reloadMemberships,
    captureIdentity, isCurrentIdentity, disposeAuth
  };
}
