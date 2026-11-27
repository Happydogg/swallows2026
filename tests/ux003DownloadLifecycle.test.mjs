// SDL-UX-003: deterministic tests of the actual panel setup functions.
// Synthetic services only. These are not real Vue DOM, signed HTTP or mobile save acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ref,computed,watch,shallowReactive,effectScope} from 'vue';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const strip=s=>s.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
const TEAM='11111111-1111-4111-8111-111111111111',TEAM2='22222222-2222-4222-8222-222222222222',MEDIA='33333333-3333-4333-8333-333333333333',PLAYER='44444444-4444-4444-8444-444444444444';
const row={id:MEDIA,category:'pitching',display_name:'Player',published_at:'2026-11-27T00:00:00Z',can_download:true};
const wait=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const err=status=>Object.assign(Error('Authorization denied'),{status});
function fixture({confirm=true,overrides={},panel='ClubhouseMediaPanel',rows=[row]}={}){
 const calls=[],revoked=[],timers=new Map(),unmounts=[],listeners=new Map();
 let identity=1,serial=0,now=0,approved=confirm,listing=rows,active=false,published=false;
 const Vue={ref,computed,watch,onUnmounted:fn=>unmounts.push(fn)};
 const auth={accountContext:ref({user_id:'guardian',roles:['guardian'],organizations:[{id:'org-a'}]}),
  authUser:ref({id:'guardian'}),authReady:ref(true),authError:ref(''),
  guardianLinks:ref([{athlete_id:'athlete',status:'verified',relationship:'parent'}]),
  captureIdentity:()=>identity,isCurrentIdentity:x=>x===identity&&!!auth.authUser.value};

 const consent=()=>({player_id:PLAYER,policy_version:'sdl004-clubhouse-view-download-v2',organization_name:'Synthetic club',active,can_accept:!active,generation:PLAYER,history:[]});
 const eligibility=()=>({eligible:true,reason_code:'eligible',targets:[{team_id:TEAM,team_name:'Team A',published,visible:published}]});
 const service={
  sharedMedia:async(team,cursor)=>{calls.push(['list',team,cursor]);return {items:listing,next_cursor:null};},
  sharedPlayback:async(id,team)=>{calls.push(['play',id,team]);return {type:'video/mp4'};},
  sharedDownload:async(id,team)=>{calls.push(['download',id,team]);return {type:'video/quicktime'};},
  mediaConsent:async id=>{calls.push(['consent',id]);return consent();},
  setMediaConsent:async(id,generation,accept)=>{calls.push(['setConsent',id,generation,accept]);active=accept;return consent();},
  publicationEligibility:async id=>{calls.push(['eligibility',id]);return eligibility();},
  setMediaPublication:async(id,team,publish)=>{calls.push(['publish',id,team,publish]);published=publish;return {updated:true,published:publish};},
  ...overrides
 };
 const document={visibilityState:'visible',addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
 const globalThis={confirm:message=>{calls.push(['confirm',message]);return approved;},document};
 const URL={createObjectURL:()=> 'blob:synthetic-'+(++serial),revokeObjectURL:url=>revoked.push(url)};
 const setTimeout=(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:now+ms});return id;};
 const clearTimeout=id=>timers.delete(id);
 function tick(ms){const end=now+ms;for(;;){const entries=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at);if(!entries.length)break;const [id,t]=entries[0];timers.delete(id);now=t.at;t.fn();}now=end;}
 const path=panel==='MediaConsentPanel'?'components/MediaConsentPanel.js':'components/MediaSharingPanels.js';
 const component=new Function('Vue','createPrivateMediaService','globalThis','URL','setTimeout','clearTimeout',strip(source(path))+'\nreturn '+panel+';')(Vue,()=>service,globalThis,URL,setTimeout,clearTimeout);
 const props=shallowReactive({auth,teams:[{id:TEAM,name:'Team A'},{id:TEAM2,name:'Team B'}],players:[{id:PLAYER,athlete_id:'athlete',preferred_name:'Synthetic player'}],controller:{mediaItems:Vue.ref([{id:MEDIA,status:'approved',category:'pitching'}]),refreshMedia:async()=>calls.push(['refreshPrivate'])}});
 const scope=effectScope();
 const c=scope.run(()=>component.setup(props));
 return {c,calls,revoked,timers,tick,component,props,setListing:v=>listing=v,setConfirm:v=>approved=v,
  background(){document.visibilityState='hidden';listeners.get('visibilitychange')?.();},
  foreground(){document.visibilityState='visible';listeners.get('visibilitychange')?.();},
  invalidate(){identity++;auth.accountContext.value={...auth.accountContext.value};},
  changeGuardian(id){identity++;auth.authUser.value=id?{id}:null;auth.accountContext.value=id?{...auth.accountContext.value,user_id:id}:null;},
  unmount(){scope.stop();for(const fn of unmounts)fn();},listeners};
}
test('fresh listing strictly projects can_download; missing and string flags cannot start download',async()=>{
 const a=fixture({rows:[{...row,can_download:'true'}]});await wait();assert.equal(a.c.items.value[0].can_download,false);a.c.download(row);await wait();assert.equal(a.calls.some(x=>x[0]==='download'),false);assert.equal(a.c.saveUrl.value,'');a.unmount();
 const b=fixture({rows:[{...row,can_download:undefined}]});await wait();b.c.download(row);await wait();assert.equal(b.calls.some(x=>x[0]==='download'),false);b.unmount();
});
test('confirmation, separate request, neutral MOV name, explicit save link and 60-second expiry',async()=>{
 const a=fixture();await wait();a.c.play(row);await wait();const playback=a.c.playback.value;assert.ok(playback);a.c.download(row);await wait();
 assert.deepEqual(a.calls.filter(x=>x[0]==='play'||x[0]==='download'),[['play',MEDIA,TEAM],['download',MEDIA,TEAM]]);
 assert.ok(a.revoked.includes(playback));const save=a.c.saveUrl.value;assert.ok(save);assert.notEqual(save,playback);assert.equal(a.c.saveName.value,'sdl-practice-video.mov');assert.match(a.component.template,/:href="saveUrl" :download="saveName"/);
 a.tick(59999);assert.equal(a.c.saveUrl.value,save);a.tick(1);assert.equal(a.c.saveUrl.value,'');assert.equal(a.c.saveName.value,'');assert.doesNotMatch(a.c.notice.value,/Authorized file ready/);assert.ok(a.revoked.includes(save));a.unmount();
});
test('cancelled confirmation and absent item do not fetch bytes',async()=>{
 const a=fixture({confirm:false});await wait();a.c.download(row);a.c.download({...row,id:PLAYER});await wait();assert.equal(a.calls.filter(x=>x[0]==='download').length,0);assert.equal(a.c.saveUrl.value,'');a.unmount();
});
test('authorized MP4 uses neutral name and explicit close revokes URL',async()=>{
 const a=fixture({overrides:{sharedDownload:async()=>({type:'video/mp4'})}});await wait();a.c.download(row);await wait();const save=a.c.saveUrl.value;assert.ok(save);assert.equal(a.c.saveName.value,'sdl-practice-video.mp4');a.c.clearSave();assert.equal(a.c.saveUrl.value,'');assert.equal(a.c.saveName.value,'');assert.doesNotMatch(a.c.notice.value,/Authorized file ready|file saved/i);assert.ok(a.revoked.includes(save));a.unmount();
});
test('stale listing and simulated 403 or 503 responses cannot yield a save URL',async()=>{
 for(const status of [401,403,503]){const a=fixture({overrides:{sharedDownload:async()=>{throw err(status);}}});await wait();a.c.download(row);await wait();assert.equal(a.c.saveUrl.value,'');assert.equal(a.c.items.value.length,0);assert.ok(a.c.error.value);a.unmount();}
});
test('refresh and team switch discard prepared files, then re-list exact selected team',async()=>{
 const a=fixture();await wait();a.c.download(row);await wait();const save=a.c.saveUrl.value;a.c.refresh();await wait();assert.equal(a.c.saveUrl.value,'');assert.ok(a.revoked.includes(save));a.c.download(row);await wait();const second=a.c.saveUrl.value;a.c.choose(TEAM2);await wait();assert.ok(a.revoked.includes(second));assert.equal(a.c.saveUrl.value,'');assert.deepEqual(a.calls.filter(x=>x[0]==='list').at(-1),['list',TEAM2,null]);a.unmount();
});
test('background, account invalidation and component exit revoke temporary URLs',async()=>{
 for(const action of ['background','invalidate','unmount']){const a=fixture();await wait();a.c.download(row);await wait();const save=a.c.saveUrl.value;assert.ok(save);a[action]();assert.equal(a.c.saveUrl.value,'');assert.ok(a.revoked.includes(save));a.unmount();}
});
test('late download receipt after scope/team switch is discarded',async()=>{
 const d=deferred(),a=fixture({overrides:{sharedDownload:()=>d.promise}});await wait();a.c.download(row);a.c.choose(TEAM2);d.resolve({type:'video/mp4'});await wait();assert.equal(a.c.saveUrl.value,'');assert.equal(a.c.selected.value,TEAM2);a.unmount();
});
test('late download receipt after account invalidation or unmount is discarded',async()=>{
 for(const action of ['invalidate','unmount','background']){const d=deferred(),a=fixture({overrides:{sharedDownload:()=>d.promise}});await wait();a.c.download(row);a[action]();d.resolve({type:'video/mp4'});await wait();assert.equal(a.c.saveUrl.value,'');a.unmount();}
});
test('consent requires explicit checkbox, one versioned decision, and withdrawal confirmation',async()=>{
 const a=fixture({panel:'MediaConsentPanel'});await wait();await a.c.accept();assert.equal(a.calls.filter(x=>x[0]==='setConsent').length,0);a.c.checked.value=true;await a.c.accept();assert.equal(a.c.status.value.active,true);assert.deepEqual(a.calls.filter(x=>x[0]==='setConsent'),[['setConsent',PLAYER,PLAYER,true]]);
 a.setConfirm(false);a.c.withdraw();await wait();assert.equal(a.c.status.value.active,true);a.setConfirm(true);a.c.withdraw();await wait();assert.equal(a.c.status.value.active,false);assert.deepEqual(a.calls.filter(x=>x[0]==='setConsent').at(-1),['setConsent',PLAYER,PLAYER,false]);assert.match(a.c.notice.value,/withdrawn/);a.unmount();
});
test('consent response after player switch cannot repopulate previous state',async()=>{
 const d=deferred(),a=fixture({panel:'MediaConsentPanel',overrides:{mediaConsent:()=>d.promise}});a.c.select('');d.resolve({player_id:PLAYER,policy_version:'sdl004-clubhouse-view-download-v2',organization_name:'Club',active:true,can_accept:false,generation:PLAYER,history:[]});await wait();assert.equal(a.c.status.value,null);a.unmount();
});
test('publication remains explicit and unpublication refreshes private library',async()=>{
 const a=fixture({panel:'MediaPublicationPanel'});await wait();a.setConfirm(false);await a.c.change(TEAM,true);assert.equal(a.calls.some(x=>x[0]==='publish'),false);a.setConfirm(true);await a.c.change(TEAM,true);assert.equal(a.c.state.value.targets[0].published,true);await a.c.change(TEAM,false);assert.equal(a.c.state.value.targets[0].published,false);assert.deepEqual(a.calls.filter(x=>x[0]==='publish'),[['publish',MEDIA,TEAM,true],['publish',MEDIA,TEAM,false]]);assert.equal(a.calls.filter(x=>x[0]==='refreshPrivate').length,2);a.unmount();
});
test('revoked consent or unpublication simulated by refreshed empty listing denies old row',async()=>{
 const a=fixture();await wait();a.c.download(row);await wait();const old=a.c.saveUrl.value;a.setListing([]);a.c.refresh();await wait();assert.ok(a.revoked.includes(old));assert.equal(a.c.items.value.length,0);const count=a.calls.filter(x=>x[0]==='download').length;a.c.download(row);await wait();assert.equal(a.calls.filter(x=>x[0]==='download').length,count);assert.equal(a.c.saveUrl.value,'');a.unmount();
});

