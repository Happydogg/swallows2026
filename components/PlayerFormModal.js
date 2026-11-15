// SDL-002: Unified add/edit player modal. Root app owns state and persistence.
// In-DOM parent bindings use kebab-case. No direct Supabase writes here.
export const PlayerFormModal = {
  name: 'PlayerFormModal',
  props: {
    mode: { type: String, required: true, validator: value => ['add', 'edit'].includes(value) },
    player: { type: Object, required: true },
    positions: { type: Array, required: true },
    isSaving: { type: Boolean, required: true },
    isUploadingPhoto: { type: Boolean, required: true },
    isCoach: { type: Boolean, required: true },
    t: { type: Function, required: true },
    formatImgUrl: { type: Function, required: true }
  },
  emits: ['close', 'submit', 'name-part-input', 'preferred-name-input', 'toggle-position', 'file-upload'],
  setup(props, { emit }) { return { emit }; },
  template: `
    <div v-if="isCoach && player" class="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 no-print">
      <div class="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold">{{ t(mode === 'add' ? 'addPlayerModalTitle' : 'editPlayerModalTitle') }}</h3>
        <div class="space-y-3 text-sm">
          
          <!-- Legal / HKID Name Inputs -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-slate-400 text-xs mb-1 font-semibold">{{ t('lastName') }}</label>
              <input v-model="player.last_name" @input="emit('name-part-input')" placeholder="e.g. Ho / Wong" type="text" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-blue-500">
            </div>
            <div>
              <label class="block text-slate-400 text-xs mb-1 font-semibold">{{ t('givenNames') }}</label>
              <input v-model="player.given_names" @input="emit('name-part-input')" placeholder="e.g. Harvey Zhiping" type="text" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-blue-500">
            </div>
          </div>

          <!-- Preferred / Dugout Display Name -->
          <div>
            <label class="block text-slate-400 text-xs mb-1 font-semibold">
              {{ t('preferredName') }} <span v-if="mode === 'add'" class="text-blue-400 font-normal">({{ t('shownOnCards') }})</span>
            </label>
            <input v-model="player.preferred_name" @input="emit('preferred-name-input')" placeholder="e.g. Harvey Ho" type="text" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-blue-500">
            <p v-if="mode === 'add'" class="text-[11px] text-slate-500 mt-0.5">{{ t('preferredNameHint') }}</p>
          </div>

          <!-- Jersey & HKLL Registration Code -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-slate-400 text-xs mb-1">{{ t('jerseyNum') }}</label>
              <input v-model="player.jersey" type="text" inputmode="numeric" pattern="[0-9]{1,2}" autocomplete="off" maxlength="2" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-blue-500">
            </div>
            <div>
              <label class="block text-slate-400 text-xs mb-1 font-semibold">HKLL Reg #</label>
              <input v-model="player.hkll_reg_no" placeholder="e.g. 25-0062 / New" type="text" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-blue-500">
            </div>
          </div>

          <!-- DOB & Contact -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-slate-400 text-xs mb-1">{{ t('dob') }}</label>
              <input v-model="player.dob" type="date" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
            </div>
            <div>
              <label class="block text-slate-400 text-xs mb-1">{{ t('parentPhone') }}</label>
              <input v-model="player.parent_phone" placeholder="+852 9123 4567" type="tel" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
            </div>
          </div>

          <div v-if="mode === 'add'">
            <label class="block text-slate-400 text-xs mb-1">{{ t('photoUrl') }}</label>
            <input v-model="player.photo_url" placeholder="https://..." type="url" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none focus:border-blue-500">
          </div>

          <!-- Edit-only Photo Upload Block -->
          <template v-if="mode === 'edit'">
          <div class="p-3 bg-slate-900/60 border border-slate-700/80 rounded-lg space-y-2">
            <label class="block text-slate-300 text-xs font-semibold">{{ t('profilePhoto') }}</label>
            <div class="flex items-center gap-3">
              <div class="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-slate-800 border border-slate-600 flex items-center justify-center font-bold text-sm text-blue-300">
                <img v-if="player.photo_url" :src="formatImgUrl(player.photo_url)" class="w-full h-full object-cover">
                <span v-else>#{{ player.jersey }}</span>
              </div>
              
              <div class="flex-1 space-y-1">
                <label class="cursor-pointer inline-flex items-center justify-center gap-1.5 w-full bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/50 px-3 py-1.5 rounded text-xs font-semibold transition">
                  <span v-if="isUploadingPhoto">⏳ {{ t('uploading') }}</span>
                  <span v-else>📷 {{ t('takeOrUploadPhoto') }}</span>
                  <input type="file" accept="image/*" class="hidden" :disabled="isUploadingPhoto" @change="emit('file-upload', $event)">
                </label>
                <p class="text-[10px] text-slate-500">{{ t('compressNote') }}</p>
              </div>
            </div>

            <div>
              <input v-model="player.photo_url" placeholder="Or paste public image URL..." type="url" class="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-xs text-slate-300 outline-none focus:border-blue-500">
            </div>
          </div>

          </template>

          <div>
            <label class="block text-slate-400 text-xs mb-1.5">{{ t('selectPositions') }}</label>
            <div class="grid grid-cols-4 gap-2">
              <button 
                type="button" 
                v-for="posKey in ['IF', 'OF', 'P', 'C']" 
                :key="posKey" 
                @click="emit('toggle-position', posKey)" 
                :class="positions.includes(posKey) ? (mode === 'add' ? 'bg-blue-600 text-white border-blue-500' : 'bg-amber-600 text-white border-amber-500') : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'"
                class="py-1.5 px-2 rounded border text-xs font-semibold transition text-center">
                {{ posKey }}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-slate-400 text-xs mb-1">{{ t('throws') }}</label>
              <select v-model="player.throws" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
                <option value="R">R ({{ t('right') }})</option>
                <option value="L">L ({{ t('left') }})</option>
              </select>
            </div>
            <div>
              <label class="block text-slate-400 text-xs mb-1">{{ t('bats') }}</label>
              <select v-model="player.bats" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
                <option value="R">R ({{ t('right') }})</option>
                <option value="L">L ({{ t('left') }})</option>
                <option value="S">S ({{ t('switch') }})</option>
              </select>
            </div>
          </div>
          <div>
            <label class="block text-slate-400 text-xs mb-1">{{ t('personalBatSpec') }}</label>
            <input v-model="player.bat_spec" placeholder='e.g., 29" / 19oz / -10' type="text" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" @click="emit('close')" class="px-3 py-1.5 rounded text-sm text-slate-400 hover:text-white">{{ t('cancel') }}</button>
          <button type="button" @click="emit('submit')" :disabled="isSaving || isUploadingPhoto" :class="mode === 'add' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'" class="disabled:opacity-50 px-4 py-1.5 rounded text-sm font-medium text-white transition">{{ t(mode === 'add' ? 'saveToCloud' : 'saveChanges') }}</button>
        </div>
      </div>
    </div>
  `
};
