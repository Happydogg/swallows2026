// SDL-003: chart, leaderboard and profile statistics state.
import { renderPlayerChartCanvas } from '../js/chartManager.js';
import {
  getPlayerSessionsList, getLatestPlayerMetric, calculatePlayerJumpRatio,
  getRowJumpRatio, getJumpRatioColorClass, computeTopMetrics,
  computeTopJumpRatios, formatPlayerHeightWeight, calculatePlayerAge,
  getClubThresholdCount, computeAvgBatSpeed, countSafetyAlerts,
  getAttackAngleColorClass
} from '../js/statsEngine.js';
import { getPlayerDisplayName, formatLegalName } from '../utils/playerUtils.js';
const { ref, reactive, computed, watch, nextTick } = Vue;

export function useAnalytics({ players, sessions, selectedPlayer, currentView, searchQuery, t }) {
  const chartMode = ref('velocity');

  const hasChartData = ref(false);

  const expandedSessionIds = reactive(new Set());

  const toggleSessionExpand = (sessionId) => {
    if (expandedSessionIds.has(sessionId)) {
      expandedSessionIds.delete(sessionId);
    } else {
      expandedSessionIds.add(sessionId);
    }
  };

  const isSessionExpanded = (sessionId) => expandedSessionIds.has(sessionId);

  const getPlayerSessions = (playerId) => getPlayerSessionsList(sessions.value, playerId);

  const getLatestMetric = (playerId, key) => getLatestPlayerMetric(sessions.value, playerId, key);

  const calculateJumpRatio = (playerId) => calculatePlayerJumpRatio(sessions.value, playerId);

  const getSessionJumpRatio = (session) => getRowJumpRatio(sessions.value, session);

  const getJumpRatioColor = getJumpRatioColorClass;

  const getTopMetrics = (key, count = 3, ascending = false) => computeTopMetrics(players.value, sessions.value, key, count, ascending);

  const getTopJumpRatios = (count = 3) => computeTopJumpRatios(players.value, sessions.value, count);

  const formatHeightWeight = (playerId) => formatPlayerHeightWeight(sessions.value, playerId);

  const calculateAge = calculatePlayerAge;

  const getClubCount = (threshold) => getClubThresholdCount(players.value, sessions.value, threshold);

  const avgBatSpeed = computed(() => computeAvgBatSpeed(players.value, sessions.value));

  const safetyAlertCount = computed(() => countSafetyAlerts(sessions.value));

  const getAttackAngleColor = getAttackAngleColorClass;

  const filteredPlayers = computed(() => {
    if (!searchQuery.value.trim()) return players.value;
    const q = searchQuery.value.toLowerCase().trim();
    return players.value.filter((p) => {
      const nameMatch = getPlayerDisplayName(p).toLowerCase().includes(q);
      const legalMatch = formatLegalName(p).toLowerCase().includes(q);
      const jerseyMatch = p.jersey != null && String(p.jersey).includes(q);
      const regMatch = p.hkll_reg_no && p.hkll_reg_no.toLowerCase().includes(q);
      return nameMatch || legalMatch || jerseyMatch || regMatch;
    });
  });

  const renderPlayerChart = () => {
    if (!selectedPlayer.value) return;
    hasChartData.value = renderPlayerChartCanvas({
      canvasId: 'playerVelocityChart',
      playerSessions: getPlayerSessions(selectedPlayer.value.id),
      chartMode: chartMode.value,
      t
    });
  };

  const setChartMode = mode => {
    chartMode.value = mode;
    nextTick(renderPlayerChart);
  };
  watch([currentView, selectedPlayer], () => {
    if (currentView.value === 'player' && selectedPlayer.value) nextTick(renderPlayerChart);
  });

  return { chartMode, hasChartData, expandedSessionIds, toggleSessionExpand, isSessionExpanded, getPlayerSessions, getLatestMetric, calculateJumpRatio, getSessionJumpRatio, getJumpRatioColor, getTopMetrics, getTopJumpRatios, formatHeightWeight, calculateAge, getClubCount, avgBatSpeed, safetyAlertCount, getAttackAngleColor, filteredPlayers, renderPlayerChart, setChartMode };
}
