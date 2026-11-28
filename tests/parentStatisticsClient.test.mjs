// Synthetic auth/database/HTTP fixtures. No live requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,user,deferred,until} from './helpers/appHarness.mjs';
const P='11111111-1111-4111-8111-111111111111',A='22222222-2222-4222-8222-222222222222',S='33333333-3333-4333-8333-333333333333';
const stats={id:S,player_id:P,session_date:'2026-11-01',exit_velo:62,throwing_velo:68,height_cm:140,weight_kg:35};
const capabilities={revision:'sdl004-club-enrollment-v2',submissions:true,review:true,clubhouse:true,clubConsent:true,parentStatistics:true,pilotWorkflow:'sdl004-final-pilot-v1'};
async function app(t,{coach=false,response=async()=>Response.json({items:[stats]})}={}){
 const h=await harness(t,null,{submissionsEnabled:true});h.rows.athlete_guardians=[{athlete_id:A,status:'verified'}];
 h.rows.players=[{id:P,athlete_id:A,preferred_name:'Synthetic child',jersey:'7',dob:'PRIVATE',parent_phone:'PRIVATE'}];
 h.rows.sessions=[{...stats,exit_velo:999,shoulder_check:'PRIVATE'}];h.rows.team_memberships=coach?[{role:'coach',status:'active'}]:[];
 const requests=[];h.fetchImpl=async url=>{
  requests.push(url);if(url.endsWith('/v2/capabilities'))return Response.json(capabilities);
  if(url.endsWith('/v2/pilot/workspace'))return Response.json({players:[],protocols:[],invitation_organizations:[],staff_scopes:[]});
  if(url.endsWith(`/v2/players/${P}/coach-statistics`))return Response.json({items:[{...stats,exit_velo:77}]});
  if(url.endsWith('/v2/workspace'))return Response.json({items:[]});
  if(url.endsWith(`/v2/players/${P}/statistics`))return response();
  throw Error('Unexpected synthetic request');
 };
 h.app.loginEmail.value='synthetic@example.invalid';h.app.loginPassword.value='synthetic';
 const login=h.app.signInAndLoad();return {h,login,requests};
}
test('parent history/card/profile/chart reads use only scoped API rows and never raw sessions',async t=>{
 const {h,login}=await app(t);await login;const c=h.app.submissionController;
 assert.equal(h.calls.some(c=>c.table==='sessions'),false);assert.equal(c.cards.value[0].profiles[0].latestExitVelo,62);
 await c.showProfile(P);assert.equal(h.app.currentView.value,'player');assert.equal(h.app.getPlayerSessions(P)[0].exit_velo,62);assert.equal(h.app.selectedPlayer.value.dob,undefined);assert.equal(h.app.selectedPlayer.value.parent_phone,undefined);
 h.chartCanvas={getContext:()=>({})};h.app.renderPlayerChart();assert.equal(h.chartConfig.data.datasets[0].data[0],62);
 h.app.setChartMode('growth');await until(()=>h.chartConfig?.data.datasets[0]?.data[0]===140);assert.equal(h.chartConfig.data.datasets[0].data[0],140);
});
test('dual-role coach uses narrow coach history on navigation and separate guardian history for family cards',async t=>{
 const {h,login}=await app(t,{coach:true});await login;assert.equal(h.app.sessions.value.length,0);assert.equal(h.calls.some(c=>c.table==='sessions'),false);
 const c=h.app.submissionController;assert.equal(c.cards.value[0].profiles[0].latestExitVelo,62);
 await c.showProfile(P);assert.equal(h.app.getLatestMetric(P,'exit_velo'),62);assert.equal(h.app.selectedPlayer.value.dob,undefined);
 h.app.currentView.value='overview';assert.equal(h.app.getLatestMetric(P,'exit_velo'),null,'Coach history is loaded only through the assigned-athlete API');
 await h.app.selectPlayer(h.app.players.value[0]);assert.equal(h.app.getLatestMetric(P,'exit_velo'),77,'Explicit coach profile navigation uses scoped history');
});
test('late parent statistics responses cannot restore data after logout',async t=>{
 const pending=deferred(),{h,login}=await app(t,{response:()=>pending.promise});
 await until(()=>h.app.submissionController.busy.value&&h.app.submissionController.ready.value);
 await h.app.signOutAndClear();pending.resolve(Response.json({items:[stats]}));await login;
 const c=h.app.submissionController;assert.equal(Object.keys(c.familyStatistics.value).length,0);assert.equal(c.cards.value.length,0);assert.equal(h.app.selectedPlayer.value,null);
});
test('parent API permission denial clears family history and never falls back to coach/raw records',async t=>{
 let denied=false;const {h,login}=await app(t,{coach:true,response:async()=>denied?new Response(null,{status:403}):Response.json({items:[stats]})});await login;
 const c=h.app.submissionController;await c.showProfile(P);denied=true;await c.refreshFamilyStatistics();
 assert.equal(Object.keys(c.familyStatistics.value).length,0);assert.equal(h.app.selectedPlayer.value,null);assert.equal(c.statsAvailable.value,false);assert.equal(c.ready.value,false);assert.equal(h.app.sessions.value.length,0);assert.equal(h.calls.some(c=>c.table==='sessions'),false);
});
test('unrelated profile selection makes no statistics request; feature gates remain closed by default',async t=>{
 const {h,login,requests}=await app(t);await login;const n=requests.length;await h.app.submissionController.showProfile(A);assert.equal(requests.length,n);
 const baseline=await harness(t,user('parent'));assert.equal(baseline.app.submissionController.enabled,false);
});
test('statistics service validates scope, finite numeric data, history bounds and strips unexpected fields',async t=>{
 const h=await harness(t,user('parent'));let data=[{...stats,shoulder_check:'PRIVATE',reviewer:'PRIVATE'}];
 const svc=h.module('js/submissionService.js').createSubmissionService({auth:h.app,enabled:true,transport:{requestJson:async route=>route==='/v2/capabilities'?capabilities:{items:data}}});
 let rows=await svc.playerStatistics(P);assert.equal(rows[0].exit_velo,62);assert.equal(rows[0].shoulder_check,undefined);assert.equal(rows[0].reviewer,undefined);
 for(const invalid of [[{...stats,player_id:A}],[{...stats,exit_velo:'Infinity'}],[{...stats,session_date:'not-a-date'}],Array.from({length:201},()=>stats)]){
  data=invalid;await assert.rejects(svc.playerStatistics(P),/Invalid statistic/);
 }
});
test('missing parent-statistics capability never queries the history endpoint',async t=>{
 const h=await harness(t,user('parent'));let requests=0;
 const svc=h.module('js/submissionService.js').createSubmissionService({auth:h.app,enabled:true,transport:{requestJson:async()=>{requests++;return {...capabilities,parentStatistics:false};}}});
 await assert.rejects(svc.playerStatistics(P),/contract unavailable/);assert.equal(requests,1);
});
test('separate statistic consent transport validates metric choices and never uses video-consent route',async t=>{
 const h=await harness(t,user('parent')),calls=[];
 const svc=h.module('js/submissionService.js').createSubmissionService({auth:h.app,enabled:true,transport:{requestJson:async(route,options)=>{calls.push({route,options});return route==='/v2/capabilities'?{...capabilities,statisticsConsent:true}:{updated:true};}}});
 await svc.setStatisticConsent({id:P,generation:A},true,['exit_velo']);assert.match(calls.at(-1).route,/statistics-consent$/);assert.equal(calls.at(-1).options.body.policy_version,'sdl004-baseball-statistics-v1');
 await svc.setStatisticConsent({id:P,generation:A},false,[]);assert.equal(calls.at(-1).options.body.policy_version,null);
 await assert.rejects(svc.setStatisticConsent({id:P,generation:A},true,['height_cm']),/Invalid statistic consent/);
 assert.equal(calls.some(c=>/\/consent$/.test(c.route)),false);
});
test('guardian sharing controls start unchecked, save separate explicit choices and discard drafts on reset',async t=>{
 const h=await harness(t,user('parent'));h.app.players.value=[{id:P,athlete_id:A}];h.app.guardianLinks.value=[{athlete_id:A,status:'verified'}];let saved=null;
 const row={id:P,generation:A,organization_name:'Synthetic club',status:'active',share_roster:false,metrics:[]};
 const c=h.module('composables/useSubmissionWorkspace.js').useSubmissionWorkspace({auth:h.app,players:h.app.players,coachRoster:h.app.coachRoster,service:{enabled:true,workspace:async()=>[],list:async()=>[],enrollments:async()=>[],hasStatisticsConsent:()=>true,statisticConsents:async()=>[row],setStatisticConsent:async(_r,roster,metrics)=>{saved={roster,metrics};return{updated:true};}}});t.after(()=>c.dispose());
 await c.load();await c.selectPlayer(P);assert.equal(c.statisticsChoices.value[P].roster,false);assert.equal(c.statisticsChoices.value[P].metrics.length,0);
 c.statisticsChoices.value[P]={roster:true,metrics:['exit_velo']};await c.saveStatisticConsent(row);assert.equal(saved.roster,true);assert.equal(saved.metrics[0],'exit_velo');
 c.reset();assert.equal(Object.keys(c.statisticsChoices.value).length,0);assert.equal(c.statisticsEnrollments.value.length,0);
});
