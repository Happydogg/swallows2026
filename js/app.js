import { PerformanceWorkspace } from '../components/PerformanceWorkspace.js';
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
import { useManagedRoster } from '../composables/useManagedRoster.js';
import { ManagedRoster } from '../components/ManagedRoster.js';
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
    SessionFormModal, UploadVideoModal, ArAnalyzerModal, ManagedRoster, PerformanceWorkspace
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
    const coachOrganizationId = ref(''), coachTeamId = ref('');
    let workspaceRevision = 0;

    let initialInvitation='';
    const pendingInvitation=ref(false);
    const auth = useAuthSession({
      onInvitation:token=>{initialInvitation=token;},
      onIdentityChange: previous => {if(previous?.userId)initialInvitation='';clearSensitiveState();},
      onContextChange: () => clearSensitiveState(),
      onAuthenticated: async () => {
        const identity = auth.captureIdentity();
        if (auth.isVerifiedGuardian.value && !auth.isTeamCoach.value) {
          submissionWorkspace.changeTab('players');
          currentView.value = 'overview';
        }
        void arAnalyzer.initPoseTracker();
        await loadWorkspace();
        if(initialInvitation && auth.isCurrentIdentity(identity)){pilotWorkspace.redemptionToken.value=initialInvitation;pendingInvitation.value=true;initialInvitation='';}
      }
    });
    const avatarManager = useAvatarManager({auth, filterRows: rows => {
      const visible = new Set((workspaceMode.value === 'admin' ? managedRoster.rows.value : visibleStagingPlayers.value).map(row => row.id));
      return rows.filter(row => visible.has(row.id));
    }});
    const avatarForPlayer = player => {
      if (!player) return '';
      return avatarManager.photos.value[player.id] || publicAvatarOrFallback(player.photo_url,player);
    };
    const coachRosterDisplay = computed(() => coachRoster.value.map(row => ({
      ...row, photo_url: avatarForPlayer(row)
    })));
    // Presentation-only selection. Every data request still uses verified server roles.
    const workspaceOptions = computed(() => [
      ...(auth.isTeamCoach.value ? [{id:'coach',label:'Coach'}] : []),
      ...(auth.isVerifiedGuardian.value ? [{id:'family',label:'Family'}] : []),
      ...(auth.isOrgAdmin.value ? [{id:'admin',label:'Club Admin'}] : []),
      ...(auth.isTeamManager.value ? [{id:'manager',label:'Team Manager'}] : [])
    ]);
    const workspaceMode = computed(() => {
      if (workspaceOptions.value.some(option => option.id === requestedWorkspace.value)) return requestedWorkspace.value;
      return workspaceOptions.value[0]?.id || 'member';
    });
    const managedRoster = useManagedRoster({auth, mode: workspaceMode, onUpdated: () => {
      // A successful roster mutation invalidates cached player projections and photos.
      selectedPlayer.value = null;
      currentView.value = 'overview';
      clearProfileHistory();
      avatarManager.reset();
    }});
    const isManagedWorkspace = computed(() => ['admin','manager'].includes(workspaceMode.value));
    const coachOrganizations = computed(() => (auth.accountContext.value?.organizations || []).filter(row => row.roles.includes('coach')));
    const coachTeams = computed(() => (auth.accountContext.value?.teams || []).filter(row => row.roles.includes('coach') &&
      (!coachOrganizationId.value || row.organization_id === coachOrganizationId.value)));
    const coachTeamCount = computed(() => coachTeams.value.filter(row => !coachTeamId.value || row.id === coachTeamId.value).length);
    const ordinaryOrganizations = computed(() => (auth.accountContext.value?.organizations || []).filter(row => row.roles.some(role => role!=='platform_admin')));
    const ordinaryTeams = computed(() => (auth.accountContext.value?.teams || []).filter(row => row.roles.some(role => role!=='platform_admin')));
    const familyPlayers = computed(() => {
      if (!auth.isVerifiedGuardian.value || auth.authError.value) return [];
      const authorized = new Set(auth.guardianLinks.value.filter(link => link.status === 'verified').map(link => link.athlete_id));
      return players.value.filter(player => authorized.has(player.athlete_id)).map(player => ({...player,photo_url:avatarForPlayer(player)}));
    });
    const statsBoard = useAuthorizedStatsBoard({
      auth,coachRoster:coachRosterDisplay,familyPlayers,workspaceMode,activeTab
    });
    const performancePlayers = computed(() => {
      if (auth.authError.value || !auth.authUser.value) return [];
      const rows = isManagedWorkspace.value ? managedRoster.rows.value : statsBoard.players.value;
      return [...new Map(rows.map(row=>[row.id,row])).values()];
    });
    const performanceReviewTeams = computed(() => workspaceMode.value==='coach'
      ? coachTeams.value.filter(team=>!coachTeamId.value || team.id===coachTeamId.value) : []);
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
    const changeWorkspace = async requested => {
      if (!workspaceOptions.value.some(option => option.id === requested) || requested === workspaceMode.value) return;
      clearWorkspaceState();
      requestedWorkspace.value = requested;
      activeTab.value = 'home';
      currentView.value = 'overview';
      await loadWorkspace();
    };
    const coach = useCoachMode(t);
    const analytics = useAnalytics({ players, sessions:analyticsSessions, selectedPlayer, currentView, searchQuery, t });
    const clearProfileHistory = () => {
      historyRevision++;
      profileHistoryLoading.value = false;
      profileHistoryError.value = '';
      sessions.value = [];
      guardianProfileId.value = '';
      guardianProfileSessions.value = [];
      clearPlayerChart();
      analytics.hasChartData.value = false;
      return historyRevision;
    };
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
    const privateMedia = usePrivateMedia({
      auth, analyzer: arAnalyzer,
      players: computed(() => workspaceMode.value === 'family' ? familyPlayers.value : []),
      coachRoster: computed(() => workspaceMode.value === 'coach' ? coachRoster.value : [])
    });
    const submissionWorkspace = useSubmissionWorkspace({
      auth,
      players,
      coachRoster,
      sessions,
      beginProfile: clearProfileHistory,
      onProfile: (player, permitted, navigation) => {
        if (navigation !== historyRevision) return;
        guardianProfileId.value = player.id;
        guardianProfileSessions.value = permitted;
        playerFeature.selectPlayer({...player,photo_url:avatarForPlayer(player)});
        if (mediaOriginAllowed.value) void privateMedia.selectMediaPlayer(player.id);
      },
      onFamilyStatistics: (id,rows,denied=false)=>{if(guardianProfileId.value===id){guardianProfileSessions.value=rows;if(denied){guardianProfileId.value='';selectedPlayer.value=null;currentView.value='overview';clearPlayerChart();analytics.hasChartData.value=false;}else analytics.renderPlayerChart();}},
      onBulkShare:(row,mode)=>pilotWorkspace.share(row,mode,{},false),
      onPrivateVideos: playerId => { void privateMedia.selectMediaPlayer(playerId); }
    });
    const enrollmentAdmin = useEnrollmentAdmin({ auth });
    const pilotWorkspace=usePilotWorkspace({auth,onLinked:async()=>{await auth.reloadMemberships();},onUpdated:()=>{void submissionWorkspace.load();}});
    // Fragments are not sent in HTTP requests. Remove the invitation before any sharing/navigation.
    if(window.location?.hash?.startsWith('#guardian-invite=')){
      const token=window.location.hash.slice('#guardian-invite='.length);
      window.history?.replaceState(null,'',window.location.pathname+window.location.search);
      if(/^[a-f0-9]{64}$/.test(token))initialInvitation=token;
    }

    const emptyPlayerForm = { ...playerFeature.newPlayer.value };
    const emptySessionForm = { ...sessionFeature.newSession.value };
    const emptyVideoForm = { ...videoFeature.newDrillVideo.value };

    const fetchSafeCoachRoster = async (current) => {
      if (!current()) return;
      coachRoster.value = [];
      coachRosterError.value = '';
      coachRosterLoading.value = true;
      try {
        const roster = await fetchCoachRoster();
        if (current()) coachRoster.value = roster.filter(row => coachTeams.value.some(team => team.id === row.team_id) &&
          (!coachTeamId.value || row.team_id === coachTeamId.value));
      } catch (err) {
        if (current()) coachRosterError.value = err.message || 'Could not retrieve team roster';
      } finally {
        if (current()) coachRosterLoading.value = false;
      }
    };
    const fetchAllData = async () => {
      const identity = auth.captureIdentity();
      const revision = workspaceRevision;
      const current = () => auth.isCurrentIdentity(identity) && revision === workspaceRevision;
      if (!current()) return;
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
        if (workspaceMode.value === 'coach' && auth.isTeamCoach.value) {
          // The scoped coach-roster RPC is the only authorized roster entry path.
          // Legacy select('*') on public.sessions returns 403 under staging RLS.
          // Never fall back to unscoped player/session reads when pilot flags are off.
          await fetchSafeCoachRoster(current);
          if(!current())return;
          // Preserve the established dual-role family cards. Links are verified
          // independently; neither projection can grant the other's role.
          const linked = auth.isVerifiedGuardian.value ? await fetchVerifiedGuardianPlayers(auth.guardianLinks.value) : [];
          if (!current()) return;
          players.value=[...new Map([...coachRoster.value,...linked].map(p=>[p.id,p])).values()].sort(compareJerseys);
          sessions.value=[];drillVideos.value=[];
          return;
        }
        if (workspaceMode.value === 'family' && auth.isVerifiedGuardian.value) {
          // Family history is loaded only through the narrow Worker RPC in the workspace.
          const linked = await fetchVerifiedGuardianPlayers(auth.guardianLinks.value);
          if (!current()) return;
          players.value = linked.sort(compareJerseys);
          sessions.value = [];
          drillVideos.value = [];
          return;
        }
        // CA/TM use a separate, explicitly scoped RPC, never legacy raw reads.
        if (isManagedWorkspace.value) {
          managedRoster.initialize();
          await managedRoster.fetchPage();
          return;
        }
        // Unlinked users and restricted platform-only accounts receive no data.
        players.value = [];
        sessions.value = [];
        drillVideos.value = [];
      } catch (err) {
        if (!current()) return;
        clearWorkspaceState();
        auth.authError.value = err.message || 'Data request failed';
        console.error('Fetch error:', err);
      } finally {
        if (current()) loading.value = false;
      }
    };
    const loadWorkspace = async () => {
      const identity = auth.captureIdentity(), revision = workspaceRevision;
      const current = () => auth.isCurrentIdentity(identity) && revision === workspaceRevision && !auth.authError.value;
      if (current() && ['coach','family'].includes(workspaceMode.value)) void arAnalyzer.initPoseTracker();
      await fetchAllData();
      if (!current() || workspaceMode.value === 'manager' || workspaceMode.value === 'member') return;
      if (workspaceMode.value === 'admin' && !managedRoster.rows.value.length) return;
      await avatarManager.load();
      if (!current()) return;
      if (workspaceMode.value === 'admin') return;
      if (current()) await submissionWorkspace.load();
      if (current()) await pilotWorkspace.load();
    };
    const changeCoachOrganization = async id => {
      if (workspaceMode.value !== 'coach' || (id && !coachOrganizations.value.some(row=>row.id===id))) return;
      clearWorkspaceState();
      coachOrganizationId.value=id;
      await loadWorkspace();
    };
    const changeCoachTeam = async id => {
      if (workspaceMode.value !== 'coach' || (id && !coachTeams.value.some(row=>row.id===id))) return;
      clearWorkspaceState({keepCoachScope:true});
      coachTeamId.value=id;
      await loadWorkspace();
    };
    const changeManagedOrganization = async id => {
      if (!isManagedWorkspace.value || managedRoster.denied.value || !managedRoster.organizations.value.some(row=>row.id===id)) return;
      clearWorkspaceState({keepManagedScope:true});
      managedRoster.chooseOrganization(id);
      await loadManagedPage();
    };
    const changeManagedTeam = async id => {
      if (!isManagedWorkspace.value || managedRoster.denied.value || (!(managedRoster.role.value==='club_admin' && id==='') && !managedRoster.teams.value.some(row=>row.id===id))) return;
      clearWorkspaceState({keepManagedScope:true});
      managedRoster.chooseTeam(id);
      await loadManagedPage();
    };
    const retryManagedRoster = () => managedRoster.denied.value ? auth.reloadMemberships() : loadManagedPage();
    const loadManagedPage = async (append=false) => {
      const revision = workspaceRevision;
      await managedRoster.fetchPage(append);
      if (revision !== workspaceRevision) return;
      if (managedRoster.error.value) {
        clearProfileHistory(); selectedPlayer.value=null; currentView.value='overview'; avatarManager.reset();
      } else if (workspaceMode.value === 'admin' && managedRoster.rows.value.length) {
        await avatarManager.load();
      }
    };
    const loadMoreManagedRoster = () => loadManagedPage(true);
    // A convenience route, never a media permission grant. The existing Worker
    // checks the signed-in identity and per-player read access independently.
    const loadAuthorizedHistory = async (id,role) => {
      const version=++historyRevision, identity=auth.captureIdentity();
      if(!auth.isCurrentIdentity(identity)||selectedPlayer.value?.id!==id)return;
      const isCurrent = () => version === historyRevision && auth.isCurrentIdentity(identity)
        && currentView.value === 'player' && selectedPlayer.value?.id === id
        && (role === 'coach'
          ? auth.isTeamCoach.value && coachRoster.value.some(player => player.id === id)
          : familyPlayers.value.some(player => player.id === id));
      profileHistoryLoading.value = true;
      try{
        const result=await fetchAuthorizedPlayerHistory(id,role);
        if(isCurrent()){
          sessions.value=result;
          Vue.nextTick(()=>{if(isCurrent())analytics.renderPlayerChart();});
        }
      }catch(error){
        if(isCurrent()){
          profileHistoryError.value=error.message||'Statistics unavailable.';
          sessions.value=[];
        }
      }finally{
        if(version===historyRevision && auth.isCurrentIdentity(identity))profileHistoryLoading.value=false;
      }
    };
    const refreshPerformanceHistory = id => {
      if (currentView.value==='player' && selectedPlayer.value?.id===id) {
        if (workspaceMode.value==='coach') void loadAuthorizedHistory(id,'coach');
        if (workspaceMode.value==='family') void loadAuthorizedHistory(id,'guardian');
      }
      if (activeTab.value==='stats' && statsBoard.selectedId.value===id) void statsBoard.select(id);
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
      clearProfileHistory();
      drillVideos.value=[];
      playerFeature.selectPlayer(projected);
      activeTab.value='team';
      if (mediaOriginAllowed.value) void privateMedia.selectMediaPlayer(authorized.id);
      return loadAuthorizedHistory(authorized.id,'coach');
    };
    // A parent's profile opens through the existing verified-guardian service,
    // not from a card's photo URL or a client-side permission toggle.
    const openFamilyPlayerProfile = player => {
      if (!auth.isVerifiedGuardian.value || workspaceMode.value !== 'family'
        || auth.authError.value || !familyPlayers.value.some(p => p.id === player?.id)) return;
      const selected=familyPlayers.value.find(p=>p.id===player.id);
      clearProfileHistory();
      playerFeature.selectPlayer({...selected,photo_url:avatarForPlayer(selected)});
      activeTab.value='team';
      if(mediaOriginAllowed.value)void privateMedia.selectMediaPlayer(selected.id);
      return loadAuthorizedHistory(selected.id,'guardian');
    };
    // CA/TM can open only the selected roster's read-only projection.
    const openManagedPlayerProfile = player => {
      if (!isManagedWorkspace.value || auth.authError.value) return;
      const managed=managedRoster.rows.value.find(p => p.id === player?.id);
      if (!managed) return;
      clearProfileHistory();
      drillVideos.value=[];
      playerFeature.selectPlayer({...managed,photo_url:workspaceMode.value==='admin'?avatarForPlayer(managed):''});
      activeTab.value='team';
    };
    const leavePlayerProfile = () => {
      currentView.value='overview';
      clearProfileHistory();
      privateMedia.resetMedia();
      selectedPlayer.value=null;
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
      clearWorkspaceState();
    };
    const clearWorkspaceState = ({keepManagedScope=false,keepCoachScope=false}={}) => {
      workspaceRevision++;
      if (keepManagedScope) managedRoster.clear(); else managedRoster.reset();
      if (!keepCoachScope) { coachOrganizationId.value=''; coachTeamId.value=''; }
      players.value = [];
      sessions.value = [];
      drillVideos.value = [];
      coachRoster.value = [];
      coachRosterError.value = '';
      selectedPlayer.value = null;
      clearProfileHistory();
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
      analytics.expandedSessionIds.clear();
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
      clearProfileHistory();
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
      selectPlayer: player => {
        if (workspaceMode.value === 'coach') return selectCoachRosterPlayer(player);
        if (workspaceMode.value === 'family') return openFamilyPlayerProfile(player);
       if (isManagedWorkspace.value) return openManagedPlayerProfile(player);
      },
      // Passing the original refs (not Vue-unwrapped copies) maintains DOM/video ownership.
      loginController: markRaw(auth),
       pilotController:markRaw(pilotWorkspace),
      submissionController: markRaw(submissionWorkspace),
      enrollmentAdminController: markRaw(enrollmentAdmin),
      privateMediaController: markRaw(privateMedia),
      statsBoardController: markRaw(statsBoard), performancePlayers, performanceReviewTeams, refreshPerformanceHistory,
       avatarController: markRaw(avatarManager),
      managedRosterController: markRaw(managedRoster), workspaceOptions, isManagedWorkspace,
      changeManagedOrganization, changeManagedTeam, retryManagedRoster, loadMoreManagedRoster,
      coachOrganizations, coachTeams, coachOrganizationId, coachTeamId, coachTeamCount,
      changeCoachOrganization, changeCoachTeam, ordinaryOrganizations, ordinaryTeams,
      analyzerController: markRaw(arAnalyzer)
    };
  }
}).mount('#app');
