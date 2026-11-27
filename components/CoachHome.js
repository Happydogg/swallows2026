// SDL-UX-002: Coach-first, read-only summary of a server-scoped roster.
// This dashboard does not invent team averages from roster rows.
export const CoachHome = {
  name: 'CoachHome',
  props: {
    roster: { type: Array, required: true },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    authorizedTeamCount: { type: Number, default: null }
  },
  emits: ['navigate', 'open-profile', 'open-video'],
  setup(props) {
    const teamCount = Vue.computed(() => props.authorizedTeamCount ?? new Set(props.roster.map(p => p.team_id).filter(Boolean)).size);
    const preview = Vue.computed(() => props.roster.slice(0, 3)); // Home preview only; Team owns the complete roster.
    const avatarFor = player => {
      const approved=String(player?.photo_url||'');
      if (/^https:\/\//.test(approved) || /^\/assets\/demo-players\/(2[1-9]|3[0-5])\.svg$/.test(approved)) return approved;
      const jersey=String(player?.jersey||'');
      return /^DEMO\s/.test(String(player?.preferred_name||'')) && /^(2[1-9]|3[0-5])$/.test(jersey)
        ? '/assets/demo-players/'+jersey+'.svg' : '';
    };
    return { teamCount, preview, avatarFor };
  },
  template: `
  <section class="space-y-5" aria-label="Coach home">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-black tracking-tight text-white sm:text-3xl">Team overview</h1>
      <button type="button" @click="$emit('navigate','team')" class="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-500">Open team roster</button>
    </header>
    <p v-if="error" class="rounded-xl border border-rose-700/60 bg-rose-950/30 p-3 text-sm text-rose-200" role="alert">{{ error }}</p>
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3">
      <div class="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Authorized teams</p>
        <p class="mt-2 text-3xl font-black text-white">{{ loading ? '…' : teamCount }}</p>
      </div>
      <div class="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Roster players</p>
        <p class="mt-2 text-3xl font-black text-cyan-300">{{ loading ? '…' : roster.length }}</p>
      </div>
    </div>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div class="rounded-2xl border border-slate-700 bg-slate-900/90 p-5 lg:col-span-3">
        <div class="mb-4 flex items-center justify-between gap-2">
          <h2 class="text-lg font-bold">Player shortcuts</h2>
          <span class="text-xs text-slate-400">Up to 3 players</span>
        </div>
        <p v-if="loading" class="text-sm text-slate-400" role="status">Loading authorized players…</p>
        <p v-else-if="!roster.length" class="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">No players are available in your verified team roster yet.</p>
        <ul v-else class="divide-y divide-slate-800">
          <li v-for="player in preview" :key="player.team_id + ':' + player.id" class="flex items-center gap-3 py-3">
            <button type="button" @click="$emit('open-profile',player)"
              :aria-label="'Open '+player.preferred_name+' player profile'"
              class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-950 text-sm font-black text-blue-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
              <img v-if="avatarFor(player)" :src="avatarFor(player)" alt="" class="h-full w-full object-cover"/>
              <span v-else>#{{ player.jersey || '–' }}</span>
            </button>
            <div class="min-w-0 flex-1">
              <button type="button" @click="$emit('open-profile',player)" class="block max-w-full truncate text-left text-sm font-semibold text-cyan-100 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">{{ player.preferred_name }}</button>
              <p class="truncate text-xs text-slate-400">{{ player.team_name || 'Assigned team' }} · {{ player.position || 'Position pending' }}</p>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-2">
              <span class="text-xs text-slate-400">B {{ player.bats || '–' }} / T {{ player.throws || '–' }}</span>
              <button type="button" @click="$emit('open-video',player)"
                :aria-label="'Open private videos for '+(player.preferred_name || 'this player')"
                class="rounded-lg border border-sky-500/40 bg-blue-900/35 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-blue-800/50">▶ Videos</button>
            </div>
          </li>
        </ul>
      </div>
      <div class="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/90 p-5 lg:col-span-2">
        <h2 class="text-lg font-bold">Quick access</h2>

        <button type="button" @click="$emit('navigate','stats')" class="flex w-full items-center justify-between rounded-xl bg-slate-800 p-4 text-left text-sm font-semibold hover:bg-slate-700">
          <span>Performance</span><span aria-hidden="true">›</span>
        </button>
        <button type="button" @click="$emit('navigate','videos')" class="flex w-full items-center justify-between rounded-xl bg-slate-800 p-4 text-left text-sm font-semibold hover:bg-slate-700">
          <span>Private video library</span><span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  </section>
  `
};
