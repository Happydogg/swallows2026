// Worker routes calling real isolated PGlite authorization functions; no external network.
import test from 'node:test';import assert from 'node:assert/strict';
import {finalPilot} from './helpers/finalPilot.mjs';import {workerHarness} from './helpers/workerHarness.mjs';
import {parent,coach,teammate,outsider,player,otherPlayer,team} from './helpers/submissionDatabase.mjs';import {adminUser,enrollment} from './helpers/clubWorkflow.mjs';
const literal=value=>value===null?'NULL':Array.isArray(value)?`ARRAY[${value.map(literal).join(',')}]::text[]`:typeof value==='boolean'?String(value):typeof value==='number'?String(value):"'"+value.replaceAll("'","''")+"'";
test('Worker/PostgreSQL integration enforces invitation theft/replay, scoped writes, official review and revoked sessions',async t=>{
 const db=await finalPilot(t),h=await workerHarness();h.env.SUBMISSIONS_ENABLED='true';h.actor=adminUser;
 h.rpcOverride=async(name,body)=>{
  assert.match(name,/^sdl_004_[a-z_]+$/);assert.equal(h.calls.at(-1).init.headers.apikey,'sb_publishable_synthetic');
  const args=Object.entries(body).map(([key,value])=>{assert.match(key,/^p_[a-z_]+$/);return key+'=>'+literal(value);}).join(',');
  try{const isTable=['sdl_004_clubhouse_leaderboard','sdl_004_clubhouse_roster','sdl_004_player_statistics','sdl_004_pilot_coach_statistics'].includes(name);
   const rows=await db.as(h.actor,isTable?`SELECT * FROM public.${name}(${args})`:`SELECT public.${name}(${args}) AS r`);return Response.json(isTable?rows:rows[0].r??null);
  }catch(e){return new Response(null,{status:e.code==='42501'?403:e.code==='PT409'?409:e.code==='PT410'?410:400});}
 };
 const request=(path,body)=>h.packaged.fetch(h.request(path,body?{method:'POST',contentType:'application/json',body:JSON.stringify(body)}:{}),h.env);
 let r=await request('/v2/onboarding/invitations',{player_id:player,email:`${outsider}@example.test`});assert.equal(r.status,200);const token=(await r.json()).token;
 h.actor=teammate;assert.equal((await request('/v2/onboarding/invitations/redeem',{token})).status,403);
 h.actor=outsider;assert.equal((await request('/v2/onboarding/invitations/redeem',{token})).status,200);assert.equal((await request('/v2/onboarding/invitations/redeem',{token})).status,409);
 h.actor=parent;r=await request(`/v2/players/${player}/growth`,{date:'2026-01-01',height:55,height_unit:'in',weight:70,weight_unit:'lb'});assert.equal(r.status,200);
 h.actor=teammate;assert.equal((await request(`/v2/players/${player}/growth`)).status,403);h.actor=coach;assert.equal((await request(`/v2/players/${otherPlayer}/growth`)).status,403);
 h.actor=parent;r=await request(`/v2/players/${player}/performance`,{protocol_id:'throw-radar-v1',value:60,unit:'mph',date:'2026-01-01',evidence:'Synthetic radar evidence',request_key:'11111111-1111-4111-8111-111111111111'});assert.equal(r.status,200);const submission=await r.json();assert.equal(submission.status,'pending');
 assert.equal((await request(`/v2/performance/${submission.id}/review`,{decision:'approved',revision:1})).status,403);
 h.actor=coach;assert.equal((await request(`/v2/performance/${submission.id}/review`,{decision:'approved',revision:1,note:'Verified'})).status,200);
 h.actor=parent;const generation=await db.generation();assert.equal((await request(`/v2/club-enrollments/${enrollment}/sharing`,{generation,mode:'all',confirmed:true})).status,200);
 h.actor=teammate;r=await request(`/v2/clubhouse/leaderboard?team_id=${team}`);assert.equal(r.status,200);assert.equal(Number((await r.json()).items[0].value),96.5606);
 h.actor=parent;await request(`/v2/club-enrollments/${enrollment}/sharing`,{generation,mode:'none',confirmed:true});h.actor=teammate;assert.equal((await(await request(`/v2/clubhouse/leaderboard?team_id=${team}`)).json()).items.length,0);
 await db.owner(`DELETE FROM auth.sessions WHERE user_id='${parent}'`);h.actor=parent;assert.equal((await request(`/v2/players/${player}/growth`)).status,401);assert.equal(h.writes+h.deletes,0);
});
