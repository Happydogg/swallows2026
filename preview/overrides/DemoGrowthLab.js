// SDL-004-FIXTURE-001: Charts of a verified, static snapshot of mock staging data.
// This component does not access sessions or bypass RLS. Never label these live/official.
import { DEMO_GROWTH_SNAPSHOT } from '../js/demoGrowthFixture.js';
import { PlayerHeroCard } from './PlayerHeroCard.js';

export const DemoGrowthLab = {
  name: 'DemoGrowthLab',
  components:{PlayerHeroCard},
  props: { playerName: { type: String, default: '' }, embedded: { type: Boolean, default: false } },
  setup(props) {
    const players = DEMO_GROWTH_SNAPSHOT.players;
    const selectedJersey = Vue.ref(players[0]?.jersey || '');
    const selected = Vue.computed(() => props.embedded
      ? players.find(p => p.name === props.playerName) || null
      : players.find(p => p.jersey === selectedJersey.value) || players[0]);
    const metrics = Object.freeze([
      { key:'height_cm', label:'Height', unit:'cm', color:'#22d3ee', decimals:1 },
      { key:'weight_kg', label:'Weight', unit:'kg', color:'#a78bfa', decimals:1 },
      { key:'throwing_velo_kmh', label:'Throwing velocity', unit:'km/h', color:'#34d399', decimals:1 },
      { key:'exit_velo_kmh', label:'Batting exit velocity', unit:'km/h', color:'#60a5fa', decimals:1 },
      { key:'sprint_18m_s', label:'18.29 m sprint', unit:'s', color:'#fbbf24', decimals:2 },
      { key:'broad_jump_cm', label:'Standing broad jump', unit:'cm', color:'#fb7185', decimals:1 }
    ]);
    const valid = (sessions,key) => sessions.every(row => Number.isFinite(Number(row[key])));
    const format = (row,metric) => row && Number.isFinite(Number(row[metric.key]))
      ? Number(row[metric.key]).toFixed(metric.decimals)+' '+metric.unit : 'Not recorded';
    const change = (sessions,metric) => {
      if(!sessions?.length || !valid(sessions,metric.key))return '—';
      const delta=Number(sessions.at(-1)[metric.key])-Number(sessions[0][metric.key]);
      return (delta > 0 ? '+' : '')+delta.toFixed(metric.decimals)+' '+metric.unit;
    };
    const points = (sessions,key) => {
      if (!sessions || sessions.length < 2 || !valid(sessions,key)) return '';
      const values=sessions.map(r=>Number(r[key]));
      const low=Math.min(...values),high=Math.max(...values),range=Math.max(high-low,0.01);
      return values.map((value,index)=>[
        (8+index*(224/(values.length-1))).toFixed(1),
        (66-(value-low)*52/range).toFixed(1)
      ].join(',')).join(' ');
    };
    return { selectedJersey, selected, players, metrics, format, change, points,
      capturedDate:DEMO_GROWTH_SNAPSHOT.captured_date };
  },
  template: `
    <section class="space-y-4 rounded-3xl border border-cyan-400/25 bg-slate-900/85 p-4 sm:p-6"
      aria-label="Synthetic staging growth dashboard">
      <div v-if="!embedded" class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-xs font-black uppercase tracking-widest text-cyan-300">Staging fixture snapshot · DEMO ONLY</p>
          <h2 class="mt-2 text-2xl font-black text-white">15 players. Eight checkpoints each.</h2>
          <p class="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
            Historical measurements copied from the staging database on {{ capturedDate }}.
            This is a read-only snapshot, not a live Supabase query or approved athlete statistics.
          </p>
        </div>
        <span class="self-start rounded-full border border-amber-400/40 bg-amber-950/20 px-3 py-2 text-xs font-bold text-amber-200">
          Fictional data · no coaching benchmarks
        </span>
      </div>

      <label v-if="!embedded" class="block max-w-md text-sm font-semibold text-slate-200" for="sdl-demo-growth-player">
        Choose demo player
        <select id="sdl-demo-growth-player" v-model="selectedJersey"
          class="mt-2 block w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-cyan-400">
          <option v-for="player in players" :key="player.jersey" :value="player.jersey">
            #{{ player.jersey }} · {{ player.name }}
          </option>
        </select>
      </label>

      <p v-if="embedded" class="text-xs font-bold uppercase tracking-widest text-amber-300">Fictional staging snapshot · Not live or official athlete statistics</p>
      <template v-if="selected">
        <player-hero-card v-if="!embedded" :player="{preferred_name:selected.name,jersey:selected.jersey,team_name:Number(selected.jersey)<=27?'Swallows Demo A':'Swallows Demo B',photo_url:'/assets/demo-players/'+selected.jersey+'.jpg'}" variant="profile"></player-hero-card>
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950/75 p-3">
          <p class="text-base font-black text-white">{{ selected.name }} <span class="ml-1 font-mono text-sky-300">#{{ selected.jersey }}</span></p>
          <p class="text-xs text-slate-400">{{ selected.sessions[0].date }} → {{ selected.sessions[selected.sessions.length-1].date }} · {{ selected.sessions.length }} sessions</p>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <article v-for="metric in metrics" :key="metric.key" class="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/75 p-4">
            <p class="text-xs font-bold uppercase tracking-wide text-slate-300">{{ metric.label }}</p>
            <p class="mt-2 text-xl font-black text-white">{{ format(selected.sessions[selected.sessions.length-1],metric) }}</p>
            <p class="mt-1 text-xs text-slate-400">First: {{ format(selected.sessions[0],metric) }}</p>
            <svg viewBox="0 0 240 76" preserveAspectRatio="none" role="img"
              :aria-label="metric.label + ' trend across eight dated fictional checkpoints'"
              class="mt-4 h-20 w-full overflow-visible">
              <line x1="8" y1="66" x2="232" y2="66" stroke="#475569" stroke-width="1"></line>
              <polyline :points="points(selected.sessions,metric.key)" fill="none" :stroke="metric.color"
                stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></polyline>
            </svg>
            <div class="mt-2 flex items-center justify-between gap-2 border-t border-slate-800 pt-3 text-xs">
              <span class="text-slate-400">Change over 14 months</span>
              <span class="font-bold text-slate-200">{{ change(selected.sessions,metric) }}</span>
            </div>
          </article>
        </div>

        <p class="text-xs leading-relaxed text-slate-400">
          For the 18.29 m sprint, a lower time means a faster recorded run. The direction of change is descriptive only;
          these fictional trends do not represent expected growth, improvement guarantees, or injury safety.
        </p>

        <details class="rounded-2xl border border-slate-700 bg-slate-950/75 p-4">
          <summary class="cursor-pointer py-2 text-sm font-bold text-white">View all eight raw demo checkpoints</summary>
          <div class="mt-3 overflow-x-auto">
            <table class="w-full min-w-[620px] border-collapse text-left text-xs">
              <thead><tr class="border-b border-slate-700 text-slate-400">
                <th scope="col" class="p-2">Date</th><th scope="col" class="p-2">Height cm</th><th scope="col" class="p-2">Weight kg</th>
                <th scope="col" class="p-2">Throw km/h</th><th scope="col" class="p-2">Exit km/h</th>
                <th scope="col" class="p-2">Sprint s</th><th scope="col" class="p-2">Jump cm</th>
              </tr></thead>
              <tbody><tr v-for="row in selected.sessions" :key="row.date" class="border-b border-slate-800 text-slate-200">
                <td class="p-2">{{ row.date }}</td><td class="p-2">{{ row.height_cm }}</td>
                <td class="p-2">{{ row.weight_kg }}</td><td class="p-2">{{ row.throwing_velo_kmh }}</td>
                <td class="p-2">{{ row.exit_velo_kmh }}</td><td class="p-2">{{ row.sprint_18m_s }}</td><td class="p-2">{{ row.broad_jump_cm }}</td>
              </tr></tbody>
            </table>
          </div>
        </details>
      </template>
    </section>
  `
};