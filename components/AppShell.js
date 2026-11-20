// SDL-UX-002: Shared responsive chrome. UI routing does not grant permissions.
const DESTINATIONS = Object.freeze([
  { id: 'home', text: 'Home', symbol: '⌂' },
  { id: 'team', text: 'Team', symbol: '♟' },
  { id: 'stats', text: 'Stats', symbol: '▥' },
  { id: 'videos', text: 'Videos', symbol: '▷' },
  { id: 'me', text: 'Me', symbol: '◉' }
]);

export const AppShell = {
  name: 'AppShell',
  props: {
    activeTab: { type: String, required: true },
    mode: { type: String, required: true },
    canCoach: { type: Boolean, default: false },
    canFamily: { type: Boolean, default: false },
    accountEmail: { type: String, default: '' },
    signOutBusy: { type: Boolean, default: false }
  },
  emits: ['navigate', 'mode-change', 'sign-out'],
  setup() { return { destinations: DESTINATIONS }; },
  template: `
    <div class="min-h-screen text-slate-100 md:flex md:gap-6">
      <aside class="hidden md:sticky md:top-4 md:z-30 md:flex md:h-[calc(100vh-2rem)] md:max-h-[calc(100dvh-2rem)] md:w-52 lg:w-60 md:shrink-0 md:self-start md:flex-col md:overflow-y-auto md:overscroll-contain md:rounded-3xl md:border md:border-slate-700/70 md:bg-slate-950/95 md:p-4 md:shadow-xl no-print" aria-label="App navigation">
        <div class="flex items-center gap-3 border-b border-slate-700/70 px-2 pb-6 pt-2">
          <img src="./logo.png" alt="" class="h-11 w-11 rounded-xl object-contain">
          <div class="text-sm font-black leading-tight tracking-wider">SWALLOWS<br><span class="text-cyan-400">DATALAB</span></div>
        </div>
        <p class="mb-3 mt-7 px-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Workspace</p>
        <nav class="space-y-2" aria-label="Primary navigation">
          <button v-for="item in destinations" :key="item.id" type="button"
            @click="$emit('navigate',item.id)" :aria-current="activeTab === item.id ? 'page' : undefined"
            :class="activeTab === item.id ? 'border-blue-400/40 bg-blue-600 text-white shadow-lg shadow-blue-950/50' : 'border-transparent text-slate-300 hover:bg-slate-800 hover:text-white'"
            class="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
            <span class="w-6 text-center text-xl" aria-hidden="true">{{ item.symbol }}</span>{{ item.text }}
          </button>
        </nav>
        <div class="mt-auto space-y-3 border-t border-slate-800 px-2 pt-5">
          <p class="truncate text-xs text-slate-400" :title="accountEmail">{{ accountEmail }}</p>
          <p class="text-xs font-semibold text-emerald-300">{{ mode==='coach' ? 'Coach workspace' : mode==='family' ? 'Family workspace' : mode==='admin' ? 'Club administration' : 'Limited access' }}</p>
          <button type="button" @click="$emit('sign-out')" :disabled="signOutBusy"
            class="w-full rounded-lg border border-slate-700 px-3 py-3 text-left text-sm font-semibold text-slate-300 hover:border-slate-500 disabled:opacity-50">Sign out</button>
        </div>
      </aside>

      <div class="min-w-0 flex-1 pb-24 md:pb-5">
        <header class="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-700/70 bg-slate-950/80 px-4 py-3 md:px-5 no-print">
          <div class="flex min-w-0 items-center gap-3">
            <img src="./logo.png" alt="" class="h-9 w-9 rounded-lg object-contain md:hidden"/>
            <div class="min-w-0">
              <p class="truncate text-xs font-black tracking-widest text-white md:text-sm">SWALLOWS <span class="text-cyan-400">DATALAB</span></p>
              <p class="text-xs text-slate-400">{{ mode==='coach' ? 'Coach' : mode==='family' ? 'My family' : mode==='admin' ? 'Club admin' : 'My account' }} · {{ destinations.find(item=>item.id===activeTab)?.text || 'Home' }}</p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <label v-if="canCoach && canFamily" class="text-xs text-slate-300">
              <span class="sr-only">Workspace mode</span>
              <select :value="mode" @change="$emit('mode-change',$event.target.value)"
                class="max-w-36 rounded-lg border border-slate-600 bg-slate-900 px-2 py-2 text-xs font-semibold text-white">
                <option value="coach">Coach</option><option value="family">Family</option>
              </select>
            </label>
            <span v-else class="rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1.5 text-xs font-semibold text-emerald-300">{{ mode==='coach' ? 'COACH' : mode==='family' ? 'FAMILY' : mode==='admin' ? 'ADMIN' : 'MEMBER' }}</span>
          </div>
        </header>

        <main id="sdl-workspace-content" class="min-w-0" tabindex="-1">
          <slot></slot>
        </main>
      </div>

      <nav aria-label="Mobile primary navigation"
        class="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-slate-700 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] shadow-2xl backdrop-blur-lg md:hidden no-print">
        <button v-for="item in destinations" :key="item.id" type="button" @click="$emit('navigate',item.id)"
          :aria-current="activeTab===item.id ? 'page' : undefined"
          :class="activeTab===item.id ? 'text-cyan-300' : 'text-slate-400'"
          class="flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
          <span class="text-xl leading-none" aria-hidden="true">{{ item.symbol }}</span><span>{{ item.text }}</span>
        </button>
      </nav>
    </div>
  `
};
