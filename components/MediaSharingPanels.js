// Temporary live acceptance panels. Server RPCs are the sole authorization authority.
import {createPrivateMediaService} from '../js/privateMediaService.js';
const {ref,computed,watch,onUnmounted}=Vue;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId=v=>typeof v==='string'&&UUID.test(v);
const category=v=>['pitching','batting','throwing'].includes(v);
function lifecycle(auth,clear){
 const busy=ref(false),error=ref(''),notice=ref('');
 let seq=0,controller=null;
 function reset(){seq++;controller?.abort();controller=null;busy.value=false;error.value='';notice.value='';clear();}
 async function run(fn){
  if(busy.value)return;
  const identity=auth.captureIdentity(),epoch=++seq;
  controller=new AbortController();const local=controller;
  const current=()=>epoch===seq&&!local.signal.aborted&&auth.isCurrentIdentity(identity);
  busy.value=true;error.value='';notice.value='';
  const timer=setTimeout(()=>local.abort(),125000);
  try{await fn({signal:local.signal,current});}
  catch(e){if(epoch===seq&&auth.isCurrentIdentity(identity)){clear();error.value=local.signal.aborted?'Request timed out. Refresh to verify the current state.':e.message||'Media request failed.';}}
  finally{clearTimeout(timer);if(epoch===seq){busy.value=false;controller=null;}}
 }
 watch(()=>auth.accountContext.value,reset,{flush:'sync'});
 onUnmounted(reset);
 return {busy,error,notice,reset,run};
}
export const MediaPublicationPanel={
 name:'MediaPublicationPanel',
 props:{auth:{type:Object,required:true},controller:{type:Object,required:true}},
 setup(props){
  const service=createPrivateMediaService({auth:props.auth});
  const clips=computed(()=>props.controller.mediaItems.value.filter(x=>x.status==='approved'));
  const selected=ref(''),state=ref(null);
  const life=lifecycle(props.auth,()=>{state.value=null;});
  async function load(id,op){
   const result=await service.publicationEligibility(id,{signal:op.signal});
   if(!op.current()||id!==selected.value)return;
   if(typeof result?.eligible!=='boolean'||!['approved_required','subject_required','consent_required','no_current_team','eligible'].includes(result.reason_code)||!Array.isArray(result.targets)||result.targets.length>100||result.targets.some(x=>!validId(x.team_id)||typeof x.team_name!=='string'||typeof x.published!=='boolean'||typeof x.visible!=='boolean'))throw Error('Invalid publication response.');
   state.value=result;
  }
  function choose(id){life.reset();selected.value=id;if(id)void life.run(op=>load(id,op));}
  watch(()=>clips.value.map(x=>x.id).join(','),()=>{if(!clips.value.some(x=>x.id===selected.value))choose(clips.value[0]?.id||'');},{immediate:true});
  async function change(team,publish){
   const target=state.value?.targets.find(x=>x.team_id===team),id=selected.value;
   if(!target||!clips.value.some(x=>x.id===id)||life.busy.value||(publish&&!state.value.eligible)||(!publish&&!target.published))return;
   if(!globalThis.confirm(publish?'Publish this approved synthetic video to '+target.team_name+'? Authorized current members may view and download it under the active guardian consent.':'Unpublish this video from '+target.team_name+'? Private playback is preserved.'))return;
   await life.run(async op=>{
    const result=await service.setMediaPublication(id,team,publish,{signal:op.signal});
    if(!op.current()||id!==selected.value)return;
    if(result?.updated!==true||result.published!==publish)throw Error('Publication result unknown. Refresh.');
    await load(id,op);
    if(op.current())life.notice.value=publish?'Published to selected team.':'Unpublished from selected team.';
    if(op.current())await props.controller.refreshMedia();
   });
  }
  const reason=computed(()=>({approved_required:'Independent approval required.',subject_required:'Single-athlete confirmation required.',consent_required:'Current guardian sharing consent required.',no_current_team:'No eligible current team.',eligible:'Ready to publish to an eligible current team.'}[state.value?.reason_code]||''));
  return {clips,selected,state,reason,choose,refresh:()=>life.run(op=>load(selected.value,op)),change,...life};
 },
 template:`
 <section class="sdl-panel space-y-3 p-4" aria-label="Video publication">
  <h2 class="sdl-section-title">Publish to Clubhouse</h2>
  <p class="text-xs text-slate-300">Synthetic staging clips only. Approval and publication are separate. Publishing does not copy or delete the video.</p>
  <p v-if="!clips.length" class="text-sm text-slate-400">No independently approved clips available for this player.</p>
  <template v-else>
   <label class="block text-sm">Approved clip<select :value="selected" @change="choose($event.target.value)" class="mt-1 block w-full min-h-11 rounded-lg bg-slate-950 border border-slate-600 px-3"><option value="">Select clip</option><option v-for="(clip,i) in clips" :key="clip.id" :value="clip.id">{{clip.category}} · {{clip.created_at ? new Date(clip.created_at).toLocaleString() : 'Clip '+(i+1)}}</option></select></label>
   <button type="button" v-if="selected" @click="refresh" :disabled="busy" class="sdl-secondary px-3 py-2 text-sm">Refresh eligibility</button>
   <p v-if="state" class="text-sm text-cyan-200">{{reason}}</p>
   <div v-for="team in state?.targets || []" :key="team.team_id" class="space-y-2 rounded-lg border border-slate-700 p-3">
    <p class="font-semibold">{{team.team_name}}</p>
    <p class="text-xs text-slate-300">{{team.visible?'Published to team':team.published?'Publication blocked · access unavailable':'Not published'}}</p>
    <div class="flex flex-wrap gap-2">
     <button v-if="state.eligible && !team.visible" type="button" @click="change(team.team_id,true)" :disabled="busy" class="sdl-primary px-4 py-2 text-sm">Publish to team</button>
     <button v-if="team.published" type="button" @click="change(team.team_id,false)" :disabled="busy" class="sdl-secondary px-4 py-2 text-sm">Unpublish</button>
    </div>
   </div>
  </template>
  <p v-if="busy" role="status" class="text-sm text-slate-400">Checking publication…</p><p v-if="notice" role="status" class="text-sm text-emerald-200">{{notice}}</p><p v-if="error" role="alert" class="text-sm text-rose-200">{{error}}</p>
 </section>`
};
export const ClubhouseMediaPanel={
 name:'ClubhouseMediaPanel',
 props:{auth:{type:Object,required:true},teams:{type:Array,default:()=>[]}},
 setup(props){
  const service=createPrivateMediaService({auth:props.auth});
  const selected=ref(''),items=ref([]),next=ref(null),loaded=ref(false),playback=ref(''),playing=ref('');
  const saveUrl=ref(''),saveName=ref('');let saveTimer=null;
  function clearSave(){if(saveTimer!==null)clearTimeout(saveTimer);saveTimer=null;if(saveUrl.value)URL.revokeObjectURL(saveUrl.value);saveUrl.value='';saveName.value='';}
  function release(){clearSave();if(playback.value)URL.revokeObjectURL(playback.value);playback.value='';playing.value='';}
  const life=lifecycle(props.auth,()=>{release();items.value=[];next.value=null;loaded.value=false;});
  async function load(append,op){
   const team=selected.value;release();
   if(!append){items.value=[];loaded.value=false;}
   const result=await service.sharedMedia(team,append?next.value:null,{signal:op.signal});
   if(!op.current()||team!==selected.value)return;
   if(!Array.isArray(result?.items)||result.items.length>30||!(result.next_cursor===null||typeof result.next_cursor==='string')||result.items.some(x=>!validId(x.id)||!category(x.category)||x.display_name!=='Player'||typeof x.published_at!=='string'))throw Error('Invalid Clubhouse listing.');
   const safe=result.items.map(x=>({id:x.id,category:x.category,display_name:'Player',published_at:x.published_at,can_download:x.can_download===true}));
   items.value=append?[...new Map([...items.value,...safe].map(x=>[x.id,x])).values()]:safe;
   next.value=result.next_cursor;loaded.value=true;
  }
  function choose(team){life.reset();selected.value=team;if(team)void life.run(op=>load(false,op));}
  watch(()=>props.teams.map(t=>t.id).join(','),()=>{if(!props.teams.some(t=>t.id===selected.value))choose(props.teams[0]?.id||'');},{immediate:true});
  function refresh(){if(selected.value)void life.run(op=>load(false,op));}
  function more(){if(next.value)void life.run(op=>load(true,op));}
  function play(item){if(!items.value.some(x=>x.id===item.id)||!selected.value)return;release();const team=selected.value;void life.run(async op=>{const blob=await service.sharedPlayback(item.id,team,{signal:op.signal});if(!op.current()||team!==selected.value)return;playback.value=URL.createObjectURL(blob);playing.value=item.id;});}
  function download(item){
   if(life.busy.value||!items.value.some(x=>x.id===item.id&&x.can_download)||!selected.value)return;
   if(!globalThis.confirm('Download this synthetic team video? Keep it private. Consent withdrawal cannot recall saved copies.'))return;
   release();const team=selected.value;
   void life.run(async op=>{
    const blob=await service.sharedDownload(item.id,team,{signal:op.signal});
    if(!op.current()||team!==selected.value)return;
    saveName.value='sdl-practice-video.'+(blob.type==='video/quicktime'?'mov':'mp4');
    saveUrl.value=URL.createObjectURL(blob);
    saveTimer=setTimeout(clearSave,60000);
    life.notice.value='Authorized file ready. Tap Save video file to save it.';
   });
  }
  // Discard delivered bytes whenever the page is backgrounded. Re-authorize on return.
  const visibility=()=>{life.reset();if(globalThis.document?.visibilityState==='visible')refresh();};
  globalThis.document?.addEventListener?.('visibilitychange',visibility);
  onUnmounted(()=>globalThis.document?.removeEventListener?.('visibilitychange',visibility));
  return {selected,items,next,loaded,playback,playing,saveUrl,saveName,choose,refresh,more,play,release,download,clearSave,...life};
 },
 template:`
 <section class="sdl-panel space-y-3 p-4" aria-label="Clubhouse videos">
  <h2 class="sdl-section-title">Clubhouse videos</h2>
  <p class="text-xs text-slate-300">Approved team-shared videos. Private clips are not listed. Download only when offered; keep saved files private.</p>
  <label class="block text-sm">Team<select :value="selected" @change="choose($event.target.value)" class="mt-1 block w-full min-h-11 rounded-lg bg-slate-950 border border-slate-600 px-3"><option value="">Choose team</option><option v-for="team in teams" :key="team.id" :value="team.id">{{team.name}}</option></select></label>
  <button v-if="selected" type="button" @click="refresh" :disabled="busy" class="sdl-secondary px-3 py-2 text-sm">Refresh Clubhouse</button>
  <p v-if="loaded && !items.length" class="text-sm text-slate-400">No shared videos for this team.</p>
  <div v-for="item in items" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 p-3"><div><p class="font-semibold">{{item.display_name}} · {{item.category}}</p><p class="text-xs text-slate-400">Published {{new Date(item.published_at).toLocaleString()}}</p></div><button type="button" @click="play(item)" :disabled="busy" class="sdl-primary px-4 py-2 text-sm">Play shared video</button><button v-if="item.can_download" type="button" @click="download(item)" :disabled="busy" class="sdl-secondary px-4 py-2 text-sm">Download video</button></div>
  <div v-if="saveUrl" class="space-y-2 rounded-lg border border-cyan-700 p-3"><p class="text-sm">Authorized file ready. Save within 60 seconds; refreshing or leaving clears this link.</p><a :href="saveUrl" :download="saveName" class="inline-block sdl-primary px-4 py-3 text-sm">Save video file</a><button type="button" @click="clearSave" class="sdl-secondary px-3 py-2 text-sm">Close</button></div>
  <p v-if="notice" role="status" class="text-sm text-emerald-200">{{notice}}</p>
  <div v-if="playback" class="space-y-2"><video :key="playback" :src="playback" controls controlslist="nodownload" disablepictureinpicture playsinline preload="metadata" class="w-full rounded-lg bg-black" @error="release"></video><button type="button" @click="release" class="sdl-secondary px-3 py-2 text-sm">Close video</button><p class="text-xs text-slate-400">Access is checked on each new request. Previously delivered bytes cannot be recalled.</p></div>
  <button v-if="next" type="button" @click="more" :disabled="busy" class="sdl-secondary px-3 py-2 text-sm">More videos</button>
  <p v-if="busy" role="status" class="text-sm text-slate-400">Loading Clubhouse…</p><p v-if="error" role="alert" class="text-sm text-rose-200">{{error}}</p>
 </section>`
};
