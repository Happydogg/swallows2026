// SDL-UX-002: Coach-first, read-only summary of a server-scoped roster.
// This dashboard does not invent team averages from roster rows.
import { PlayerHeroCard } from './PlayerHeroCard.js';
export const CoachHome = {
  components:{PlayerHeroCard},
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
      if (/^https:\/\//.test(approved) || /^\/assets\/demo-players\/(2[1-9]|3[0-5])\.(svg|jpg)$/.test(approved)) return approved;
      const jersey=String(player?.jersey||'');
      return /^DEMO\s/.test(String(player?.preferred_name||'')) && /^(2[1-9]|3[0-5])$/.test(jersey)
        ? '/assets/demo-players/'+jersey+'.svg' : '';
    };
    return { teamCount, preview, avatarFor };
  },
  template: `
  <section class="space-y-4" aria-label="Coach home">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-black tracking-tight text-white sm:text-3xl">Team overview</h1>
      <button type="button" @click="$emit('navigate','team')" class="sdl-primary px-4 py-2.5 text-sm font-semibold">Open team roster</button>
    </header>
    <p v-if="error" class="rounded-xl border border-rose-700/60 bg-rose-950/30 p-3 text-sm text-rose-200" role="alert">{{ error }}</p>
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3">
      <div class="sdl-panel p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Authorized teams</p>
        <p class="mt-2 text-3xl font-black text-white">{{ loading ? '…' : teamCount }}</p>
      </div>
      <div class="sdl-panel p-4">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Roster players</p>
        <p class="mt-2 text-3xl font-black text-cyan-300">{{ loading ? '…' : roster.length }}</p>
      </div>
    </div>
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div class="sdl-panel p-4 lg:col-span-3">
        <div class="mb-4 flex items-center justify-between gap-2">
          <h2 class="sdl-section-title">Player shortcuts</h2>
          <span class="text-xs text-slate-400">Up to 3 players</span>
        </div>
        <p v-if="loading" class="text-sm text-slate-400" role="status">Loading authorized players…</p>
        <p v-else-if="!roster.length" class="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">No players are available in your verified team roster yet.</p>
        <div v-else class="grid gap-3">
<player-hero-card v-for="player in preview" :key="player.team_id+':'+player.id" :player="{...player,photo_url:avatarFor(player)}" variant="compact"><template #actions><div class="grid grid-cols-2 gap-2"><button @click="$emit('open-profile',player)" class="sdl-primary min-h-11 px-3 py-2 text-sm font-semibold">View profile</button><button @click="$emit('open-video',player)" class="sdl-secondary min-h-11 px-3 py-2 text-sm font-semibold">Videos</button></div></template></player-hero-card>
</div>
      </div>
      <div class="sdl-panel space-y-3 p-4 lg:col-span-2">
        <h2 class="sdl-section-title">Quick access</h2>

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
