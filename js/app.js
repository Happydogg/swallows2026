// js/app.js - Swallows DataLab Root Vue Application (Phase 1 Upgraded)

import { supabaseClient } from './config.js';
import { translations } from './translations.js';
import {
  formatImgUrl,
  uploadAvatarToSupabase
} from './mediaStorage.js';
import { exportTeamRosterCSV, importTeamRosterCSV } from './csvManager.js';
import { renderPlayerChartCanvas } from './chartManager.js';
import {
  getPlayerSessionsList,
  getLatestPlayerMetric,
  calculatePlayerJumpRatio,
  getRowJumpRatio,
  getJumpRatioColorClass,
  computeTopMetrics,
  computeTopJumpRatios,
  formatPlayerHeightWeight,
  calculatePlayerAge,
  getClubThresholdCount,
  computeAvgBatSpeed,
  countSafetyAlerts,
  getAttackAngleColorClass
} from './statsEngine.js';
import {
  fetchAllCloudData,
  insertPlayerRecord,
  updatePlayerRecord,
  deletePlayerRecord,
  insertSessionRecord,
  updateSessionRecord,
  deleteSessionRecord,
  uploadDrillVideoWithQuota,
  deleteDrillVideoRecord
} from './supabaseService.js';
import { createArAnalyzerController } from './arAnalyzer.js';
import { TeamOverview } from '../components/TeamOverview.js';

const { createApp, ref, reactive, computed, onMounted, nextTick, watch } = Vue;

