// SDL-003: session entry/edit state and commands.
import { insertSessionRecord, updateSessionRecord, deleteSessionRecord } from '../js/supabaseService.js';
import { cleanVal, convertSpeedValue, normalizeToKmh } from '../utils/sessionUtils.js';
const { ref, nextTick } = Vue;

export function useSessions({ sessions, isCoach, isSaving, t, expandedSessionIds, renderPlayerChart }) {
  const logSpeedUnit = ref('kmh');

  const editSpeedUnit = ref('kmh');

  const toggleSpeedUnit = (target, newUnit) => {
    const targetUnit = target === 'log' ? logSpeedUnit : editSpeedUnit;
    const targetObj = target === 'log' ? newSession.value : editingSession.value;
    if (targetUnit.value === newUnit || !targetObj) return;


    const toMph = newUnit === 'mph';
    targetObj.exit_velo = convertSpeedValue(targetObj.exit_velo, toMph);
    targetObj.control_exit_velo = convertSpeedValue(targetObj.control_exit_velo, toMph);
    targetObj.throwing_velo = convertSpeedValue(targetObj.throwing_velo, toMph);
    targetUnit.value = newUnit;
  };

  const showLogModal = ref(false);

  const showEditSessionModal = ref(false);

  const activePlayerForLog = ref(null);

  const editingSession = ref(null);

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

  const openLogModal = (player) => {
    if (!isCoach.value) return;
    activePlayerForLog.value = player;
    logSpeedUnit.value = 'kmh';
    showLogModal.value = true;
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

  return { logSpeedUnit, editSpeedUnit, toggleSpeedUnit, showLogModal, showEditSessionModal, activePlayerForLog, editingSession, newSession, openLogModal, saveSession, openEditSessionModal, updateSession, removeSession };
}
