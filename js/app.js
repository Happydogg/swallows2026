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
import { fetchAuthorizedPlayerHistory } from './authorizedStatsService.js';
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
import { StatsHub } from '../components/StatsHub.js';
import { AuthorizedStatsBoard } from '../components/AuthorizedStatsBoard.js';
import { useAuthorizedStatsBoard } from '../composables/useAuthorizedStatsBoard.js';
import { StagingDataBrowser } from '../components/StagingDataBrowser.js';
import { AvatarManager } from '../components/AvatarManager.js';
import { useAvatarManager } from '../composables/useAvatarManager.js';
import { publicAvatarOrFallback } from './avatarService.js';
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
    PilotWorkspace, PerformanceInbox, LoginLanding, AppShell, CoachHome, ParentHome, StatsHub, AuthorizedStatsBoard, StagingDataBrowser, AvatarManager, InviteOnboarding, AppHeader, TeamOverview, CoachTeamRoster, PlayerFormModal, PlayerProfile, PrivateMediaPanel, SubmissionWorkspace, ClubEnrollmentAdmin,
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
    const profileHistoryLoading=ref(false),profileHistoryError=ref('');
    let historyRevision=0;
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
        if (auth.isCurrentIdentity(identity)) await avatarManager.load();
        await submissionWorkspace.load();
        await enrollmentAdmin.load();
        await pilotWorkspace.load();
        if(initialInvitation && auth.isCurrentIdentity(identity)){pilotWorkspace.redemptionToken.value=initialInvitation;pendingInvitation.value=true;initialInvitation='';}
      }
    });
    const avatarManager = useAvatarManager({auth});
    const avatarForPlayer = player => {
      if (!player) return '';
      return avatarManager.photos.value[player.id] || publicAvatarOrFallback(player.photo_url,player);
    };
    const coachRosterDisplay = computed(() => coachRoster.value.map(row => ({
      ...row, photo_url: avatarForPlayer(row)
    })));
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
      return players.value.filter(player => authorized.has(player.athlete_id)).map(player => ({...player,photo_url:avatarForPlayer(player)}));
    });
    const statsBoard = useAuthorizedStatsBoard({
      auth,coachRoster:coachRosterDisplay,familyPlayers,workspaceMode,activeTab
    });
    // Staging player projection: never promote viewer choice to authorization.
    const visibleStagingPlayers = computed(() => {
      if (auth.authError.value) return [];
      return workspaceMode.value === 'coach' && auth.isTeamCoach.value
        ? coachRosterDisplay.value
        : workspaceMode.value === 'family' && auth.isVerifiedGuardian.value ? familyPlayers.value : [];
    });
    // Exact browser origins approved by the staging media Worker (SDL-004).
    // This is only a UI guard; the Worker still authenticates and authorizes reads.
    const mediaOriginAllowed = computed(() =>
      ['https://sdl-staging.pages.dev','https://sdl-ux-live.pages.dev',
        'http://127.0.0.1:5500','http://localhost:5500'].includes(window.location.origin)
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
      onProfile: (player,permitted=[])=>{guardianProfileId.value=player.id;guardianProfileSessions.value=permitted;playerFeature.selectPlayer({...player,photo_url:avatarForPlayer(player)});},
      onFamilyStatistics: (id,rows,denied=false)=>{if(guardianProfileId.value===id){guardianProfileSessions.value=rows;if(denied){guardianProfileId.value='';selectedPlayer.value=null;currentView.value='overview';clearPlayerChart();analytics.hasChartData.value=false;}else analytics.renderPlayerChart();}},
      onBulkShare:(row,mode)=>pilotWorkspace.share(row,mode,{},false),
      onPrivateVideos: playerId => { void privateMedia.selectMediaPlayer(playerId); }
    });
    const enrollmentAdmin = useEnrollmentAdmin({ auth });
    const pilotWorkspace=usePilotWorkspace({auth,onLinked:async()=>{const identity=auth.captureIdentity();await auth.reloadMemberships();if(!auth.isCurrentIdentity(identity))return;await fetchAllData();if(auth.isCurrentIdentity(identity))await avatarManager.load();if(auth.isCurrentIdentity(identity))await submissionWorkspace.load();if(auth.isCurrentIdentity(identity))pendingInvitation.value=false;},onUpdated:()=>{void submissionWorkspace.load();}});
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
          // The scoped coach-roster RPC is the only authorized roster entry path.
          // Legacy select('*') on public.sessions returns 403 under staging RLS.
          // Never fall back to unscoped player/session reads when pilot flags are off.
          await fetchSafeCoachRoster(identity);
          if(!auth.isCurrentIdentity(identity))return;
          const linked=auth.isVerifiedGuardian.value
            ? await fetchVerifiedGuardianPlayers(auth.guardianLinks.value) : [];
          if(!auth.isCurrentIdentity(identity))return;
          players.value=[...new Map([...coachRoster.value,...linked].map(p=>[p.id,p])).values()].sort(compareJerseys);
          sessions.value=[];drillVideos.value=[];
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
    // A convenience route, never a media permission grant. The existing Worker
    // checks the signed-in identity and per-player read access independently.
    const loadAuthorizedHistory = async (id,role) => {
      const version=++historyRevision, identity=auth.captureIdentity();
      if(!auth.isCurrentIdentity(identity)||selectedPlayer.value?.id!==id)return;
      profileHistoryError.value='';profileHistoryLoading.value=true;
      sessions.value=[];guardianProfileId.value='';guardianProfileSessions.value=[];
      try{
        const result=await fetchAuthorizedPlayerHistory(id,role);
        if(version===historyRevision && auth.isCurrentIdentity(identity) && selectedPlayer.value?.id===id){
          sessions.value=result;Vue.nextTick(()=>analytics.renderPlayerChart());
        }
      }catch(error){
        if(version===historyRevision && auth.isCurrentIdentity(identity) && selectedPlayer.value?.id===id){
          profileHistoryError.value=error.message||'Statistics unavailable.';
          sessions.value=[];
        }
      }finally{
        if(version===historyRevision && auth.isCurrentIdentity(identity))profileHistoryLoading.value=false;
      }
    };
    const openAuthorizedPlayerVideos = player => {
      if (!auth.authUser.value || auth.authError.value || !player?.id) return;
      const currentlyScoped = visibleStagingPlayers.value.some(row =>
        row.id === player.id && (workspaceMode.value !== 'coach' || row.team_id === player.team_id));
      if (!currentlyScoped) return;
      navigateTab('videos');
      if (mediaOriginAllowed.value && privateMedia.mediaPlayers.value.some(row => row.id === player.id)) {
        void privateMedia.selectMediaPlayer(player.id);
      }
    };
    const selectCoachRosterPlayer = player => {
      if (!auth.isTeamCoach.value || workspaceMode.value !== 'coach' || auth.authError.value) return;
      const authorized = coachRoster.value.find(row => row.id === player?.id && row.team_id === player?.team_id);
      if (!authorized) return;
      // The authenticated service supplies private, short-lived signed photos.
      // The coach roster RPC remains narrowly scoped, with no raw profile read.
      const projected={...authorized,photo_url:avatarForPlayer(authorized)};
      sessions.value=[]; drillVideos.value=[];
      guardianProfileId.value=''; guardianProfileSessions.value=[];
      playerFeature.selectPlayer(projected);
      activeTab.value='team';
      if (mediaOriginAllowed.value) void privateMedia.selectMediaPlayer(authorized.id);
      void loadAuthorizedHistory(authorized.id,'coach');
    };
    // A parent's profile opens through the existing verified-guardian service,
    // not from a card's photo URL or a client-side permission toggle.
    const openFamilyPlayerProfile = player => {
      if (!auth.isVerifiedGuardian.value || workspaceMode.value !== 'family'
        || auth.authError.value || !familyPlayers.value.some(p => p.id === player?.id)) return;
      const selected=familyPlayers.value.find(p=>p.id===player.id);
      playerFeature.selectPlayer({...selected,photo_url:avatarForPlayer(selected)});
      activeTab.value='team';
      if(mediaOriginAllowed.value)void privateMedia.selectMediaPlayer(selected.id);
      void loadAuthorizedHistory(selected.id,'guardian');
    };
    // Admin-only accounts can navigate from their server-filtered player
    // directory to the same profile, without reading sessions or private video.
    const openManagedPlayerProfile = player => {
      if (workspaceMode.value !== 'admin' || !auth.isOrgAdmin.value || auth.authError.value) return;
      const managed=avatarManager.rows.value.find(p => p.id === player?.id);
      if (!managed || !avatarManager.canEdit(managed.id)) return;
      sessions.value=[];drillVideos.value=[];
      guardianProfileId.value='';guardianProfileSessions.value=[];
      playerFeature.selectPlayer({...managed,photo_url:avatarForPlayer(managed)});
      activeTab.value='team';
    };
    const leavePlayerProfile = () => {
      currentView.value='overview';
      historyRevision++;profileHistoryLoading.value=false;profileHistoryError.value='';
      sessions.value=[];
      privateMedia.resetMedia();
      if (workspaceMode.value === 'admin') activeTab.value='me';
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
      historyRevision++;profileHistoryLoading.value=false;profileHistoryError.value='';
      currentView.value = 'overview';
      loading.value = false;
      coachRosterLoading.value = false;
      searchQuery.value = '';
      coach.lockCoachMode();
      privateMedia.resetMedia();
      avatarManager.reset();
      statsBoard.reset();
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
    Vue.watch(avatarManager.photos, photos => {
      const id=selectedPlayer.value?.id;
      if (id && photos[id] && selectedPlayer.value.photo_url !== photos[id]) {
        selectedPlayer.value={...selectedPlayer.value,photo_url:photos[id]};
      }
    });
    const dismissInvitePrompt = () => {pendingInvitation.value=false;};
    const signInAndLoad = () => auth.signIn();
    const signOutAndClear = () => {initialInvitation='';return auth.signOut();};
    onMounted(() => auth.initializeAuth());
    onUnmounted(() => { auth.disposeAuth(); submissionWorkspace.dispose(); enrollmentAdmin.dispose();pilotWorkspace.dispose(); });

    return {
      currentLang, t, saveLanguage, loading, isSaving, currentView, overviewTab, activeTab, workspaceMode, familyPlayers, visibleStagingPlayers, coachRosterDisplay, mediaOriginAllowed, statsFamilyCards: submissionWorkspace.cards, navigateTab, changeWorkspace, pendingInvitation, dismissInvitePrompt, searchQuery,
      selectedPlayer, players, sessions, profileHistoryLoading, profileHistoryError, drillVideos, coachRoster, coachRosterLoading, coachRosterError, selectCoachRosterPlayer, openAuthorizedPlayerVideos, openFamilyPlayerProfile, openManagedPlayerProfile, leavePlayerProfile, canEditPlayerPhoto: avatarManager.canEdit, avatarManager,
      formatImgUrl, triggerPrintReport,
      ...auth, signInAndLoad, signOutAndClear,
      ...coach, ...analytics, ...playerFeature, ...sessionFeature, ...videoFeature, ...csvFeature,
      ...arAnalyzer,
      selectPlayer: player=>{
        guardianProfileId.value='';guardianProfileSessions.value=[];
        playerFeature.selectPlayer(player);
        const allowedCoach=auth.isTeamCoach.value && coachRoster.value.some(p=>p.id===player?.id);
        const allowedGuardian=auth.isVerifiedGuardian.value && familyPlayers.value.some(p=>p.id===player?.id);
        if(allowedCoach)void loadAuthorizedHistory(player.id,'coach');
        else if(allowedGuardian)void loadAuthorizedHistory(player.id,'guardian');
      },
      // Passing the original refs (not Vue-unwrapped copies) maintains DOM/video ownership.
      loginController: markRaw(auth),
       pilotController:markRaw(pilotWorkspace),
      submissionController: markRaw(submissionWorkspace),
      enrollmentAdminController: markRaw(enrollmentAdmin),
      privateMediaController: markRaw(privateMedia),
      statsBoardController: markRaw(statsBoard),
       avatarController: markRaw(avatarManager),
      analyzerController: markRaw(arAnalyzer)
    };
  }
}).mount('#app');
