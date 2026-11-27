// SDL-004-UX-LIVE: Origin-only staging change. No public media access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ORIGINS } from '../backend/worker/pilot.mjs';
import entry from '../backend/worker/index.mjs';

const WORKER='https://sdl-r2-staging-gate.sampson-ho.workers.dev';
const STAGING='https://sdl-staging.pages.dev';
const LIVE='https://sdl-ux-live.pages.dev';
const LOCAL=['http://127.0.0.1:5500','http://localhost:5500'];

function request(origin,path='/v2/submissions',method='OPTIONS'){
  return new Request(WORKER+path, { method, headers: { Origin: origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization,Content-Type' } });
}

test('exact four authorized origins; synthetic design preview remains excluded',()=>{
  assert.deepEqual([...ORIGINS].sort(),[...LOCAL,STAGING,LIVE].sort());
  assert.equal(ORIGINS.has('https://sdl-ux-preview.pages.dev'),false);
  assert.equal(ORIGINS.has('http://sdl-ux-live.pages.dev'),false);
});

for(const origin of [...LOCAL,STAGING,LIVE]){
  test('OPTIONS private media CORS only echoes approved origin: '+origin,async()=>{
    const r=await entry.fetch(request(origin),{});
    assert.equal(r.status,204);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);
    assert.match(r.headers.get('Access-Control-Allow-Headers'),/Authorization/);
    assert.equal(r.headers.get('Vary'),'Origin');
  });
}

test('disallowed public origin is rejected without permissive CORS',async()=>{
  const r=await entry.fetch(request('https://untrusted.invalid'),{});
  assert.equal(r.status,403);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
});

test('new origin does not bypass media authentication',async()=>{
  const env={
    SUPABASE_URL:'https://wvurolqbjhuckkkjiiiv.supabase.co',
    SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',
    SUPABASE_SECRET_KEY:'sb_secret_synthetic',
    MEDIA_BUCKET:{},MEDIA_PLAYBACK_ENABLED:'true'
  };
  const r=await entry.fetch(request(LIVE,'/v2/submissions?player_id=00000000-0000-4000-8000-000000000000','GET'),env);
  assert.equal(r.status,401);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),LIVE);
  assert.match(await r.text(),/Authentication required/);
});

test('v2 CORS still permits exact origin while backend feature gate stays off',async()=>{
  const preflight=await entry.fetch(request(LIVE,'/v2/submissions','OPTIONS'),{});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),LIVE);
  const denied=await entry.fetch(request(LIVE,'/v2/submissions','GET'),{SUBMISSIONS_ENABLED:'false'});
  assert.equal(denied.status,503);
  assert.match(await denied.text(),/disabled/);
});

test('deterministic player UUID reaches server role check; malformed IDs and missing auth still fail',async t=>{
 const prior=globalThis.fetch;
 t.after(()=>{globalThis.fetch=prior;});
 const demo='abcdef12-3456-d789-0123-abcdef123456';
 const calls=[];
 globalThis.fetch=async(url,init)=>{
   const path=new URL(url).pathname;
   if(path==='/auth/v1/user')return Response.json({id:'11111111-1111-4111-8111-111111111111'});
   if(path.endsWith('/sdl_004_session_active'))return Response.json(true);
   if(path.endsWith('/sdl_004_submission_contract'))return Response.json({rbacVersion:5,revision:'sdl004-club-enrollment-v2',mediaRevision:'v5.1-clean-start'});
   calls.push([path,JSON.parse(init.body)]);
   if(path.endsWith('/sdl_004_submission_can_submit'))return Response.json(false);
   if(path.endsWith('/sdl_004_list_submissions'))return Response.json([]);
   throw Error('Unexpected request');
 };
 const env={SUPABASE_URL:'https://wvurolqbjhuckkkjiiiv.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',SUPABASE_SECRET_KEY:'sb_secret_synthetic',MEDIA_BUCKET:{},MEDIA_UPLOAD_ENABLED:'true',MEDIA_PLAYBACK_ENABLED:'true'};
 const run=path=>entry.fetch(new Request(WORKER+path,{headers:{Origin:LIVE,Authorization:'Bearer synthetic'}}),env);
 assert.equal((await run('/v2/submissions/upload-eligibility?player_id='+demo)).status,200);
 assert.deepEqual(calls[0][1],{p_player_id:demo});
 assert.equal((await run('/v2/submissions?player_id='+demo)).status,200);
 assert.deepEqual(calls[1][1],{p_player_id:demo});
 assert.equal((await run('/v2/submissions?player_id=bad')).status,400);
 assert.equal(calls.length,2);
});

