// SDL-UX-002: Coach-first, read-only summary of a server-scoped roster.
// No historical statistics are inferred from roster rows.
export const CoachHome = {
  name: 'CoachHome',
  props: {
    roster: { type: Array, required: true },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' }
  },
  emits: ['navigate', 'open-profile'],
  setup(props) {
    const teamCount = Vue.computed(() => new Set(props.roster.map(p => p.team_id).filter(Boolean)).size);
    const preview = Vue.computed(() => props.roster); // Full authorized roster; no five-player truncation.
    const avatarFor=player => /^DEMO\s/.test(String(player?.preferred_name||'')) && /^(2[1-9]|3[0-5])$/.test(String(player?.jersey||'')) ? '/assets/demo-players/'+player.jersey+'.svg' : '';
    return { teamCount, preview, avatarFor };
  },
  template: `
  <section class="space-y-5" aria-label="Coach home">
    <div class="relative overflow-hidden rounded-3xl border border-blue-400/25 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 p-5 sm:p-7">
      <div class="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-blue-500/20 blur-3xl" aria-hidden="true"></div>
      <div class="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p class="text-xs font-bold uppercase tracking-widest text-cyan-300">Coach Command Center</p>
          <h1 class="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Build the next play.</h1>
          <p class="mt-2 max-w-xl text-sm text-slate-300">Your verified team roster and coaching workflows, together in one place.</p>
        </div>
        <button type="button" @click="$emit('navigate','team')" class="self-start rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500">Open team roster</button>
      </div>
    </div>
    <p v-if="error" class="rounded-xl border border-rose-700/60 bg-rose-950/30 p-3 text-sm text-rose-200" role="alert">{{ error }}</p>
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Authorized teams</p>
        <p class="mt-2 text-3xl font-black text-white">{{ loading ? '…' : teamCount }}</p>
      </div>
      <div class="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Roster players</p>
        <p class="mt-2 text-3xl font-black text-cyan-300">{{ loading ? '…' : roster.length }}</p>
      </div>
      <div class="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Performance reviews</p>
        <button type="button" @click="$emit('navigate','stats')" class="mt-2 text-left text-sm font-bold text-cyan-300 underline underline-offset-4">Open reviews</button>
      </div>
      <div class="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Private media</p>
        <button type="button" @click="$emit('navigate','videos')" class="mt-2 text-left text-sm font-bold text-cyan-300 underline underline-offset-4">Open videos</button>
      </div>
    </div>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div class="rounded-2xl border border-slate-700 bg-slate-900/90 p-5 lg:col-span-3">
        <div class="mb-4 flex items-center justify-between gap-2">
          <h2 class="text-lg font-bold">Full team roster</h2>
          <button type="button" @click="$emit('navigate','team')" class="text-sm font-semibold text-cyan-300">View all</button>
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
            <span class="text-xs text-slate-400">B {{ player.bats || '–' }} / T {{ player.throws || '–' }}</span>
          </li>
        </ul>
        <p class="mt-4 text-xs text-slate-500">Only fields returned by the authorized coach-roster service are shown.</p>
      </div>
      <div class="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/90 p-5 lg:col-span-2">
        <h2 class="text-lg font-bold">Quick access</h2>
        <button type="button" @click="$emit('navigate','team')" class="flex w-full items-center justify-between rounded-xl bg-blue-700/25 p-4 text-left text-sm font-semibold hover:bg-blue-700/40">
          <span>⚾ Team and roster</span><span aria-hidden="true">›</span>
        </button>
        <button type="button" @click="$emit('navigate','stats')" class="flex w-full items-center justify-between rounded-xl bg-slate-800 p-4 text-left text-sm font-semibold hover:bg-slate-700">
          <span>📊 Performance and approvals</span><span aria-hidden="true">›</span>
        </button>
        <button type="button" @click="$emit('navigate','videos')" class="flex w-full items-center justify-between rounded-xl bg-slate-800 p-4 text-left text-sm font-semibold hover:bg-slate-700">
          <span>▶ Private video library</span><span aria-hidden="true">›</span>
        </button>
        <p class="text-xs leading-relaxed text-slate-400">Practice and official statistics remain in their existing authorized workflows. This dashboard does not invent team averages.</p>
      </div>
    </div>
  </section>
  `
};