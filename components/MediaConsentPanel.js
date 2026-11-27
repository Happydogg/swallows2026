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
  const verifiedLink=player=>props.auth.guardianLinks.value.find(link=>
   link.athlete_id===player.athlete_id && link.status==='verified');
  const eligible=id=>props.players.find(player=>id===player.id && verifiedLink(player));
  function authorized(id){
   const {auth}=props,context=auth.accountContext.value;
   return auth.authReady.value && !auth.authError.value && !!auth.authUser.value?.id &&
    context?.user_id===auth.authUser.value.id && context.roles.includes('guardian') && !!eligible(id);
  }
  function reset(){
   sequence++;abort?.abort();abort=null;
   status.value=null;checked.value=false;busy.value=false;error.value='';notice.value='';
  }
  function validate(result,id){
   if(result?.player_id!==id||result.policy_version!=='sdl004-clubhouse-view-download-v2'||
      typeof result.organization_name!=='string'||typeof result.active!=='boolean'||
      typeof result.can_accept!=='boolean'||typeof result.generation!=='string'||!Array.isArray(result.history)){
    throw Error('Invalid consent response.');
   }
   return result;
  }
  async function run(action=null){
   const id=selected.value,previous=status.value;
   if(busy.value||!authorized(id))return;
   if(action===true&&(!checked.value||!previous?.can_accept||previous.active))return;
   if(action===false&&!previous?.active)return;
   const identity=props.auth.captureIdentity(),epoch=++sequence;
   if(!props.auth.isCurrentIdentity(identity))return;
   const controller=new AbortController();abort=controller;
   const ownsState=()=>epoch===sequence&&props.auth.isCurrentIdentity(identity)&&selected.value===id&&authorized(id);
   const current=()=>ownsState()&&!controller.signal.aborted;
   status.value=null;checked.value=false;busy.value=true;error.value='';notice.value='';
   const timer=setTimeout(()=>controller.abort(),20000);
   try{
    let result=validate(await service.mediaConsent(id,{signal:controller.signal}),id);
    if(!current())return;
    if(action!==null){
     // The roster does not project enrollment generation. Recheck it with
     // the existing consent read before sending an explicit decision.
     const {generation}=result;
     if(generation!==previous.generation||result.organization_name!==previous.organization_name||
        result.active!==previous.active||(action===true&&!result.can_accept)){
      status.value=result;
      error.value='Consent changed. Review the current information before making a new decision.';
      return;
     }
     result=validate(await service.setMediaConsent(id,generation,action,{signal:controller.signal}),id);
     if(!current())return;
     notice.value=result.active?'Sharing consent recorded. Videos remain private until explicitly published.':
      'Sharing consent withdrawn. Future shared access is blocked.';
    }
    status.value=result;
   }catch(e){
    if(ownsState())error.value=controller.signal.aborted?'Consent request timed out. Refresh to verify the current state.':e.message||'Consent service unavailable.';
   }finally{
    clearTimeout(timer);
    if(epoch===sequence){busy.value=false;abort=null;}
   }
  }
  function select(id){
   reset();selected.value=id;
   if(authorized(id))void run();
  }
  watch([
   ()=>props.auth.authUser.value?.id,()=>props.auth.accountContext.value,
   ()=>props.auth.authReady.value,()=>props.auth.authError.value,
   ()=>JSON.stringify(props.players.filter(verifiedLink).map(player=>[
    player.id,player.athlete_id,verifiedLink(player).relationship
   ]).sort((a,b)=>a[0].localeCompare(b[0])))
  ],()=>{
   reset();
   if(!eligible(selected.value))selected.value=props.players.find(verifiedLink)?.id||'';
   // Account verification may replace several projections in one turn.
   // Clear immediately and issue just the final authoritative read.
   const epoch=sequence;
   void Promise.resolve().then(()=>{if(sequence===epoch&&authorized(selected.value))void run();});
  },{immediate:true,flush:'sync'});
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