const consentResult=(generation=PLAYER,extra={})=>({
 player_id:PLAYER,policy_version:'sdl004-clubhouse-view-download-v2',organization_name:'Synthetic club',
 active:false,can_accept:true,generation,history:[],...extra
});

test('same-player enrollment context invalidates old active consent and aborts obsolete reads',async()=>{
 const stale=deferred(),next=deferred(),signals=[];
 const a=fixture({panel:'MediaConsentPanel',overrides:{
  mediaConsent(_id,{signal}){signals.push(signal);return [consentResult(PLAYER,{active:true}),stale.promise,next.promise][signals.length-1];}
 }});
 try {
  await wait();assert.equal(a.c.status.value.active,true);
  void a.c.refresh();await wait();
  a.invalidate();await wait();
  assert.equal(a.c.selected.value,PLAYER);
  assert.equal(a.c.status.value,null);
  assert.equal(signals[1].aborted,true);
  stale.resolve(consentResult(PLAYER,{active:true}));await wait();
  assert.equal(a.c.status.value,null);
  next.resolve(consentResult(TEAM2));await wait();
  assert.equal(a.c.status.value.generation,TEAM2);
 } finally {a.unmount();}
});

test('enrollment generation changing only on the server requires a fresh opt-in before any write',async()=>{
 let generation=PLAYER;const writes=[];
 const a=fixture({panel:'MediaConsentPanel',overrides:{
  mediaConsent:async()=>consentResult(generation),
  setMediaConsent:async(_id,requested)=>{writes.push(requested);return consentResult(generation,{active:true});}
 }});
 try {
  await wait();a.c.checked.value=true;generation=TEAM2;
  await a.c.accept();
  assert.deepEqual(writes,[]);
  assert.equal(a.c.status.value.generation,TEAM2);
  assert.equal(a.c.checked.value,false);
  a.c.checked.value=true;await a.c.accept();
  assert.deepEqual(writes,[TEAM2]);
 } finally {a.unmount();}
});

