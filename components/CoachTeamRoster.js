// SDL-004-006: Separate coach-only roster. No private player profile navigation.
export const CoachTeamRoster = {
  name: 'CoachTeamRoster',
  emits: ['open-review', 'open-profile'],
  setup(props) {
    const selectedTeam=Vue.ref('');
    const teamOptions=Vue.computed(()=>[...new Map(props.roster.map(p=>[p.team_id,{id:p.team_id,name:p.team_name}])).values()]);
    const displayedRoster=Vue.computed(()=>props.roster.filter(p=>!selectedTeam.value||p.team_id===selectedTeam.value));
    const avatarFor = player => {
      const approved=String(player?.photo_url||'');
      if (/^https:\/\//.test(approved) || /^\/assets\/demo-players\/(2[1-9]|3[0-5])\.svg$/.test(approved)) return approved;
      const jersey=String(player?.jersey||'');
      return /^DEMO\s/.test(String(player?.preferred_name||'')) && /^(2[1-9]|3[0-5])$/.test(jersey)
        ? '/assets/demo-players/'+jersey+'.svg' : '';
    };
    return {selectedTeam,teamOptions,displayedRoster,avatarFor};
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
          <p class="text-xs text-slate-400">Full authorized roster · Select a player for profile, growth charts and videos</p>
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
            <button type="button" @click="$emit('open-profile',player)" class="flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" :aria-label="'Open '+player.preferred_name+' player profile'">
              <img v-if="avatarFor(player)" :src="avatarFor(player)" alt="" class="h-14 w-14 shrink-0 rounded-xl border border-blue-400/40 bg-blue-950 object-cover"/>
              <span v-else class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-900 text-blue-300">#{{ player.jersey || '–' }}</span>
              <span class="min-w-0">
                <span class="block truncate text-white font-semibold">{{ player.preferred_name }}</span>
                <span class="block truncate text-slate-400 text-xs">{{ player.team_name }}</span>
                <span v-if="avatarFor(player)" class="mt-0.5 block text-[10px] font-bold uppercase text-amber-300">Synthetic demo portrait</span>
              </span>
            </button>
            <span class="text-blue-300 text-sm font-mono">#{{ player.jersey ?? '--' }}</span>
          </div>
          <p class="mt-3 text-sm text-slate-200">{{ player.position || 'Position not set' }}</p>
          <p class="text-xs text-slate-400 mt-1">Throws {{ player.throws || '--' }} · Bats {{ player.bats || '--' }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" @click="$emit('open-profile',player)" class="rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-blue-500">View player profile →</button>
            <button type="button" @click="$emit('open-review',player.team_id)" class="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm">Team review</button>
          </div>
        </article>
      </div>
    </section>
  `
};
