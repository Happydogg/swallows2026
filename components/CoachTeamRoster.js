// SDL-004-006: Separate coach-only roster. No private player profile navigation.
export const CoachTeamRoster = {
  name: 'CoachTeamRoster',
  emits: ['open-review'],
  setup(props) {
    const selectedTeam=Vue.ref('');
    const teamOptions=Vue.computed(()=>[...new Map(props.roster.map(p=>[p.team_id,{id:p.team_id,name:p.team_name}])).values()]);
    const displayedRoster=Vue.computed(()=>props.roster.filter(p=>!selectedTeam.value||p.team_id===selectedTeam.value));
    return {selectedTeam,teamOptions,displayedRoster};
  },
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
        <span class="text-sm text-slate-300">{{ displayedRoster.length }} players</span>
      </header>
      <label class="block text-sm">Team<select v-model="selectedTeam" class="block w-full mt-1 rounded bg-slate-900 p-3"><option value="">All authorized teams</option><option v-for="team in teamOptions" :key="team.id" :value="team.id">{{ team.name }}</option></select></label>
      <p v-if="error" class="text-rose-300 text-sm" role="alert">{{ error }}</p>
      <p v-if="loading" class="text-slate-400 text-sm" role="status">Loading your team roster…</p>
      <div v-else-if="!displayedRoster.length" class="rounded-xl border border-slate-700 bg-slate-800 p-6 text-slate-400 text-center">
        No players assigned to your coached teams.
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <article v-for="player in displayedRoster" :key="player.team_id + ':' + player.id"
          class="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-white font-semibold">{{ player.preferred_name }}</p>
              <p class="text-slate-400 text-xs">{{ player.team_name }}</p>
            </div>
            <span class="text-blue-300 text-sm font-mono">#{{ player.jersey ?? '--' }}</span>
          </div>
          <p class="mt-3 text-sm text-slate-200">{{ player.position || 'Position not set' }}</p>
          <p class="text-xs text-slate-400 mt-1">Throws {{ player.throws || '--' }} · Bats {{ player.bats || '--' }}</p>
          <button @click="$emit('open-review',player.team_id)" class="mt-3 p-3 rounded bg-slate-700 text-sm">Videos and review</button>
        </article>
      </div>
    </section>
  `
};
