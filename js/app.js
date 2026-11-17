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
import { AppHeader } from '../components/AppHeader.js';
import { TeamOverview } from '../components/TeamOverview.js';
import { CoachTeamRoster } from '../components/CoachTeamRoster.js';
import { PlayerFormModal } from '../components/PlayerFormModal.js';
import { PlayerProfile } from '../components/PlayerProfile.js';
import { SessionFormModal } from '../components/SessionFormModal.js';
import { UploadVideoModal } from '../components/UploadVideoModal.js';
import { ArAnalyzerModal } from '../components/ArAnalyzerModal.js';

const { createApp, ref, onMounted, onUnmounted, markRaw } = Vue;

createApp({
  components: {
    AppHeader, TeamOverview, CoachTeamRoster, PlayerFormModal, PlayerProfile, PrivateMediaPanel, SubmissionWorkspace, ClubEnrollmentAdmin,
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
    const searchQuery = ref('');
    const selectedPlayer = ref(null);
    const players = ref([]);
    const sessions = ref([]);
    const drillVideos = ref([]);
    const coachRoster = ref([]);
    const coachRosterLoading = ref(false);
    const coachRosterError = ref('');

    const auth = useAuthSession({
      onIdentityChange: () => clearSensitiveState(),
      onAuthenticated: async () => {
        if (auth.isVerifiedGuardian.value && !auth.isTeamCoach.value) {
          submissionWorkspace.changeTab('players');
          currentView.value = 'overview';
        }
        void arAnalyzer.initPoseTracker();
        await fetchAllData();
        await submissionWorkspace.load();
        await enrollmentAdmin.load();
      }
    });
    const coach = useCoachMode(t);
    const analytics = useAnalytics({ players, sessions, selectedPlayer, currentView, searchQuery, t });
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
      onProfile: playerFeature.selectPlayer,
      onPrivateVideos: playerId => { void privateMedia.selectMediaPlayer(playerId); }
    });
    const enrollmentAdmin = useEnrollmentAdmin({ auth });
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
          const data = await fetchAllCloudData();
          if (!auth.isCurrentIdentity(identity)) return;
          players.value = data.players.sort(compareJerseys);
          sessions.value = data.sessions;
          drillVideos.value = data.drillVideos;
          await fetchSafeCoachRoster(identity);
          return;
        }
        if (auth.isVerifiedGuardian.value) {
          // No parent-safe statistics API exists: sessions are never requested here.
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
      players.value = [];
      sessions.value = [];
      drillVideos.value = [];
      coachRoster.value = [];
      coachRosterError.value = '';
      selectedPlayer.value = null;
      currentView.value = 'overview';
      loading.value = false;
      coachRosterLoading.value = false;
      searchQuery.value = '';
      coach.lockCoachMode();
      privateMedia.resetMedia();
      submissionWorkspace.reset();
      enrollmentAdmin.reset();
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
    const signInAndLoad = () => auth.signIn();
    const signOutAndClear = () => auth.signOut();
    onMounted(() => auth.initializeAuth());
    onUnmounted(() => { auth.disposeAuth(); submissionWorkspace.dispose(); enrollmentAdmin.dispose(); });

    return {
      currentLang, t, saveLanguage, loading, isSaving, currentView, overviewTab, searchQuery,
      selectedPlayer, players, sessions, drillVideos, coachRoster, coachRosterLoading, coachRosterError,
      formatImgUrl, triggerPrintReport,
      ...auth, signInAndLoad, signOutAndClear,
      ...coach, ...analytics, ...playerFeature, ...sessionFeature, ...videoFeature, ...csvFeature,
      ...arAnalyzer,
      // Passing the original refs (not Vue-unwrapped copies) maintains DOM/video ownership.
      submissionController: markRaw(submissionWorkspace),
      enrollmentAdminController: markRaw(enrollmentAdmin),
      privateMediaController: markRaw(privateMedia),
      analyzerController: markRaw(arAnalyzer)
    };
  }
}).mount('#app');
