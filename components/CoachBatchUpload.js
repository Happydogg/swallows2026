import {createCoachBatchUpload,BATCH_MAX} from '../js/coachBatchUpload.js';
import {createPrivateMediaService,validateMediaFile} from '../js/privateMediaService.js';
import {extractVideoThumbnail} from '../js/videoThumbnail.js';
const {ref,computed,watch,onBeforeUnmount}=Vue;
export const CoachBatchUpload={
 name:'CoachBatchUpload',
 props:{auth:{type:Object,required:true},roster:{type:Array,required:true}},
 setup(props,{expose}){
   const step=ref(0), state=ref({running:false,rows:[]}), error=ref(''), bulk=ref(''), team=ref('');
   const categories=['batting','pitching','throwing'];
   const teams=computed(()=>[...new Map(props.roster.map(p=>[p.team_id,p.team_name||'Team'])).entries()].filter(([id])=>id));
   const players=computed(()=>props.roster.filter(p=>p.team_id===team.value));
   const queue=createCoachBatchUpload({auth:props.auth,service:createPrivateMediaService({auth:props.auth}),getCoachedPlayers:()=>players.value,validateFile:validateMediaFile,onChange:s=>{state.value=s;}});
   const rows=computed(()=>state.value.rows),running=computed(()=>state.value.running);
   const sizeMiB=computed(()=>(rows.value.reduce((n,r)=>n+r.size,0)/1048576).toFixed(1));
   const ready=computed(()=>rows.value.length>0&&rows.value.every(r=>r.playerId&&categories.includes(r.category)));
   const saved=computed(()=>rows.value.filter(r=>r.state==='saved').length);
   const retryable=computed(()=>rows.value.some(r=>['queued','retry'].includes(r.state)));
   const thumbnails=ref({}),localUrls=ref({}), localFiles=new Map(),previewId=ref('');
   let thumbController=new AbortController(),thumbJobs=Promise.resolve();
   const dispose=()=>{for(const u of localFiles.values())URL.revokeObjectURL(u);localFiles.clear();thumbController.abort();thumbController=new AbortController();thumbJobs=Promise.resolve();thumbnails.value={};localUrls.value={};previewId.value='';};
   const reset=()=>{queue.clear();dispose();step.value=0;error.value='';bulk.value='';};
   watch(()=>props.roster.map(p=>p.team_id+':'+p.id).sort().join('|'),()=>{reset();if(!teams.value.some(([id])=>id===team.value))team.value=teams.value.length===1?teams.value[0][0]:'';},{immediate:true});
   watch(()=>props.auth.isTeamCoach.value,allowed=>{if(!allowed)reset();});
   watch(team,()=>{if(rows.value.length)reset();});
   expose({hasPending:()=>running.value||rows.value.some(r=>['queued','retry','checking','uploading'].includes(r.state))});
   onBeforeUnmount(reset);
   function addFiles(event){
     error.value='';const files=Array.from(event.target.files||[]);event.target.value='';
     if(!team.value||!files.length)return;
     try{const before=new Set(rows.value.map(r=>r.id));queue.add(files);const added=rows.value.filter(r=>!before.has(r.id));added.forEach((r,i)=>{const u=URL.createObjectURL(files[i]);localFiles.set(r.id,u);});localUrls.value=Object.fromEntries(localFiles);const signal=thumbController.signal;thumbJobs=thumbJobs.then(async()=>{for(let i=0;i<added.length;i++){if(signal.aborted)break;const id=added[i].id;if(!localFiles.has(id))continue;try{const img=await extractVideoThumbnail(files[i],{onSignal:signal});if(!signal.aborted&&localFiles.has(id))thumbnails.value={...thumbnails.value,[id]:img};}catch{ /* Unsupported codec: keep explicit preview button, never fake a frame. */ }}});step.value=1;}catch(e){error.value=e.message;}
   }
   function assign(r,patch){queue.assign(r.id,{playerId:r.playerId,category:r.category,...patch});}
   function applyBulk(){if(!categories.includes(bulk.value))return;rows.value.forEach(r=>assign(r,{category:bulk.value}));}
   function remove(r){queue.remove(r.id);if(!rows.value.some(x=>x.id===r.id)){const u=localFiles.get(r.id);if(u)URL.revokeObjectURL(u);localFiles.delete(r.id);localUrls.value=Object.fromEntries(localFiles);const next={...thumbnails.value};delete next[r.id];thumbnails.value=next;if(previewId.value===r.id)previewId.value='';}}
   async function start(){if(running.value)return;error.value='';step.value=3;try{await queue.run();}catch(e){error.value=e.message;}}
   function label(id){const p=players.value.find(p=>p.id===id);return p?(p.jersey?'#'+p.jersey+' · ':'')+(p.preferred_name||'Player'):'Player no longer in roster';}
   function restart(){if(!running.value&&(!retryable.value||window.confirm('Discard unfinished clips? Unconfirmed uploads may already have reached the server.')))reset();}
   return {step,rows,running,error,bulk,team,teams,players,categories,sizeMiB,ready,saved,retryable,thumbnails,localUrls,previewId,max:BATCH_MAX,addFiles,assign,applyBulk,remove,start,label,restart,cancel:queue.cancel};
 },
 template:`
 <section class="space-y-4" aria-label="Coach batch video upload">
 <header><h2 class="text-2xl font-black text-white">Batch Upload</h2><p class="text-xs text-slate-400">Synthetic staging footage only. Do not upload real children.</p></header>
 <ol class="grid grid-cols-4 gap-2 text-xs"><li v-for="(s,i) in ['Select','Assign','Confirm','Results']" :key="s" :aria-current="i===step?'step':undefined" :class="i<=step?'border-blue-400 text-white':'border-slate-700 text-slate-400'" class="border-t-4 pt-2">{{i+1}}. {{s}}</li></ol>
 <p v-if="error" role="alert" class="rounded-lg bg-rose-950 p-3 text-rose-200">{{error}}</p>
 <div v-if="step<2" class="space-y-3 rounded-xl bg-slate-900 p-4">
 <label class="block">Team<select v-model="team" :disabled="rows.length>0" class="mt-1 w-full rounded-lg bg-slate-800 p-3"><option value="">Select team</option><option v-for="([id,name]) in teams" :value="id" :key="id">{{name}}</option></select></label>
 <p class="text-sm text-slate-300">{{players.length}} players · {{rows.length}} / {{max}} videos · {{sizeMiB}} MiB total</p>
 <label class="block rounded-xl border border-dashed border-slate-500 p-4">Add practice videos (Photo Library or Files)<input type="file" multiple accept="video/mp4,video/quicktime,.mp4,.mov" :disabled="!team||rows.length>=max||running" @change="addFiles" class="mt-2 block w-full text-sm"></label>
 <p class="text-xs text-slate-400">MP4 / MOV · Maximum 40 MiB per file. Keep this page open during upload.</p></div>
 <div v-if="step===1" class="space-y-3">
 <h3 class="text-lg font-bold">Assign videos · {{rows.filter(r=>r.playerId).length}}/{{rows.length}}</h3>
 <div class="flex gap-2"><select v-model="bulk" class="min-w-0 flex-1 rounded-lg bg-slate-800 p-3"><option value="">Choose activity</option><option v-for="c in categories" :key="c">{{c}}</option></select><button @click="applyBulk" :disabled="!bulk" class="rounded-lg bg-slate-700 p-3">Apply to all</button></div>
 <article v-for="r in rows" :key="r.id" class="space-y-3 rounded-xl bg-slate-900 p-4">
 <div class="flex items-center gap-3"><video v-if="previewId===r.id && localUrls[r.id]" :src="localUrls[r.id]" preload="metadata" playsinline muted controls class="h-20 w-28 rounded bg-black object-contain"></video><button v-else @click="previewId=r.id" class="h-20 w-24 shrink-0 overflow-hidden rounded bg-slate-800 text-sm"><img v-if="thumbnails[r.id]" :src="thumbnails[r.id]" alt="Preview actual clip" class="h-full w-full object-cover"><span v-else>Preview clip</span></button><div class="min-w-0 flex-1"><p class="break-all font-bold">{{r.name}}</p><p class="text-xs">{{(r.size/1048576).toFixed(1)}} MiB</p></div><button @click="remove(r)" :aria-label="'Remove '+r.name" class="rounded-lg bg-slate-800 p-3">×</button></div>
 <label class="block">Player<select :value="r.playerId" @change="assign(r,{playerId:$event.target.value})" class="mt-1 w-full rounded-lg bg-slate-800 p-3"><option value="">Select player</option><option v-for="p in players" :key="p.id" :value="p.id">{{label(p.id)}}</option></select></label>
 <label class="block">Activity<select :value="r.category" @change="assign(r,{category:$event.target.value})" class="mt-1 w-full rounded-lg bg-slate-800 p-3"><option value="">Select activity</option><option v-for="c in categories" :key="c">{{c}}</option></select></label></article>
 <button @click="step=2" :disabled="!ready" class="w-full rounded-xl bg-blue-600 p-3 font-bold disabled:opacity-40">Review {{rows.length}} videos</button></div>
 <div v-if="step===2" class="space-y-3"><h3 class="text-lg font-bold">Confirm upload</h3><p>{{rows.length}} videos · {{sizeMiB}} MiB</p>
 <div v-for="r in rows" :key="r.id" class="rounded-xl bg-slate-900 p-3"><p class="font-bold">{{label(r.playerId)}}</p><p class="break-all text-sm">{{r.name}} · {{r.category}}</p></div>
 <p class="rounded-lg bg-slate-800 p-3 text-sm">Private uploads only. No automatic approval or sharing.</p><button @click="start" class="w-full rounded-xl bg-blue-600 p-3 font-bold">Upload {{rows.length}} videos</button><button @click="step=1" class="w-full rounded-xl bg-slate-800 p-3">Edit assignments</button></div>
 <div v-if="step===3" class="space-y-3"><h3 class="text-lg font-bold">Upload results</h3><p role="status">{{saved}} of {{rows.length}} saved</p><progress :value="saved" :max="rows.length||1" class="w-full"></progress>
 <div v-for="r in rows" :key="r.id" class="rounded-xl bg-slate-900 p-3"><p class="font-bold">{{label(r.playerId)}} · {{r.category}}</p><p class="break-all text-xs">{{r.name}}</p><p class="text-sm" :class="r.state==='saved'?'text-emerald-300':'text-slate-300'">{{r.state}} {{r.state==='uploading'?r.progress+'%':''}}</p><p v-if="r.message" class="text-xs text-amber-300">{{r.message}}</p></div>
 <button v-if="running" @click="cancel" class="w-full rounded-xl bg-slate-700 p-3">Pause / cancel active request</button>
 <button v-if="!running&&retryable" @click="start" class="w-full rounded-xl bg-blue-600 p-3 font-bold">Continue / retry unconfirmed videos</button>
 <button v-if="!running" @click="restart" class="w-full rounded-xl bg-slate-800 p-3">Start another batch</button><p class="text-xs text-slate-400">Successful requests are not repeated in this queue. Closing or leaving this page clears the queue; unconfirmed requests may have reached the server.</p></div>
 </section>`
};