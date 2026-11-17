import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,user,deferred,until} from './helpers/appHarness.mjs';
const O='11111111-1111-4111-8111-111111111111',O2='22222222-2222-4222-8222-222222222222',A='33333333-3333-4333-8333-333333333333',E='44444444-4444-4444-8444-444444444444',G='55555555-5555-4555-8555-555555555555';
const row={organization_id:O,athlete_id:A,preferred_name:'Synthetic athlete',enrollment_id:E,generation:G,status:'active',recording_storage_authorized:true,recording_active:true,recording_permission_ref:'existing-case',consent_active:true};
async function setup(t,overrides={},options={}){
 const h=await harness(t,user('admin'));h.app.orgMemberships.value=[{organization_id:O,role:'admin',status:'active'}];const calls=[];
 const api={enabled:true,adminOrganizations:async()=>[{id:O,name:'First club'},{id:O2,name:'Second club'}],adminEnrollments:async org=>[{...row,organization_id:org}],
 setEnrollment:async(...args)=>{calls.push(['enrollment',...args]);return{updated:true};},setRecordingPermission:async(...args)=>{calls.push(['recording',...args]);return{updated:true};},...overrides};
 const c=h.module('composables/useEnrollmentAdmin.js').useEnrollmentAdmin({auth:h.app,service:api,...options});t.after(()=>c.dispose());return{h,c,calls};
}
async function loaded(t,overrides={},options={}){const s=await setup(t,overrides,options);await s.c.load();await s.c.selectOrganization(O);return s;}
test('disabled administrator feature makes no requests or mutations, even through direct controller calls',async t=>{
 let called=false;const {c}=await setup(t,{enabled:false,adminOrganizations:async()=>{called=true;}});await c.load();await c.selectOrganization(O);c.prepareEnrollment(row,'ended');await c.confirmChange();assert.equal(called,false);assert.equal(c.pendingChange.value,null);
});
test('administrator hints alone do not confer access and unauthorized organizations cannot be selected',async t=>{
 const {c,calls}=await setup(t,{adminOrganizations:async()=>[]});await c.load();await c.selectOrganization(O);c.prepareEnrollment(row,'ended');await c.confirmChange();assert.equal(c.organizationId.value,'');assert.equal(c.athletes.value.length,0);assert.equal(calls.length,0);
});
test('multi-club administrator must choose an authorized club; enrollment changes require explicit review',async t=>{
 const {c,calls}=await loaded(t);assert.equal(c.organizations.value.length,2);c.prepareEnrollment(c.athletes.value[0],'ended');assert.equal(calls.length,0);assert.equal(c.pendingChange.value.organizationName,'First club');
 await c.confirmChange();assert.equal(calls[0][0],'enrollment');assert.equal(calls[0][1].organization_id,O);assert.equal(calls[0][2],'ended');assert.equal(c.listReady.value,true);
});
test('cross-club and stale enrollment objects cannot stage administrator changes',async t=>{
 const {c,calls}=await loaded(t);c.prepareEnrollment({...row,organization_id:O2},'ended');c.prepareEnrollment({...row,generation:O2},'ended');await c.confirmChange();assert.equal(calls.length,0);assert.equal(c.pendingChange.value,null);
});
test('permission grant and revocation require new evidence and explicit evidence review',async t=>{
 const {c,calls}=await loaded(t);const r=c.athletes.value[0];assert.equal(c.evidence.value[A],undefined);
 for(const allowed of[true,false]){c.prepareRecording(r,allowed);assert.match(c.error.value,/evidence/);assert.equal(c.pendingChange.value,null);}
 c.evidence.value[A]='  case-123  ';c.prepareRecording(r,false);assert.equal(c.pendingChange.value,null);c.evidenceReviewed.value[A]=true;c.prepareRecording(r,false);assert.equal(c.pendingChange.value.evidence,'case-123');assert.equal(calls.length,0);
 await c.confirmChange();assert.equal(calls[0][0],'recording');assert.equal(calls[0][2],false);assert.equal(calls[0][3],'case-123');assert.equal(c.evidence.value[A],undefined);
});
test('inactive and unenrolled athletes cannot grant recording permission; rejoin reuses the protected enrollment ID',async t=>{
 const {c,calls}=await loaded(t,{adminEnrollments:async()=>[{...row,status:'ended',consent_active:false}]});const r=c.athletes.value[0];c.evidence.value[A]='case';c.evidenceReviewed.value[A]=true;c.prepareRecording(r,true);assert.equal(c.pendingChange.value,null);
 c.prepareEnrollment(r,'active');await c.confirmChange();assert.equal(calls[0][1].enrollment_id,E);assert.equal(calls[0][2],'active');assert.equal(c.athletes.value[0].consent_active,false);
});
test('new enrollment uses only an existing selected club athlete profile',async t=>{
 const {c,calls}=await loaded(t,{adminEnrollments:async()=>[{...row,enrollment_id:null,generation:null,status:'not_enrolled'}]});c.prepareEnrollment(c.athletes.value[0],'active');await c.confirmChange();assert.equal(calls[0][1].enrollment_id,null);assert.equal(calls[0][1].athlete_id,A);
});
test('switching clubs aborts old reads and drops staged changes and private evidence',async t=>{
 const pending=deferred();let first=true;const {c}=await setup(t,{adminEnrollments:async org=>org===O&&first?(first=false,pending.promise):[{...row,organization_id:org}]});await c.load();const old=c.selectOrganization(O);c.evidence.value[A]='private-reference';await c.selectOrganization(O2);pending.resolve([row]);await old;
 assert.equal(c.organizationId.value,O2);assert.equal(c.athletes.value[0].organization_id,O2);assert.equal(Object.keys(c.evidence.value).length,0);assert.equal(c.pendingChange.value,null);
});
test('late mutation results do not restore the previous club',async t=>{
 const pending=deferred();const {c}=await loaded(t,{setEnrollment:()=>pending.promise});c.prepareEnrollment(c.athletes.value[0],'ended');const changing=c.confirmChange();await c.selectOrganization(O2);pending.resolve({updated:true});await changing;assert.equal(c.organizationId.value,O2);assert.equal(c.notice.value,'');assert.equal(c.athletes.value[0].organization_id,O2);
});
test('permission loss clears authorized clubs, child rows and evidence before another action',async t=>{
 const {c}=await loaded(t,{setEnrollment:async()=>{throw Object.assign(Error('Forbidden'),{status:403});}});c.prepareEnrollment(c.athletes.value[0],'ended');await c.confirmChange();assert.equal(c.organizations.value.length,0);assert.equal(c.athletes.value.length,0);assert.equal(c.pendingChange.value,null);assert.equal(c.busy.value,false);assert.match(c.error.value,/Forbidden/);
});
test('uncertain mutation never retries automatically and requires refreshing before another write',async t=>{
 let n=0;const {c}=await loaded(t,{setEnrollment:async()=>{n++;throw Error('Network result unknown');}});c.prepareEnrollment(c.athletes.value[0],'ended');await c.confirmChange();await c.confirmChange();assert.equal(n,1);assert.equal(c.listReady.value,false);assert.equal(c.athletes.value.length,0);assert.match(c.error.value,/unknown/);
});
test('application logout removes the actual administrator controller state and staged private evidence',async t=>{
 const h=await harness(t,user('admin')),c=h.app.enrollmentAdminController;c.organizations.value=[{id:O,name:'Club'}];c.organizationId.value=O;c.athletes.value=[row];c.evidence.value[A]='private';c.pendingChange.value={row};await h.app.signOutAndClear();assert.equal(c.organizations.value.length,0);assert.equal(c.athletes.value.length,0);assert.equal(c.pendingChange.value,null);assert.equal(Object.keys(c.evidence.value).length,0);
});
test('aborted administration requests stop loading and leave no actionable stale rows',async t=>{
 const {c}=await loaded(t,{adminEnrollments:(_o,_q,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError'))))},{timeoutMs:5});assert.equal(c.busy.value,false);assert.equal(c.listReady.value,false);assert.match(c.error.value,/interrupted/);
});
async function serviceSetup(t,overrides={}){
 const h=await harness(t,user('admin')),calls=[];const transport={requestJson:async(route,options)=>{calls.push({route,options});if(route==='/v2/capabilities')return{revision:'sdl004-club-enrollment-v2',submissions:true,review:true,clubhouse:true,clubConsent:true,enrollmentAdmin:true};return{items:[row]};},...overrides};
 return{h,calls,service:h.module('js/submissionService.js').createSubmissionService({auth:h.app,enabled:true,transport})};
}
test('administration capability must be verified before reading or mutating',async t=>{
 const {service,calls}=await serviceSetup(t,{requestJson:async route=>{calls.push(route);return{revision:'sdl004-club-enrollment-v2',submissions:true,review:true,clubhouse:true,clubConsent:true};}});
 await assert.rejects(service.adminOrganizations(),/awaits deployment/);assert.equal(calls.length,1);
});
test('administrator service uses existing mutation routes and projects only explicit fields',async t=>{
 const {service,calls}=await serviceSetup(t);await service.setEnrollment({...row,guardian:'private',consent_active:true},'ended');assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).options.body)),{athlete_id:A,organization_id:O,status:'ended',enrollment_id:E});
 await service.setRecordingPermission(row,false,' case-123 ');assert.match(calls.at(-1).route,/club-enrollments\/.*\/recording/);assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).options.body)),{allowed:false,permission_ref:'case-123'});
});
test('administrator summary strips family/audit fields and rejects cross-club rows',async t=>{
 const {service}=await serviceSetup(t,{requestJson:async route=>route==='/v2/capabilities'?{revision:'sdl004-club-enrollment-v2',submissions:true,review:true,clubhouse:true,clubConsent:true,enrollmentAdmin:true}:{items:[{...row,dob:'private',guardian_id:'private',history:['private']}]}});
 const [r]=await service.adminEnrollments(O);assert.equal(r.dob,undefined);assert.equal(r.guardian_id,undefined);assert.equal(r.history,undefined);await assert.rejects(service.adminEnrollments(O2),/organization/);
});
test('administrator search supports encoded Unicode names and literal query characters',async t=>{
 const {service,calls}=await serviceSetup(t);await service.adminEnrollments(O,"小明 O'Neil %");assert.ok(calls.at(-1).route.includes('q=%'));assert.ok(calls.at(-1).route.includes('%27'));assert.ok(!calls.at(-1).route.includes("'"));await assert.rejects(service.adminEnrollments(O,'a'.repeat(101)),/100 characters/);
});

test('external account switching clears the actual administrator controller before new identity verification',async t=>{
 const h=await harness(t,user('admin')),c=h.app.enrollmentAdminController;c.organizations.value=[{id:O,name:'Club'}];c.organizationId.value=O;c.athletes.value=[row];c.evidence.value[A]='private';
 h.emit('SIGNED_IN',user('second'));assert.equal(c.athletes.value.length,0);assert.equal(c.organizations.value.length,0);assert.equal(Object.keys(c.evidence.value).length,0);
 await until(()=>h.app.authUser.value?.id==='second');assert.equal(c.athletes.value.length,0);
});
