// SDL-003: lightweight Vue application coordinator (no bundler required).
// Feature state/commands live in composables, UI in components, I/O in services.
import { translations } from './translations.js';
import { supabaseClient } from './config.js';
import { formatImgUrl } from './mediaStorage.js';
import { fetchAllCloudData } from './supabaseService.js';
import { fetchCoachRoster } from './coachRosterService.js';
import { createArAnalyzerController } from './arAnalyzer.js';
import { compareJerseys } from '../utils/jerseyUtils.js';
import { useCoachMode } from '../composables/useCoachMode.js';
import { useAuthSession } from '../composables/useAuthSession.js';
import { usePlayers } from '../composables/usePlayers.js';
import { useSessions } from '../composables/useSessions.js';
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

const { createApp, ref, onMounted, markRaw } = Vue;

createApp({
  components: {
    AppHeader, TeamOverview, CoachTeamRoster, PlayerFormModal, PlayerProfile,
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

    const auth = useAuthSession();
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

    const fetchSafeCoachRoster = async () => {
      coachRoster.value = [];
      coachRosterError.value = '';
      coachRosterLoading.value = true;
      try {
        coachRoster.value = await fetchCoachRoster();
      } catch (err) {
        coachRosterError.value = err.message || 'Could not retrieve team roster';
      } finally {
        coachRosterLoading.value = false;
      }
    };
    const fetchAllData = async () => {
      loading.value = true;
      try {
        const data = await fetchAllCloudData();
        players.value = data.players.sort(compareJerseys);
        sessions.value = data.sessions;
        drillVideos.value = data.drillVideos;
        if (auth.isTeamCoach.value) await fetchSafeCoachRoster();
      } catch (err) {
        auth.authError.value = err.message || 'Data request failed';
        console.error('Fetch error:', err);
      } finally {
        loading.value = false;
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
    };
    const signInAndLoad = async () => {
      await auth.signIn();
      if (auth.authUser.value) await fetchAllData();
    };
    const signOutAndClear = async () => {
      // Clear private data immediately even when logout fails remotely.
      clearSensitiveState();
      await auth.signOut();
    };
    onMounted(async () => {
      // Track external sign-outs and token changes, including other tabs.
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          clearSensitiveState();
          auth.authUser.value = null;
        }
      });
      await auth.initializeAuth();
      if (auth.authUser.value) await fetchAllData();
      else loading.value = false;
      // Pose tracker starts only once login has resolved; no need on login screen.
      if (auth.authUser.value) arAnalyzer.initPoseTracker();
    });

    return {
      currentLang, t, saveLanguage, loading, isSaving, currentView, overviewTab, searchQuery,
      selectedPlayer, players, sessions, drillVideos, coachRoster, coachRosterLoading, coachRosterError,
      formatImgUrl, triggerPrintReport,
      ...auth, signInAndLoad, signOutAndClear,
      ...coach, ...analytics, ...playerFeature, ...sessionFeature, ...videoFeature, ...csvFeature,
      ...arAnalyzer,
      // Passing the original refs (not Vue-unwrapped copies) maintains DOM/video ownership.
      analyzerController: markRaw(arAnalyzer)
    };
  }
}).mount('#app');
