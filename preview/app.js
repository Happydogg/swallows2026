// SDL-UX-003: Preview-only Vue entry. No Supabase, Worker, R2 or authentication.
import { AppShell } from './components/AppShell.js';
import { ParentHome } from './components/ParentHome.js';
import { CoachHome } from './components/CoachHome.js';
import { LoginLanding } from './components/LoginLanding.js';
import { InviteOnboarding } from './components/InviteOnboarding.js';

const { createApp, ref, computed } = Vue;
const demoPlayers = Object.freeze([
  { id: 'demo-player-1', athlete_id: 'demo-athlete-1', preferred_name: 'Sample Player A', jersey: '12', position: 'SS / P', bats: 'R', throws: 'R' },
  { id: 'demo-player-2', athlete_id: 'demo-athlete-2', preferred_name: 'Sample Player B', jersey: '08', position: 'OF', bats: 'L', throws: 'R' }
]);
const demoRoster = Object.freeze([
  { id: 'demo-player-1', team_id: 'demo-team', team_name: 'Swallows Demo Team', preferred_name: 'Sample Player A', jersey: '12', position: 'SS / P', bats: 'R', throws: 'R' },
  { id: 'demo-player-2', team_id: 'demo-team', team_name: 'Swallows Demo Team', preferred_name: 'Sample Player B', jersey: '08', position: 'OF', bats: 'L', throws: 'R' },
  { id: 'demo-player-3', team_id: 'demo-team', team_name: 'Swallows Demo Team', preferred_name: 'Sample Player C', jersey: '21', position: 'C', bats: 'R', throws: 'R' },
  { id: 'demo-player-4', team_id: 'demo-team', team_name: 'Swallows Demo Team', preferred_name: 'Sample Player D', jersey: '05', position: '3B', bats: 'L', throws: 'L' }
]);

function previewAuthController() {
  const c = {
    authMethod: ref('email'), loginEmail: ref(''), loginPassword: ref(''),
    loginPhone: ref(''), loginOtpCode: ref(''), inviteCode: ref(''), inviteEmail: ref(''),
    authBusy: ref(false), authError: ref(''), authNotice: ref('')
  };
  c.setAuthMethod = method => {
    if (!['email', 'invite', 'phone', 'otp'].includes(method)) return;
    c.authMethod.value = method;
    c.authError.value = '';
    c.authNotice.value = '';
  };
  const unavailable = () => { c.authNotice.value = 'Design preview only. Real authentication and invitation services are not connected.'; };
  c.signIn = unavailable;
  c.registerEmail = unavailable;
  c.redeemInvitation = unavailable;
  c.requestPhoneOtp = unavailable;
  c.verifyOtpCode = unavailable;
  return c;
}

function previewInviteController() {
  return {
    enabled: false, busy: ref(false), error: ref(''), notice: ref(''),
    redemptionToken: ref(''), redeem() {}
  };
}

createApp({
  components: { AppShell, ParentHome, CoachHome, LoginLanding, InviteOnboarding },
  setup() {
    const screen = ref('app');
    const role = ref('family');
    const activeTab = ref('home');
    const previewViews = Object.freeze([
      { id:'app', title:'Inside app' }, { id:'login', title:'Login' }, { id:'invite', title:'Invitation' }
    ]);
    const version = window.SDL_UX_META?.commit?.slice(0, 8) || 'local';
    const branch = window.SDL_UX_META?.branch || 'local-preview';
    const loginController = previewAuthController();
    const invitationController = previewInviteController();
    const tabTitle = computed(() => ({
      home:'Home', team:'Team and Clubhouse', stats:'Stats and Progress',
      videos:'Videos', me:'My Account'
    })[activeTab.value] || 'Review');
    const reportOpen = ref(false);
    const issue = ref('');
    const copyNotice = ref('');
    const manualReport = ref(false);
    const reportText = computed(() => [
      'SDL-UX-003 | Mobile preview feedback',
      'Version: '+version,
      'Branch: '+branch,
      'Screen: '+screen.value,
      'Role: '+role.value,
      'Tab: '+activeTab.value,
      'Viewport: '+window.innerWidth+'x'+window.innerHeight,
      'Issue: '+(issue.value.trim() || '(describe the problem)'),
      'Expected:',
      'Actual:',
      'Screenshot: attach in ChatGPT separately',
      'Note: Synthetic-data design preview only'
    ].join('\n'));
    async function copyReport() {
      copyNotice.value = '';
      manualReport.value = false;
      try {
        if (!navigator.clipboard?.writeText) throw Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(reportText.value);
        copyNotice.value = 'Copied! Paste into the SDL chat and add your screenshot.';
      } catch {
        manualReport.value = true;
        copyNotice.value = 'Copy the report from the text field below and paste into the SDL chat.';
      }
    }
    return {
      previewViews, screen, role, activeTab, tabTitle, version, branch,
      demoPlayers, demoRoster, loginController, invitationController,
      reportOpen, issue, reportText, copyReport, copyNotice, manualReport
    };
  }
}).mount('#preview-app');
