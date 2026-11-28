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
    controller:{type:Object,default:null},selected:{type:Object,default:null},thumbnails:{type:Object,default:()=>({})}},
  emits:['filter','refresh','more','open','close','next'],
  setup(props,{emit}){
    const visible=Vue.computed(()=>visibleReviewRows(props.rows,props.filters,props.available,props.status,props.scope));
    const playerOptions=Vue.computed(()=>props.players.filter(p=>!props.filters.teamId||p.teamIds?.includes(props.filters.teamId)));
    const safeTotal=Vue.computed(()=>props.available&&props.status==='ready'&&Number.isSafeInteger(props.total)&&props.total>=0?props.total:null);
    function open(row){if(!props.busy&&visible.value.some(x=>x.id===row.id))emit('open',{id:row.id,playerId:row.playerId,teamId:row.teamId});}
    const playback=Vue.computed(()=>props.controller?.mediaPlaybackUrl.value || '');
    const canDecide=Vue.computed(()=>!!(playback.value&&props.controller?.reviewItem.value));
    return {visible,playerOptions,safeTotal,categories,localThumbnail,open,playback,canDecide};
  },
  template:`
    <section v-if="available" class="space-y-4" aria-label="Review Videos">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <div><h2 class="text-2xl font-bold">Review Videos</h2>
          <p role="status" class="text-sm text-slate-400">{{safeTotal===null?'Pending count unavailable':safeTotal+' pending'}} · Content suitability only</p><p v-if="safeTotal!==null&&filteredTotal!==null" class="text-xs text-slate-400">{{filteredTotal}} matching · {{visible.length}} loaded</p>
        </div>
        <button v-if="!selected" type="button" :disabled="status==='loading'||busy" @click="$emit('refresh')" class="min-h-11 rounded-lg border border-slate-600 px-3 text-sm text-white disabled:opacity-50">Refresh</button>
      </header>
      <p v-if="controller?.mediaError.value" role="alert" class="rounded-lg bg-rose-950 p-3 text-sm text-rose-200">{{controller.mediaError.value}}</p>
      <p v-if="controller?.mediaNotice.value" role="status" class="text-sm text-emerald-200">{{controller.mediaNotice.value}}</p>
      <template v-if="selected && controller">
        <button type="button" @click="$emit('close')" :disabled="busy" class="min-h-11 text-cyan-300">‹ Back to queue</button>
        <div class="rounded-xl border border-slate-700 bg-slate-900 p-3">
          <p class="font-bold">{{controller.inboxReviewPlayerLabel.value}}</p>
          <p class="text-xs text-slate-400">{{selected.teamLabel}} · {{selected.category}}</p>
          <video v-if="playback" :key="playback" :src="playback" @error="controller.reportPlaybackError"
            controls playsinline preload="metadata" class="mt-3 aspect-video w-full rounded-lg bg-black object-contain"></video>
        </div>
        <template v-if="canDecide">
          <label class="flex items-start gap-2 text-sm"><input type="checkbox" v-model="controller.reviewSingleSubject.value" :disabled="busy">I confirm only the selected athlete is identifiable in the entire clip.</label>
          <label class="block text-sm">Rejection reason (required to reject)<textarea v-model="controller.reviewVideoNote.value" maxlength="1000" :disabled="busy" rows="2" class="mt-1 w-full rounded-xl bg-slate-900 p-3"></textarea></label>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" @click="controller.reviewPrivateMedia('approved')" :disabled="busy" class="min-h-12 rounded-xl bg-emerald-700 font-bold">Approve</button>
            <button type="button" @click="controller.reviewPrivateMedia('rejected')" :disabled="busy||!controller.reviewVideoNote.value.trim()" class="min-h-12 rounded-xl border border-rose-700 text-rose-200 font-bold disabled:opacity-40">Reject</button>
          </div>
          <p class="text-xs text-slate-400">Approval remains private. It does not publish or share the video.</p>
        </template>
        <p v-if="status==='unavailable'" role="status" class="text-sm text-amber-200">The next page is unavailable. Return to the queue to refresh.</p>
        <button type="button" @click="$emit('next')" :disabled="busy||status!=='ready'" class="min-h-12 w-full rounded-xl bg-slate-800 font-bold">Next Video →</button>
      </template>
      <p v-else-if="status==='loading'" role="status" class="text-sm text-slate-300">Loading review inbox…</p>
      <p v-else-if="status==='unavailable'" role="status" class="text-sm text-amber-200">Review inbox unavailable. No pending count is available.</p>
      <template v-else-if="status==='ready'">
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="min-w-0 text-xs text-slate-300">Team<select :disabled="busy" :value="filters.teamId||''" @change="$emit('filter',{key:'teamId',value:$event.target.value})" class="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-white"><option value="">All teams</option><option v-for="team in teams" :key="team.id" :value="team.id">{{team.label}}</option></select></label>
          <label class="min-w-0 text-xs text-slate-300">Player<select :disabled="busy" :value="filters.playerId||''" @change="$emit('filter',{key:'playerId',value:$event.target.value})" class="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-white"><option value="">All players</option><option v-for="player in playerOptions" :key="player.id" :value="player.id">{{player.label}}</option></select></label>
          <label class="min-w-0 text-xs text-slate-300">Category<select :disabled="busy" :value="filters.category||''" @change="$emit('filter',{key:'category',value:$event.target.value})" class="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-2 text-sm text-white"><option value="">All categories</option><option v-for="category in categories" :key="category" :value="category">{{category}}</option></select></label>
        </div>
        <p v-if="!visible.length" role="status" class="text-sm text-slate-300">{{safeTotal===0?'No videos awaiting your review.':'No matching videos. Try changing filters.'}}</p>
        <button v-for="row in visible" :key="row.id" type="button" @click="open(row)" :disabled="busy"
          class="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 text-left"
          :aria-label="'Open review for '+row.playerLabel">
          <span class="grid h-12 w-16 shrink-0 place-content-center overflow-hidden rounded-lg bg-slate-800" aria-hidden="true">
            <img v-if="localThumbnail(thumbnails[row.id])" :src="localThumbnail(thumbnails[row.id])" alt="" loading="lazy">
            <span v-else>▶</span>
          </span>
          <span class="min-w-0 flex-1 break-words">
            <span class="block font-bold">{{row.playerLabel}}</span>
            <span class="block text-xs text-slate-400">{{row.teamLabel}} · {{row.category}} · {{row.createdAt?new Date(row.createdAt).toLocaleDateString():''}}</span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        <button v-if="hasMore" type="button" @click="$emit('more')" :disabled="busy" class="min-h-11 w-full rounded-lg border border-slate-600 text-sm text-white">Load more</button>
      </template>
    </section>`
};