test('guardian change clears consent, checkbox and notices for an unchanged player',async()=>{
 const old=deferred(),next=deferred(),signals=[];
 const a=fixture({panel:'MediaConsentPanel',overrides:{
  mediaConsent(_id,{signal}){signals.push(signal);return [consentResult(),old.promise,next.promise][signals.length-1];}
 }});
 try {
  await wait();a.c.checked.value=true;
  void a.c.refresh();await wait();
  a.c.checked.value=true;a.c.notice.value='Old consent message';
  a.changeGuardian('another-guardian');
  assert.equal(a.c.status.value,null);assert.equal(a.c.checked.value,false);assert.equal(a.c.notice.value,'');
  await wait();assert.equal(signals[1].aborted,true);
  old.resolve(consentResult(PLAYER,{active:true}));await wait();
  assert.equal(a.c.status.value,null);
  next.resolve(consentResult(TEAM2));await wait();
  assert.equal(a.c.status.value.generation,TEAM2);
 } finally {a.unmount();}
});

test('revoked guardian authority cancels the request even when the player list has not changed',async()=>{
 const pending=deferred();let signal;
 const a=fixture({panel:'MediaConsentPanel',overrides:{mediaConsent:(_id,o)=>{signal=o.signal;return pending.promise;}}});
 try {
  await wait();
  a.props.auth.guardianLinks.value=[{athlete_id:'athlete',status:'revoked',relationship:'parent'}];
  assert.equal(signal.aborted,true);
  pending.resolve(consentResult(PLAYER,{active:true}));await wait();
  assert.equal(a.props.players[0].id,PLAYER);assert.equal(a.c.status.value,null);
  assert.equal(a.c.selected.value,'');
 } finally {a.unmount();}
});

