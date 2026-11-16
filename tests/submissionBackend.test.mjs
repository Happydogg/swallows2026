import test from 'node:test';
import assert from 'node:assert/strict';
import {workerHarness,PLAYER,OTHER,VIDEO,ORIGIN,bytes} from './helpers/workerHarness.mjs';
const upload=`/v2/submissions?player_id=${PLAYER}&category=pitching&share_with_team=false`;
async function h(role='parent'){const h=await workerHarness(role);h.env.SUBMISSIONS_ENABLED='true';return h;}
test('complete package keeps v2 disabled by default while preserving v1 private routes',async()=>{
 const x=await h();delete x.env.SUBMISSIONS_ENABLED;
 assert.equal((await x.packaged.fetch(x.request('/v2/capabilities'),x.env)).status,503);assert.equal(x.calls.length,0);
 x.seed();assert.equal((await x.packaged.fetch(x.request(`/v1/media/${VIDEO}`),x.env)).status,200);
});
test('complete package preflight admits idempotency headers and denies other origins',async()=>{
 const x=await h();const r=await x.packaged.fetch(x.request('/v2/submissions',{method:'OPTIONS',auth:false}),x.env);
 assert.equal(r.status,204);assert.match(r.headers.get('Access-Control-Allow-Headers'),/Idempotency-Key/);
 assert.equal((await x.packaged.fetch(x.request('/v2/capabilities',{origin:'https://example.invalid'}),x.env)).status,403);
});
test('capability negotiation requires both current session and exact database revision',async()=>{
 const x=await h();let r=await x.packaged.fetch(x.request('/v2/capabilities'),x.env);assert.equal(r.status,200);
 assert.equal((await r.json()).revision,'sdl004-submissions-v1');x.revision='old';assert.equal((await x.packaged.fetch(x.request('/v2/capabilities'),x.env)).status,503);
 x.revision='sdl004-submissions-v1';x.revoked=true;assert.equal((await x.packaged.fetch(x.request('/v2/capabilities'),x.env)).status,401);
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
