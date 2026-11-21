// SDL-UX-009: Live, read-only charts from server-authorized player history.
// No invented norms, threshold assessments, or direct Supabase calls.
export const AuthorizedStatsBoard = {
  name:'AuthorizedStatsBoard',
  emits:['open-profile'],
  props:{controller:{type:Object,required:true}},
  setup(props){
    const metrics=Object.freeze([
      {key:'height_cm',name:'Height',unit:'cm',dec:1,color:'#38bdf8'},
      {key:'weight_kg',name:'Weight',unit:'kg',dec:1,color:'#34d399'},
      {key:'throwing_velo',name:'Throwing velocity',unit:'km/h',dec:1,color:'#60a5fa'},
      {key:'exit_velo',name:'Batting exit velocity',unit:'km/h',dec:1,color:'#a78bfa'},
      {key:'sprint_time',name:'18.29 m sprint',unit:'s',dec:2,color:'#fbbf24'},
      {key:'broad_jump',name:'Standing broad jump',unit:'cm',dec:1,color:'#fb7185'}
    ]);
    const available=(rows,key)=>rows.filter(r=>r[key]!==null&&Number.isFinite(Number(r[key])));
    const first=(rows,m)=>available(rows,m.key)[0]||null;
    const last=(rows,m)=>available(rows,m.key).at(-1)||null;
    const value=(row,m)=>row ? Number(row[m.key]).toFixed(m.dec)+' '+m.unit:'Not recorded';
    const delta=(rows,m)=>{
      const a=first(rows,m),b=last(rows,m);
      if(!a||!b||a===b)return 'No comparison';
      const v=Number(b[m.key])-Number(a[m.key]);
      return (v>0?'+':'')+v.toFixed(m.dec)+' '+m.unit;
    };
    const points=(rows,m)=>{
      const present=available(rows,m.key);
      if(present.length<2)return '';
      const vals=present.map(r=>Number(r[m.key]));
      const lo=Math.min(...vals),hi=Math.max(...vals),range=Math.max(hi-lo,0.1);
      return present.map((r,i)=>[
        (8+i*224/(present.length-1)).toFixed(1),
        (65-((Number(r[m.key])-lo)/range)*53).toFixed(1)
      ].join(',')).join(' ');
    };
    const recordedMetrics = Vue.computed(() => metrics.filter(metric => last(props.controller.sessions.value, metric)));
    return {...props.controller,recordedMetrics,first,last,value,delta,points};
  },
  template:`
    <section class="space-y-4 rounded-3xl border border-cyan-400/20 bg-slate-900/90 p-4 sm:p-6"
      aria-label="Live authorized player growth statistics">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-black uppercase tracking-wider text-cyan-300">Live staging measurements · authorized access</p>
          <h2 class="mt-2 text-xl font-black text-white sm:text-2xl">Player development</h2>
          <p class="mt-2 max-w-2xl text-sm text-slate-400">Select a permitted player to see recorded results over time. Different testing methods should be compared only within their protocol.</p>
        </div>
        <button type="button" @click="selectedId && select(selectedId)" :disabled="busy || !selectedId"
          class="min-h-11 rounded-xl border border-blue-500/50 bg-blue-900/40 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-50">
          Refresh history
        </button>
      </div>
      <label class="block max-w-lg text-sm font-bold text-slate-300">
        Choose player
        <select :value="selectedId" @change="select($event.target.value)"
          class="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-base text-white">
          <option value="">Select an authorized player</option>
          <option v-for="p in players" :key="p.id" :value="p.id">#{{ p.jersey || '–' }} · {{ p.preferred_name || 'Player' }}</option>
        </select>
      </label>
      <div v-if="selected" class="flex items-center gap-3 rounded-xl bg-slate-950/75 p-3">
        <img v-if="selected.photo_url && !selected.photo_url.startsWith('sdl-private-avatar:')"
          :src="selected.photo_url" alt="" class="h-14 w-14 rounded-xl object-cover">
        <div>
          <p class="font-bold text-white">{{ selected.preferred_name }}</p>
          <p class="text-xs text-slate-400">#{{ selected.jersey || '–' }} · {{ sessions.length }} recorded session{{ sessions.length===1?'':'s' }}</p>
        </div>
        <button type="button" @click="$emit('open-profile',selected)" class="ml-auto rounded-lg bg-blue-700 px-3 py-2 text-sm text-white">View profile</button>
      </div>
      <p v-if="busy" class="rounded-xl bg-slate-950 p-4 text-sm text-slate-300" role="status">
        Checking access and loading permitted measurements…
      </p>
      <p v-if="error" class="rounded-xl border border-amber-700 bg-amber-950/30 p-4 text-sm text-amber-200" role="alert">{{ error }}</p>
      <p v-if="!busy && !error && selectedId && sessions.length===0" class="rounded-xl border border-dashed border-slate-600 p-4 text-sm text-slate-300">
        No permitted measurements are recorded for this player.
      </p>
      <template v-if="!busy && !error && sessions.length">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <article v-for="m in recordedMetrics" :key="m.key" class="rounded-2xl border border-slate-700 bg-slate-950/85 p-4">
            <p class="text-xs font-bold uppercase tracking-wide text-slate-300">{{ m.name }}</p>
            <p class="mt-2 text-xl font-black text-white">{{ value(last(sessions,m),m) }}</p>
            <div v-if="last(sessions,m)" class="mt-1 flex justify-between gap-2 text-xs text-slate-400">
              <span>{{ value(first(sessions,m),m) }} initially</span>
              <span class="font-bold text-slate-200">{{ delta(sessions,m) }}</span>
            </div>
            <svg viewBox="0 0 240 75" role="img" :aria-label="m.name+' trend for '+selected.preferred_name"
              class="mt-3 h-20 w-full" preserveAspectRatio="none">
              <line x1="8" x2="232" y1="65" y2="65" stroke="#475569" stroke-width="1"></line>
              <polyline v-if="points(sessions,m)" :points="points(sessions,m)" fill="none" :stroke="m.color" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></polyline>
            </svg>
          </article>
        </div>
        <details class="rounded-2xl border border-slate-700 bg-slate-950/80 p-4">
          <summary class="cursor-pointer py-2 text-sm font-bold text-white">Recorded session history ({{ sessions.length }})</summary>
          <div class="mt-3 overflow-x-auto">
            <table class="w-full min-w-[610px] text-left text-xs">
              <thead><tr class="border-b border-slate-600 text-slate-400">
                <th scope="col" class="p-2">Date</th><th v-for="m in recordedMetrics" :key="m.key" scope="col" class="p-2">{{ m.name }} ({{ m.unit }})</th>
              </tr></thead>
              <tbody><tr v-for="row in sessions" :key="row.id" class="border-b border-slate-800 text-slate-200">
                <td class="p-2">{{ row.session_date }}</td><td v-for="m in recordedMetrics" :key="m.key" class="p-2">{{ row[m.key] ?? '–' }}</td>
              </tr></tbody>
            </table>
          </div>
        </details>
        <p class="text-xs leading-relaxed text-slate-400">These are recorded staging measurements, not automatically approved medical or coaching benchmarks. Lower sprint times are faster; no injury-risk claim is made.</p>
      </template>
    </section>
  `
};
