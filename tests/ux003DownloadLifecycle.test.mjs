// SDL-UX-003: deterministic tests of the actual panel setup functions.
// Synthetic services only. These are not real Vue DOM, signed HTTP or mobile save acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const strip=s=>s.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
const TEAM='11111111-1111-4111-8111-111111111111',TEAM2='22222222-2222-4222-8222-222222222222',MEDIA='33333333-3333-4333-8333-333333333333',PLAYER='44444444-4444-4444-8444-444444444444';
const row={id:MEDIA,category:'pitching',display_name:'Player',published_at:'2026-11-27T00:00:00Z',can_download:true};
const wait=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const err=status=>Object.assign(Error('Authorization denied'),{status});
function fixture({confirm=true,overrides={},panel='ClubhouseMediaPanel',rows=[row]}={}){
 const calls=[],revoked=[],timers=new Map(),watchers=[],unmounts=[],listeners=new Map();
 let identity=1,serial=0,now=0,approved=confirm,listing=rows,active=false,published=false;
 const Vue={ref:value=>({value}),computed:fn=>({get value(){return fn()}}),watch:(source,fn,options)=>{watchers.push({source,fn});if(options?.immediate)fn();},onUnmounted:fn=>unmounts.push(fn)};
 const auth={accountContext:Vue.ref({}),captureIdentity:()=>identity,isCurrentIdentity:x=>x===identity};
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
 const props={auth,teams:[{id:TEAM,name:'Team A'},{id:TEAM2,name:'Team B'}],players:[{id:PLAYER,preferred_name:'Synthetic player'}],controller:{mediaItems:Vue.ref([{id:MEDIA,status:'approved',category:'pitching'}]),refreshMedia:async()=>calls.push(['refreshPrivate'])}};
 const c=component.setup(props);
 return {c,calls,revoked,timers,tick,component,props,setListing:v=>listing=v,setConfirm:v=>approved=v,
  background(){document.visibilityState='hidden';listeners.get('visibilitychange')?.();},
  foreground(){document.visibilityState='visible';listeners.get('visibilitychange')?.();},
  invalidate(){identity++;auth.accountContext.value={};watchers[0]?.fn();},
  unmount(){for(const fn of unmounts)fn();},listeners};
}
test('fresh listing strictly projects can_download; missing and string flags cannot start download',async()=>{
 const a=fixture({rows:[{...row,can_download:'true'}]});await wait();assert.equal(a.c.items.value[0].can_download,false);a.c.download(row);await wait();assert.equal(a.calls.some(x=>x[0]==='download'),false);assert.equal(a.c.saveUrl.value,'');a.unmount();
 const b=fixture({rows:[{...row,can_download:undefined}]});await wait();b.c.download(row);await wait();assert.equal(b.calls.some(x=>x[0]==='download'),false);b.unmount();
});
test('confirmation, separate request, neutral MOV name, explicit save link and 60-second expiry',async()=>{
 const a=fixture();await wait();a.c.play(row);await wait();const playback=a.c.playback.value;assert.ok(playback);a.c.download(row);await wait();
 assert.deepEqual(a.calls.filter(x=>x[0]==='play'||x[0]==='download'),[['play',MEDIA,TEAM],['download',MEDIA,TEAM]]);
 assert.ok(a.revoked.includes(playback));const save=a.c.saveUrl.value;assert.ok(save);assert.notEqual(save,playback);assert.equal(a.c.saveName.value,'sdl-practice-video.mov');assert.match(a.component.template,/:href="saveUrl" :download="saveName"/);
 a.tick(59999);assert.equal(a.c.saveUrl.value,save);a.tick(1);assert.equal(a.c.saveUrl.value,'');assert.ok(a.revoked.includes(save));a.unmount();
});
test('cancelled confirmation and absent item do not fetch bytes',async()=>{
 const a=fixture({confirm:false});await wait();a.c.download(row);a.c.download({...row,id:PLAYER});await wait();assert.equal(a.calls.filter(x=>x[0]==='download').length,0);assert.equal(a.c.saveUrl.value,'');a.unmount();
});
test('authorized MP4 uses neutral name and explicit close revokes URL',async()=>{
 const a=fixture({overrides:{sharedDownload:async()=>({type:'video/mp4'})}});await wait();a.c.download(row);await wait();const save=a.c.saveUrl.value;assert.ok(save);assert.equal(a.c.saveName.value,'sdl-practice-video.mp4');a.c.clearSave();assert.equal(a.c.saveUrl.value,'');assert.ok(a.revoked.includes(save));a.unmount();
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
