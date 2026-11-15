// SDL-003: lightweight Vue application coordinator (no bundler required).
// Feature state/commands live in composables, UI in components, I/O in services.
import { translations } from './translations.js';
import { formatImgUrl } from './mediaStorage.js';
import { fetchAllCloudData } from './supabaseService.js';
import { createArAnalyzerController } from './arAnalyzer.js';
import { compareJerseys } from '../utils/jerseyUtils.js';
import { useCoachMode } from '../composables/useCoachMode.js';
import { usePlayers } from '../composables/usePlayers.js';
import { useSessions } from '../composables/useSessions.js';
import { useVideos } from '../composables/useVideos.js';
import { useAnalytics } from '../composables/useAnalytics.js';
import { useRosterCsv } from '../composables/useRosterCsv.js';
import { AppHeader } from '../components/AppHeader.js';
import { TeamOverview } from '../components/TeamOverview.js';
import { PlayerFormModal } from '../components/PlayerFormModal.js';
import { PlayerProfile } from '../components/PlayerProfile.js';
import { SessionFormModal } from '../components/SessionFormModal.js';
import { UploadVideoModal } from '../components/UploadVideoModal.js';
import { ArAnalyzerModal } from '../components/ArAnalyzerModal.js';

const { createApp, ref, onMounted, markRaw } = Vue;

createApp({
  components: {
    AppHeader, TeamOverview, PlayerFormModal, PlayerProfile,
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

    const fetchAllData = async () => {
      loading.value = true;
      try {
        const data = await fetchAllCloudData();
        players.value = data.players.sort(compareJerseys);
        sessions.value = data.sessions;
        drillVideos.value = data.drillVideos;
      } catch (err) {
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
    onMounted(() => {
      fetchAllData();
      arAnalyzer.initPoseTracker();
    });

    return {
      currentLang, t, saveLanguage, loading, isSaving, currentView, overviewTab, searchQuery,
      selectedPlayer, players, sessions, drillVideos,
      formatImgUrl, triggerPrintReport,
      ...coach, ...analytics, ...playerFeature, ...sessionFeature, ...videoFeature, ...csvFeature,
      ...arAnalyzer,
      // Passing the original refs (not Vue-unwrapped copies) maintains DOM/video ownership.
      analyzerController: markRaw(arAnalyzer)
    };
  }
}).mount('#app');
