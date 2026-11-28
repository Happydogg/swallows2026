// UX-V02: Preview-only photo-forward athlete identity; never exported by live/staging builds.
export const PlayerHeroCard = {
  name:'PlayerHeroCard',
  props:{
    player:{type:Object,required:true}, variant:{type:String,default:'compact'},
    teamLabel:{type:String,default:''}, t:{type:Function,default:null},
    formatHeightWeight:{type:Function,default:null}
  },
  setup(props){
    const failed=Vue.ref(false);
    Vue.watch(()=>props.player.photo_url,()=>{failed.value=false;});
    const label=key=>typeof props.t==='function'?props.t(key):({throws:'Throws',bats:'Bats',batSpec:'Bat specification',notSpecified:'Not specified'}[key]||key);
    return {failed,label};
  },
  template:`
    <article class="overflow-hidden rounded-2xl border border-sky-500/30 bg-slate-950 shadow-lg" aria-label="Athlete hero card">
      <div class="relative isolate overflow-hidden bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950"
        :class="variant==='compact'?'min-h-[190px] sm:min-h-[220px]':'min-h-[240px] sm:min-h-[280px] lg:min-h-[320px]'">
        <img v-if="player.photo_url&&!failed" :src="player.photo_url" :alt="'Fictional portrait of '+player.preferred_name" @error="failed=true" class="absolute inset-y-0 right-0 h-full w-[58%] object-cover object-center">
        <div v-else class="absolute inset-y-0 right-0 flex w-[58%] items-center justify-center bg-blue-950 text-5xl font-black text-sky-400/50" aria-hidden="true">#{{player.jersey||'–'}}</div>
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950 via-blue-950/90 via-40% to-transparent" aria-hidden="true"></div>
        <div class="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-950/90 to-transparent" aria-hidden="true"></div>
        <div class="relative flex min-h-[inherit] w-[55%] flex-col justify-center gap-2 px-4 py-5 sm:px-6">
          <p class="text-[10px] font-black uppercase tracking-[0.15em] text-cyan-200">Swallows DataLab · Demo</p>
          <p class="text-4xl font-black leading-none text-white sm:text-5xl">#{{player.jersey||'–'}}</p>
          <h2 class="break-words text-xl font-black leading-tight text-white sm:text-3xl">{{player.preferred_name||'Player'}}</h2>
          <p class="text-xs font-semibold text-slate-200 sm:text-sm">{{teamLabel||player.team_name||'Swallows Demo'}}</p>
          <div v-if="player.position" class="flex flex-wrap gap-1"><span v-for="pos in String(player.position).split(/[,/]/).map(s=>s.trim()).filter(Boolean)" :key="pos" class="rounded-full border border-cyan-400/50 bg-blue-950/70 px-2 py-1 text-xs font-bold text-cyan-100">{{pos}}</span></div>
          <p v-if="player.throws||player.bats" class="text-xs text-slate-300">{{label('throws')}} {{player.throws||'–'}} · {{label('bats')}} {{player.bats||'–'}}</p>
        </div>
      </div>
      <div v-if="$slots.actions" class="border-t border-sky-500/20 bg-slate-950 p-3"><slot name="actions"></slot></div>
      <div v-if="variant==='profile'" class="grid gap-2 border-t border-sky-500/20 bg-slate-900 p-4 sm:grid-cols-2">
        <div><p class="text-xs font-bold uppercase tracking-wide text-cyan-300">Growth</p><p class="mt-1 text-sm font-semibold">{{formatHeightWeight?formatHeightWeight(player.id):'Not recorded'}}</p></div>
        <div><p class="text-xs font-bold uppercase tracking-wide text-cyan-300">Equipment</p><p class="mt-1 text-sm text-slate-200">{{label('batSpec')}}: {{player.bat_spec||label('notSpecified')}}</p></div>
      </div>
    </article>`
};
