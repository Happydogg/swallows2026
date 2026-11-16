// SDL-004-006: Separate coach-only roster. No private player profile navigation.
export const CoachTeamRoster = {
  name: 'CoachTeamRoster',
  props: {
    roster: { type: Array, required: true },
    loading: { type: Boolean, required: true },
    error: { type: String, default: '' }
  },
  template: `
    <section class="space-y-4" aria-label="Coach team roster">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-xl font-bold text-white">Team Dashboard</h2>
          <p class="text-xs text-slate-400">Read-only team roster · Approved baseball fields only</p>
        </div>
        <span class="text-sm text-slate-300">{{ roster.length }} players</span>
      </header>
      <p v-if="error" class="text-rose-300 text-sm" role="alert">{{ error }}</p>
      <p v-if="loading" class="text-slate-400 text-sm" role="status">Loading your team roster…</p>
      <div v-else-if="!roster.length" class="rounded-xl border border-slate-700 bg-slate-800 p-6 text-slate-400 text-center">
        No players assigned to your coached teams.
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <article v-for="player in roster" :key="player.team_id + ':' + player.id"
          class="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-white font-semibold">{{ player.preferred_name }}</p>
              <p class="text-slate-400 text-xs">{{ player.team_name }}</p>
            </div>
            <span class="text-blue-300 text-sm font-mono">#{{ player.jersey || '--' }}</span>
          </div>
          <p class="mt-3 text-sm text-slate-200">{{ player.position || 'Position not set' }}</p>
          <p class="text-xs text-slate-400 mt-1">Throws {{ player.throws || '--' }} · Bats {{ player.bats || '--' }}</p>
        </article>
      </div>
    </section>
  `
};
