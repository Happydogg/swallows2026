import test from 'node:test';
import assert from 'node:assert/strict';
import {workerHarness,PLAYER,OTHER,VIDEO,ORIGIN,bytes} from './helpers/workerHarness.mjs';
const upload=`/v2/submissions?player_id=${PLAYER}&category=pitching`;
async function h(role='parent'){const h=await workerHarness(role);Object.assign(h.env,{SUBMISSIONS_ENABLED:'true',MEDIA_UPLOAD_ENABLED:'true',
 MEDIA_REVIEW_ENABLED:'true',MEDIA_PUBLICATION_ENABLED:'true'});return h;}
test('complete package keeps v2 disabled by default and retires v1 private routes',async()=>{
 const x=await h();delete x.env.SUBMISSIONS_ENABLED;
 assert.equal((await x.packaged.fetch(x.request('/v2/capabilities'),x.env)).status,503);assert.equal(x.calls.length,0);
 x.seed();assert.equal((await x.packaged.fetch(x.request(`/v1/media/${VIDEO}`),x.env)).status,410);
});
test('complete package preflight admits idempotency headers and denies other origins',async()=>{
 const x=await h();const r=await x.packaged.fetch(x.request('/v2/submissions',{method:'OPTIONS',auth:false}),x.env);
 assert.equal(r.status,204);assert.match(r.headers.get('Access-Control-Allow-Headers'),/Idempotency-Key/);
 assert.equal((await x.packaged.fetch(x.request('/v2/capabilities',{origin:'https://example.invalid'}),x.env)).status,403);
});
test('capability negotiation requires both current session and exact database revision',async()=>{
 const x=await h();let r=await x.packaged.fetch(x.request('/v2/capabilities'),x.env);assert.equal(r.status,200);
 assert.equal((await r.json()).revision,'sdl004-club-enrollment-v2');x.revision='old';assert.equal((await x.packaged.fetch(x.request('/v2/capabilities'),x.env)).status,503);
 x.revision='sdl004-club-enrollment-v2';x.revoked=true;assert.equal((await x.packaged.fetch(x.request('/v2/capabilities'),x.env)).status,401);
});
test('completed idempotency receipt is returned without another object write',async()=>{
 const x=await h();x.completed=true;const r=await x.packaged.fetch(x.request(upload,{method:'POST',body:bytes}),x.env);
 assert.equal(r.status,201);assert.equal((await r.json()).id,VIDEO);assert.equal(x.writes,0);
});
test('reservation conflicts return 409 and do not write R2',async()=>{
 const x=await h();x.conflict=true;assert.equal((await x.packaged.fetch(x.request(upload,{method:'POST',body:bytes}),x.env)).status,409);assert.equal(x.writes,0);
});
test('new upload uses one reserved server ID and never deletes objects on uncertain commit',async()=>{
 const x=await h();let r=await x.packaged.fetch(x.request(upload,{method:'POST',body:bytes}),x.env);assert.equal(r.status,201);assert.equal(x.writes,1);
 assert.ok(x.objects.has(`pilot/${PLAYER}/${VIDEO}.mp4`));x.failMetadata=true;
 r=await x.packaged.fetch(x.request(upload,{method:'POST',body:bytes}),x.env);assert.equal(r.status,503);assert.equal(x.deletes,0);
});
test('missing idempotency key fails validation before any object write',async()=>{
 const x=await h();const request=x.request(upload,{method:'POST',body:bytes});request.headers.delete('Idempotency-Key');
 assert.equal((await x.packaged.fetch(request,x.env)).status,400);assert.equal(x.writes,0);
});
test('direct unauthorized player and self-review calls fail closed',async()=>{
 const x=await h();assert.equal((await x.packaged.fetch(x.request(upload.replace(PLAYER,OTHER),{method:'POST',body:bytes}),x.env)).status,403);
 x.role='coach';x.selfReview=true;assert.equal((await x.packaged.fetch(x.request(`/v2/submissions/${VIDEO}/review`,{method:'POST',body:JSON.stringify({decision:'approved',note:''}),contentType:'application/json'}),x.env)).status,403);
});
test('revoked session is rejected even if Auth user endpoint still returns a user',async()=>{
 const x=await h();x.revoked=true;assert.equal((await x.packaged.fetch(x.request(upload,{method:'POST',body:bytes}),x.env)).status,401);assert.equal(x.writes,0);
});

