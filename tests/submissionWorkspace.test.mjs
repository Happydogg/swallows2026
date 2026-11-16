import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,user,deferred} from './helpers/appHarness.mjs';
const P='11111111-1111-4111-8111-111111111111',P2='22222222-2222-4222-8222-222222222222',A='33333333-3333-4333-8333-333333333333',V='44444444-4444-4444-8444-444444444444',T='55555555-5555-4555-8555-555555555555';
const row={id:V,player_id:P,category:'pitching',status:'pending',can_review:true,can_consent:true,history:[],share_with_team:false};
const file={name:'clip.mp4',type:'video/mp4',size:12,lastModified:1};
async function setup(t,overrides={},options={}){
 const h=await harness(t,user('parent'));const calls=[],revoked=[];
 h.app.players.value=[{id:P,athlete_id:A,preferred_name:'Child',jersey:'07',dob:'private',parent_phone:'private'},
 {id:P2,athlete_id:A,preferred_name:'Child at second club',jersey:'8'}];
 h.app.guardianLinks.value=[{athlete_id:A,status:'verified'}];
 h.app.coachRoster.value=[{id:P,team_id:T,team_name:'Team',preferred_name:'Child'}];
 h.app.teamMemberships.value=[{role:'coach',status:'active'}];
 const api={enabled:true,workspace:async()=>[{id:P,athlete_id:A,is_guardian:true,is_coach:true,team_id:T,team_name:'Team',organization_name:'Club',organization_id:'org'}],
 list:async()=>[{...row}],queue:async()=>[{...row}],clubhouse:async()=>[{id:V,player_id:P,category:'pitching',preferred_name:'Child'}],
 submit:async(...args)=>{calls.push(['submit',...args]);args[3].onProgress(100);return row;},review:async(...args)=>{calls.push(['review',...args]);return {updated:true};},
 consent:async(...args)=>{calls.push(['consent',...args]);return {updated:true};},playback:async()=>new Blob(['private'],{type:'video/mp4'}),...overrides};
 const c=h.module('composables/useSubmissionWorkspace.js').useSubmissionWorkspace({auth:h.app,players:h.app.players,coachRoster:h.app.coachRoster,
 onProfile:p=>calls.push(['profile',p.id]),service:api,urls:{createObjectURL:()=>`blob:${calls.length}`,revokeObjectURL:u=>revoked.push(u)},newKey:()=>V,pollMs:1000000,...options});
 t.after(()=>c.dispose());return{h,c,api,calls,revoked};
}
test('My Players groups an athlete across organizations and supports multiple children without family data',async t=>{
 const {h,c}=await setup(t);assert.equal(c.cards.value.length,1);assert.equal(c.cards.value[0].profiles.length,2);
 assert.equal(c.cards.value[0].profiles[0].dob,undefined);assert.equal(c.cards.value[0].profiles[0].parent_phone,undefined);
 h.app.players.value.push({id:'third',athlete_id:'other',preferred_name:'Sibling'});h.app.guardianLinks.value.push({athlete_id:'other',status:'verified'});
 assert.equal(c.cards.value.length,2);
});
test('unverified guardian links never generate parent cards',async t=>{const {h,c}=await setup(t);h.app.guardianLinks.value[0].status='revoked';assert.equal(c.cards.value.length,0);});
test('workspace metadata contains club/team context and dual-role accounts retain both views',async t=>{
 const {c}=await setup(t);await c.load();assert.equal(c.ready.value,true);assert.equal(c.cards.value[0].memberships[0].team_name,'Team');assert.equal(c.teams.value[0].id,T);
});
test('profile navigation only uses the currently verified linked-child record',async t=>{const {c,calls}=await setup(t);c.showProfile('unrelated');assert.equal(calls.length,0);c.showProfile(P);assert.deepEqual(calls[0],['profile',P]);});
test('undeployed workspace never makes requests and leaves submission operation disabled',async t=>{
 let called=false;const {c}=await setup(t,{enabled:false,list:()=>{called=true;}});await c.load();await c.selectPlayer(P);assert.equal(called,false);assert.equal(c.enabled,false);assert.match(c.error.value,/awaits verified/);
});
test('own-child selection loads history, unrelated selection makes no request',async t=>{
 let n=0;const {c}=await setup(t,{list:async()=>{n++;return[row];}});await c.selectPlayer('unrelated');assert.equal(n,0);await c.selectPlayer(P);assert.equal(n,1);
});
test('MP4 picking creates a local preview and invalid files are rejected',async t=>{
 const {c}=await setup(t);c.pickFile({target:{files:[file],value:'x'}});assert.ok(c.previewUrl.value);
 c.pickFile({target:{files:[{...file,type:'video/quicktime'}],value:'x'}});assert.equal(c.file.value,null);assert.match(c.error.value,/MP4/);
 c.pickFile({target:{files:[{...file,size:20971521}],value:'x'}});assert.equal(c.file.value,null);assert.match(c.error.value,/20 MiB/);
});
test('successful parent submission sends category and explicit consent then reloads status',async t=>{
 const {c,calls,revoked}=await setup(t);await c.selectPlayer(P);c.pickFile({target:{files:[file],value:''}});c.category.value='throwing';c.share.value=true;await c.submit();
 const call=calls.find(x=>x[0]==='submit');assert.equal(call[3].category,'throwing');assert.equal(call[3].share,true);assert.equal(call[3].key,V);
 assert.equal(c.items.value[0].status,'pending');assert.equal(c.file.value,null);assert.ok(revoked.length);assert.match(c.notice.value,/Submitted/);
});
test('interrupted submission keeps the same idempotency key for recovery',async t=>{
 const keys=[];const {c}=await setup(t,{submit:async(_p,_f,meta)=>{keys.push(meta.key);throw Error('Upload interrupted');}});
 await c.selectPlayer(P);c.pickFile({target:{files:[file],value:''}});await c.submit();await c.submit();assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(c.file.value.name,file.name);
});
test('status filtering covers pending approved and rejected histories',async t=>{
 const {c}=await setup(t,{list:async()=>['pending','approved','rejected'].map((status,i)=>({...row,id:V+i,status}))});await c.selectPlayer(P);
 for(const value of ['pending','approved','rejected']){c.filter.value=value;assert.equal(c.shownItems.value.length,1);assert.equal(c.shownItems.value[0].status,value);}
});
test('coach queue remains scoped to selected authorized team',async t=>{
 const selected=[];const {c}=await setup(t,{queue:async(team)=>{selected.push(team);return[row];}});await c.enterReview('other-team');assert.equal(selected.length,0);await c.enterReview(T);assert.deepEqual(selected,[T]);assert.equal(c.pendingCount.value,1);
});
test('review uses explicit server permission and parents cannot approve their own records',async t=>{
 const {c,calls}=await setup(t);await c.enterReview(T);c.queue.value=[{...row,can_review:false}];await c.review(c.queue.value[0],'approved');assert.equal(calls.length,0);
 c.queue.value=[{...row}];c.notes.value[V]='Good mechanics';await c.review(c.queue.value[0],'approved');assert.equal(calls[0][0],'review');assert.equal(calls[0][3],'Good mechanics');
});
test('concurrent review conflict refreshes the queue without reporting success',async t=>{
 let count=0;const {c}=await setup(t,{queue:async()=>{count++;return[{...row,status:count>1?'approved':'pending'}];},review:async()=>{throw Object.assign(Error('Concurrent review'),{status:409});}});
 await c.enterReview(T);await c.review(c.queue.value[0],'approved');assert.equal(count,2);assert.equal(c.queue.value[0].status,'approved');assert.equal(c.notice.value,'');assert.match(c.error.value,/Concurrent/);
});
test('consent withdrawal clears shared rows and private playback immediately in this tab',async t=>{
 const {c,calls,revoked}=await setup(t);await c.selectPlayer(P);c.items.value=[{...row,share_with_team:true}];await c.play(c.items.value[0]);c.shared.value=[row];
 await c.consent(c.items.value[0],false);assert.equal(c.playbackUrl.value,'');assert.equal(c.shared.value.length,0);assert.ok(revoked.length);assert.equal(calls[0][0],'consent');assert.equal(calls[0][2],false);
});
test('Clubhouse refresh drops stale rows and playback before fetching current consent',async t=>{
 let count=0;const {c}=await setup(t,{clubhouse:async()=>++count===1?[row]:[]});await c.selectTeam(T,'clubhouse');await c.play(c.shared.value[0],'clubhouse');assert.ok(c.playbackUrl.value);
 await c.refreshShared();assert.equal(c.shared.value.length,0);assert.equal(c.playbackUrl.value,'');
});
test('permission-denied playback clears every private list and preview',async t=>{
 const {c}=await setup(t,{playback:async()=>{throw Object.assign(Error('Denied'),{status:403});}});await c.selectPlayer(P);await c.play(c.items.value[0]);assert.equal(c.items.value.length,0);assert.equal(c.playbackUrl.value,'');assert.equal(c.ready.value,false);
});
test('logout/account switching discards late history responses and releases previews',async t=>{
 const pending=deferred();const {c,h,revoked}=await setup(t,{list:()=>pending.promise});const selecting=c.selectPlayer(P);c.pickFile({target:{files:[file],value:''}});
 await h.app.signOutAndClear();c.reset();pending.resolve([row]);await selecting;assert.equal(c.items.value.length,0);assert.equal(c.previewUrl.value,'');assert.equal(c.cards.value.length,0);assert.equal(c.busy.value,false);
});
test('late upload progress cannot mutate the next session',async t=>{
 const pending=deferred();let progress;const {c}=await setup(t,{submit:(_p,_f,_m,opt)=>{progress=opt.onProgress;return pending.promise;}});await c.selectPlayer(P);c.pickFile({target:{files:[file],value:''}});const submitting=c.submit();c.reset();progress(99);pending.resolve(row);await submitting;assert.equal(c.progress.value,0);assert.equal(c.notice.value,'');
});
test('preview and playback decode errors release Blob resources',async t=>{
 const {c}=await setup(t);c.pickFile({target:{files:[file],value:''}});c.previewError();assert.equal(c.file.value,null);assert.match(c.error.value,/decode/);await c.selectPlayer(P);await c.play(c.items.value[0]);c.playbackError();assert.equal(c.playbackUrl.value,'');
});
test('request timeout clears loading and allows retry',async t=>{
 const {c}=await setup(t,{list:(_p,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError'))))},{timeoutMs:10});await c.selectPlayer(P);assert.equal(c.busy.value,false);assert.match(c.error.value,/interrupted/);
});

async function serviceSetup(t,overrides={}){
 const h=await harness(t,user('parent')),calls=[];const transport={requestJson:async(route,opt)=>{calls.push({route,opt});if(route==='/v2/capabilities')return{revision:'sdl004-submissions-v1',submissions:true,review:true,clubhouse:true};return{items:[row]};},submit:async()=>row,submissionPlayback:async()=>new Blob(['private']),...overrides};
 return{h,calls,service:h.module('js/submissionService.js').createSubmissionService({auth:h.app,enabled:true,transport})};
}
test('submission transport refuses an old or incomplete backend contract',async t=>{const {service}=await serviceSetup(t,{requestJson:async()=>({revision:'old'})});await assert.rejects(service.list(P),/required backend/);});
test('client feature gate blocks even direct programmatic calls before any backend request',async t=>{const {h}=await serviceSetup(t);let called=false;const service=h.module('js/submissionService.js').createSubmissionService({auth:h.app,enabled:false,transport:{requestJson(){called=true;}}});await assert.rejects(service.list(P),/await verified/);assert.equal(called,false);});
test('metadata projection strips private family fields and reviewer identity from history',async t=>{const {service}=await serviceSetup(t,{requestJson:async route=>route==='/v2/capabilities'?{revision:'sdl004-submissions-v1',submissions:true,review:true,clubhouse:true}:{items:[{...row,dob:'secret',history:[{actor:'private',action:'approved',note:'OK'}]}]}});const [item]=await service.list(P);assert.equal(item.dob,undefined);assert.equal(item.history[0].actor,undefined);});
test('review and consent requests use only explicit fields and scoped IDs',async t=>{const {service,calls}=await serviceSetup(t);await service.review(V,'rejected','Try again');assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).opt.body)),{decision:'rejected',note:'Try again'});await service.consent(V,false);assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).opt.body)),{share_with_team:false,team_ids:[]});await assert.rejects(service.review(V,'pending',''),/Invalid review/);});


test('background consent rechecks preserve authorized playback and stop it when consent disappears',async t=>{
 let allowed=true;const {c}=await setup(t,{clubhouse:async()=>allowed?[row]:[]});
 await c.selectTeam(T,'clubhouse');await c.play(c.shared.value[0],'clubhouse');const url=c.playbackUrl.value;
 await c.refreshShared(true);assert.equal(c.playbackUrl.value,url);
 allowed=false;await c.refreshShared(true);assert.equal(c.playbackUrl.value,'');assert.equal(c.shared.value.length,0);
});