test('MOV upload preserves native MIME through private storage and service-only finalization',async t=>{
 const prior=globalThis.fetch;t.after(()=>{globalThis.fetch=prior;});
 const player='11111111-1111-4111-8111-111111111111',video='33333333-3333-4333-8333-333333333333',key='pilot/'+player+'/'+video+'.mp4';
 const bytes=new Uint8Array([0,0,0,12,102,116,121,112,113,116,32,32]);
 let stored,finalized=false;
 globalThis.fetch=async(url,init)=>{
   const path=new URL(url).pathname;
   if(path==='/auth/v1/user')return Response.json({id:player});
   if(path.endsWith('/sdl_004_session_active'))return Response.json(true);
   if(path.endsWith('/sdl_004_submission_contract'))return Response.json({rbacVersion:5,revision:'sdl004-club-enrollment-v2',mediaRevision:'v5.1-clean-start'});
   if(path.endsWith('/sdl_004_submission_can_submit'))return Response.json(true);
   if(path.endsWith('/sdl_004_reserve_submission'))return Response.json({state:'reserved',id:video,object_key:key});
   if(path.endsWith('/sdl_v5_finish_quicktime')){assert.equal(new Headers(init.headers).get('apikey'),'sb_secret_synthetic');assert.equal(new Headers(init.headers).get('Authorization'),null);finalized=true;return Response.json({id:video,player_id:player,category:'pitching',status:'approved'});}
   if(path.endsWith('/sdl_v5_authorize_playback'))return Response.json(true);
   if(path.endsWith('/sdl_media_objects'))return Response.json([{object_key:key,player_id:player,byte_size:12,content_type:'video/quicktime'}]);
   throw Error(path);
 };
 const env={SUPABASE_URL:'https://wvurolqbjhuckkkjiiiv.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',SUPABASE_SECRET_KEY:'sb_secret_synthetic',MEDIA_UPLOAD_ENABLED:'true',MEDIA_PLAYBACK_ENABLED:'true',MEDIA_BUCKET:{
   async put(k,b,o){assert.equal(k,key);assert.equal(o.httpMetadata.contentType,'video/quicktime');stored=b;},
   async get(k){assert.equal(k,key);return {size:stored.length,body:new Blob([stored]).stream()};}
 }};
 const req=new Request(WORKER+'/v2/submissions?player_id='+player+'&category=pitching',{method:'POST',headers:{Origin:LIVE,Authorization:'Bearer synthetic','Content-Type':'video/quicktime','Content-Length':'12','Idempotency-Key':video},body:bytes});
 const response=await entry.fetch(req,env);assert.equal(response.status,201);assert.equal(finalized,true);assert.deepEqual(stored,bytes);
 const playback=await entry.fetch(new Request(WORKER+'/v2/submissions/'+video+'/playback',{headers:{Origin:LIVE,Authorization:'Bearer synthetic'}}),env);
 assert.equal(playback.status,200);assert.equal(playback.headers.get('Content-Type'),'video/quicktime');
 assert.deepEqual(new Uint8Array(await playback.arrayBuffer()),bytes);
});

