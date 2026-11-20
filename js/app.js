import {createPilotWorkflowService} from './pilotWorkflowService.js';
import {usePilotWorkspace} from '../composables/usePilotWorkspace.js';
import {PilotWorkspace} from '../components/PilotWorkspace.js';
import {PerformanceInbox} from '../components/PerformanceInbox.js';
// SDL-003: lightweight Vue application coordinator (no bundler required).
// Feature state/commands live in composables, UI in components, I/O in services.
import { translations } from './translations.js';
import { clearPlayerChart } from './chartManager.js';
import { formatImgUrl } from './mediaStorage.js';
import { fetchAllCloudData, fetchVerifiedGuardianPlayers } from './supabaseService.js';
import { fetchCoachRoster } from './coachRosterService.js';
import { createArAnalyzerController } from './arAnalyzer.js';
import { compareJerseys } from '../utils/jerseyUtils.js';
import { useCoachMode } from '../composables/useCoachMode.js';
import { useAuthSession } from '../composables/useAuthSession.js';
import { usePlayers } from '../composables/usePlayers.js';
import { useSessions } from '../composables/useSessions.js';
import { useEnrollmentAdmin } from '../composables/useEnrollmentAdmin.js';
import { ClubEnrollmentAdmin } from '../components/ClubEnrollmentAdmin.js';
import { useSubmissionWorkspace } from '../composables/useSubmissionWorkspace.js';
import { SubmissionWorkspace } from '../components/SubmissionWorkspace.js';
import { usePrivateMedia } from '../composables/usePrivateMedia.js';
import { PrivateMediaPanel } from '../components/PrivateMediaPanel.js';
import { useVideos } from '../composables/useVideos.js';
import { useAnalytics } from '../composables/useAnalytics.js';
import { useRosterCsv } from '../composables/useRosterCsv.js';
import { LoginLanding } from '../components/LoginLanding.js';
import { AppShell } from '../components/AppShell.js';
import { CoachHome } from '../components/CoachHome.js';
import { ParentHome } from '../components/ParentHome.js';
import { StagingDataBrowser } from '../components/StagingDataBrowser.js';
import { InviteOnboarding } from '../components/InviteOnboarding.js';
import { AppHeader } from '../components/AppHeader.js';
import { TeamOverview } from '../components/TeamOverview.js';
import { CoachTeamRoster } from '../components/CoachTeamRoster.js';
import { PlayerFormModal } from '../components/PlayerFormModal.js';
import { PlayerProfile } from '../components/PlayerProfile.js';
import { SessionFormModal } from '../components/SessionFormModal.js';
import { UploadVideoModal } from '../components/UploadVideoModal.js';
import { ArAnalyzerModal } from '../components/ArAnalyzerModal.js';

const { createApp, ref, onMounted, onUnmounted, markRaw, computed } = Vue;

