// Optional real Workers runtime simulation, with all outbound traffic disabled.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/worker/package.json',import.meta.url));
let Miniflare,convert;try{({Miniflare,convertV4MiniflareOptions:convert}=require('miniflare'));}catch{}
const script=new URL('../backend/worker/.cloudflare/output/v1/workers/default/bundle/index.js',import.meta.url);
test('built Worker starts in workerd, keeps new features disabled and makes no outbound requests',{skip:!Miniflare||!fs.existsSync(script)},async t=>{
 let outbound=0;
 const mf=new Miniflare(convert({modules:true,scriptPath:script.pathname,compatibilityDate:'2026-11-16',
   bindings:{SUPABASE_URL:'https://wvurolqbjhuckkkjiiiv.supabase.co',SUBMISSIONS_ENABLED:'false'},r2Buckets:['MEDIA_BUCKET'],
   outboundService:()=>{outbound++;throw new Error('Outbound access forbidden');}}));
 t.after(()=>mf.dispose());
 const health=await mf.dispatchFetch('https://local.invalid/health');assert.equal(health.status,200);
 const disabled=await mf.dispatchFetch('https://local.invalid/v2/capabilities');assert.equal(disabled.status,503);
 const options=await mf.dispatchFetch('https://local.invalid/v2/submissions',{method:'OPTIONS',headers:{Origin:'http://localhost:5500'}});
 assert.equal(options.status,204);assert.match(options.headers.get('Access-Control-Allow-Headers'),/Idempotency-Key/);
 assert.equal(outbound,0);
});
test('built final-pilot Worker generates invitations in workerd without privileged JWT fallback or external services',{skip:!Miniflare||!fs.existsSync(script)},async t=>{
 const {Response:RuntimeResponse}=require('miniflare'),id='11111111-1111-4111-8111-111111111111';let storedHash='';
 const mf=new Miniflare(convert({modules:true,scriptPath:script.pathname,compatibilityDate:'2026-11-16',bindings:{SUPABASE_URL:'https://wvurolqbjhuckkkjiiiv.supabase.co',SUBMISSIONS_ENABLED:'true',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',SUPABASE_SECRET_KEY:'sb_secret_synthetic'},r2Buckets:['MEDIA_BUCKET'],outboundService:async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://wvurolqbjhuckkkjiiiv.supabase.co');assert.equal(request.headers.get('Authorization'),'Bearer synthetic');
  if(url.pathname==='/auth/v1/user')return RuntimeResponse.json({id});
  const rpc=url.pathname.split('/').pop();if(rpc==='sdl_004_session_active')return RuntimeResponse.json(true);if(rpc==='sdl_004_submission_contract')return RuntimeResponse.json({revision:'sdl004-club-enrollment-v2',pilotWorkflow:'sdl004-final-pilot-v1'});
  assert.equal(rpc,'sdl_004_pilot_issue_invitation');storedHash=(await request.json()).p_hash;return RuntimeResponse.json({id,expires_at:'2026-11-20T00:00:00Z'});
 }}));t.after(()=>mf.dispose());
 const r=await mf.dispatchFetch('https://local.invalid/v2/onboarding/invitations',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json',Origin:'http://localhost:5500'},body:JSON.stringify({player_id:id,email:'synthetic@example.test'})});assert.equal(r.status,200);const d=await r.json();assert.match(d.token,/^[a-f0-9]{64}$/);assert.match(storedHash,/^[a-f0-9]{64}$/);assert.notEqual(d.token,storedHash);assert.match(r.headers.get('Cache-Control'),/no-store/);
});
