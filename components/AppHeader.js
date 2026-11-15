// SDL-003: navigation and coach toolbar.
export const AppHeader = {
  name: "AppHeader",
  props: {
    t: { type: Function, required: true },
    currentLang: { type: String, required: true },
    isCoach: { type: Boolean, required: true },
    currentView: { type: String, required: true }
  },
  emits: ["change-language", "navigate-overview", "export-csv", "import-csv", "add-player", "lock-coach", "unlock-coach"],
  template: `
<header class="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-4 mb-6 gap-4 no-print">
  <div>
    <h1 class="text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
      <img src="./logo.png" alt="Swallows Logo" class="w-8 h-8 rounded-lg shadow-sm object-contain border border-slate-700 bg-slate-950">
      <span>SWALLOWS <span class="text-emerald-400">DATALAB</span></span>
    </h1>
    <p class="text-sm text-slate-400 mt-0.5">
      {{ t('cloudSynced') }} • 
      <span v-if="isCoach" class="text-emerald-400 font-medium">{{ t('coachUnlocked') }}</span>
      <span v-else class="text-slate-500 font-medium">{{ t('readOnlyView') }}</span>
    </p>
  </div>

  <div class="flex flex-wrap items-center gap-2">
    <!-- Language Switcher Dropdown -->
    <select :value="currentLang" @change="$emit('change-language', $event.target.value)" class="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-md px-2.5 py-1.5 outline-none focus:border-blue-500">
      <option value="en">English (EN)</option>
      <option value="zh">繁體中文 (ZH)</option>
      <option value="ja">日本語 (JA)</option>
    </select>

    <!-- Navigation: Team Overview -->
    <button @click="$emit('navigate-overview')" :class="currentView === 'overview' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'" class="px-3 py-1.5 rounded-md text-sm font-medium transition">
      {{ t('teamOverview') }}
    </button>

    <!-- Coach Only Action Toolbar -->
    <template v-if="isCoach">
      <!-- Export CSV Roster / Parent Check-in Template -->
      <button @click="$emit('export-csv')" class="bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-md text-sm font-medium text-white transition flex items-center gap-1">
        📊 {{ t('exportCSV') }}
      </button>

      <!-- Batch Import CSV Roster / Quarterly Check-in Updates -->
      <label class="bg-purple-600 hover:bg-purple-500 px-3 py-1.5 rounded-md text-sm font-medium text-white transition cursor-pointer flex items-center gap-1">
        📂 {{ t('importCSV') }}
        <input type="file" accept=".csv" class="hidden" @change="$emit('import-csv', $event)">
      </label>

      <!-- Add Single Player Button -->
      <button @click="$emit('add-player')" class="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-md text-sm font-medium text-white transition">
        + {{ t('addPlayer') }}
      </button>

      <!-- Lock Coach Mode -->
      <button @click="$emit('lock-coach')" class="bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 border border-slate-700 px-3 py-1.5 rounded-md text-sm font-medium transition">
        {{ t('lock') }}
      </button>
    </template>

    <!-- Public/Parent View: Coach Unlock Trigger -->
    <template v-else>
      <button @click="$emit('unlock-coach')" class="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-md text-sm font-medium transition">
        🔒 {{ t('coachUnlock') }}
      </button>
    </template>
  </div>
</header>
  `
};
