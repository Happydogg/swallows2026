// Worker transport simulations only; database authorization is independently tested in PGlite.
import test from 'node:test';
import assert from 'node:assert/strict';
import {workerHarness,PLAYER,OTHER,VIDEO} from './helpers/workerHarness.mjs';
async function fixture(role='parent'){const h=await workerHarness(role);h.env.SUBMISSIONS_ENABLED='true';return h;}
const routes=['/v2/clubhouse/roster?team_id='+OTHER,'/v2/clubhouse/leaderboard?team_id='+OTHER,`/v2/players/${PLAYER}/statistics`];
test('safe roster Worker route forwards caller JWT and strips all non-contract fields without R2 access',async()=>{
 const h=await fixture();h.statisticsRows=[{id:PLAYER,team_id:OTHER,team_name:'Team',preferred_name:'Synthetic',jersey:'07',position:'SS',throws:'R',bats:'L',dob:'private',parent_phone:'private',last_name:'private'}];
 const r=await h.packaged.fetch(h.request(routes[0]),h.env);assert.equal(r.status,200);const [p]=(await r.json()).items;
 assert.deepEqual(Object.keys(p).sort(),['id','team_id','team_name','preferred_name','jersey','position','throws','bats'].sort());
 const rpc=h.calls.find(c=>c.url.endsWith('rpc/sdl_004_clubhouse_roster'));assert.equal(rpc.init.headers.Authorization,'Bearer synthetic');assert.equal(rpc.init.headers.apikey,h.env.SUPABASE_PUBLISHABLE_KEY);
 assert.match(r.headers.get('Cache-Control'),/no-store/);assert.equal(h.writes+h.deletes,0);
});
test('leaderboard and family history routes return only their explicit contracts',async()=>{
 const h=await fixture();h.statisticsRows=[{id:VIDEO,player_id:PLAYER,team_id:OTHER,metric:'exit_velo',value:62,height_cm:140,weight_kg:35,shoulder_check:'private'}];
 let r=await h.packaged.fetch(h.request(routes[1]),h.env);let row=(await r.json()).items[0];assert.equal(r.status,200);assert.equal(row.height_cm,undefined);assert.equal(row.shoulder_check,undefined);
 h.statisticsRows=[{id:VIDEO,player_id:PLAYER,session_date:'2026-11-01',height_cm:140,exit_velo:62,shoulder_check:'private',created_by:'private'}];
 r=await h.packaged.fetch(h.request(routes[2]),h.env);const data=await r.json();row=data.items[0];assert.equal(r.status,200);assert.equal(data.historyLimit,200);assert.equal(row.height_cm,140);assert.equal(row.shoulder_check,undefined);assert.equal(row.created_by,undefined);
});
test('unrelated guardians, cross-team and cross-player requests are denied without privileged fallback',async()=>{
 const h=await fixture('unrelated');for(const route of routes)assert.equal((await h.packaged.fetch(h.request(route),h.env)).status,403);
 h.role='parent';for(const route of [`/v2/players/${OTHER}/statistics`,`/v2/clubhouse/roster?team_id=${PLAYER}`,`/v2/clubhouse/leaderboard?team_id=${PLAYER}`])assert.equal((await h.packaged.fetch(h.request(route),h.env)).status,403);
 assert.equal(h.calls.some(c=>c.init.headers.apikey===h.env.SUPABASE_SECRET_KEY),false);
});
test('expired, revoked and missing authentication fail before statistics RPC execution',async()=>{
 for(const mode of ['expired','revoked','missing']){
  const h=await fixture();h.expired=mode==='expired';h.revoked=mode==='revoked';
  for(const route of routes)assert.equal((await h.packaged.fetch(h.request(route,{auth:mode!=='missing'}),h.env)).status,401);
  assert.equal(h.calls.some(c=>/rpc\/sdl_004_(clubhouse_roster|clubhouse_leaderboard|player_statistics)$/.test(c.url)),false);
 }
});
test('new APIs keep v2 disabled and fail closed on absent contracts or malformed requests',async()=>{
 const h=await fixture();h.env.SUBMISSIONS_ENABLED='false';assert.equal((await h.packaged.fetch(h.request(routes[0]),h.env)).status,503);assert.equal(h.calls.length,0);
 h.env.SUBMISSIONS_ENABLED='true';h.statisticsContract=false;assert.equal((await h.packaged.fetch(h.request(routes[0]),h.env)).status,503);
 h.statisticsContract=true;
 for(const route of ['/v2/clubhouse/roster?team_id=bad',`/v2/clubhouse/roster?team_id=${OTHER}&team_id=${PLAYER}`,routes[1]+'&organization_id='+OTHER,routes[2]+'?select=*'])assert.equal((await h.packaged.fetch(h.request(route),h.env)).status,400);
 assert.equal((await h.packaged.fetch(h.request(routes[0],{method:'POST'}),h.env)).status,405);
});
test('Worker rejects overbroad or wrong-scope database responses without returning private data',async()=>{
 const h=await fixture();h.statisticsRows=[{id:PLAYER,team_id:PLAYER}];assert.equal((await h.packaged.fetch(h.request(routes[0]),h.env)).status,503);
 h.statisticsRows=Array.from({length:201},()=>({id:VIDEO,player_id:PLAYER}));assert.equal((await h.packaged.fetch(h.request(routes[2]),h.env)).status,503);
});
test('capabilities advertise only the database-verified safe contracts',async()=>{
 const h=await fixture();let r=await h.packaged.fetch(h.request('/v2/capabilities'),h.env);let caps=await r.json();for(const c of ['clubhouseRoster','clubhouseLeaderboard','parentStatistics','statisticsConsent'])assert.equal(caps[c],true);
 h.statisticsContract=false;r=await h.packaged.fetch(h.request('/v2/capabilities'),h.env);caps=await r.json();assert.equal(caps.parentStatistics,false);
});
test('separate statistic consent requires guardian authorization, current policy and bounded explicit choices',async()=>{
 const h=await fixture(),path=`/v2/club-enrollments/${VIDEO}/statistics-consent`,body={generation:OTHER,roster:true,metrics:['exit_velo'],policy_version:'sdl004-baseball-statistics-v1'};
 let r=await h.packaged.fetch(h.request(path,{method:'POST',contentType:'application/json',body:JSON.stringify(body)}),h.env);assert.equal(r.status,200);
 const call=h.calls.find(c=>c.url.endsWith('rpc/sdl_004_set_statistic_consent'));assert.equal(JSON.parse(call.init.body).p_roster,true);assert.equal(h.calls.some(c=>c.url.endsWith('rpc/sdl_004_club_consent')),false);
 h.role='coach';r=await h.packaged.fetch(h.request(path,{method:'POST',body:JSON.stringify(body)}),h.env);assert.equal(r.status,403);h.role='parent';
 for(const extra of [{metrics:['height_cm']},{policy_version:'sdl004-clubhouse-v1'},{roster:false},{metrics:['exit_velo','exit_velo']}])assert.equal((await h.packaged.fetch(h.request(path,{method:'POST',body:JSON.stringify({...body,...extra})}),h.env)).status,400);
 assert.equal((await h.packaged.fetch(h.request(path,{method:'POST',body:'x'.repeat(2049)}),h.env)).status,413);assert.equal(h.writes+h.deletes,0);
});

