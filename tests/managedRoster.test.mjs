// Synthetic frontend acceptance: real application modules, fake account RPCs.
// No hosted accounts, credentials, database modifications or media requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, deferred, ok, user, until } from './helpers/appHarness.mjs';

const A='club-a', B='club-b', A1='team-a1', A2='team-a2', B1='team-b1', EMPTY='team-empty';
const org = (id, roles) => ({id,name:id,roles});
const team = (id, organization_id, roles) => ({id,organization_id,name:id,roles});
const player = (id, organization_id, team_ids) => ({id,organization_id,team_ids,preferred_name:`Demo ${id}`,jersey:'7',position:'P',throws:'R',bats:'L',scope_actions:{review_parent_statistics:false}});
const page = (role, rows, next_after=null) => ({version:1,role,rows,next_after});
const ids = rows => [...rows].map(row=>row.id);
const rpcCalls = h => h.calls.filter(call=>call.rpc==='sdl_v5_authorized_roster');
const noUnscoped = h => {
  assert.equal(h.calls.some(call=>call.table==='sessions'||(call.table==='players'&&call.columns==='*')),false);
  assert.equal(h.app.isCoach.value,false);
  assert.equal(h.app.submissionController.enabled,false);
};
function context(name, roles, organizations=[], teams=[], guardian_links=0) {
  return {version:1,user_id:name,roles,organizations,teams,direct_memberships:{organizations:[],teams:[],guardian_links},
    platform:{view:roles.includes('platform_admin'),export:false,sensitive_write:false}};
}
async function start(t, { name, roles, organizations=[], teams=[], roster=[], guardian=[], coach=[], pageOverride }) {
  const h=await harness(t);
  h.loginUser=user(name);
  h.rows.sdl_v5_account_context=context(name,roles,organizations,teams,guardian.length);
  h.rows.athlete_guardians=guardian.map(p=>({athlete_id:p.athlete_id,status:'verified'}));
  h.rows.players=guardian; h.rows.roster=coach;
  if(pageOverride) h.rows.sdl_v5_authorized_roster=pageOverride;
  else if(roles.includes('club_admin')) h.rows.sdl_v5_authorized_roster=page('club_admin',roster);
  else if(roles.includes('manager')) h.rows.sdl_v5_authorized_roster=page('manager',roster);
  await h.app.signInAndLoad();
  noUnscoped(h);
  return h;
}
const managed = h => h.app.managedRosterController;