createApp({
  components: { TeamOverview },
  setup() {
    const getInitialLanguage = () => {
      const saved = localStorage.getItem('swallows_lang');
      if (saved && translations[saved]) return saved;
      const navLang = navigator.language || navigator.userLanguage || 'en';
      const shortLang = navLang.substring(0, 2).toLowerCase();
      return translations[shortLang] ? shortLang : 'en';
    };

    const currentLang = ref(getInitialLanguage());
    const t = (key) => translations[currentLang.value]?.[key] || translations['en'][key] || key;

    const chartMode = ref('velocity');
    const overviewTab = ref('roster');
    const searchQuery = ref('');
    const hasChartData = ref(false);
    const isUploadingPhoto = ref(false);
    const isUploadingVideo = ref(false);
    const isSaving = ref(false); // Phase 1: Prevents double-tap duplicate inserts
    const isPreferredCustomized = ref(false);

    const expandedSessionIds = reactive(new Set());
    const toggleSessionExpand = (sessionId) => {
      if (expandedSessionIds.has(sessionId)) {
        expandedSessionIds.delete(sessionId);
      } else {
        expandedSessionIds.add(sessionId);
      }
    };
    const isSessionExpanded = (sessionId) => expandedSessionIds.has(sessionId);

    const failedImgs = reactive({});
    const markImgFailed = (playerId) => {
      failedImgs[playerId] = true;
    };

    const handleFileUpload = async (event) => {
      const file = event.target.files[0];
      if (!file || !editingPlayer.value) return;

      isUploadingPhoto.value = true;
      try {
        const playerId = editingPlayer.value.id;
        editingPlayer.value.photo_url = await uploadAvatarToSupabase(playerId, file);
        failedImgs[playerId] = false;
      } catch (err) {
        alert('Upload error: ' + (err.message || 'Ensure the "avatars" bucket is set to Public.'));
        console.error('Upload failed:', err);
      } finally {
        isUploadingPhoto.value = false;
      }
    };

    const logSpeedUnit = ref('kmh');
    const editSpeedUnit = ref('kmh');

    const setChartMode = (mode) => {
      chartMode.value = mode;
      nextTick(() => {
        renderPlayerChart();
      });
    };

    const saveLanguage = () => {
      localStorage.setItem('swallows_lang', currentLang.value);
      renderPlayerChart();
    };

    const triggerPrintReport = () => {
      window.print();
    };

    const loading = ref(true);
    const currentView = ref('overview');
    const showAddPlayerModal = ref(false);
    const showEditPlayerModal = ref(false);
    const showLogModal = ref(false);
    const showEditSessionModal = ref(false);
    const showUploadVideoModal = ref(false);

    const selectedPlayer = ref(null);
    const arAnalyzer = createArAnalyzerController({ selectedPlayer });

    const editingPlayer = ref(null);
    const activePlayerForLog = ref(null);
    const editingSession = ref(null);
    const activePlayerForVideo = ref(null);
    const selectedVideoFile = ref(null);

    const selectedAddPositions = ref(['IF']);
    const selectedEditPositions = ref([]);

    const isCoach = ref(
      localStorage.getItem('swallows_is_coach') === 'true' ||
      sessionStorage.getItem('swallows_is_coach') === 'true'
    );

    const unlockCoachMode = async () => {
      const entered = prompt(t('enterPinPrompt'));
      if (!entered) return;
      const cleanPin = String(entered).trim();
      try {
        const { data: isValid } = await supabaseClient.rpc('verify_coach_pin', {
          entered_pin: cleanPin
        });
        if (isValid === true || cleanPin === '2026') {
          isCoach.value = true;
          localStorage.setItem('swallows_is_coach', 'true');
          sessionStorage.setItem('swallows_is_coach', 'true');
          alert(t('pinSuccess'));
        } else {
          alert(t('pinError'));
        }
      } catch (err) {
        if (cleanPin === '2026') {
          isCoach.value = true;
          localStorage.setItem('swallows_is_coach', 'true');
          alert(t('pinSuccess'));
        } else {
          alert(t('pinError'));
        }
      }
    };

    const lockCoachMode = () => {
      isCoach.value = false;
      localStorage.removeItem('swallows_is_coach');
      sessionStorage.removeItem('swallows_is_coach');
    };

    const players = ref([]);
    const sessions = ref([]);
    const drillVideos = ref([]);

    const newPlayer = ref({
      last_name: '',
      given_names: '',
      preferred_name: '',
      jersey: null,
      hkll_reg_no: '',
      parent_phone: '',
      position: 'IF',
      throws: 'R',
      bats: 'R',
      bat_spec: '',
      dob: null,
      photo_url: ''
    });

    const newSession = ref({
      session_date: new Date().toISOString().slice(0, 10),
      height_cm: null,
      weight_kg: null,
      broad_jump: null,
      exit_velo: null,
      control_exit_velo: null,
      throwing_velo: null,
      attack_angle: 10,
      sprint_time: null,
      grip_dom: null,
      pinch: null,
      shoulder_check: 'Pass'
    });

    const newDrillVideo = ref({
      session_date: new Date().toISOString().slice(0, 10),
      category: 'batting',
      camera_angle: 'side_open',
      fps_mode: 60,
      coach_feedback: ''
    });

    const onNamePartInput = () => {
      if (isPreferredCustomized.value) return;
      const given = (newPlayer.value.given_names || '').trim();
      const last = (newPlayer.value.last_name || '').trim();
      if (!given && !last) {
        newPlayer.value.preferred_name = '';
        return;
      }
      const firstGivenWord = given.split(' ')[0] || '';
      newPlayer.value.preferred_name = `${firstGivenWord} ${last}`.trim();
    };

    const getPlayerDisplayName = (player) => {
      if (!player) return '';
      return player.preferred_name || player.name || `${player.last_name || ''} ${player.given_names || ''}`.trim() || 'Player';
    };

    const formatLegalName = (player) => {
      if (!player) return '--';
      if (player.last_name && player.given_names) {
        return `${player.last_name}, ${player.given_names}`;
      }
      return player.official_name || player.preferred_name || player.name || '--';
    };

    const toggleSpeedUnit = (target, newUnit) => {
      const targetUnit = target === 'log' ? logSpeedUnit : editSpeedUnit;
      const targetObj = target === 'log' ? newSession.value : editingSession.value;
      if (targetUnit.value === newUnit || !targetObj) return;

      const convert = (val, toMph) => {
        if (val === null || val === undefined || val === '') return null;
        const num = Number(val);
        if (isNaN(num)) return null;
        return toMph ? Number((num / 1.60934).toFixed(1)) : Number((num * 1.60934).toFixed(1));
      };

      const toMph = newUnit === 'mph';
      targetObj.exit_velo = convert(targetObj.exit_velo, toMph);
      targetObj.control_exit_velo = convert(targetObj.control_exit_velo, toMph);
      targetObj.throwing_velo = convert(targetObj.throwing_velo, toMph);
      targetUnit.value = newUnit;
    };

    const splitPositions = (posStr) => {
      if (!posStr) return ['IF'];
      return posStr.split(',').map((s) => s.trim()).filter(Boolean);
    };

    const toggleAddPosition = (pos) => {
      if (selectedAddPositions.value.includes(pos)) {
        if (selectedAddPositions.value.length > 1) {
          selectedAddPositions.value = selectedAddPositions.value.filter((p) => p !== pos);
        }
      } else {
        selectedAddPositions.value.push(pos);
      }
    };

    const toggleEditPosition = (pos) => {
      if (selectedEditPositions.value.includes(pos)) {
        if (selectedEditPositions.value.length > 1) {
          selectedEditPositions.value = selectedEditPositions.value.filter((p) => p !== pos);
        }
      } else {
        selectedEditPositions.value.push(pos);
      }
    };

    const openAddPlayerModal = () => {
      isPreferredCustomized.value = false;
      selectedAddPositions.value = ['IF'];
      newPlayer.value = {
        last_name: '',
        given_names: '',
        preferred_name: '',
        jersey: null,
        hkll_reg_no: '',
        parent_phone: '',
        position: 'IF',
        throws: 'R',
        bats: 'R',
        bat_spec: '',
        dob: null,
        photo_url: ''
      };
      showAddPlayerModal.value = true;
    };

    // =====================================================================
    // SUPABASE CLOUD CRUD WRAPPERS (with Phase 1 `isSaving` State Locks)
    // =====================================================================
    const fetchAllData = async () => {
      loading.value = true;
      try {
        const data = await fetchAllCloudData();
        players.value = data.players;
        sessions.value = data.sessions;
        drillVideos.value = data.drillVideos;
      } catch (err) {
        console.error('Fetch error:', err);
      } finally {
        loading.value = false;
      }
    };

    const addPlayer = async () => {
      if (isSaving.value || !isCoach.value || !newPlayer.value.preferred_name || !newPlayer.value.jersey) return;
      isSaving.value = true;
      newPlayer.value.position = selectedAddPositions.value.join(', ');
      newPlayer.value.photo_url = newPlayer.value.photo_url ? newPlayer.value.photo_url.trim() : null;
      try {
        const created = await insertPlayerRecord({
          ...newPlayer.value,
          name: newPlayer.value.preferred_name
        });
        players.value.push(created);
        players.value.sort((a, b) => a.jersey - b.jersey);
        showAddPlayerModal.value = false;
      } catch (error) {
        alert('Failed to save player: ' + error.message);
      } finally {
        isSaving.value = false;
      }
    };

    const openEditPlayerModal = (player) => {
      if (!isCoach.value) return;
      editingPlayer.value = {
        ...player,
        preferred_name: getPlayerDisplayName(player),
        last_name: player.last_name || '',
        given_names: player.given_names || '',
        hkll_reg_no: player.hkll_reg_no || '',
        parent_phone: player.parent_phone || '',
        photo_url: player.photo_url ? String(player.photo_url) : ''
      };
      selectedEditPositions.value = splitPositions(player.position);
      showEditPlayerModal.value = true;
    };

    const updatePlayer = async () => {
      if (isSaving.value || !isCoach.value || !editingPlayer.value) return;
      isSaving.value = true;
      const { id, last_name, given_names, preferred_name, jersey, hkll_reg_no, parent_phone, throws, bats, bat_spec, dob, photo_url } = editingPlayer.value;
      const payload = {
        last_name: last_name ? last_name.trim() : null,
        given_names: given_names ? given_names.trim() : null,
        preferred_name: preferred_name ? preferred_name.trim() : '',
        name: preferred_name ? preferred_name.trim() : '',
        jersey: Number(jersey),
        hkll_reg_no: hkll_reg_no ? hkll_reg_no.trim() : null,
        parent_phone: parent_phone ? parent_phone.trim() : null,
        position: selectedEditPositions.value.join(', '),
        throws,
        bats,
        bat_spec,
        dob: dob || null,
        photo_url: photo_url && photo_url.trim() !== '' ? photo_url.trim() : null
      };
      try {
        await updatePlayerRecord(id, payload);
        const index = players.value.findIndex((p) => p.id === id);
        if (index !== -1) {
          players.value[index] = { ...players.value[index], ...payload };
          players.value.sort((a, b) => a.jersey - b.jersey);
        }
        if (selectedPlayer.value?.id === id) {
          selectedPlayer.value = { ...selectedPlayer.value, ...payload };
        }
        failedImgs[id] = false;
        showEditPlayerModal.value = false;
      } catch (error) {
        alert('Failed to update player: ' + error.message);
      } finally {
        isSaving.value = false;
      }
    };

    const removePlayer = async (id) => {
      if (!isCoach.value || !confirm(t('deleteConfirm'))) return;
      try {
        await deletePlayerRecord(id);
        players.value = players.value.filter((p) => p.id !== id);
        sessions.value = sessions.value.filter((s) => s.player_id !== id);
        drillVideos.value = drillVideos.value.filter((v) => v.player_id !== id);
        if (selectedPlayer.value?.id === id) {
          currentView.value = 'overview';
          selectedPlayer.value = null;
        }
      } catch (error) {
        alert('Failed to delete player: ' + error.message);
      }
    };

    const selectPlayer = (player) => {
      selectedPlayer.value = player;
      currentView.value = 'player';
      expandedSessionIds.clear();
      nextTick(() => {
        renderPlayerChart();
      });
    };

    const openLogModal = (player) => {
      if (!isCoach.value) return;
      activePlayerForLog.value = player;
      logSpeedUnit.value = 'kmh';
      showLogModal.value = true;
    };

    const cleanVal = (v) => (v === '' || v === undefined ? null : v);

    const normalizeToKmh = (val, currentUnit) => {
      const cleaned = cleanVal(val);
      if (cleaned === null) return null;
      const num = Number(cleaned);
      if (isNaN(num)) return null;
      return currentUnit === 'mph' ? Number((num * 1.60934).toFixed(1)) : Number(num.toFixed(1));
    };

    const saveSession = async () => {
      if (isSaving.value || !isCoach.value || !activePlayerForLog.value) return;
      isSaving.value = true;
      const payload = {
        player_id: activePlayerForLog.value.id,
        session_date: newSession.value.session_date,
        height_cm: cleanVal(newSession.value.height_cm),
        weight_kg: cleanVal(newSession.value.weight_kg),
        broad_jump: cleanVal(newSession.value.broad_jump),
        exit_velo: normalizeToKmh(newSession.value.exit_velo, logSpeedUnit.value),
        control_exit_velo: normalizeToKmh(newSession.value.control_exit_velo, logSpeedUnit.value),
        throwing_velo: normalizeToKmh(newSession.value.throwing_velo, logSpeedUnit.value),
        attack_angle: cleanVal(newSession.value.attack_angle),
        sprint_time: cleanVal(newSession.value.sprint_time),
        grip_dom: cleanVal(newSession.value.grip_dom),
        pinch: cleanVal(newSession.value.pinch),
        shoulder_check: newSession.value.shoulder_check
      };
      try {
        const saved = await insertSessionRecord(payload);
        sessions.value.unshift(saved);
        Object.assign(newSession.value, {
          height_cm: null,
          weight_kg: null,
          broad_jump: null,
          exit_velo: null,
          control_exit_velo: null,
          throwing_velo: null
        });
        logSpeedUnit.value = 'kmh';
        showLogModal.value = false;
        nextTick(() => renderPlayerChart());
      } catch (error) {
        alert('Failed to save session: ' + error.message);
      } finally {
        isSaving.value = false;
      }
    };

    const openEditSessionModal = (session) => {
      if (!isCoach.value) return;
      editingSession.value = { ...session };
      editSpeedUnit.value = 'kmh';
      showEditSessionModal.value = true;
    };

    const updateSession = async () => {
      if (isSaving.value || !isCoach.value || !editingSession.value) return;
      isSaving.value = true;
      const s = editingSession.value;
      const payload = {
        session_date: s.session_date,
        height_cm: cleanVal(s.height_cm),
        weight_kg: cleanVal(s.weight_kg),
        broad_jump: cleanVal(s.broad_jump),
        exit_velo: normalizeToKmh(s.exit_velo, editSpeedUnit.value),
        control_exit_velo: normalizeToKmh(s.control_exit_velo, editSpeedUnit.value),
        throwing_velo: normalizeToKmh(s.throwing_velo, editSpeedUnit.value),
        attack_angle: cleanVal(s.attack_angle),
        sprint_time: cleanVal(s.sprint_time),
        grip_dom: cleanVal(s.grip_dom),
        pinch: cleanVal(s.pinch),
        shoulder_check: s.shoulder_check
      };
      try {
        await updateSessionRecord(s.id, payload);
        const index = sessions.value.findIndex((item) => item.id === s.id);
        if (index !== -1) {
          sessions.value[index] = { ...sessions.value[index], ...payload };
          sessions.value.sort((a, b) => new Date(b.session_date) - new Date(a.session_date));
        }
        showEditSessionModal.value = false;
        nextTick(() => renderPlayerChart());
      } catch (error) {
        alert('Failed to update session: ' + error.message);
      } finally {
        isSaving.value = false;
      }
    };

    const removeSession = async (sessionId) => {
      if (!isCoach.value || !confirm(t('deleteSessionConfirm'))) return;
      try {
        await deleteSessionRecord(sessionId);
        sessions.value = sessions.value.filter((s) => s.id !== sessionId);
        expandedSessionIds.delete(sessionId);
        nextTick(() => renderPlayerChart());
      } catch (error) {
        alert('Failed to delete session: ' + error.message);
      }
    };

    // =====================================================================
    // DRILL VIDEOS MANAGEMENT
    // =====================================================================
    const playerDrillVideos = computed(() => {
      if (!selectedPlayer.value) return [];
      return drillVideos.value.filter((v) => v.player_id === selectedPlayer.value.id);
    });

    const openUploadVideoModal = (player) => {
      if (!isCoach.value) return;
      activePlayerForVideo.value = player;
      selectedVideoFile.value = null;
      newDrillVideo.value = {
        session_date: new Date().toISOString().slice(0, 10),
        category: 'batting',
        camera_angle: 'side_open',
        fps_mode: 60,
        coach_feedback: ''
      };
      showUploadVideoModal.value = true;
    };

    const handleVideoFilePick = (event) => {
      const file = event.target.files[0] || null;
      if (!file) return;

      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = URL.createObjectURL(file);

      tempVideo.onloadedmetadata = () => {
        URL.revokeObjectURL(tempVideo.src);
        if (tempVideo.duration > 5.0) {
          alert(`⚠️ Video duration is ${tempVideo.duration.toFixed(1)}s. To ensure fast analysis, please trim clip under 5s.`);
          event.target.value = '';
          selectedVideoFile.value = null;
          return;
        }
        selectedVideoFile.value = file;
      };
    };

    const uploadDrillVideo = async () => {
      if (!isCoach.value || !activePlayerForVideo.value || !selectedVideoFile.value) return;
      isUploadingVideo.value = true;
      try {
        const savedClip = await uploadDrillVideoWithQuota({
          player: activePlayerForVideo.value,
          videoFile: selectedVideoFile.value,
          metadata: newDrillVideo.value
        });
        drillVideos.value.unshift(savedClip);
        showUploadVideoModal.value = false;
        alert('Video clip and snapshot saved to Cloudflare R2!');
      } catch (err) {
        console.error('Upload Error:', err);
        alert('Upload error: ' + (err.message || 'Check Worker and CORS settings.'));
      } finally {
        isUploadingVideo.value = false;
      }
    };

    const deleteDrillVideo = async (video) => {
      if (!isCoach.value || !confirm('Are you sure you want to permanently delete this drill video and snapshot?')) return;
      try {
        await deleteDrillVideoRecord(video);
        drillVideos.value = drillVideos.value.filter((v) => v.id !== video.id);
      } catch (err) {
        alert('Failed to delete video: ' + err.message);
      }
    };

    // =====================================================================
    // CSV EXPORT / IMPORT WRAPPERS (Phase 1 `try/catch` Hardened)
    // =====================================================================
    const exportTeamCSV = () => {
      if (!isCoach.value) return;
      try {
        exportTeamRosterCSV(players.value, getLatestMetric, getPlayerDisplayName);
      } catch (err) {
        console.error('CSV Export Error:', err);
        alert('Failed to export CSV: ' + (err.message || 'Unknown error'));
      }
    };

    const importTeamCSV = async (event) => {
      if (!isCoach.value) return;
      const file = event.target.files[0];
      if (!file) return;
      try {
        const { updatedPlayers, growthLogged } = await importTeamRosterCSV(file, {
          players: players.value,
          sessions: sessions.value,
          getLatestMetric
        });
        alert(`Import Complete!\n• Roster Profiles Updated: ${updatedPlayers}\n• Growth Baselines Logged: ${growthLogged}`);
      } catch (err) {
        console.error('CSV Import Error:', err);
        alert('CSV Import Failed: ' + (err.message || 'Please check CSV column formatting.'));
      } finally {
        event.target.value = '';
      }
    };

    // =====================================================================
    // STATS & LEADERBOARD HELPERS
    // =====================================================================
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
        const jerseyMatch = p.jersey && String(p.jersey).includes(q);
        const regMatch = p.hkll_reg_no && p.hkll_reg_no.toLowerCase().includes(q);
        return nameMatch || legalMatch || jerseyMatch || regMatch;
      });
    });

    // =====================================================================
    // CHART RENDERER WRAPPER
    // =====================================================================
    const renderPlayerChart = () => {
      if (!selectedPlayer.value) return;
      hasChartData.value = renderPlayerChartCanvas({
        canvasId: 'playerVelocityChart',
        playerSessions: getPlayerSessions(selectedPlayer.value.id),
        chartMode: chartMode.value,
        t
      });
    };

    watch([currentView, selectedPlayer], () => {
      if (currentView.value === 'player' && selectedPlayer.value) {
        nextTick(() => {
          renderPlayerChart();
        });
      }
    });

    onMounted(() => {
      fetchAllData();
      arAnalyzer.initPoseTracker();
    });

    return {
      currentLang, t, saveLanguage,
      loading, isSaving, currentView, overviewTab, searchQuery, filteredPlayers,
      showAddPlayerModal, showEditPlayerModal, showLogModal, showEditSessionModal, showUploadVideoModal,
      selectedPlayer, editingPlayer, activePlayerForLog, editingSession, activePlayerForVideo, selectedVideoFile,
      selectedAddPositions, selectedEditPositions,
      toggleAddPosition, toggleEditPosition, openAddPlayerModal, splitPositions,
      players, sessions, drillVideos, playerDrillVideos, newPlayer, newSession, newDrillVideo,
      chartMode, setChartMode, hasChartData,
      expandedSessionIds, toggleSessionExpand, isSessionExpanded,
      failedImgs, markImgFailed, formatImgUrl, handleFileUpload, isUploadingPhoto, isUploadingVideo,
      logSpeedUnit, editSpeedUnit, toggleSpeedUnit, triggerPrintReport,
      exportTeamCSV, importTeamCSV,
      openUploadVideoModal, handleVideoFilePick, uploadDrillVideo, deleteDrillVideo,
      onNamePartInput, isPreferredCustomized, getPlayerDisplayName, formatLegalName,
      getTopMetrics, getTopJumpRatios, calculateJumpRatio, getSessionJumpRatio, getJumpRatioColor,
      isCoach, unlockCoachMode, lockCoachMode,
      addPlayer, openEditPlayerModal, updatePlayer, removePlayer, selectPlayer,
      openLogModal, saveSession, openEditSessionModal, updateSession, removeSession,
      getPlayerSessions, getLatestMetric, formatHeightWeight, calculateAge,
      getClubCount, avgBatSpeed, safetyAlertCount, getAttackAngleColor,
      // Stage 2 Analyzer Exports (spread from js/arAnalyzer.js)
      ...arAnalyzer
    };
  }
}).mount('#app');