// SDL-UX-002-ADMIN-01: synthetic-only authorized registration and roster mutations.
// No credentials, hosted writes, raw player-table CRUD or media operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, user, ok, deferred, until } from './helpers/appHarness.mjs';

const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_A='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TEAM_B='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PLAYER='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REGISTERED='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const organization=role=>({id:ORG,name:'Demo Club',roles:[role]});
const team=(id,role)=>({id,organization_id:ORG,name:id===TEAM_A?'Team A':'Team B',roles:[role]});
const row=(id=PLAYER,team_ids=[TEAM_A])=>({id,organization_id:ORG,team_ids,preferred_name:'Synthetic Athlete',jersey:'7',position:'IF',throws:'R',bats:'R'});
const page=(role,rows)=>({version:1,role,rows,next_after:null});
const context=(who,role,teams)=>({
  version:1,user_id:who,roles:[role],organizations:[organization(role)],teams,
  direct_memberships:{organizations:[],teams:[],guardian_links:0},
  platform:{view:false,export:false,sensitive_write:false}
});
async function start(t,role,teams=[TEAM_A],roster=[row()]) {
  const h=await harness(t);
  h.loginUser=user(role+'-account');
  h.rows.sdl_v5_account_context=context(h.loginUser.id,role,teams.map(id=>team(id,role)));
  h.rows.sdl_v5_authorized_roster=page(role,roster);
  h.rows.sdl_v5_register_player=REGISTERED;
  h.rows.sdl_v5_set_roster=null;
  await h.app.signInAndLoad();
  assert.equal(h.app.submissionController.enabled,false);
  assert.equal(h.app.workspaceMode.value,role==='club_admin'?'admin':'manager');
  return {h,managed:h.app.managedRosterController};
}
const changes=(h,rpc)=>h.calls.filter(call=>call.rpc===rpc);
const form=(managed,teamId=TEAM_A)=>{
  assert.equal(managed.openRegistration(),true);
  Object.assign(managed.registration.value,{teamId,name:'Synthetic Athlete',jersey:'07',reason:'Approved practice registration'});
};

test('Club Admin registers in authorized effective team without direct membership or table CRUD',async t=>{
  const {h,managed}=await start(t,'club_admin',[TEAM_A,TEAM_B]);
  assert.equal(h.app.teamMemberships.value.length,0);
  form(managed,TEAM_B);
  const key=managed.registration.value.requestKey;
  assert.match(key,/^[0-9a-f-]{36}$/i);
  assert.equal(await managed.registerPlayer(),true);
  const rpc=changes(h,'sdl_v5_register_player');
  assert.equal(rpc.length,1);
  assert.equal(rpc[0].args.p_team,TEAM_B);
  assert.equal(rpc[0].args.p_request,key);
  assert.equal(rpc[0].args.p_name,'Synthetic Athlete');
  assert.equal(rpc[0].args.p_jersey,'07');
  assert.equal(managed.registrationOpen.value,false);
  assert.equal(managed.writeNotice.value,'Player registered in the selected team.');
  assert.equal(h.calls.some(c=>c.table==='players' && ['*'].includes(c.columns)),false);
  assert.equal(h.calls.some(c=>c.table==='players' && c.action),false);
});

test('Manager registers only in assigned team and cannot create outside its effective scope',async t=>{
  const {h,managed}=await start(t,'manager',[TEAM_A]);
  form(managed,TEAM_A);
  assert.equal(await managed.registerPlayer(),true);
  assert.equal(changes(h,'sdl_v5_register_player').at(-1).args.p_team,TEAM_A);
  form(managed,TEAM_B);
  assert.equal(await managed.registerPlayer(),false);
  assert.equal(changes(h,'sdl_v5_register_player').length,1);
  assert.equal(managed.denied.value,true);
  assert.deepEqual(managed.rows.value,[]);
});

test('Network uncertainty preserves registration request key across retries',async t=>{
  const {h,managed}=await start(t,'club_admin',[TEAM_A]);
  form(managed);
  const key=managed.registration.value.requestKey;
  h.queue('sdl_v5_register_player',{data:null,error:{code:'NETWORK_ERROR',message:'transport failed'}});
  assert.equal(await managed.registerPlayer(),false);
  assert.equal(managed.registration.value.requestKey,key);
  assert.match(managed.writeError.value,/could not be confirmed|service/i);
  assert.equal(await managed.registerPlayer(),true);
  const sends=changes(h,'sdl_v5_register_player');
  assert.equal(sends.length,2);
  assert.equal(sends[0].args.p_request,key);
  assert.equal(sends[1].args.p_request,key);
});

