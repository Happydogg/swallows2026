// SDL-004-005: all write controls disabled during read-only RLS pilot.
// No localStorage/PIN can grant coach permissions. Writes require future server policies.
const { ref } = Vue;
export function useCoachMode(t) {
  const isCoach = ref(false);
  const unlockCoachMode = () => alert('Coach editing is unavailable during SDL-004-005 security testing.');
  const lockCoachMode = () => { isCoach.value = false; };
  return { isCoach, unlockCoachMode, lockCoachMode };
}
