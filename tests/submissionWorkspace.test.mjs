import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,user,deferred} from './helpers/appHarness.mjs';
const P='11111111-1111-4111-8111-111111111111',P2='22222222-2222-4222-8222-222222222222',A='33333333-3333-4333-8333-333333333333',V='44444444-4444-4444-8444-444444444444',T='55555555-5555-4555-8555-555555555555';
const E='88888888-8888-4888-8888-888888888888',G='99999999-9999-4999-8999-999999999999',O='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const club={id:E,generation:G,athlete_id:A,organization_id:O,organization_name:'First club',status:'active',consent_active:false,history:[]};
const row={id:V,player_id:P,athlete_id:A,can_publish:true,publication_team_ids:[],category:'pitching',status:'pending',can_review:true,can_consent:true,history:[],share_with_team:false};
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
 enrollments:async()=>[{...club}],clubConsent:async(...args)=>{calls.push(['clubConsent',...args]);return {updated:true};},publish:async(...args)=>{calls.push(['publish',...args]);return {updated:true};},playback:async()=>new Blob(['private'],{type:'video/mp4'}),...overrides};
 const c=h.module('composables/useSubmissionWorkspace.js').useSubmissionWorkspace({auth:h.app,players:h.app.players,coachRoster:h.app.coachRoster,sessions:h.app.sessions,
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
test('successful parent submission is private with no per-video consent parameters',async t=>{
 const {c,calls,revoked}=await setup(t);await c.load();await c.selectPlayer(P);c.pickFile({target:{files:[file],value:''}});c.category.value='throwing';await c.submit();
 const call=calls.find(x=>x[0]==='submit');assert.equal(call[3].category,'throwing');assert.equal(call[3].share,undefined);assert.equal(call[3].teamIds,undefined);assert.equal(call[3].key,V);
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
test('club withdrawal clears shared rows and playback but preserves private history',async t=>{
 const {c,calls,revoked}=await setup(t);await c.load();await c.selectPlayer(P);await c.play(c.items.value[0]);c.shared.value=[row];
 await c.clubConsent(c.clubEnrollments.value[0],false);assert.equal(c.playbackUrl.value,'');assert.equal(c.shared.value.length,0);assert.ok(revoked.length);assert.equal(calls[0][0],'clubConsent');assert.equal(calls[0][2],false);assert.equal(c.items.value.length,1);
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
 const h=await harness(t,user('parent')),calls=[];const transport={requestJson:async(route,opt)=>{calls.push({route,opt});if(route==='/v2/capabilities')return{revision:'sdl004-club-enrollment-v2',submissions:true,review:true,clubhouse:true,clubConsent:true};return{items:[row]};},submit:async()=>row,submissionPlayback:async()=>new Blob(['private']),...overrides};
 return{h,calls,service:h.module('js/submissionService.js').createSubmissionService({auth:h.app,enabled:true,transport})};
}
test('submission transport refuses an old or incomplete backend contract',async t=>{const {service}=await serviceSetup(t,{requestJson:async()=>({revision:'old'})});await assert.rejects(service.list(P),/required backend/);});
test('client feature gate blocks even direct programmatic calls before any backend request',async t=>{const {h}=await serviceSetup(t);let called=false;const service=h.module('js/submissionService.js').createSubmissionService({auth:h.app,enabled:false,transport:{requestJson(){called=true;}}});await assert.rejects(service.list(P),/await verified/);assert.equal(called,false);});
test('metadata projection strips private family fields and reviewer identity from history',async t=>{const {service}=await serviceSetup(t,{requestJson:async route=>route==='/v2/capabilities'?{revision:'sdl004-club-enrollment-v2',submissions:true,review:true,clubhouse:true,clubConsent:true}:{items:[{...row,dob:'secret',history:[{actor:'private',action:'approved',note:'OK'}]}]}});const [item]=await service.list(P);assert.equal(item.dob,undefined);assert.equal(item.history[0].actor,undefined);});
test('review, club consent and publication requests carry explicit scoped fields',async t=>{
 const {service,calls}=await serviceSetup(t);await service.review(V,'rejected','Try again');assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).opt.body)),{decision:'rejected',note:'Try again'});
 await service.clubConsent(club,false);assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).opt.body)),{generation:G,accept:false,policy_version:null});
 await service.clubConsent(club,true);assert.equal(calls.at(-1).opt.body.policy_version,'sdl004-clubhouse-v1');
 await service.publish(V,[T],[A]);assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).opt.body)),{team_ids:[T],subject_athletes:[A]});
 await assert.rejects(service.review(V,'pending',''),/Invalid review/);
});