test('01 Club Admin A uses effective teams with zero direct team memberships',async t=>{
  const h=await start(t,{name:'admin-a',roles:['club_admin'],organizations:[org(A,['club_admin'])],teams:[team(A1,A,['club_admin']),team(A2,A,['club_admin']),team(EMPTY,A,['club_admin'])],roster:[player('p-a1',A,[A1]),player('p-a2',A,[A2])]});
  assert.equal(h.app.workspaceMode.value,'admin'); assert.equal(h.app.teamMemberships.value.length,0);
  assert.deepEqual(ids(managed(h).teams.value),[A1,A2,EMPTY]); assert.deepEqual(ids(managed(h).rows.value),['p-a1','p-a2']);
  assert.equal(rpcCalls(h)[0].args.p_organization,A); assert.equal(rpcCalls(h)[0].args.p_team,null);
  assert.equal(h.calls.some(call=>call.rpc==='sdl_004_coach_roster'),false);
  h.app.openManagedPlayerProfile(managed(h).rows.value[0]); assert.equal(h.app.selectedPlayer.value.id,'p-a1');
  assert.equal(h.app.canEditPlayerPhoto('p-a1'),false);
  h.rows.sdl_v5_authorized_roster=page('club_admin',[]);
  await h.app.changeManagedTeam(EMPTY); assert.deepEqual(ids(managed(h).rows.value),[]);
  assert.equal(managed(h).error.value,''); assert.equal(h.app.selectedPlayer.value,null);
});
test('02 Club Admin B has the equivalent other-club roster journey',async t=>{
  const h=await start(t,{name:'admin-b',roles:['club_admin'],organizations:[org(B,['club_admin'])],teams:[team(B1,B,['club_admin'])],roster:[player('p-b1',B,[B1])]});
  assert.equal(h.app.workspaceMode.value,'admin');assert.deepEqual(ids(managed(h).organizations.value),[B]);assert.deepEqual(ids(managed(h).rows.value),['p-b1']);
});
for(const [n,assigned] of [[3,A1],[4,A2]]) test(`0${n} Manager ${assigned} has exactly its assigned scope and no Coach eligibility`,async t=>{
  const h=await start(t,{name:`manager-${assigned}`,roles:['manager'],organizations:[org(A,['manager'])],teams:[team(assigned,A,['manager'])],roster:[player(`p-${assigned}`,A,[assigned])]});
  assert.equal(h.app.workspaceMode.value,'manager');assert.equal(h.app.isTeamManager.value,true);assert.equal(h.app.isTeamCoach.value,false);
  assert.deepEqual(ids(managed(h).teams.value),[assigned]);assert.deepEqual(ids(managed(h).rows.value),[`p-${assigned}`]);
  assert.equal(rpcCalls(h)[0].args.p_role,'manager');assert.equal(rpcCalls(h)[0].args.p_team,assigned);
  const before=h.calls.length;await h.app.changeWorkspace('coach');
  assert.equal(h.app.workspaceMode.value,'manager');assert.equal(h.calls.length,before);
});
test('05 Coach retains the hardened legacy roster with effective assigned teams',async t=>{
  const h=await start(t,{name:'coach',roles:['coach'],organizations:[org(A,['coach'])],teams:[team(A1,A,['coach'])],coach:[{id:'p-a1',team_id:A1,preferred_name:'Demo Coach'}]});
  assert.equal(h.app.workspaceMode.value,'coach');assert.deepEqual(ids(h.app.coachRoster.value),['p-a1']);assert.equal(rpcCalls(h).length,0);
});
test('06 multi-team Coach can select an empty authorized team without stale player state',async t=>{
  const h=await start(t,{name:'multi-coach',roles:['coach'],organizations:[org(A,['coach'])],teams:[team(A1,A,['coach']),team(EMPTY,A,['coach'])],coach:[{id:'p-a1',team_id:A1,preferred_name:'Demo Coach'}]});
  assert.equal(h.app.coachTeamCount.value,2); h.app.selectedPlayer.value={id:'p-a1'};
  await h.app.changeCoachTeam(EMPTY);assert.equal(h.app.coachTeamCount.value,1);assert.deepEqual(ids(h.app.coachRoster.value),[]);assert.equal(h.app.selectedPlayer.value,null);
});
for(const [n,count] of [[7,1],[8,2]]) test(`0${n} Guardian with ${count} verified linked child(ren) retains family reader`,async t=>{
  const guardian=Array.from({length:count},(_,i)=>({id:`p-g${i}`,athlete_id:`a-${i}`,preferred_name:`Demo Child ${i}`,jersey:String(i+1)}));
  const h=await start(t,{name:`guardian-${count}`,roles:['guardian'],guardian});
  assert.equal(h.app.workspaceMode.value,'family');assert.deepEqual(ids(h.app.familyPlayers.value),ids(guardian));assert.equal(rpcCalls(h).length,0);
});
test('09 Coach + Guardian switches independent authorized views',async t=>{
  const h=await start(t,{name:'coach-guardian',roles:['coach','guardian'],organizations:[org(A,['coach'])],teams:[team(A1,A,['coach'])],coach:[{id:'p-coach',team_id:A1,preferred_name:'Demo Coach'}],guardian:[{id:'p-family',athlete_id:'child',preferred_name:'Demo Family'}]});
  assert.equal(h.app.workspaceMode.value,'coach');assert.deepEqual(ids(h.app.visibleStagingPlayers.value),['p-coach']);
  await h.app.changeWorkspace('family');assert.deepEqual(ids(h.app.visibleStagingPlayers.value),['p-family']);assert.deepEqual(ids(h.app.coachRoster.value),[]);
});
test('10 Manager + Guardian has independent role selections',async t=>{
  const h=await start(t,{name:'manager-guardian',roles:['manager','guardian'],organizations:[org(A,['manager'])],teams:[team(A1,A,['manager'])],roster:[player('p-team',A,[A1])],guardian:[{id:'p-family',athlete_id:'child',preferred_name:'Demo Family'}]});
  assert.equal(h.app.workspaceMode.value,'family');assert.deepEqual(ids(h.app.familyPlayers.value),['p-family']);
  await h.app.changeWorkspace('manager');assert.deepEqual(ids(managed(h).rows.value),['p-team']);assert.equal(h.app.familyPlayers.value.length,0);
  await h.app.changeWorkspace('family');assert.equal(managed(h).rows.value.length,0);assert.deepEqual(ids(h.app.familyPlayers.value),['p-family']);
});
test('11 No authorized ordinary role means no private roster, even with platform-only context',async t=>{
  const h=await start(t,{name:'limited',roles:['platform_admin'],organizations:[org(A,['platform_admin'])],teams:[team(A1,A,['platform_admin'])]});
  assert.equal(h.app.workspaceMode.value,'member');assert.equal(h.app.workspaceOptions.value.length,0);assert.equal(rpcCalls(h).length,0);assert.equal(h.app.ordinaryOrganizations.value.length,0);
});
test('12 Verification failure clears previously loaded roster and scope',async t=>{
  const h=await start(t,{name:'revoked',roles:['manager'],organizations:[org(A,['manager'])],teams:[team(A1,A,['manager'])],roster:[player('p-team',A,[A1])]});
  h.queue('sdl_v5_account_context',{data:null,error:{code:'42501',message:'Active session required'}});
  await h.app.reloadMemberships();assert.equal(h.app.accountContext.value,null);assert.equal(h.app.workspaceMode.value,'member');assert.equal(managed(h).rows.value.length,0);assert.match(h.app.authError.value,/Active session required/);
});

