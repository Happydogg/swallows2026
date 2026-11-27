// SDL-UX-003 P0: Read-only inbox presentation. The existing independent review owns all mutations.
import {uniqueReviewRows,reviewCategories as categories} from '../js/mediaReviewModel.js';
export function visibleReviewRows(rows,filters={},available=false,status='idle',scope=null){
  return available===true&&status==='ready'?uniqueReviewRows(rows,scope,filters):[];
}
export function localThumbnail(value){
  // Matches the existing extractVideoThumbnail result; no remote URL accepted.
  return typeof value==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)?value:'';
}
export const VideoReviewInbox={
  name:'VideoReviewInbox',
  props:{available:{type:Boolean,default:false},status:{type:String,default:'idle'},
    rows:{type:Array,default:()=>[]},filters:{type:Object,default:()=>({})},
    teams:{type:Array,default:()=>[]},players:{type:Array,default:()=>[]},
    scope:{type:Object,default:null},total:{type:Number,default:null},filteredTotal:{type:Number,default:null},hasMore:{type:Boolean,default:false},busy:{type:Boolean,default:false},
    thumbnails:{type:Object,default:()=>({})}},
  emits:['filter','refresh','more','open'],
  setup(props,{emit}){
    const visible=Vue.computed(()=>visibleReviewRows(props.rows,props.filters,props.available,props.status,props.scope));
    const playerOptions=Vue.computed(()=>props.players.filter(p=>!props.filters.teamId||p.teamIds?.includes(props.filters.teamId)));
    const safeTotal=Vue.computed(()=>props.available&&props.status==='ready'&&Number.isSafeInteger(props.total)&&props.total>=0?props.total:null);
    function open(row){if(!props.busy&&visible.value.some(x=>x.id===row.id))emit('open',{id:row.id,playerId:row.playerId,teamId:row.teamId});}
    return {visible,playerOptions,safeTotal,categories,localThumbnail,open};
  },
  template:`
    <section v-if="available" class="sdl-panel space-y-4 p-4" aria-label="Video Review inbox">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <div><h2 class="text-lg font-black text-white">Video Review</h2>
          <p v-if="safeTotal!==null" role="status" class="text-sm text-slate-300">{{safeTotal}} pending in authorized scope</p><p v-if="safeTotal!==null&&filteredTotal!==null" class="text-xs text-slate-400">{{filteredTotal}} matching · {{visible.length}} loaded</p>
        </div>
        <button type="button" :disabled="status==='loading'||busy" @click="$emit('refresh')" class="min-h-11 rounded-lg border border-slate-600 px-3 text-sm text-white disabled:opacity-50">Refresh</button>
      </header>
      <p v-if="status==='loading'" role="status" class="text-sm text-slate-300">Loading review inbox…</p>
      <p v-else-if="status==='unavailable'" role="status" class="text-sm text-amber-200">Review inbox unavailable. No pending count is available.</p>
      <template v-else-if="status==='ready'">
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="min-w-0 text-xs text-slate-300">Team<select :disabled="busy" :value="filters.teamId||''" @change="$emit('filter',{key:'teamId',value:$event.target.value})" class="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-white"><option value="">All teams</option><option v-for="team in teams" :key="team.id" :value="team.id">{{team.label}}</option></select></label>
          <label class="min-w-0 text-xs text-slate-300">Player<select :disabled="busy" :value="filters.playerId||''" @change="$emit('filter',{key:'playerId',value:$event.target.value})" class="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-white"><option value="">All players</option><option v-for="player in playerOptions" :key="player.id" :value="player.id">{{player.label}}</option></select></label>
          <label class="min-w-0 text-xs text-slate-300">Category<select :disabled="busy" :value="filters.category||''" @change="$emit('filter',{key:'category',value:$event.target.value})" class="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-white"><option value="">All categories</option><option v-for="category in categories" :key="category" :value="category">{{category}}</option></select></label>
        </div>
        <p v-if="!visible.length" role="status" class="text-sm text-slate-300">{{safeTotal===0?'No videos awaiting your review.':'No matching videos. Try changing filters.'}}</p>
        <article v-for="row in visible" :key="row.id" class="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3">
          <div class="flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900">
            <img v-if="localThumbnail(thumbnails[row.id])" :src="localThumbnail(thumbnails[row.id])" alt="" loading="lazy" class="h-full w-full object-cover">
            <span v-else class="px-1 text-center text-xs text-slate-300">No preview</span>
          </div>
          <div class="min-w-0 flex-1 break-words">
            <h3 class="text-sm font-bold text-white">{{row.playerLabel}}</h3>
            <p class="text-xs text-slate-300">{{row.teamLabel}} · {{row.category}}</p>
            <p class="text-xs font-semibold text-amber-200">Pending independent review</p>
          </div>
          <button type="button" @click="open(row)" :disabled="busy" class="min-h-11 shrink-0 rounded-lg border border-cyan-700 bg-cyan-950 px-3 text-sm font-bold text-cyan-100" :aria-label="'Open review for '+row.playerLabel">Open</button>
        </article>
        <button v-if="hasMore" type="button" @click="$emit('more')" :disabled="busy" class="min-h-11 w-full rounded-lg border border-slate-600 text-sm text-white">Load more</button>
      </template>
    </section>`
};