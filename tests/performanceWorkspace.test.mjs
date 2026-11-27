import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,user,ok,deferred,until} from './helpers/appHarness.mjs';
import * as Vue from 'vue';

const player = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const team = '33333333-3333-4333-8333-333333333333';
const measurementId = '44444444-4444-4444-8444-444444444444';
const protocol = {id:'throw-radar-v1',metric:'throwing_velo',unit:'km/h',label:'Radar throwing'};
const row = {id:measurementId,player_id:player,revision:1,protocol_id:protocol.id,unit:protocol.unit,
  measurement_date:'2026-01-01',evidence:'Radar reading',value:79,status:'approved',history:[]};
const historyRpc = 'sdl_004_pilot_performance';
const submitRpc = 'sdl_004_pilot_submit_performance';
const catalogRpc = 'sdl_004_pilot_workspace';

async function fixture(t, modeName='coach') {
  const h=await harness(t,user('staff'));
  h.rows[catalogRpc]={protocols:[protocol]};
  const auth=h.app.loginController;
  const mode=Vue.ref(modeName), playerId=Vue.ref(player), context=Vue.ref('staff'), updates=[];
  const scope=Vue.effectScope();
  const {usePerformanceWorkspace,usePerformanceReview}=h.module('composables/usePerformanceWorkspace.js');
  const workspace=scope.run(()=>usePerformanceWorkspace({
    auth,mode:()=>mode.value,playerId:()=>playerId.value,context:()=>context.value,onUpdated:id=>updates.push(id)
  }));
  t.after(()=>scope.stop());
  await until(()=>workspace.ready.value);
  const fill=()=>Object.assign(workspace.form.value,{protocolId:protocol.id,value:'79',date:'2026-01-01',evidence:'Radar reading'});
  return {h,scope,auth,workspace,fill,mode,playerId,context,updates,usePerformanceReview};
}

test('staff modes submit official measurements and family mode submits pending without the media feature',async t=>{
  const {h,workspace,fill,mode,updates}=await fixture(t);
  for(const role of ['coach','admin','manager','family']){
    mode.value=role;
    await until(()=>workspace.ready.value);
    const official=role!=='family';
    h.rows[submitRpc]={id:measurementId,status:official?'approved':'pending',revision:1};
    h.rows[historyRpc]=[{...row,status:h.rows[submitRpc].status}];
    fill();
    const before=h.calls.filter(c=>c.rpc===historyRpc).length;
    await workspace.save();
    const {args}=h.calls.filter(c=>c.rpc===submitRpc).at(-1);
    assert.equal(args.p_player,player);
    assert.equal(args.p_official,official);
    assert.equal(args.p_value,79);
    assert.equal(args.p_protocol,protocol.id);
    assert.equal(args.p_evidence,'Radar reading');
    assert.ok(h.calls.filter(c=>c.rpc===historyRpc).length>before);
  }
  assert.deepEqual(updates,[player,player,player,player]);
  assert.equal(h.app.submissionController.enabled,false);
  assert.ok(!h.calls.some(c=>c.table==='sessions'));
});

test('official corrections require a dedicated reason and preserve the idempotency key for an exact retry',async t=>{
  const {h,workspace}=await fixture(t,'manager');
  const correctRpc='sdl_v5_correct_official';
  h.rows[historyRpc]=[row];
  await workspace.refresh();
  workspace.correct(workspace.rows.value[0]);
  await workspace.save();
  assert.match(workspace.error.value,/correction reason/);
  assert.ok(!h.calls.some(c=>c.rpc===correctRpc));
  workspace.form.value.reason='Radar transcription corrected';
  h.queue(correctRpc,{error:{code:'unavailable'}});
  await workspace.save();
  h.rows[correctRpc]={id:measurementId,status:'approved',revision:1};
  await workspace.save();
  const calls=h.calls.filter(c=>c.rpc===correctRpc);
  assert.equal(calls.length,2);
  assert.equal(calls[0].args.p_request,calls[1].args.p_request);
  assert.equal(calls[1].args.p_prior,measurementId);
  assert.equal(calls[1].args.p_reason,'Radar transcription corrected');
  assert.match(workspace.notice.value,/Official correction saved/);
});

test('changing player discards older reads and a denied read leaves the form unavailable',async t=>{
  const {h,workspace,playerId}=await fixture(t);
  const older=deferred();
  h.queue(historyRpc,older.promise);
  const oldResult=workspace.refresh();
  h.queue(historyRpc,{error:{code:'42501'}});
  playerId.value=other;
  await until(()=>/cannot perform/.test(workspace.error.value));
  older.resolve(ok([row]));
  await oldResult;
  assert.equal(workspace.rows.value.length,0);
  assert.equal(workspace.ready.value,false);
  assert.equal(workspace.form.value.evidence,'');
});

test('Coach inbox sends revision-checked decisions only for a reviewable parent result and reloads the assigned team',async t=>{
  const {h,scope,auth,updates,usePerformanceReview}=await fixture(t);
  const pending={...row,status:'pending',source_kind:'parent',can_review:true};
  h.rows[historyRpc]=[pending];
  const review=scope.run(()=>usePerformanceReview({auth,teamAllowed:id=>id===team,context:()=> 'staff',onUpdated:id=>updates.push(id)}));
  await review.loadReview(other);
  assert.ok(!h.calls.some(c=>c.args?.p_team===other));
  await review.loadReview(team);
  await review.review(review.reviewRows.value[0],'rejected');
  assert.match(review.error.value,/review note/);
  review.reviewNotes.value[measurementId]='Repeat the reading';
  h.rows[historyRpc]=[];
  await review.review(review.reviewRows.value[0],'rejected');
  const {args}=h.calls.find(c=>c.rpc==='sdl_004_pilot_review_performance');
  assert.equal(args.p_revision,1);
  assert.equal(args.p_decision,'rejected');
  assert.equal(args.p_note,'Repeat the reading');
  assert.equal(h.calls.filter(c=>c.args?.p_team===team).length,2);
  assert.deepEqual(updates,[player]);
});

test('invalid dates and mismatched protocol units leave measurements unsaved',async t=>{
  const {h,workspace,fill}=await fixture(t);
  fill();
  workspace.form.value.date='2026-02-30';
  await workspace.save();
  assert.match(workspace.error.value,/valid measurement date/);
  h.rows[catalogRpc]={protocols:[{...protocol,unit:'mph'}]};
  await workspace.refresh();
  assert.match(workspace.error.value,/protocols are unavailable/);
  assert.equal(workspace.ready.value,false);
  assert.ok(!h.calls.some(c=>c.rpc===submitRpc));
});

test('an account change clears the form and ignores a late save acknowledgement',async t=>{
  const {h,workspace,fill,context,updates}=await fixture(t);
  fill();
  const result=deferred();
  h.queue(submitRpc,result.promise);
  const save=workspace.save();
  context.value='';
  result.resolve(ok({id:measurementId,status:'approved',revision:1}));
  await save;
  assert.equal(workspace.form.value.evidence,'');
  assert.equal(workspace.notice.value,'');
  assert.equal(workspace.ready.value,false);
  assert.deepEqual(updates,[]);
});