test('built safe-statistics routes run in workerd with synthetic outbound services only',async t=>{
 const {createRequire}=await import('node:module');const require=createRequire(new URL('../backend/worker/package.json',import.meta.url));
 const {Miniflare,Response:RuntimeResponse,convertV4MiniflareOptions:convert}=require('miniflare');let calls=0,redirectRpc=false;const events=[];
 const mf=new Miniflare(convert({modules:true,scriptPath:new URL('../backend/worker/.cloudflare/output/v1/workers/default/bundle/index.js',import.meta.url).pathname,compatibilityDate:'2026-11-16',
 bindings:{SUPABASE_URL:'https://wvurolqbjhuckkkjiiiv.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',SUPABASE_SECRET_KEY:'sb_secret_synthetic',SUBMISSIONS_ENABLED:'true'},r2Buckets:['MEDIA_BUCKET'],
 outboundService:async request=>{
  const url=new URL(request.url);events.push({path:url.pathname,key:request.headers.get('apikey')==='sb_publishable_synthetic',bearer:request.headers.get('Authorization')==='Bearer synthetic'});assert.equal(url.hostname,'wvurolqbjhuckkkjiiiv.supabase.co');calls++;
  if(url.pathname==='/auth/v1/user')return RuntimeResponse.json({id:PLAYER});
  assert.equal(request.headers.get('apikey'),'sb_publishable_synthetic');assert.equal(request.headers.get('Authorization'),'Bearer synthetic');
  const rpc=url.pathname.split('/').at(-1);
  if(rpc==='sdl_004_session_active')return redirectRpc?new RuntimeResponse(null,{status:302,headers:{Location:'https://unrelated.invalid'}}):RuntimeResponse.json(true);
  if(rpc==='sdl_004_submission_contract')return RuntimeResponse.json({revision:'sdl004-club-enrollment-v2',clubhouseRoster:true,clubhouseLeaderboard:true,parentStatistics:true,statisticsConsent:true});
  if(rpc==='sdl_004_set_statistic_consent')return RuntimeResponse.json(null);
  return RuntimeResponse.json([{id:VIDEO,player_id:PLAYER,team_id:OTHER,preferred_name:'Synthetic',session_date:'2026-11-01',metric:'exit_velo',value:62,parent_phone:'PRIVATE'}]);
 }}));t.after(()=>mf.dispose());
 for(const route of routes){const r=await mf.dispatchFetch('https://local.invalid'+route,{headers:{Authorization:'Bearer synthetic'}});assert.equal(r.status,200,route+' '+(r.status!==200?await r.clone().text()+JSON.stringify(events):''));assert.equal((await r.json()).items[0].parent_phone,undefined);}
 const r=await mf.dispatchFetch(`https://local.invalid/v2/club-enrollments/${VIDEO}/statistics-consent`,{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({generation:OTHER,roster:true,metrics:['exit_velo'],policy_version:'sdl004-baseball-statistics-v1'})});assert.equal(r.status,200);assert.ok(calls>=16);
 redirectRpc=true;const before=calls;const redirected=await mf.dispatchFetch('https://local.invalid'+routes[0],{headers:{Authorization:'Bearer synthetic'}});assert.equal(redirected.status,503);assert.equal(calls-before,2,'RPC redirects are rejected without forwarding the bearer elsewhere');
});