test('Club Admin can assign an authorized same-club player to a different team',async t=>{
  const {h,managed}=await start(t,'club_admin',[TEAM_A,TEAM_B],[row()]);
  assert.equal(managed.prepareRosterChange(managed.rows.value[0],TEAM_B),true);
  assert.equal(managed.pendingChange.value.add,true);
  managed.pendingChange.value.reason='Player moving to Team B';
  h.rows.sdl_v5_authorized_roster=page('club_admin',[row(PLAYER,[TEAM_A,TEAM_B])]);
  assert.equal(await managed.commitRosterChange(),true);
  const calls=changes(h,'sdl_v5_set_roster');
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].args,{p_player:PLAYER,p_team:TEAM_B,p_add:true,p_reason:'Player moving to Team B'});
  assert.deepEqual(managed.rows.value[0].team_ids,[TEAM_A,TEAM_B]);
});

test('Manager may end existing team membership but cannot add an undiscovered player',async t=>{
  const {h,managed}=await start(t,'manager',[TEAM_A],[row()]);
  assert.equal(managed.prepareRosterChange(managed.rows.value[0],TEAM_B),false);
  assert.equal(managed.prepareRosterChange(managed.rows.value[0],TEAM_A),true);
  assert.equal(managed.pendingChange.value.add,false);
  managed.pendingChange.value.reason='Departed assigned team';
  h.rows.sdl_v5_authorized_roster=page('manager',[]);
  assert.equal(await managed.commitRosterChange(),true);
  const calls=changes(h,'sdl_v5_set_roster');
  assert.equal(calls.length,1);
  assert.equal(calls[0].args.p_add,false);
  assert.equal(calls[0].args.p_player,PLAYER);
  assert.deepEqual(managed.rows.value,[]);
  assert.match(managed.writeNotice.value,/history preserved/);
  assert.equal(h.calls.some(c=>c.table==='players' && c.action==='delete'),false);
});

test('Duplicate or stale membership decision never invokes a second write',async t=>{
  const {h,managed}=await start(t,'club_admin',[TEAM_A],[row()]);
  const adapter=h.module('js/managedRosterAdminService.js').createManagedRosterAdminService({
    auth:h.app.loginController
  });
  await assert.rejects(adapter.setRoster({
    role:'club_admin',organizationId:ORG,teamId:TEAM_A,playerId:PLAYER,add:true,
    reason:'Duplicate assignment',rows:managed.rows.value
  }),/Roster state changed/);
  assert.equal(changes(h,'sdl_v5_set_roster').length,0);
});

test('Scope change invalidates an in-flight registration result',async t=>{
  const {h,managed}=await start(t,'manager',[TEAM_A,TEAM_B],[row()]);
  form(managed,TEAM_A);
  const pending=deferred();
  h.queue('sdl_v5_register_player',pending.promise);
  const first=managed.registerPlayer();
  await until(()=>managed.writeBusy.value);
  h.rows.sdl_v5_authorized_roster=page('manager',[row(PLAYER,[TEAM_B])]);
  await h.app.changeManagedTeam(TEAM_B);
  pending.resolve(ok(REGISTERED));
  assert.equal(await first,false);
  assert.equal(managed.writeBusy.value,false);
  assert.equal(managed.writeNotice.value,'');
  assert.equal(managed.teamId.value,TEAM_B);
  assert.deepEqual(managed.rows.value.map(p=>p.id),[PLAYER]);
});

test('Coach and Guardian cannot call administrative roster RPCs through the adapter',async t=>{
  const h=await harness(t,user('guardian'));
  const adapter=h.module('js/managedRosterAdminService.js').createManagedRosterAdminService({auth:h.app.loginController});
  await assert.rejects(adapter.registerPlayer({
    role:'club_admin',organizationId:ORG,teamId:TEAM_A,name:'X',jersey:'1',
    requestKey:REGISTERED,reason:'Unauthorized'
  }),/selected scope/);
  assert.equal(changes(h,'sdl_v5_register_player').length,0);
});
