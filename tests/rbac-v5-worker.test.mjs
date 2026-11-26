import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workerHarness,VIDEO} from './helpers/workerHarness.mjs';

test('Worker requests object-specific authorization for playback and attachment delivery',async()=>{
 const h=await workerHarness();
 h.seed();
 h.env.SUBMISSIONS_ENABLED='true';
 let permitted=true;
 const decisions=[];
 h.rpcOverride=(name,body)=>{
   if(name==='sdl_004_session_active')return Response.json(true);
   if(name==='sdl_004_submission_contract')return Response.json({revision:'sdl004-club-enrollment-v2',rbacVersion:5});
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

test('legacy playback requires v5 object authorization after the player-only RPC closes',async()=>{
 const h=await workerHarness();h.seed();h.env.SUBMISSIONS_ENABLED='true';
 let permit=true;
 h.rpcOverride=(name,body)=>{
   if(name==='sdl_004_session_active')return Response.json(true);
   if(name==='sdl_004_submission_contract')return Response.json({revision:'sdl004-club-enrollment-v2',rbacVersion:5});
   if(name==='sdl_004_media_can_access')return Response.json(false);
   if(name==='sdl_v5_authorize_playback')return Response.json(permit&&body.p_id===VIDEO);
   throw Error('unexpected RPC');
 };
 const play=()=>h.packaged.fetch(h.request('/v1/media/'+VIDEO),h.env);
 assert.equal((await play()).status,200);
 permit=false;
 assert.equal((await play()).status,403);
});

test('legacy and range requests check the current session and keep playback separate from attachments',async()=>{
 const h=await workerHarness();h.seed();h.env.SUBMISSIONS_ENABLED='true';
 let active=true;
 const actions=[];
 h.rpcOverride=(name)=>{
   if(name==='sdl_004_session_active')return Response.json(active);
   if(name==='sdl_004_submission_contract')return Response.json({revision:'sdl004-club-enrollment-v2',rbacVersion:5});
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
 assert.equal((await range(playback)).status,200);
 assert.equal((await range(legacy)).headers.has('Content-Disposition'),false);
 assert.equal((await range(playback.replace('playback','download'))).status,403);
 active=false;
 assert.equal((await range(legacy)).status,401);
 assert.equal((await range(playback)).status,401);
 assert.deepEqual(actions,['sdl_v5_authorize_playback','sdl_v5_authorize_playback','sdl_v5_authorize_download']);
});