test('background consent rechecks preserve authorized playback and stop it when consent disappears',async t=>{
 let allowed=true;const {c}=await setup(t,{clubhouse:async()=>allowed?[row]:[]});
 await c.selectTeam(T,'clubhouse');await c.play(c.shared.value[0],'clubhouse');const url=c.playbackUrl.value;
 await c.refreshShared(true);assert.equal(c.playbackUrl.value,url);
 allowed=false;await c.refreshShared(true);assert.equal(c.playbackUrl.value,'');assert.equal(c.shared.value.length,0);
});


test('club consent defaults to no sharing and requires an explicit policy acceptance',async t=>{
 const {c,calls}=await setup(t);await c.load();await c.selectPlayer(P);const e=c.clubEnrollments.value[0];
 assert.equal(c.consentAccepted.value[E],undefined);await c.clubConsent(e,true);assert.equal(calls.length,0);assert.match(c.error.value,/Explicitly/);
 c.consentAccepted.value[E]=true;await c.clubConsent(e,true);assert.equal(calls[0][0],'clubConsent');assert.equal(calls[0][1].id,E);assert.equal(calls[0][2],true);
});
test('each club has its own enrollment consent and accepting one does not accept another',async t=>{
 const other={...club,id:O,organization_name:'Other club'};const {c,calls}=await setup(t,{enrollments:async()=>[club,other]});await c.load();await c.selectPlayer(P);
 assert.equal(c.clubEnrollments.value.length,2);c.consentAccepted.value[E]=true;await c.clubConsent(c.clubEnrollments.value[0],true);
 assert.equal(calls.length,1);assert.equal(c.consentAccepted.value[O],undefined);
});
test('stale enrollment generations and inactive enrollment acceptance fail closed in the UI',async t=>{
 const {c,calls}=await setup(t);await c.load();await c.selectPlayer(P);c.consentAccepted.value[E]=true;
 await c.clubConsent({...club,generation:O},true);assert.equal(calls.length,0);
 c.clubEnrollments.value=[{...club,status:'ended'}];await c.clubConsent(c.clubEnrollments.value[0],true);assert.equal(calls.length,0);
});
test('logout and player changes discard consent and subject confirmation drafts',async t=>{
 const {c}=await setup(t);await c.load();await c.selectPlayer(P);c.consentAccepted.value[E]=true;c.subjectConfirmed.value[V]=true;
 await c.selectPlayer(P2);assert.equal(Object.keys(c.consentAccepted.value).length,0);assert.equal(Object.keys(c.subjectConfirmed.value).length,0);
 c.reset();assert.equal(c.clubEnrollments.value.length,0);
});
test('publication requires server eligibility and explicit single-athlete confirmation',async t=>{
 const {c,calls}=await setup(t);await c.enterReview(T);await c.publish(c.queue.value[0]);assert.equal(calls.length,0);
 c.subjectConfirmed.value[V]=true;await c.publish(c.queue.value[0]);assert.equal(calls[0][0],'publish');assert.deepEqual([...calls[0][2]],[T]);assert.deepEqual([...calls[0][3]],[A]);
});
test('late club consent responses cannot restore an account switched workspace',async t=>{
 const d=deferred();const {c}=await setup(t,{enrollments:()=>d.promise});await c.load();const loading=c.selectPlayer(P);await new Promise(r=>setTimeout(r,5));c.reset();d.resolve([club]);await loading;assert.equal(c.clubEnrollments.value.length,0);
});
test('consent conflict refreshes enrollment generation before another acceptance',async t=>{
 let n=0;const {c}=await setup(t,{enrollments:async()=>[{...club,generation:++n>1?O:G}],clubConsent:async()=>{throw Object.assign(Error('Enrollment changed'),{status:409});}});await c.load();await c.selectPlayer(P);c.consentAccepted.value[E]=true;await c.clubConsent(c.clubEnrollments.value[0],true);
 assert.equal(c.clubEnrollments.value[0].generation,O);assert.equal(Object.keys(c.consentAccepted.value).length,0);assert.match(c.error.value,/Enrollment changed/);
});

