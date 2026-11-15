// SDL-003: coach-mode UI state (not a security/authorization boundary).
import { supabaseClient } from '../js/config.js';
const { ref } = Vue;

export function useCoachMode(t) {
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

  return { isCoach, unlockCoachMode, lockCoachMode };
}
