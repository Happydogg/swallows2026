import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workerHarness,VIDEO} from './helpers/workerHarness.mjs';

test('Worker requests object-specific authorization for playback and attachment delivery',async()=>{
 const h=await workerHarness();
 h.seed();
 Object.assign(h.env,{MEDIA_PLAYBACK_ENABLED:'true',MEDIA_DOWNLOAD_ENABLED:'true'});
 let permitted=true;
 const decisions=[];
 h.rpcOverride=(name,body)=>{
   if(name==='sdl_004_session_active')return Response.json(true);
   if(name==='sdl_004_submission_contract')return Response.json({revision:'sdl004-club-enrollment-v2',rbacVersion:5,mediaRevision:'v5.1-clean-start'});
   decisions.push([name,body.p_id]);
   return Response.json(permitted);
 };
 for(const action of ['playback','download']){
   const response=await h.packaged.fetch(h.request('/v2/submissions/'+VIDEO+'/'+action),h.env);
   assert.equal(response.status,200);
   assert.equal(response.headers.get('Content-Disposition')?.startsWith('attachment')??false,action==='download');
 }
 assert.deepEqual(decisions,[['sdl_v5_authorize_playback',VIDEO],['sdl_v5_authorize_download',VIDEO]]);
 permitted=false;
 const before=h.calls.filter(entry=>entry.url.includes('sdl_media_objects?')).length;
 const denied=await h.packaged.fetch(h.request('/v2/submissions/'+VIDEO+'/download'),h.env);
 assert.equal(denied.status,403);
 assert.equal(h.calls.filter(entry=>entry.url.includes('sdl_media_objects?')).length,before);
});

test('retired media routes never reach player or object authorization',async()=>{
 const h=await workerHarness();h.seed();h.env.MEDIA_PLAYBACK_ENABLED='true';
 for (const path of ['/v1/authorize','/v1/media','/v1/media/'+VIDEO]) {
   assert.equal((await h.packaged.fetch(h.request(path),h.env)).status,410);
 }
 assert.deepEqual(h.calls,[]);
});

test('legacy and range requests check the current session and keep playback separate from attachments',async()=>{
 const h=await workerHarness();h.seed();Object.assign(h.env,{MEDIA_PLAYBACK_ENABLED:'true',MEDIA_DOWNLOAD_ENABLED:'true'});
 let active=true;
 const actions=[];
 h.rpcOverride=(name)=>{
   if(name==='sdl_004_session_active')return Response.json(active);
   if(name==='sdl_004_submission_contract')return Response.json({revision:'sdl004-club-enrollment-v2',rbacVersion:5,mediaRevision:'v5.1-clean-start'});
   if(name==='sdl_004_media_can_access')return Response.json(false);
   actions.push(name);
   return Response.json(name==='sdl_v5_authorize_playback');
 };
 const range=path=>{
   const request=h.request(path);
   request.headers.set('Range','bytes=0-7');
   return h.packaged.fetch(request,h.env);
 };
 const playback='/v2/submissions/'+VIDEO+'/playback';
 const legacy='/v1/media/'+VIDEO;
 assert.equal((await range(playback)).status,206);
 assert.equal((await range(legacy)).status,410);
 assert.equal((await range(playback.replace('playback','download'))).status,403);
 active=false;
 assert.equal((await range(legacy)).status,410);
 assert.equal((await range(playback)).status,401);
 assert.deepEqual(actions,['sdl_v5_authorize_playback','sdl_v5_authorize_download']);
});

test('staging Worker preserves exact Pages origins with the submission gate closed',async()=>{
 const h=await workerHarness();h.env.SUBMISSIONS_ENABLED='false';
 for(const origin of ['https://sdl-staging.pages.dev','https://sdl-ux-live.pages.dev','http://localhost:5500','http://127.0.0.1:5500']){
  const preflight=await h.packaged.fetch(h.request('/v2/submissions',{method:'OPTIONS',auth:false,origin}),h.env);
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
  const gated=await h.packaged.fetch(h.request('/v2/submissions',{origin}),h.env);
  assert.equal(gated.status,503);
 }
 for(const origin of ['https://unrelated.pages.dev','https://sdl-staging.pages.dev.example.org']){
  const denied=await h.packaged.fetch(h.request('/v2/submissions',{method:'OPTIONS',auth:false,origin}),h.env);
  assert.equal(denied.status,403);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
 }
 assert.equal(h.calls.length,0,'CORS and closed gate must not access Supabase');
});

test('playback-only mode returns full and ranged media while every mutation gate stays closed',async()=>{
 const h=await workerHarness();
 h.seed();
 h.env.MEDIA_PLAYBACK_ENABLED='true';
 const path='/v2/submissions/'+VIDEO+'/playback';
 const full=await h.packaged.fetch(h.request(path),h.env);
 assert.equal(full.status,200);
 assert.equal(full.headers.get('Cache-Control'),'private, no-store');
 const range=h.request(path);
 range.headers.set('Range','bytes=0-7');
 const partial=await h.packaged.fetch(range,h.env);
 assert.equal(partial.status,206);
 assert.equal(partial.headers.get('Content-Range'),'bytes 0-7/12');
 assert.equal((await partial.arrayBuffer()).byteLength,8);
 const calls=h.calls.length;
 for(const [method,url] of [
  ['POST','/v2/submissions'],['GET','/v2/submissions/upload-eligibility'],
  ['POST',path.replace('playback','review')],['GET','/v2/review'],
  ['POST',path.replace('playback','publish')],['GET',path.replace('playback','download')]
 ]){
  const disabled=await h.packaged.fetch(h.request(url,{method}),h.env);
  assert.equal(disabled.status,503);
  assert.equal((await disabled.json()).code,'media_disabled');
 }
 assert.equal(h.calls.length,calls);
 delete h.env.MEDIA_PLAYBACK_ENABLED;
 assert.equal((await h.packaged.fetch(h.request(path),h.env)).status,503);
 assert.equal(h.calls.length,calls);
 assert.equal(h.objects.size,1);
});

test('enabled playback rejects stale media contracts and inconsistent metadata',async()=>{
 const h=await workerHarness();
 h.seed();
 h.env.MEDIA_PLAYBACK_ENABLED='true';
 const path='/v2/submissions/'+VIDEO+'/playback';
 h.rpcOverride=name=>Response.json(name==='sdl_004_submission_contract'
  ? {revision:'sdl004-club-enrollment-v2',rbacVersion:5}
  : true);
 assert.equal((await h.packaged.fetch(h.request(path),h.env)).status,503);
 assert.equal(h.calls.some(call=>call.url.includes('sdl_media_objects?')),false);
 delete h.rpcOverride;
 delete h.records[0].player_id;
 assert.equal((await h.packaged.fetch(h.request(path),h.env)).status,503);
});
