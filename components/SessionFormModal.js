// SDL-003: shared Add/Edit session measurements form.
export const SessionFormModal = {
  name: "SessionFormModal",
  props: {
    t: { type: Function, required: true },
    mode: { type: String, required: true },
    session: { type: Object, required: true },
    activePlayerForLog: { type: Object, required: true },
    getPlayerDisplayName: { type: Function, required: true },
    speedUnit: { type: String, required: true }
  },
  emits: ["close", "submit", "speed-unit"],
  template: `
<div class="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 no-print">
  <div class="bg-slate-800 border border-slate-700 rounded-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
    <h3 class="text-lg font-bold">{{ mode === 'edit' ? t('editSessionModalTitle') : t('logSessionTitle') + ': ' + getPlayerDisplayName(activePlayerForLog) }}</h3>

    <div class="space-y-4 text-sm">
      <div>
        <label class="block text-slate-400 text-xs mb-1">{{ t('date') }}</label>
        <input v-model="session.session_date" type="date" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
      </div>

      <!-- Growth & Power Section -->
      <div class="p-3 bg-slate-900/60 border border-slate-700/60 rounded-lg space-y-2">
        <p class="text-xs font-semibold text-blue-400 uppercase tracking-wider">{{ t('growthSectionHeader') }}</p>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block text-slate-400 text-xs mb-1">{{ t('heightCm') }}</label>
            <input v-model.number="session.height_cm" placeholder="e.g. 138" type="number" step="0.1" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
          </div>
          <div>
            <label class="block text-slate-400 text-xs mb-1">{{ t('weightKg') }}</label>
            <input v-model.number="session.weight_kg" placeholder="e.g. 34" type="number" step="0.1" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
          </div>
          <div>
            <label class="block text-slate-400 text-xs mb-1">{{ t('broadJumpCm') }}</label>
            <input v-model.number="session.broad_jump" placeholder="e.g. 155" type="number" step="1" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
          </div>
        </div>
      </div>

      <!-- Station Metrics Section with Unit Switcher -->
      <div class="p-3 bg-slate-900/60 border border-slate-700/60 rounded-lg space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-xs font-semibold text-emerald-400 uppercase tracking-wider">{{ t('stationMetricsHeader') }}</p>
          <div class="flex items-center gap-1 bg-slate-800 p-0.5 rounded border border-slate-700">
            <button 
              type="button" 
              @click="$emit('speed-unit', 'kmh')" 
              :class="speedUnit === 'kmh' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'"
              class="px-2 py-0.5 rounded text-xs transition">
              km/h
            </button>
            <button 
              type="button" 
              @click="$emit('speed-unit', 'mph')" 
              :class="speedUnit === 'mph' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-white'"
              class="px-2 py-0.5 rounded text-xs transition">
              mph (Blast)
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-400 text-xs mb-1">
              {{ t('personalBatExit') }} ({{ speedUnit === 'mph' ? 'mph' : 'km/h' }})
            </label>
            <input v-model.number="session.exit_velo" type="number" step="0.1" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
          </div>
          <div>
            <label class="block text-slate-400 text-xs mb-1">
              {{ t('controlBatExit') }} ({{ speedUnit === 'mph' ? 'mph' : 'km/h' }})
            </label>
            <input v-model.number="session.control_exit_velo" type="number" step="0.1" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
          </div>
          <div>
            <label class="block text-slate-400 text-xs mb-1">
              {{ t('throwingVeloInput') }} ({{ speedUnit === 'mph' ? 'mph' : 'km/h' }})
            </label>
            <input v-model.number="session.throwing_velo" placeholder="--" type="number" step="0.1" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
          </div>
          <div>
            <label class="block text-slate-400 text-xs mb-1">{{ t('attackAngleDeg') }}</label>
            <input v-model.number="session.attack_angle" type="number" step="0.5" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
          </div>
          <div>
            <label class="block text-slate-400 text-xs mb-1">{{ t('homeTo1stSec') }}</label>
            <input v-model.number="session.sprint_time" type="number" step="0.01" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
          </div>
          <div>
            <label class="block text-slate-400 text-xs mb-1">{{ t('domGripKg') }}</label>
            <input v-model.number="session.grip_dom" type="number" step="0.1" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
          </div>
          <div>
            <label class="block text-slate-400 text-xs mb-1">{{ t('fingerPinchKg') }}</label>
            <input v-model.number="session.pinch" type="number" step="0.1" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
          </div>
          <div>
            <label class="block text-slate-400 text-xs mb-1">{{ t('shoulderCheck') }}</label>
            <select v-model="session.shoulder_check" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
              <option value="Pass">{{ t('pass') }}</option>
              <option value="Adjust">{{ t('adjust') }}</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <button @click="$emit('close')" class="px-3 py-1.5 rounded text-sm text-slate-400 hover:text-white">{{ t('cancel') }}</button>
      <button @click="$emit('submit')" :class="mode === 'edit' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'" class="px-4 py-1.5 rounded text-sm font-medium text-white transition">{{ t(mode === 'edit' ? 'saveChanges' : 'saveRecord') }}</button>
    </div>
  </div>
</div>
  `
};
