// SDL-UX-003 P0: Presentation only. Caller owns identity, scope, access and refresh.
// No API access or authorization decision is made here.
const definitions=Object.freeze({
  video_review:{title:'Video review',tab:'videos',section:'review',group:'attention'},
  performance_review:{title:'Performance review',tab:'stats',section:'review',group:'attention'},
  team_management:{title:'Team management',tab:'team',section:'roster',group:'attention'},
  family_action:{title:'Family account action',tab:'me',section:'family',group:'attention'},
  media_consent:{title:'Media sharing preferences',tab:'me',section:'consent',group:'optional'},
  my_videos:{title:'Your video submissions',tab:'videos',section:'library',group:'updates'}
});
export function projectActionCenter(items,status){
  if(!['ready','unavailable','loading'].includes(status)||!Array.isArray(items))return [];
  const seen=new Set(), result=[];
  for(const item of items){
    if(!item||item.available!==true||!Object.hasOwn(definitions,item.kind)||seen.has(item.kind))continue;
    seen.add(item.kind);
    const d=definitions[item.kind];
    const count=d.group==='attention'&&status==='ready'&&Number.isSafeInteger(item.count)&&item.count>=0?item.count:null;
    result.push({kind:item.kind,...d,count,description:typeof item.description==='string'?item.description:'',
      required:d.group==='attention'&&item.required===true});
  }
  return result;
}
export const ActionCenter={
  name:'ActionCenter',
  props:{items:{type:Array,default:()=>[]},status:{type:String,default:'idle'}},
  emits:['navigate','refresh'],
  setup(props,{emit}){
    const groups=Vue.computed(()=>{const rows=projectActionCenter(props.items,props.status);
      return ['attention','optional','updates'].map(key=>({key,label:{attention:'Needs attention',optional:'Optional choices',updates:'Updates'}[key],rows:rows.filter(x=>x.group===key)})).filter(g=>g.rows.length);});
    function open(row){emit('navigate',{tab:row.tab,section:row.section,kind:row.kind});}
    return {groups,open};
  },
  template:`
    <section class="sdl-panel space-y-3 p-4" aria-label="Action Center">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-black text-white">Action Center</h2>
        <button v-if="status==='unavailable'" type="button" @click="$emit('refresh')" class="min-h-11 rounded-lg border border-slate-600 px-3 text-sm text-white">Retry</button>
      </header>
      <p v-if="status==='loading'" role="status" class="text-sm text-slate-300">Checking your actions…</p>
      <p v-else-if="status==='unavailable'" role="status" class="text-sm text-amber-200">Some action counts are unavailable. Try again.</p>
      <p v-else-if="status==='ready'&&!groups.length" role="status" class="text-sm text-slate-300">No other action categories are currently available in this workspace.</p>
      <div v-for="g in groups" :key="g.key" class="space-y-2">
        <h3 class="text-xs font-bold uppercase tracking-wide text-slate-300">{{g.label}}</h3>
        <button v-for="row in g.rows" :key="row.kind" type="button" @click="open(row)" class="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
          <span class="min-w-0 break-words"><span class="block text-sm font-bold text-white">{{row.title}}</span>
            <span v-if="row.required" class="block text-xs text-amber-200">Required</span>
            <span v-if="g.key==='optional'" class="block text-xs text-slate-300">Optional</span>
            <span v-if="row.description" class="block text-xs leading-relaxed text-slate-300">{{row.description}}</span>
          </span>
          <span v-if="row.count!==null" class="shrink-0 text-lg font-black text-cyan-200" :aria-label="row.count+' pending'">{{row.count}}</span>
          <span v-else-if="g.key==='attention'" class="shrink-0 text-xs text-slate-300">{{status==='loading'?'Checking…':'Unavailable'}}</span><span v-else aria-hidden="true" class="shrink-0 text-slate-300">›</span>
        </button>
      </div>
    </section>`
};