test('permanent deletion requires authorization, verified storage absence and durable retry',async t=>{
 const prior=globalThis.fetch;t.after(()=>{globalThis.fetch=prior;});
 const player='abcdef12-3456-d789-0123-abcdef123456',video='33333333-3333-4333-8333-333333333333',key='pilot/'+player+'/'+video+'.mp4';
 let queued=false,confirmed=false,stored=true,fail=false,wrongKey=false,attempts=0,records=0,allowed=true,due=true;
 globalThis.fetch=async(url,init)=>{
   const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):{},headers=new Headers(init.headers);
   if(path==='/auth/v1/user')return Response.json({id:'11111111-1111-4111-8111-111111111111'});
   if(path.endsWith('/sdl_004_session_active'))return Response.json(true);
   if(path.endsWith('/sdl_004_submission_contract'))return Response.json({rbacVersion:5,revision:'sdl004-club-enrollment-v2',mediaRevision:'v5.1-clean-start'});
   if(path.endsWith('/sdl_v5_archive_media')){if(!allowed)return new Response(null,{status:403});queued=true;return Response.json(true);}
   assert.equal(headers.get('apikey'),'sb_secret_synthetic');assert.equal(headers.get('Authorization'),null);
   if(path.endsWith('/sdl_v5_media_purge_jobs'))return Response.json(queued?[{id:video,player_id:player,object_key:wrongKey?'unrelated':key,confirmed,due}]:[]);
   if(path.endsWith('/sdl_v5_record_media_purge')){assert.equal(body.p_id,video);records++;confirmed=body.p_absent;if(confirmed)due=false;return Response.json(confirmed);}
   throw Error(path);
 };
 const env={SUPABASE_URL:'https://wvurolqbjhuckkkjiiiv.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',SUPABASE_SECRET_KEY:'sb_secret_synthetic',MEDIA_ARCHIVE_ENABLED:'true',MEDIA_BUCKET:{
   async delete(k){assert.equal(k,key);attempts++;if(fail)throw Error('R2 unavailable');stored=false;},
   async head(k){assert.equal(k,key);return stored?{size:12}:null;}
 }};
 const remove=()=>entry.fetch(new Request(WORKER+'/v2/submissions/'+video+'/archive',{method:'POST',headers:{Origin:LIVE,Authorization:'Bearer synthetic'}}),env);
 allowed=false;assert.equal((await remove()).status,403);assert.equal(attempts,0);
 allowed=true;wrongKey=true;let r=await remove();assert.equal(r.status,202);assert.equal((await r.json()).deleted,false);assert.equal(attempts,0);
 wrongKey=false;fail=true;r=await remove();assert.equal(r.status,202);assert.equal((await r.json()).deleted,false);assert.equal(stored,true);assert.equal(records,1);
 fail=false;await entry.scheduled({cron:'*/5 * * * *'},env);assert.equal(stored,false);assert.equal(confirmed,true);assert.equal(records,2);
 r=await remove();assert.equal(r.status,200);assert.deepEqual(await r.json(),{archived:true,deleted:true});assert.equal(attempts,2);
});

test('independent private review has its own gate and contract, and only calls the narrow RPC',async t=>{
 const prior=globalThis.fetch;t.after(()=>{globalThis.fetch=prior;});
 let revision=true,allowed=true,calls=0;
 const video='33333333-3333-4333-8333-333333333333';
 globalThis.fetch=async(url,init)=>{
  const n=new URL(url).pathname.split('/').pop();
  if(n==='user')return Response.json({id:'11111111-1111-4111-8111-111111111111'});
  if(n==='sdl_004_session_active')return Response.json(true);
  if(n==='sdl_004_submission_contract')return Response.json({rbacVersion:5,revision:'sdl004-club-enrollment-v2',mediaRevision:'v5.1-clean-start',mediaReviewRevision:revision?'independent-review-v1':null});
  if(n==='sdl_v5_review_private_media'){calls++;assert.equal(new Headers(init.headers).get('Authorization'),'Bearer synthetic');assert.equal(JSON.parse(init.body).p_id,video);return allowed?Response.json(true):new Response(null,{status:403});}
  throw Error('Unexpected RPC '+n);
 };
 const env={SUPABASE_URL:'https://wvurolqbjhuckkkjiiiv.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',SUPABASE_SECRET_KEY:'sb_secret_synthetic',MEDIA_BUCKET:{},SUBMISSIONS_ENABLED:'false',MEDIA_REVIEW_ENABLED:'false'};
 const run=(body={decision:'approved',note:'',single_subject:true})=>entry.fetch(new Request(WORKER+'/v2/submissions/'+video+'/review-private',{method:'POST',headers:{Origin:LIVE,Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(body)}),env);
 assert.equal((await run()).status,503);assert.equal(calls,0);
 env.MEDIA_REVIEW_ENABLED='true';revision=false;assert.equal((await run()).status,503);assert.equal(calls,0);
 revision=true;assert.equal((await run({decision:'rejected',note:'',single_subject:false})).status,400);assert.equal(calls,0);
 allowed=false;assert.equal((await run()).status,403);assert.equal(calls,1);
 allowed=true;assert.equal((await run()).status,200);assert.equal(calls,2);
});
