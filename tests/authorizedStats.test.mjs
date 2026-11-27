// SDL-004-LIVE-STATS-001: isolated role-scoped stats contract tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../js/authorizedStatsService.js',import.meta.url),'utf8');
const PLAYER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
async function api(client){
 const context=vm.createContext({DOMException,Date,Number,Error});
 const config=new vm.SyntheticModule(['supabaseClient'],function(){this.setExport('supabaseClient',client);},{context});
 const m=new vm.SourceTextModule(code,{context,identifier:'authorizedStatsService.js'});
 await m.link(p=>p==='./config.js'?config:Promise.reject(Error('Unapproved import')));
 await m.evaluate();
 return m.namespace;
}
test('coach and guardian history is retrieved via distinct server permission RPCs, never raw sessions',async()=>{
 const calls=[];
 const rows=[
 {id:'s1',player_id:PLAYER,session_date:'2026-08-15',exit_velo:'66',throwing_velo:55,sprint_time:'4.32',height_cm:'146',weight_kg:35},
 {id:'s2',player_id:PLAYER,session_date:'2026-06-15',exit_velo:'65',throwing_velo:52,sprint_time:'4.41',height_cm:'145',weight_kg:34}
 ];
 const client={rpc(name,args){calls.push({name,args});return Promise.resolve({data:rows,error:null})},from(){throw Error('Raw sessions query prohibited')}};
 const {fetchAuthorizedPlayerHistory}=await api(client);
 const a=await fetchAuthorizedPlayerHistory(PLAYER,'coach');
 const b=await fetchAuthorizedPlayerHistory(PLAYER,'guardian');
 assert.equal(calls[0].name,'sdl_004_pilot_coach_statistics');
 assert.equal(calls[1].name,'sdl_004_player_statistics');
 assert.equal(calls[0].args.p_player,PLAYER);assert.equal(calls[1].args.p_player_id,PLAYER);
 assert.equal(a[0].session_date,'2026-06-15');assert.equal(a[1].height_cm,146);
 assert.equal(a[1].weight_kg,35);assert.equal(a[1].exit_velo,66);
 assert.deepEqual(a,b);
});
test('cross-player, malformed, denied and unavailable histories fail closed',async()=>{
 let n=0;
 const {fetchAuthorizedPlayerHistory}=await api({rpc(){n++;return Promise.resolve({data:[],error:null})}});
 await assert.rejects(()=>fetchAuthorizedPlayerHistory('other','coach'),/Invalid athlete/);
 await assert.rejects(()=>fetchAuthorizedPlayerHistory(PLAYER,'admin'),/Unsupported/);
 assert.equal(n,0);
 const cross=await api({rpc:async()=>({data:[{player_id:OTHER,session_date:'2026-08-15'}],error:null})});
 await assert.rejects(()=>cross.fetchAuthorizedPlayerHistory(PLAYER,'coach'),/did not match/);
 const locked=await api({rpc:async()=>({data:null,error:{code:'42501',message:'not authorized'}})});
 await assert.rejects(()=>locked.fetchAuthorizedPlayerHistory(PLAYER,'guardian'),e=>e.status===403);
 const unavailable=await api({rpc:async()=>({data:null,error:{code:'P0001',message:'timeout'}})});
 await assert.rejects(()=>unavailable.fetchAuthorizedPlayerHistory(PLAYER,'coach'),e=>e.status===503);
});
test('field values reject invalid measurements and no session metadata crosses into display',async()=>{
 const {fetchAuthorizedPlayerHistory}=await api({rpc:async()=>({data:[{id:'s',player_id:PLAYER,session_date:'2026-01-01',
 exit_velo:'60',parent_phone:'PRIVATE',object_key:'PRIVATE',weight_kg:null}],error:null})});
 const rows=await fetchAuthorizedPlayerHistory(PLAYER,'coach');
 assert.equal(rows[0].exit_velo,60);
 assert.equal(rows[0].weight_kg,null);
 assert.equal(rows[0].parent_phone,undefined);
 assert.equal(rows[0].object_key,undefined);
});
test('request abort prevents stale player history',async()=>{
 const c=new AbortController();c.abort();
 const {fetchAuthorizedPlayerHistory}=await api({rpc(){throw Error('request must not be made')}});
 await assert.rejects(()=>fetchAuthorizedPlayerHistory(PLAYER,'coach',{signal:c.signal}),e=>e.name==='AbortError');
});