test('cursor pagination sends the exact prior cursor; denial clears all rows and disables further selection',async t=>{
  const first=Array.from({length:100},(_,i)=>player(`p-${String(i).padStart(3,'0')}`,A,[A1]));
  const h=await start(t,{name:'pages',roles:['club_admin'],organizations:[org(A,['club_admin'])],teams:[team(A1,A,['club_admin'])],pageOverride:page('club_admin',first,'p-099')});
  h.rows.sdl_v5_authorized_roster=page('club_admin',[player('p-100',A,[A1])]);
  await h.app.loadMoreManagedRoster();assert.equal(managed(h).rows.value.length,101);assert.equal(rpcCalls(h).at(-1).args.p_after,'p-099');assert.equal(managed(h).nextAfter.value,null);
  h.queue('sdl_v5_authorized_roster',{data:null,error:{code:'42501',message:'Not authorized'}});
  await h.app.changeManagedTeam(A1);assert.equal(managed(h).denied.value,true);assert.equal(managed(h).rows.value.length,0);assert.equal(managed(h).teamId.value,'');
  const before=h.calls.length;await h.app.changeManagedOrganization(A);assert.equal(h.calls.length,before);
});
test('late roster response from earlier scope is discarded',async t=>{
  const h=await start(t,{name:'scope-switch',roles:['manager'],organizations:[org(A,['manager'])],teams:[team(A1,A,['manager']),team(A2,A,['manager'])],roster:[player('initial',A,[A1])]});
  const old=deferred();h.queue('sdl_v5_authorized_roster',old.promise);
  const earlier=h.app.changeManagedTeam(A1);await until(()=>managed(h).loading.value);
  h.rows.sdl_v5_authorized_roster=page('manager',[player('current',A,[A2])]);await h.app.changeManagedTeam(A2);
  old.resolve(ok(page('manager',[player('obsolete',A,[A1])])));await earlier;
  assert.deepEqual(ids(managed(h).rows.value),['current']);assert.equal(managed(h).teamId.value,A2);
});
test('malformed response is rejected without retaining data; explicit transport error is not an empty roster',async t=>{
  const h=await start(t,{name:'bad-roster',roles:['club_admin'],organizations:[org(A,['club_admin'])],teams:[team(A1,A,['club_admin'])],pageOverride:page('club_admin',[player('bad',B,[B1])])});
  assert.equal(managed(h).rows.value.length,0);assert.match(managed(h).error.value,/Could not load/);assert.equal(managed(h).denied.value,false);
  h.rows.sdl_v5_authorized_roster=page('club_admin',[{...player('good',A,[A1]),private_contact:'PRIVATE'}]);await h.app.retryManagedRoster();
  assert.deepEqual(ids(managed(h).rows.value),['good']);assert.equal(managed(h).rows.value[0].private_contact,undefined);assert.equal(managed(h).rows.value[0].scope_actions,undefined);
});
test('multi-club account keeps Club Admin and Manager scope tags independent',async t=>{
  const h=await start(t,{name:'staff-dual',roles:['club_admin','manager'],organizations:[org(A,['club_admin']),org(B,['club_admin','manager'])],teams:[team(A1,A,['club_admin']),team(B1,B,['club_admin','manager'])],roster:[player('p-a',A,[A1])]});
  h.rows.sdl_v5_authorized_roster=page('club_admin',[player('p-b',B,[B1])]);
  await h.app.changeManagedOrganization(B);assert.deepEqual(ids(managed(h).rows.value),['p-b']);assert.equal(rpcCalls(h).at(-1).args.p_organization,B);
  h.rows.sdl_v5_authorized_roster=page('manager',[player('p-b',B,[B1])]);await h.app.changeWorkspace('manager');
  assert.deepEqual(ids(managed(h).organizations.value),[B]);assert.deepEqual(ids(managed(h).teams.value),[B1]);assert.equal(rpcCalls(h).at(-1).args.p_role,'manager');
});
test('account context from another identity is rejected before any roster reader',async t=>{
  const h=await harness(t);h.loginUser=user('current-user');
  h.rows.sdl_v5_account_context=context('different-user',['club_admin'],[org(A,['club_admin'])],[team(A1,A,['club_admin'])]);
  await h.app.signInAndLoad();assert.equal(h.app.accountContext.value,null);assert.equal(h.app.workspaceMode.value,'member');assert.equal(rpcCalls(h).length,0);
  assert.match(h.app.authError.value,/Unexpected account or roster response/);
});
