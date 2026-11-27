// SDL-004B-RBAC-05: narrow staging acceptance surface; final UX belongs to SDL-UX-003.
import { createPrivateMediaService } from '../js/privateMediaService.js';
const {ref,watch,onUnmounted}=Vue;
export const MediaConsentPanel={
 name:'MediaConsentPanel',
 props:{auth:{type:Object,required:true},players:{type:Array,default:()=>[]}},
 setup(props){
  const service=createPrivateMediaService({auth:props.auth});
  const selected=ref(''),status=ref(null),checked=ref(false),busy=ref(false),error=ref(''),notice=ref('');
  let sequence=0,abort=null;
  function reset(){sequence++;abort?.abort();abort=null;status.value=null;checked.value=false;busy.value=false;error.value='';notice.value='';}
  async function run(action=null){
   if(busy.value||!props.players.some(p=>p.id===selected.value))return;
   if(action===true&&(!checked.value||!status.value?.can_accept||status.value.active))return;
   if(action===false&&!status.value?.active)return;
   const id=selected.value,generation=status.value?.generation,identity=props.auth.captureIdentity(),epoch=++sequence;
   abort?.abort();const controller=new AbortController();abort=controller;
   const current=()=>epoch===sequence&&!controller.signal.aborted&&props.auth.isCurrentIdentity(identity)&&selected.value===id;
   busy.value=true;error.value='';notice.value='';
   const timer=setTimeout(()=>controller.abort(),20000);
   try{
    const result=action===null?await service.mediaConsent(id,{signal:controller.signal}):await service.setMediaConsent(id,generation,action,{signal:controller.signal});
    if(!current())return;
    if(result?.player_id!==id||result.policy_version!=='sdl004-clubhouse-view-download-v2'||typeof result.organization_name!=='string'||typeof result.active!=='boolean'||typeof result.can_accept!=='boolean'||typeof result.generation!=='string'||!Array.isArray(result.history))throw Error('Invalid consent response.');
    status.value=result;checked.value=false;
    if(action!==null)notice.value=result.active?'Sharing consent recorded. Videos remain private until explicitly published.':'Sharing consent withdrawn. Future shared access is blocked.';
   }catch(e){if(epoch===sequence&&props.auth.isCurrentIdentity(identity)&&selected.value===id){status.value=null;checked.value=false;error.value=controller.signal.aborted?'Consent request timed out. Refresh to verify the current state.':e.message||'Consent service unavailable.';}}
   finally{clearTimeout(timer);if(epoch===sequence){busy.value=false;abort=null;}}
  }
  function select(id){reset();selected.value=id;if(id)void run();}
  watch(()=>props.players.map(p=>p.id).join(','),()=>{if(!props.players.some(p=>p.id===selected.value))select(props.players[0]?.id||'');},{immediate:true});
  onUnmounted(reset);
  return {selected,status,checked,busy,error,notice,select,refresh:()=>run(),accept:()=>run(true),withdraw:()=>{if(globalThis.confirm('Withdraw team video sharing consent? This blocks future shared access. Previously delivered copies cannot be recalled. Re-acceptance may require resolution of a guardian objection.'))void run(false);}};
 },
 template:`
 <section class="sdl-panel space-y-3 p-4 sm:p-5" aria-label="Clubhouse video sharing consent">
  <header class="flex flex-wrap items-center justify-between gap-2">
   <h2 class="sdl-section-title">Clubhouse video sharing</h2>
   <span class="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300">Optional</span>
  </header>
  <p class="text-xs text-amber-200">Synthetic staging test only. Do not grant consent for real player footage in this test environment.</p>
  <label class="block text-sm text-slate-300">Player
   <select :value="selected" @change="select($event.target.value)" class="mt-1 w-full min-h-11 rounded-lg border border-slate-600 bg-slate-950 px-3">
    <option value="">Choose a player</option><option v-for="p in players" :key="p.id" :value="p.id">{{ p.preferred_name || 'My player' }}</option>
   </select>
  </label>
  <p v-if="busy" role="status" class="text-sm text-slate-400">Checking consent…</p>
  <p v-if="error" role="alert" class="text-sm text-rose-200">{{error}}</p>
  <p v-if="notice" role="status" class="text-sm text-emerald-200">{{notice}}</p>
  <button v-if="selected" type="button" @click="refresh" :disabled="busy" class="sdl-secondary px-3 py-2 text-sm">Refresh consent</button>
  <template v-if="status">
   <div class="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
    <p class="font-semibold">{{status.organization_name}}</p>
    <p class="mt-1 text-sm" :class="status.active?'text-emerald-200':'text-slate-300'">{{status.active ? 'Consent active' : 'Not sharing'}}</p>
   </div>
   <p class="text-sm text-slate-300">Optional standing consent for this continuous club enrollment. Private storage and statistics sharing are separate. Only independently approved, explicitly published single-athlete clips may be shared with authorized current team members.</p>
   <p class="text-sm text-slate-300">Consent includes viewing and downloading. Authorized team members may save explicitly published clips when the download feature is enabled. Withdrawal stops future shared access; copies already delivered cannot be remotely deleted. Leaving the club ends consent.</p>
   <p class="text-xs text-slate-400">Policy: {{status.policy_version}}</p>
   <p v-if="status.active && status.accepted_at" class="text-xs text-slate-400">Accepted: {{new Date(status.accepted_at).toLocaleString()}}</p>
   <template v-if="!status.active && status.can_accept">
    <label class="flex min-h-11 items-start gap-3 rounded-xl border border-slate-600 bg-slate-950/60 p-3 text-sm"><input type="checkbox" v-model="checked" :disabled="busy" class="mt-1 h-5 w-5 shrink-0">I voluntarily authorize approved videos of this synthetic player to be viewed and downloaded by authorized current team members within this club.</label>
    <button type="button" @click="accept" :disabled="busy || !checked" class="sdl-primary px-4 py-3 text-sm disabled:opacity-50">Grant sharing consent</button>
   </template>
   <p v-else-if="!status.active" class="text-sm text-amber-200">Acceptance unavailable. Check current enrollment, participation restrictions or unresolved guardian objections.</p>
   <button v-if="status.active" type="button" @click="withdraw" :disabled="busy" class="sdl-secondary px-4 py-3 text-sm">Withdraw sharing consent</button>
   <details v-if="status.history.length"><summary class="cursor-pointer text-sm">Consent record history</summary><ul class="text-xs text-slate-400"><li v-for="(entry,i) in status.history" :key="i">{{entry.action}} · {{new Date(entry.at).toLocaleString()}}</li></ul></details>
  </template>
 </section>`
};