createApp({
  components: {
    PilotWorkspace, PerformanceInbox, LoginLanding, AppShell, CoachHome, ParentHome, StagingDataBrowser, InviteOnboarding, AppHeader, TeamOverview, CoachTeamRoster, PlayerFormModal, PlayerProfile, PrivateMediaPanel, SubmissionWorkspace, ClubEnrollmentAdmin,
    SessionFormModal, UploadVideoModal, ArAnalyzerModal
  },
  setup() {
    const savedLang = localStorage.getItem('swallows_lang');
    const browserLang = (navigator.language || navigator.userLanguage || 'en').substring(0, 2).toLowerCase();
    const currentLang = ref(savedLang && translations[savedLang] ? savedLang : (translations[browserLang] ? browserLang : 'en'));
    const t = key => translations[currentLang.value]?.[key] || translations.en[key] || key;
    const loading = ref(true);
    const isSaving = ref(false);
    const currentView = ref('overview');
    const overviewTab = ref('roster');
    const activeTab = ref('home');
    const requestedWorkspace = ref('auto');
    const searchQuery = ref('');
    const selectedPlayer = ref(null);
    const players = ref([]);
    const sessions = ref([]);
    const drillVideos = ref([]);
    const guardianProfileId=ref(''),guardianProfileSessions=ref([]);
    const analyticsSessions=computed(()=>currentView.value==='player'&&guardianProfileId.value===selectedPlayer.value?.id?guardianProfileSessions.value:sessions.value);
    const coachRoster = ref([]);
    const coachRosterLoading = ref(false);
    const coachRosterError = ref('');

    let initialInvitation='';
    const pendingInvitation=ref(false);
    const auth = useAuthSession({
      onInvitation:token=>{initialInvitation=token;},
      onIdentityChange: previous => {if(previous?.userId)initialInvitation='';clearSensitiveState();},
      onAuthenticated: async () => {
        const identity = auth.captureIdentity();
        if (auth.isVerifiedGuardian.value && !auth.isTeamCoach.value) {
          submissionWorkspace.changeTab('players');
          currentView.value = 'overview';
        }
        void arAnalyzer.initPoseTracker();
        await fetchAllData();
        await submissionWorkspace.load();
        await enrollmentAdmin.load();
        await pilotWorkspace.load();
        if(initialInvitation && auth.isCurrentIdentity(identity)){pilotWorkspace.redemptionToken.value=initialInvitation;pendingInvitation.value=true;initialInvitation='';}
      }
    });
    // Presentation-only selection. Every data request still uses verified server roles.
    const workspaceMode = computed(() => {
      if (requestedWorkspace.value === 'family' && auth.isVerifiedGuardian.value) return 'family';
      if (requestedWorkspace.value === 'coach' && auth.isTeamCoach.value) return 'coach';
      if (auth.isTeamCoach.value) return 'coach';
      if (auth.isVerifiedGuardian.value) return 'family';
      if (auth.isOrgAdmin.value) return 'admin';
      return 'member';
    });
    const familyPlayers = computed(() => {
      if (!auth.isVerifiedGuardian.value || auth.authError.value) return [];
      const authorized = new Set(auth.guardianLinks.value.filter(link => link.status === 'verified').map(link => link.athlete_id));
      return players.value.filter(player => authorized.has(player.athlete_id));
    });
    // Staging player projection: never promote viewer choice to authorization.
    const visibleStagingPlayers = computed(() => {
      if (auth.authError.value) return [];
      return workspaceMode.value === 'coach' && auth.isTeamCoach.value
        ? coachRoster.value
        : workspaceMode.value === 'family' && auth.isVerifiedGuardian.value ? familyPlayers.value : [];
    });
    // Existing private-media Worker authorizes only these exact browser origins.
    // A new Pages hostname must never spoof or work around its Origin checks.
    const mediaOriginAllowed = computed(() =>
      ['https://sdl-staging.pages.dev','http://127.0.0.1:5500','http://localhost:5500']
        .includes(window.location.origin)
    );
    const changeWorkspace = requested => {
      if (requested !== 'coach' && requested !== 'family') return;
      if (requested === 'coach' && !auth.isTeamCoach.value) return;
      if (requested === 'family' && !auth.isVerifiedGuardian.value) return;
      requestedWorkspace.value = requested;
      activeTab.value = 'home';
      currentView.value = 'overview';
    };
    const coach = useCoachMode(t);
    const analytics = useAnalytics({ players, sessions:analyticsSessions, selectedPlayer, currentView, searchQuery, t });
    const playerFeature = usePlayers({
      players, sessions, drillVideos, selectedPlayer, currentView,
      expandedSessionIds: analytics.expandedSessionIds,
      isCoach: coach.isCoach, isSaving, t,
      renderPlayerChart: analytics.renderPlayerChart
    });
    const sessionFeature = useSessions({
      sessions, isCoach: coach.isCoach, isSaving, t,
      expandedSessionIds: analytics.expandedSessionIds,
      renderPlayerChart: analytics.renderPlayerChart
    });
    const videoFeature = useVideos({ drillVideos, selectedPlayer, isCoach: coach.isCoach });
    const csvFeature = useRosterCsv({
      players, sessions, isCoach: coach.isCoach,
      getLatestMetric: analytics.getLatestMetric,
      getPlayerDisplayName: playerFeature.getPlayerDisplayName
    });
    const arAnalyzer = createArAnalyzerController({ selectedPlayer });
    const privateMedia = usePrivateMedia({ auth, players, coachRoster, analyzer: arAnalyzer });
    const submissionWorkspace = useSubmissionWorkspace({
      auth,
      players,
      coachRoster,
      sessions,
      onProfile: (player,permitted=[])=>{guardianProfileId.value=player.id;guardianProfileSessions.value=permitted;playerFeature.selectPlayer(player);},
      onFamilyStatistics: (id,rows,denied=false)=>{if(guardianProfileId.value===id){guardianProfileSessions.value=rows;if(denied){guardianProfileId.value='';selectedPlayer.value=null;currentView.value='overview';clearPlayerChart();analytics.hasChartData.value=false;}else analytics.renderPlayerChart();}},
      onBulkShare:(row,mode)=>pilotWorkspace.share(row,mode,{},false),
      onPrivateVideos: playerId => { void privateMedia.selectMediaPlayer(playerId); }
    });
    const enrollmentAdmin = useEnrollmentAdmin({ auth });
    const pilotWorkspace=usePilotWorkspace({auth,onLinked:async()=>{const identity=auth.captureIdentity();await auth.reloadMemberships();if(!auth.isCurrentIdentity(identity))return;await fetchAllData();if(auth.isCurrentIdentity(identity))await submissionWorkspace.load();if(auth.isCurrentIdentity(identity))pendingInvitation.value=false;},onUpdated:()=>{void submissionWorkspace.load();}});
    // Fragments are not sent in HTTP requests. Remove the invitation before any sharing/navigation.
    if(window.location?.hash?.startsWith('#guardian-invite=')){
      const token=window.location.hash.slice('#guardian-invite='.length);
      window.history?.replaceState(null,'',window.location.pathname+window.location.search);
      if(/^[a-f0-9]{64}$/.test(token))initialInvitation=token;
    }

    const emptyPlayerForm = { ...playerFeature.newPlayer.value };
    const emptySessionForm = { ...sessionFeature.newSession.value };
    const emptyVideoForm = { ...videoFeature.newDrillVideo.value };

    const fetchSafeCoachRoster = async (identity) => {
      if (!auth.isCurrentIdentity(identity)) return;
      coachRoster.value = [];
      coachRosterError.value = '';
      coachRosterLoading.value = true;
      try {
        const roster = await fetchCoachRoster();
        if (auth.isCurrentIdentity(identity)) coachRoster.value = roster;
      } catch (err) {
        if (auth.isCurrentIdentity(identity)) coachRosterError.value = err.message || 'Could not retrieve team roster';
      } finally {
        if (auth.isCurrentIdentity(identity)) coachRosterLoading.value = false;
      }
    };
    const fetchAllData = async () => {
      const identity = auth.captureIdentity();
      if (!auth.isCurrentIdentity(identity)) return;
      loading.value = true;
      try {
        // Default-deny: failed membership lookups or accounts with no active coach or
        // verified guardian role never fall through to the legacy unrestricted loader.
        if (auth.authError.value) {
          players.value = [];
          sessions.value = [];
          drillVideos.value = [];
          return;
        }
        if (auth.isTeamCoach.value) {
          if(pilotWorkspace.enabled){
            await fetchSafeCoachRoster(identity);
            if(!auth.isCurrentIdentity(identity))return;
            const linked=auth.isVerifiedGuardian.value?await fetchVerifiedGuardianPlayers(auth.guardianLinks.value):[];
            if(!auth.isCurrentIdentity(identity))return;
            players.value=[...new Map([...coachRoster.value,...linked].map(p=>[p.id,p])).values()].sort(compareJerseys);
            sessions.value=[];drillVideos.value=[];return;
          }
          const data = await fetchAllCloudData();
          if (!auth.isCurrentIdentity(identity)) return;
          players.value = data.players.sort(compareJerseys);
          sessions.value = data.sessions;
          drillVideos.value = data.drillVideos;
          await fetchSafeCoachRoster(identity);
          return;
        }
        if (auth.isVerifiedGuardian.value) {
          // Family history is loaded only through the narrow Worker RPC in the workspace.
          const linked = await fetchVerifiedGuardianPlayers(auth.guardianLinks.value);
          if (!auth.isCurrentIdentity(identity)) return;
          players.value = linked.sort(compareJerseys);
          sessions.value = [];
          drillVideos.value = [];
          return;
        }
        // Unlinked users, pending/revoked guardians, and admin-only accounts:
        // no raw player or session queries (enrollmentAdmin.load() handles org admins).
        players.value = [];
        sessions.value = [];
        drillVideos.value = [];
      } catch (err) {
        if (!auth.isCurrentIdentity(identity)) return;
        auth.authError.value = err.message || 'Data request failed';
        console.error('Fetch error:', err);
      } finally {
        if (auth.isCurrentIdentity(identity)) loading.value = false;
      }
    };
    const saveLanguage = () => {
      localStorage.setItem('swallows_lang', currentLang.value);
      analytics.renderPlayerChart();
    };
    const triggerPrintReport = () => window.print();
    const clearSensitiveState = () => {
      pendingInvitation.value = false;
      activeTab.value = 'home';
      requestedWorkspace.value = 'auto';
      players.value = [];
      sessions.value = [];
      drillVideos.value = [];
      coachRoster.value = [];
      coachRosterError.value = '';
      guardianProfileId.value='';guardianProfileSessions.value=[];
      selectedPlayer.value = null;
      currentView.value = 'overview';
      loading.value = false;
      coachRosterLoading.value = false;
      searchQuery.value = '';
      coach.lockCoachMode();
      privateMedia.resetMedia();
      submissionWorkspace.reset();
      enrollmentAdmin.reset();
      pilotWorkspace.reset();
      clearPlayerChart();
      analytics.expandedSessionIds.clear();
      analytics.hasChartData.value = false;
      playerFeature.showAddPlayerModal.value = false;
      playerFeature.showEditPlayerModal.value = false;
      playerFeature.editingPlayer.value = null;
      sessionFeature.showLogModal.value = false;
      sessionFeature.showEditSessionModal.value = false;
      sessionFeature.activePlayerForLog.value = null;
      sessionFeature.editingSession.value = null;
      videoFeature.showUploadVideoModal.value = false;
      videoFeature.activePlayerForVideo.value = null;
      videoFeature.selectedVideoFile.value = null;
      playerFeature.newPlayer.value = { ...emptyPlayerForm };
      sessionFeature.newSession.value = { ...emptySessionForm };
      videoFeature.newDrillVideo.value = { ...emptyVideoForm };
      for (const id of Object.keys(playerFeature.failedImgs)) delete playerFeature.failedImgs[id];
    };
    const navigateTab = tab => {
      if (!['home', 'team', 'stats', 'videos', 'me'].includes(tab)) return;
      activeTab.value = tab;
      currentView.value = 'overview';
      if (tab === 'team' && workspaceMode.value === 'family') submissionWorkspace.changeTab('players');
      if (tab === 'stats') {
        submissionWorkspace.changeTab(workspaceMode.value === 'coach' ? 'review' : 'players');
        overviewTab.value = 'leaderboard';
      }
      if (tab === 'videos') submissionWorkspace.changeTab('submissions');
      if (tab === 'team' && workspaceMode.value === 'coach') overviewTab.value = 'roster';
    };
    Vue.watch(currentView, view => { if (view === 'player') activeTab.value = 'team'; });
    const dismissInvitePrompt = () => {pendingInvitation.value=false;};
    const signInAndLoad = () => auth.signIn();
    const signOutAndClear = () => {initialInvitation='';return auth.signOut();};
    onMounted(() => auth.initializeAuth());
    onUnmounted(() => { auth.disposeAuth(); submissionWorkspace.dispose(); enrollmentAdmin.dispose();pilotWorkspace.dispose(); });

    return {
      currentLang, t, saveLanguage, loading, isSaving, currentView, overviewTab, activeTab, workspaceMode, familyPlayers, visibleStagingPlayers, mediaOriginAllowed, navigateTab, changeWorkspace, pendingInvitation, dismissInvitePrompt, searchQuery,
      selectedPlayer, players, sessions, drillVideos, coachRoster, coachRosterLoading, coachRosterError,
      formatImgUrl, triggerPrintReport,
      ...auth, signInAndLoad, signOutAndClear,
      ...coach, ...analytics, ...playerFeature, ...sessionFeature, ...videoFeature, ...csvFeature,
      ...arAnalyzer,
      selectPlayer: async player=>{
        guardianProfileId.value='';guardianProfileSessions.value=[];playerFeature.selectPlayer(player);
        if(pilotWorkspace.enabled){
          const identity=auth.captureIdentity();sessions.value=[];
          try{const rows=await createPilotWorkflowService({auth}).coachStatistics(player.id);
          if(auth.isCurrentIdentity(identity)&&selectedPlayer.value?.id===player.id){sessions.value=rows;analytics.renderPlayerChart();}}
          catch(error){if(auth.isCurrentIdentity(identity)&&selectedPlayer.value?.id===player.id){sessions.value=[];auth.authError.value=error.message;}}
        }
      },
      // Passing the original refs (not Vue-unwrapped copies) maintains DOM/video ownership.
      loginController: markRaw(auth),
       pilotController:markRaw(pilotWorkspace),
      submissionController: markRaw(submissionWorkspace),
      enrollmentAdminController: markRaw(enrollmentAdmin),
      privateMediaController: markRaw(privateMedia),
      analyzerController: markRaw(arAnalyzer)
    };
  }
}).mount('#app');
