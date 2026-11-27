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
test('Worker rejects missing/obsolete consent policy and multi-child publication before authorization RPC',async()=>{
 const x=await h('coach');for(const subjects of [[],[PLAYER,OTHER]])assert.equal((await x.packaged.fetch(x.request(`/v2/submissions/${VIDEO}/publish`,{method:'POST',body:JSON.stringify({team_ids:[OTHER],subject_athletes:subjects}),contentType:'application/json'}),x.env)).status,400);
 assert.equal(x.calls.some(c=>c.url.endsWith('/sdl_004_publish_submission')),false);
 const r=await x.packaged.fetch(x.request(`/v2/club-enrollments/${VIDEO}/consent`,{method:'POST',body:JSON.stringify({accept:true,generation:OTHER,policy_version:'old'}),contentType:'application/json'}),x.env);assert.equal(r.status,400);
});
test('coach publication requires server approval/consent and forwards explicit team and subject scope',async()=>{
 const x=await h('coach');const request=()=>x.request(`/v2/submissions/${VIDEO}/publish`,{method:'POST',body:JSON.stringify({team_ids:[OTHER],subject_athletes:[PLAYER]}),contentType:'application/json'});
 assert.equal((await x.packaged.fetch(request(),x.env)).status,403);x.approved=true;x.consent=true;assert.equal((await x.packaged.fetch(request(),x.env)).status,200);
 const call=x.calls.filter(c=>c.url.endsWith('/sdl_004_publish_submission')).at(-1);assert.equal(call.init.headers.Authorization,'Bearer synthetic');assert.deepEqual(JSON.parse(call.init.body),{p_id:VIDEO,p_team_ids:[OTHER],p_subject_athletes:[PLAYER]});
});
test('all direct v2 routes reject the previous per-video database contract',async()=>{
 const x=await h();x.revision='sdl004-submissions-v1';assert.equal((await x.packaged.fetch(x.request(upload,{method:'POST',body:bytes}),x.env)).status,503);assert.equal(x.writes,0);
});
test('club consent withdrawal never deletes or modifies R2 media',async()=>{
 const x=await h('parent');x.seed();const count=x.objects.size;
 const r=await x.packaged.fetch(x.request(`/v2/club-enrollments/${VIDEO}/consent`,{method:'POST',body:JSON.stringify({accept:false,generation:OTHER}),contentType:'application/json'}),x.env);
 assert.equal(r.status,200);assert.equal(x.objects.size,count);assert.equal(x.deletes,0);assert.equal(x.writes,0);
});
