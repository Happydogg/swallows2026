// SDL-UX-004: Authenticated staging player browser, presentation only.
// The coordinator supplies only coach-RPC or verified-guardian scoped rows.
export const StagingDataBrowser = {
  name: 'StagingDataBrowser',
  props: {
    players: { type: Array, required: true },
    mode: { type: String, required: true },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    videoHere: { type: Boolean, default: false }
  },
  emits: ['navigate', 'open-video'],
  setup(props) {
    const search = Vue.ref('');
    const visiblePlayers = Vue.computed(() => {
      const term = search.value.trim().toLocaleLowerCase();
      return props.players.filter(player =>
        !term || String(player.preferred_name || '').toLocaleLowerCase().includes(term)
      );
    });
    return { search, visiblePlayers };
  },
  template: `
    <section class="mb-6 space-y-4" aria-label="Live staging player browser">
      <div class="overflow-hidden rounded-2xl border border-sky-400/25 bg-gradient-to-r from-blue-950 to-slate-900 p-5 sm:p-6">
        <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-xs font-bold uppercase tracking-wider text-sky-300">Connected to SDL staging</p>
              <span class="rounded-full border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 text-xs font-semibold text-emerald-300">Authenticated</span>
            </div>
            <h2 class="mt-2 text-xl font-black text-white sm:text-2xl">{{ mode === 'coach' ? 'Your assigned team players' : 'Your linked players' }}</h2>
            <p class="mt-2 text-sm text-slate-300">These are records available to your signed-in account through existing staging permissions.</p>
          </div>
          <button type="button" @click="$emit('navigate','videos')" class="self-start rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500">View player videos</button>
        </div>
      </div>

      <p v-if="error" class="rounded-lg border border-rose-600/40 bg-rose-950/40 p-3 text-sm text-rose-300" role="alert">{{ error }}</p>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <label class="min-w-0 flex-1 text-sm text-slate-300" for="sdl-staging-player-search">
          <span class="sr-only">Search authorized player names</span>
          <input id="sdl-staging-player-search" v-model="search" type="search" placeholder="Search accessible players..."
            class="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-base text-white placeholder-slate-500 outline-none focus:border-cyan-400"/>
        </label>
        <span class="text-sm font-semibold text-slate-300">{{ loading ? 'Loading…' : visiblePlayers.length + ' visible' }}</span>
      </div>
      <p v-if="loading" role="status" class="rounded-xl border border-slate-700 bg-slate-800 p-5 text-sm text-slate-400">Loading authorized staging records…</p>
      <p v-else-if="!visiblePlayers.length" class="rounded-xl border border-dashed border-slate-600 bg-slate-900 p-5 text-sm text-slate-400">
        {{ search ? 'No players match your search.' : 'No player records are available for your current verified membership.' }}
      </p>
      <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <article v-for="player in visiblePlayers" :key="(player.team_id || 'family') + ':' + player.id"
          class="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
          <div class="flex gap-3">
            <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-950 font-black text-cyan-200">#{{ player.jersey || '–' }}</div>
            <div class="min-w-0 flex-1">
              <h3 class="truncate text-base font-bold text-white">{{ player.preferred_name || 'Unnamed athlete' }}</h3>
              <p v-if="player.team_name" class="mt-1 truncate text-xs text-slate-400">{{ player.team_name }}</p>
              <p class="mt-1 text-sm text-slate-300">{{ player.position || 'Position not recorded' }}</p>
              <p class="mt-1 text-xs text-slate-400">Bats {{ player.bats || '–' }} · Throws {{ player.throws || '–' }}</p>
            </div>
          </div>
          <button type="button" @click="$emit('open-video', player)"
            :aria-label="'Open private videos for ' + (player.preferred_name || 'this player')"
            class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-blue-900/35 px-4 py-3 text-sm font-bold text-sky-100 hover:bg-blue-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
            <span aria-hidden="true">▶</span><span>Open player videos</span>
          </button>
        </article>
      </div>
      <p class="text-xs text-slate-400">No birth dates, private contact details, or unapproved metrics are added by this browser. Video access is checked separately.</p>
    </section>
  `
};
