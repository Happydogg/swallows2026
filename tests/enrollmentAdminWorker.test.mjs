// Worker/RPC contract tests with synthetic authorization and R2; no live service.
import test from 'node:test';
import assert from 'node:assert/strict';
import {workerHarness,PLAYER,OTHER,VIDEO} from './helpers/workerHarness.mjs';
async function harness(role='admin'){const h=await workerHarness(role);h.env.SUBMISSIONS_ENABLED='true';return h;}
test('administrator reads use the caller bearer and explicit scoped RPCs, never service-key table reads',async()=>{
 const h=await harness();let r=await h.packaged.fetch(h.request('/v2/admin/organizations'),h.env);assert.equal(r.status,200);assert.equal((await r.json()).items[0].id,OTHER);
 r=await h.packaged.fetch(h.request(`/v2/admin/enrollments?organization_id=${OTHER}&q=${encodeURIComponent('小明 %')}`),h.env);assert.equal(r.status,200);
 const c=h.calls.find(c=>c.url.endsWith('/sdl_004_admin_enrollments'));assert.equal(c.init.headers.Authorization,'Bearer synthetic');assert.equal(c.init.headers.apikey,h.env.SUPABASE_PUBLISHABLE_KEY);assert.deepEqual(JSON.parse(c.init.body),{p_organization:OTHER,p_query:'小明 %'});assert.equal(h.writes,0);assert.equal(h.deletes,0);
});
test('parents/coaches have no administrative clubs and cannot read administrator enrollments',async()=>{
 for(const role of['parent','coach','unrelated']){const h=await harness(role);const r=await h.packaged.fetch(h.request('/v2/admin/organizations'),h.env);assert.deepEqual((await r.json()).items,[]);assert.equal((await h.packaged.fetch(h.request(`/v2/admin/enrollments?organization_id=${OTHER}`),h.env)).status,403);}
});
test('organization-scoped administrator calls deny other-club reads, enrollment changes and recording evidence writes',async()=>{
 const h=await harness();assert.equal((await h.packaged.fetch(h.request(`/v2/admin/enrollments?organization_id=${PLAYER}`),h.env)).status,403);
 let r=await h.packaged.fetch(h.request('/v2/club-enrollments',{method:'POST',body:JSON.stringify({athlete_id:VIDEO,organization_id:PLAYER,status:'active'}),contentType:'application/json'}),h.env);assert.equal(r.status,403);
 h.enrollmentOrganizations={[VIDEO]:PLAYER};r=await h.packaged.fetch(h.request(`/v2/club-enrollments/${VIDEO}/recording`,{method:'POST',body:JSON.stringify({allowed:true,permission_ref:'foreign-case'}),contentType:'application/json'}),h.env);assert.equal(r.status,403);
});
test('authorized administrator mutations preserve existing RPC signatures and do not grant guardian consent',async()=>{
 const h=await harness();let r=await h.packaged.fetch(h.request('/v2/club-enrollments',{method:'POST',body:JSON.stringify({athlete_id:PLAYER,organization_id:OTHER,enrollment_id:VIDEO,status:'ended',consent:true}),contentType:'application/json'}),h.env);assert.equal(r.status,200);
 const c=h.calls.find(c=>c.url.endsWith('/sdl_004_set_club_enrollment'));assert.deepEqual(JSON.parse(c.init.body),{p_athlete:PLAYER,p_organization:OTHER,p_status:'ended',p_enrollment:VIDEO});
 r=await h.packaged.fetch(h.request(`/v2/club-enrollments/${VIDEO}/recording`,{method:'POST',body:JSON.stringify({allowed:false,permission_ref:'revocation-case'}),contentType:'application/json'}),h.env);assert.equal(r.status,200);assert.equal(h.calls.some(c=>c.url.endsWith('/sdl_004_club_consent')),false);assert.equal(h.writes,0);assert.equal(h.deletes,0);
});
test('missing evidence, invalid organization/search and unverified admin backend are rejected',async()=>{
 const h=await harness();assert.equal((await h.packaged.fetch(h.request(`/v2/club-enrollments/${VIDEO}/recording`,{method:'POST',body:JSON.stringify({allowed:false,permission_ref:'  '}),contentType:'application/json'}),h.env)).status,400);
 assert.equal((await h.packaged.fetch(h.request('/v2/admin/enrollments?organization_id=invalid'),h.env)).status,400);
 assert.equal((await h.packaged.fetch(h.request(`/v2/admin/enrollments?organization_id=${OTHER}&q=${'a'.repeat(101)}`),h.env)).status,400);
 h.adminContract=false;assert.equal((await h.packaged.fetch(h.request('/v2/admin/organizations'),h.env)).status,503);
});
test('disabled v2 and revoked sessions prohibit administrator reads before authorization RPCs',async()=>{
 const h=await harness();delete h.env.SUBMISSIONS_ENABLED;assert.equal((await h.packaged.fetch(h.request('/v2/admin/organizations'),h.env)).status,503);assert.equal(h.calls.length,0);
 h.env.SUBMISSIONS_ENABLED='true';h.revoked=true;assert.equal((await h.packaged.fetch(h.request('/v2/admin/organizations'),h.env)).status,401);assert.equal(h.calls.some(c=>c.url.endsWith('/sdl_004_admin_organizations')),false);
});
