// SDL-UX-003: Preview-only Vue entry. No Supabase, Worker, R2 or authentication.
import { AppShell } from './components/AppShell.js';
import { ParentHome } from './components/ParentHome.js';
import { CoachHome } from './components/CoachHome.js';
import { LoginLanding } from './components/LoginLanding.js';
import { InviteOnboarding } from './components/InviteOnboarding.js';
import { PlayerHeroCard } from './components/PlayerHeroCard.js';
import { PrivateMediaPanel } from './components/PrivateMediaPanel.js';
import { StatsHub } from './components/StatsHub.js';
import { CoachTeamRoster } from './components/CoachTeamRoster.js';
import { DemoGrowthLab } from './components/DemoGrowthLab.js';
import { DEMO_GROWTH_SNAPSHOT } from './js/demoGrowthFixture.js';

const { createApp, ref, computed } = Vue;
const demoPlayers = Object.freeze([
  { id: 'demo-player-1', athlete_id: 'demo-athlete-1', preferred_name: 'Sample Player A', jersey: '12', position: 'SS / P', bats: 'R', throws: 'R' },
  { id: 'demo-player-2', athlete_id: 'demo-athlete-2', preferred_name: 'Sample Player B', jersey: '08', position: 'OF', bats: 'L', throws: 'R' }
]);
// The same fifteen fictional names and jerseys used by the staging fixture.
const demoRoster = Object.freeze(DEMO_GROWTH_SNAPSHOT.players.map((player, i) => ({
  id: 'demo-player-'+player.jersey,
  team_id: 'demo-team',
  team_name: 'Swallows Demo Team',
  preferred_name: player.name,
  jersey: player.jersey,
  position: ['SS','2B','P','C','CF','3B','LF','P','1B','RF','SS','C','2B','P','CF'][i],
  throws: i % 4 === 0 ? 'L' : 'R',
  bats: i % 3 === 0 ? 'L' : 'R',
  photo_url: '/assets/demo-players/'+player.jersey+'.svg'
})));

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

function previewMediaController() {
  const mediaPlayers = ref(demoRoster.map(p=>({id:p.id,label:p.preferred_name+' · Swallows Demo Team'})));
  const mediaPlayerId = ref(demoRoster[0].id);
  const mediaItems = ref([
    {id:'demo-clip-1',created_at:'2026-11-13T10:00:00Z',byte_size:8388608},
    {id:'demo-clip-2',created_at:'2026-11-11T10:00:00Z',byte_size:5242880}
  ]);
  const mediaReadAllowed = ref(true), mediaUploadAllowed = ref(false), mediaLoading = ref(false);
  const mediaUploading = ref(false), mediaPlaybackLoading = ref(false), mediaProgress = ref(0);
  const mediaError = ref(''), mediaNotice = ref('Design-only clip cards. Real playback requires signing in on SDL UX Live.');
  const mediaFile = ref(null), mediaPlaybackUrl = ref(''), mediaPlaybackId = ref('');
  const unavailable = () => { mediaNotice.value = 'Demo only. Use the authenticated SDL UX Live website for permitted videos.'; };
  return {
    mediaPlayers, mediaPlayerId, mediaItems, mediaReadAllowed, mediaUploadAllowed, mediaLoading,
    mediaUploading, mediaPlaybackLoading, mediaProgress, mediaError, mediaNotice,
    mediaFile, mediaPlaybackUrl, mediaPlaybackId,
    selectMediaPlayer(id) { if (mediaPlayers.value.some(p=>p.id===id)) {mediaPlayerId.value=id;unavailable();} },
    refreshMedia:unavailable, selectMediaFile:unavailable, uploadPrivateMedia:unavailable,
    playPrivateMedia:unavailable, analyzePrivateMedia:unavailable, reportPlaybackError:unavailable
  };
}

createApp({
  components: { AppShell, ParentHome, CoachHome, LoginLanding, InviteOnboarding, PlayerHeroCard, PrivateMediaPanel, StatsHub, CoachTeamRoster, DemoGrowthLab },
  setup() {
    // Safe, whitelisted review deep links. Query values cannot grant roles or
    // access any real data because this build has no backend connection.
    const reviewQuery = new URLSearchParams(window.location.search);
    const requestedScreen = reviewQuery.get('screen');
    const requestedTab = reviewQuery.get('tab');
    const screen = ref(['app','profile','login','invite'].includes(requestedScreen) ? requestedScreen : 'app');
    const role = ref(reviewQuery.get('role') === 'coach' ? 'coach' : 'family');
    const activeTab = ref(['home','team','stats','videos','me'].includes(requestedTab) ? requestedTab : 'home');
    const previewViews = Object.freeze([
      { id:'app', title:'Inside app' }, { id:'profile', title:'Player profile' }, { id:'login', title:'Login' }, { id:'invite', title:'Invitation' }
    ]);
    const version = window.SDL_UX_META?.commit?.slice(0, 8) || 'local';
    const branch = window.SDL_UX_META?.branch || 'local-preview';
    const loginController = previewAuthController();
    const invitationController = previewInviteController();
    const previewMediaControllerState = previewMediaController();
    const previewSelectedPlayer = ref(demoRoster[0]);
    const openPreviewProfile = player => {
      const allowed=demoRoster.find(p=>p.id===player?.id && p.team_id===player?.team_id);
      if (!allowed) return;
      previewSelectedPlayer.value=allowed;
      previewMediaControllerState.selectMediaPlayer(allowed.id);
      screen.value='profile';
    };
    // Fictional numbers on the explicitly labeled synthetic site.
    const previewFamilyStats = Object.freeze([
      { athlete_id: 'demo-athlete-1', name: 'Sample Player A', profiles: [
        { id: 'demo-player-1', clubLabel: 'Swallows Demo Team', jersey: '12',
          position: 'SS / P', statsAvailable: true, latestExitVelo: 74,
          latestThrowingVelo: 67, latestSprintTime: 4.2, sessionCount: 6 }
      ] },
      { athlete_id: 'demo-athlete-2', name: 'Sample Player B', profiles: [
        { id: 'demo-player-2', clubLabel: 'Swallows Demo Team', jersey: '08',
          position: 'OF', statsAvailable: false }
      ] }
    ]);
    const previewTranslate = key => ({
      throws:'Throws',bats:'Bats',officialName:'Official name',
      dob:'DOB',jumpRatioLabel:'Jump ratio',batSpec:'Bat specification',
      notSpecified:'Not specified'
    })[key] || key;
    const demoMeasurements = () => 'Synthetic example · 140 cm · 32 kg';
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
      demoPlayers, demoRoster, previewSelectedPlayer, openPreviewProfile, loginController, invitationController,
      previewMediaControllerState, previewFamilyStats, previewTranslate, demoMeasurements,
      reportOpen, issue, reportText, copyReport, copyNotice, manualReport
    };
  }
}).mount('#preview-app');