test('logout during consent revalidation aborts and clears a pending same-player response',async()=>{
 const pending=deferred();let signal;
 const a=fixture({panel:'MediaConsentPanel',overrides:{mediaConsent:(_id,o)=>{signal=o.signal;return pending.promise;}}});
 try {
  await wait();a.changeGuardian(null);
  assert.equal(signal.aborted,true);assert.equal(a.c.busy.value,false);
  pending.resolve(consentResult(PLAYER,{active:true}));await wait();
  assert.equal(a.c.status.value,null);assert.equal(a.c.notice.value,'');
 } finally {a.unmount();}
});

test('organization context revalidates once while ordinary reactive updates keep consent stable',async()=>{
 const a=fixture({panel:'MediaConsentPanel'});
 try {
  await wait();assert.equal(a.calls.filter(x=>x[0]==='consent').length,1);
  a.props.players=[{...a.props.players[0],preferred_name:'Updated label'}];
  a.props.auth.authUser.value={id:'guardian',label:'Renewed session'};
  a.props.auth.guardianLinks.value=[{...a.props.auth.guardianLinks.value[0]}];
  await wait();assert.equal(a.calls.filter(x=>x[0]==='consent').length,1);
  a.props.auth.accountContext.value={...a.props.auth.accountContext.value,organizations:[{id:'org-b'}]};
  assert.equal(a.c.status.value,null);
  await wait();assert.equal(a.calls.filter(x=>x[0]==='consent').length,2);
 } finally {a.unmount();}
});

test('withdrawal is explicit and a rejected reacceptance leaves no active status',async()=>{
 let active=true;const writes=[];
 const a=fixture({panel:'MediaConsentPanel',overrides:{
  mediaConsent:async()=>consentResult(PLAYER,{active}),
  setMediaConsent:async(_id,_generation,accept)=>{
   writes.push(accept);
   if(accept)throw err(403);
   active=false;return consentResult();
  }
 }});
 try {
  await wait();a.c.withdraw();await wait();
  assert.equal(a.c.status.value.active,false);assert.match(a.c.notice.value,/withdrawn/);
  assert.deepEqual(writes,[false]);a.c.checked.value=true;await a.c.accept();
  assert.deepEqual(writes,[false,true]);assert.equal(a.c.status.value,null);
  assert.equal(a.c.checked.value,false);assert.equal(a.c.notice.value,'');assert.match(a.c.error.value,/denied/);
 } finally {a.unmount();}
});

test('a repeated download revokes the first URL and gives the replacement a full lifetime',async()=>{
 const a=fixture();
 try {
  await wait();a.c.download(row);await wait();
  const first=a.c.saveUrl.value;a.tick(30000);a.c.download(row);await wait();
  const second=a.c.saveUrl.value;
  assert.ok(first&&second&&first!==second);assert.deepEqual(a.revoked,[first]);
  a.tick(30000);assert.equal(a.c.saveUrl.value,second);
  a.tick(30000);assert.equal(a.c.saveUrl.value,'');assert.deepEqual(a.revoked,[first,second]);
 } finally {a.unmount();}
});