test('My Players cards include permitted session summary and private video shortcut without exposing PII',async t=>{
 const privateCalled=[];
 const {h,c}=await setup(t,{},{onPrivateVideos:id=>privateCalled.push(id)});
 h.app.sessions.value=[{id:'s1',player_id:P,exit_velo:62,throwing_velo:68,sprint_time:3.45,broad_jump:155}];
 const [card]=c.cards.value;
 assert.equal(card.profiles[0].sessionCount,1);
 assert.equal(card.profiles[0].latestExitVelo,62);
 assert.equal(card.profiles[0].latestThrowingVelo,68);
 assert.equal(card.profiles[0].latestSprintTime,3.45);
 assert.equal(card.profiles[0].dob,undefined);
 assert.equal(card.profiles[0].hkll_reg_no,undefined);
 assert.equal(card.profiles[0].parent_phone,undefined);
 c.openPrivateVideos('unrelated');
 assert.equal(privateCalled.length,0);
 c.openPrivateVideos(P);
 assert.deepEqual(privateCalled,[P]);
});

test('Team Clubhouse defaults to clear unavailable state for roster and leaderboard when backend capability is absent',async t=>{
 const {c}=await setup(t);
 await c.load();
 await c.selectTeam(T,'clubhouse');
 assert.equal(c.clubhouseRosterReady.value,false);
 assert.equal(c.clubhouseLeaderboardReady.value,false);
 assert.equal(c.clubhouseRosterSafe.value.length,0);
 assert.match(c.clubhouseRosterNotice.value,/roster endpoint/i);
 assert.match(c.clubhouseLeaderboardNotice.value,/leaderboard endpoint/i);
});

test('Team Clubhouse projects authorized roster and leaderboard fixtures while stripping private player fields and unconsented rows',async t=>{
 const {c}=await setup(t,{
   hasClubhouseRoster:()=>true,
   hasClubhouseLeaderboard:()=>true,
   clubhouseRoster:async()=>[
     {id:P,team_id:T,team_name:'Swallows U12',preferred_name:'Leo',jersey:'07',position:'SS, P',throws:'R',bats:'L',dob:'2014-05-01',hkll_reg_no:'HKLL-999',parent_phone:'+85290000000',last_name:'Secret',given_names:'Legal',consent_active:true,approved:true},
     {id:P2,team_id:T,team_name:'Swallows U12',preferred_name:'Hidden Child',jersey:'12',consent_active:false}
   ],
   clubhouseLeaderboard:async()=>[
     {id:V,player_id:P,team_id:T,team_name:'Swallows U12',metric:'exit_velo',preferred_name:'Leo',jersey:'07',value:64.5,unit:'km/h',dob:'2014-05-01',parent_phone:'secret',consent_active:true},
     {id:E,player_id:P2,team_id:T,team_name:'Swallows U12',metric:'exit_velo',preferred_name:'Unconsented',jersey:'12',value:99.9,consent_active:false},
     {id:G,player_id:P,team_id:T,team_name:'Swallows U12',metric:'sprint_time',preferred_name:'Leo',jersey:'07',value:3.32,unit:'s',consent_active:true}
   ]
 });
 await c.load();
 await c.selectTeam(T,'clubhouse');
 assert.equal(c.clubhouseRosterReady.value,true);
 assert.equal(c.clubhouseRosterSafe.value.length,1);
 const [member]=c.clubhouseRosterSafe.value;
 assert.equal(member.preferred_name,'Leo');
 assert.equal(member.jersey,'07');
 assert.equal(member.dob,undefined);
 assert.equal(member.hkll_reg_no,undefined);
 assert.equal(member.parent_phone,undefined);
 assert.equal(member.last_name,undefined);
 assert.equal(member.given_names,undefined);

 assert.equal(c.clubhouseLeaderboardReady.value,true);
 assert.equal(c.clubhouseLeaderboardByMetric.value.exit_velo.length,1);
 assert.equal(c.clubhouseLeaderboardByMetric.value.exit_velo[0].preferred_name,'Leo');
 assert.equal(c.clubhouseLeaderboardByMetric.value.exit_velo[0].value,64.5);
 assert.equal(c.clubhouseLeaderboardByMetric.value.exit_velo[0].dob,undefined);
 assert.equal(c.clubhouseLeaderboardByMetric.value.exit_velo[0].parent_phone,undefined);
 assert.equal(c.clubhouseLeaderboardByMetric.value.sprint_time.length,1);
 assert.equal(c.clubhouseLeaderboardByMetric.value.sprint_time[0].value,3.32);

 c.changeClubhouseSection('leaderboard');
 assert.equal(c.clubhouseSection.value,'leaderboard');
 c.changeClubhouseSection('stats');
 assert.equal(c.clubhouseSection.value,'stats');
 c.changeClubhouseSection('videos');
 assert.equal(c.clubhouseSection.value,'videos');
});