test('old per-video consent and upload sharing parameters fail closed',async()=>{
 const x=await h();const r=await x.packaged.fetch(x.request(upload+'&share_with_team=true&team_ids='+OTHER,{method:'POST',body:bytes}),x.env);assert.equal(r.status,400);assert.equal(x.writes,0);
 assert.equal((await x.packaged.fetch(x.request(`/v2/submissions/${VIDEO}/consent`,{method:'POST',body:'{}',contentType:'application/json'}),x.env)).status,404);
});
test('standing club consent forwards guardian token, enrollment generation and policy only',async()=>{
 const x=await h();const r=await x.packaged.fetch(x.request(`/v2/club-enrollments/${VIDEO}/consent`,{method:'POST',body:JSON.stringify({accept:true,generation:OTHER,policy_version:'sdl004-clubhouse-v1',guardian:'forged'}),contentType:'application/json'}),x.env);
 assert.equal(r.status,200);const call=x.calls.find(c=>c.url.endsWith('/sdl_004_club_consent'));assert.equal(call.init.headers.Authorization,'Bearer synthetic');assert.equal(call.init.headers.apikey,x.env.SUPABASE_PUBLISHABLE_KEY);
 assert.deepEqual(JSON.parse(call.init.body),{p_enrollment:VIDEO,p_generation:OTHER,p_accept:true,p_policy_version:'sdl004-clubhouse-v1'});
});
test('coaches cannot forge club consent, enrollment or recording permission via the Worker',async()=>{
 const x=await h('coach');for(const[path,body]of [[`/v2/club-enrollments/${VIDEO}/consent`,{accept:true,generation:OTHER,policy_version:'sdl004-clubhouse-v1'}],
 ['/v2/club-enrollments',{athlete_id:PLAYER,organization_id:OTHER,status:'active'}],[`/v2/club-enrollments/${VIDEO}/recording`,{allowed:true,permission_ref:'forged'}]])
 assert.equal((await x.packaged.fetch(x.request(path,{method:'POST',body:JSON.stringify(body),contentType:'application/json'}),x.env)).status,403);
});
// REG-01: legacy publication is deliberately held; do not re-enable it for old tests.
test('held legacy publication denies malformed and valid requests even after approval and consent',async()=>{
 const x=await h('coach');
 for(const approved of [false,true]){
  x.approved=approved;x.consent=approved;
  for(const subjects of [[],[PLAYER,OTHER],[PLAYER]]){
   const r=await x.packaged.fetch(x.request(`/v2/submissions/${VIDEO}/publish`,{method:'POST',body:JSON.stringify({team_ids:[OTHER],subject_athletes:subjects}),contentType:'application/json'}),x.env);
   assert.equal(r.status,503);assert.equal((await r.json()).code,'media_disabled');
  }
 }
 assert.equal(x.calls.some(c=>/\/(sdl_004_publish_submission|sdl_v5_set_media_publication)$/.test(c.url)),false);
 assert.equal(x.writes,0);assert.equal(x.deletes,0);
});
test('obsolete legacy standing consent policy remains invalid before consent RPC',async()=>{
 const x=await h('coach');
 const r=await x.packaged.fetch(x.request(`/v2/club-enrollments/${VIDEO}/consent`,{method:'POST',body:JSON.stringify({accept:true,generation:OTHER,policy_version:'old'}),contentType:'application/json'}),x.env);
 assert.equal(r.status,400);
 assert.equal(x.calls.some(c=>c.url.endsWith('/sdl_004_club_consent')),false);
});
// Synthetic responses model the current narrow database contract only. These tests
// check Worker validation/forwarding/denial, not PostgreSQL authorization itself.
const currentPolicy='sdl004-clubhouse-view-download-v2';
async function sharingHarness(){
 const x=await h('coach');x.env.MEDIA_CONSENT_ENABLED='true';
 x.approved=false;x.consent=false;x.singleSubject=false;
 x.rpcOverride=(rpc,body)=>{
  if(rpc==='sdl_004_session_active')return Response.json(!x.revoked);
  if(rpc==='sdl_004_submission_contract')return Response.json({revision:'sdl004-club-enrollment-v2',rbacVersion:5,mediaRevision:'v5.1-clean-start',mediaPublicationRevision:'team-publication-v1',mediaConsentRevision:currentPolicy});
  if(rpc==='sdl_v5_set_media_publication'){
   const scope=['coach','admin'].includes(x.role)&&body.p_id===VIDEO&&body.p_team===OTHER;
   const permitted=scope&&(!body.p_publish||(x.approved&&x.consent&&x.singleSubject));
   return permitted?Response.json(true):new Response(null,{status:403});
  }
  if(rpc==='sdl_v5_set_media_consent')return x.role==='parent'&&body.p_player===PLAYER&&body.p_generation===OTHER?Response.json({active:body.p_accept}):new Response(null,{status:403});
  assert.fail('Unexpected RPC in current sharing contract: '+rpc);
 };
 return x;
}
const post=(x,path,body)=>x.packaged.fetch(x.request(path,{method:'POST',body:JSON.stringify(body),contentType:'application/json'}),x.env);
test('current consent and single-team publication reject malformed input before mutation RPC',async()=>{
 const x=await sharingHarness();x.role='parent';
 for(const body of [{accept:true,generation:OTHER},{accept:true,generation:OTHER,policy_version:'sdl004-clubhouse-v1'},{accept:true,generation:OTHER,policy_version:'old'},{accept:true,generation:'invalid',policy_version:currentPolicy}]){
  assert.equal((await post(x,`/v2/media/consent?player_id=${PLAYER}`,body)).status,400);
 }
 x.role='coach';
 for(const body of [{},{team_id:'invalid'},{team_ids:[OTHER],subject_athletes:[]},{team_ids:[OTHER],subject_athletes:[PLAYER,OTHER]},{team_id:[PLAYER,OTHER]}]){
  assert.equal((await post(x,`/v2/media/${VIDEO}/publish`,body)).status,400);
 }
 assert.equal(x.calls.some(c=>/\/(sdl_v5_set_media_consent|sdl_v5_set_media_publication|sdl_004_publish_submission)$/.test(c.url)),false);
});
test('current publication forwards caller JWT and exact narrow scope, propagates authorization denials and receipts',async()=>{
 const x=await sharingHarness();const publish=()=>post(x,`/v2/media/${VIDEO}/publish`,{team_id:OTHER});
 assert.equal((await publish()).status,403);x.approved=true;
 assert.equal((await publish()).status,403);x.consent=true;
 assert.equal((await publish()).status,403);x.singleSubject=true;
 for(const role of ['parent','manager','teammate','platform_admin']){x.role=role;assert.equal((await publish()).status,403);}
 x.role='coach';assert.equal((await post(x,`/v2/media/${VIDEO}/publish`,{team_id:PLAYER})).status,403);
 const r=await publish();assert.equal(r.status,200);assert.deepEqual(await r.json(),{updated:true,published:true});
 const call=x.calls.filter(c=>c.url.endsWith('/sdl_v5_set_media_publication')).at(-1);
 assert.equal(call.init.headers.Authorization,'Bearer synthetic');assert.equal(call.init.headers.apikey,x.env.SUPABASE_PUBLISHABLE_KEY);
 assert.deepEqual(JSON.parse(call.init.body),{p_id:VIDEO,p_team:OTHER,p_publish:true});
 // Unpublication must remain possible for authorized staff after consent withdrawal.
 x.consent=false;const unpublish=await post(x,`/v2/media/${VIDEO}/unpublish`,{team_id:OTHER});
 assert.equal(unpublish.status,200);assert.deepEqual(await unpublish.json(),{updated:true,published:false});
 const removal=x.calls.filter(c=>c.url.endsWith('/sdl_v5_set_media_publication')).at(-1);
 assert.deepEqual(JSON.parse(removal.init.body),{p_id:VIDEO,p_team:OTHER,p_publish:false});
 assert.equal(x.calls.some(c=>c.url.endsWith('/sdl_004_publish_submission')),false);assert.equal(x.writes,0);assert.equal(x.deletes,0);
});
test('all direct v2 routes reject the previous per-video database contract',async()=>{
 const x=await h();x.revision='sdl004-submissions-v1';assert.equal((await x.packaged.fetch(x.request(upload,{method:'POST',body:bytes}),x.env)).status,503);assert.equal(x.writes,0);
});
test('club consent withdrawal never deletes or modifies R2 media',async()=>{
 const x=await h('parent');x.seed();const count=x.objects.size;
 const r=await x.packaged.fetch(x.request(`/v2/club-enrollments/${VIDEO}/consent`,{method:'POST',body:JSON.stringify({accept:false,generation:OTHER}),contentType:'application/json'}),x.env);
 assert.equal(r.status,200);assert.equal(x.objects.size,count);assert.equal(x.deletes,0);assert.equal(x.writes,0);
});
