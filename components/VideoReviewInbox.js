// SDL-UX approved Review Videos: content suitability, not biomechanics.
import {createPrivateMediaService} from '../js/privateMediaService.js';
export const VideoReviewInbox={
 name:'VideoReviewInbox',props:{auth:{type:Object,required:true},scope:{type:Object,required:true},controller:{type:Object,required:true}},
 setup(props){
   const {ref,computed,watch,onUnmounted}=Vue,c=props.controller,service=createPrivateMediaService({auth:props.auth});
   const items=ref([]),teams=ref([]),pending=ref(null),filtered=ref(null),next=ref(null),filter=ref(''),selected=ref(null),busy=ref(false),error=ref(''),notice=ref('');
   let epoch=0,abort=null;
   const digest=computed(()=>JSON.stringify(props.scope));
   function clear(){epoch++;abort?.abort();abort=null;busy.value=false;items.value=[];teams.value=[];pending.value=null;filtered.value=null;next.value=null;selected.value=null;error.value='';notice.value='';c.resetMedia();}
   async function load(append=false,openFirst=false){
     const scope=props.scope,identity=props.auth.captureIdentity(),stamp=++epoch;abort?.abort();abort=new AbortController();const local=abort;busy.value=true;error.value='';
     const current=()=>stamp===epoch&&!local.signal.aborted&&props.auth.isCurrentIdentity(identity);
     try{
       const data=await service.reviewInbox(scope,{...(filter.value?{teamId:filter.value}:{}),...(append&&next.value?{cursor:next.value}:{}),limit:30},{signal:local.signal});
       if(!current())return;
       const valid=data.items.every(r=>typeof r.id==='string'&&typeof r.playerId==='string'&&typeof r.playerLabel==='string'&&typeof r.teamLabel==='string'&&r.status==='pending'&&r.can_review===true&&['batting','pitching','throwing'].includes(r.category));
       if(!valid)throw Error('Invalid review list.');
       items.value=append?[...new Map([...items.value,...data.items].map(r=>[r.id,r])).values()]:data.items;
       teams.value=data.teams;pending.value=data.pendingTotal;filtered.value=data.filteredTotal;next.value=data.nextCursor;
     }catch(e){if(current()){items.value=[];pending.value=null;filtered.value=null;next.value=null;selected.value=null;c.resetMedia();error.value=e.message||'Review inbox unavailable.';}}
     finally{if(stamp===epoch){busy.value=false;abort=null;}}
     if(openFirst&&current()&&items.value.length)await open(items.value[0]);
   }
   async function open(row){
     if(busy.value||c.mediaReviewing.value||!items.value.some(x=>x.id===row.id&&x.playerId===row.playerId))return;
     const stamp=++epoch;busy.value=true;error.value='';notice.value='';selected.value=row;
     try{const ok=await c.openInboxReview(props.scope,row,filter.value);if(stamp!==epoch)return;if(!ok){error.value=c.mediaError.value||'Review unavailable. Refresh the queue.';selected.value=null;}}
     finally{if(stamp===epoch)busy.value=false;}
   }
   function changeFilter(){const value=filter.value;clear();filter.value=value;void load();}
   async function nextVideo(){
     if(busy.value||c.mediaReviewing.value)return;
     const at=items.value.findIndex(r=>r.id===selected.value?.id);
     if(at>=0&&at+1<items.value.length){await open(items.value[at+1]);return;}
     if(next.value){const old=new Set(items.value.map(r=>r.id));await load(true);const newItem=items.value.find(r=>!old.has(r.id));if(newItem){await open(newItem);return;}}
     c.resetMedia();selected.value=null;notice.value='End of loaded queue. Skipped videos remain pending.';
   }
   async function decide(decision){
     if(busy.value||!selected.value||!c.reviewItem.value||!c.mediaPlaybackUrl.value)return;
     const stamp=epoch,identity=props.auth.captureIdentity();
     const ok=await c.reviewPrivateMedia(decision);
     if(stamp!==epoch||!props.auth.isCurrentIdentity(identity))return;
     if(ok){selected.value=null;await load(false,true);}
   }
   function back(){if(busy.value||c.mediaReviewing.value)return;c.resetMedia();selected.value=null;error.value='';}
   watch(digest,()=>{clear();filter.value='';void load();},{immediate:true});
   watch(()=>props.auth.accountContext.value,()=>{clear();filter.value='';},{flush:'sync'});
   onUnmounted(clear);
   return {items,teams,pending,filtered,next,filter,selected,busy,error,notice,load,open,back,changeFilter,nextVideo,decide,...Object.fromEntries(['mediaPlaybackUrl','mediaReviewing','mediaError','reviewItem','reviewVideoNote','reviewSingleSubject','reportPlaybackError'].map(k=>[k,c[k]]))};
 },
 template:`
 <section class="space-y-4" aria-label="Review Videos">
   <h2 class="text-2xl font-bold">Review Videos</h2><p class="text-sm text-slate-400">{{pending===null?'Pending count unavailable':pending+' pending'}} · Content suitability only</p>
   <p v-if="error||mediaError" role="alert" class="rounded-lg bg-rose-950 p-3 text-sm text-rose-200">{{error||mediaError}}</p>
   <p v-if="busy" role="status" class="text-sm text-slate-300">Checking authorized submissions…</p>
   <template v-if="!selected">
     <label class="block text-sm">Team <select v-model="filter" @change="changeFilter" :disabled="busy" class="mt-1 w-full rounded-lg bg-slate-900 p-3"><option value="">All authorized teams</option><option v-for="t in teams" :key="t.id" :value="t.id">{{t.label}}</option></select></label>
     <button @click="load()" :disabled="busy" class="sdl-secondary min-h-11 px-3 py-2">Refresh queue</button>
     <p v-if="filtered===0" class="text-sm text-slate-400">No pending videos in this scope.</p>
     <button v-for="r in items" :key="r.id" @click="open(r)" :disabled="busy" class="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 text-left"><span class="grid h-12 w-16 place-content-center rounded-lg bg-slate-800">▶</span><span class="min-w-0 flex-1"><span class="block font-bold">{{r.playerLabel}}</span><span class="block text-xs text-slate-400">{{r.teamLabel}} · {{r.category}} · {{r.createdAt?new Date(r.createdAt).toLocaleDateString():''}}</span></span><span>›</span></button>
     <button v-if="next" @click="load(true)" :disabled="busy" class="sdl-secondary min-h-11 px-3 py-2">Load more</button>
   </template>
   <template v-else>
     <button @click="back" :disabled="busy||mediaReviewing" class="min-h-11 text-cyan-300">‹ Back to queue</button>
     <div class="rounded-xl border border-slate-700 bg-slate-900 p-3"><p class="font-bold">{{selected.playerLabel}}</p><p class="text-xs text-slate-400">{{selected.teamLabel}} · {{selected.category}}</p><video v-if="mediaPlaybackUrl" :key="mediaPlaybackUrl" :src="mediaPlaybackUrl" @error="reportPlaybackError" controls playsinline preload="metadata" class="mt-3 aspect-video w-full rounded-lg bg-black object-contain"></video></div>
     <template v-if="mediaPlaybackUrl && reviewItem"><label class="flex items-start gap-2 text-sm"><input type="checkbox" v-model="reviewSingleSubject" :disabled="mediaReviewing">I confirm only the selected athlete is identifiable in the entire clip.</label><label class="block text-sm">Rejection reason (required to reject)<textarea v-model="reviewVideoNote" maxlength="1000" :disabled="mediaReviewing" rows="2" class="mt-1 w-full rounded-xl bg-slate-900 p-3"></textarea></label>
     <div class="grid grid-cols-2 gap-2"><button @click="decide('approved')" :disabled="mediaReviewing||busy" class="min-h-12 rounded-xl bg-emerald-700 font-bold">Approve</button><button @click="decide('rejected')" :disabled="mediaReviewing||busy||!reviewVideoNote.trim()" class="min-h-12 rounded-xl border border-rose-700 text-rose-200 font-bold disabled:opacity-40">Reject</button></div><p class="text-xs text-slate-400">Approval remains private. It does not publish or share the video.</p></template>
     <button @click="nextVideo" :disabled="busy||mediaReviewing" class="min-h-12 w-full rounded-xl bg-slate-800 font-bold">Next Video →</button>
   </template><p v-if="notice" role="status" class="text-sm text-slate-300">{{notice}}</p>
 </section>`
};