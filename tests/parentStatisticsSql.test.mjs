// Real isolated PostgreSQL/WASM; all identities, metrics and enrollments are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {clubWorkflow,enrollment,peerEnrollment,secondClubPlayer,adminUser} from './helpers/clubWorkflow.mjs';
import {uuid,parent,coach,teammate,outsider,player,peer,otherPlayer,team,otherTeam,org,athlete} from './helpers/submissionDatabase.mjs';
import {computeTopMetrics,computeTopJumpRatios} from '../js/statsEngine.js';
const runtime=process.env.SDL004_PGLITE_RUNTIME,S=uuid(1001),S2=uuid(1002);
async function fixture(t){
 const h=await clubWorkflow(t,runtime);
 h.exec=async sql=>{await h.owner('RESET ROLE');return h.db.exec(sql);};
 await h.exec(`INSERT INTO public.team_memberships VALUES('${team}','${parent}','active','parent');
 INSERT INTO public.sessions(id,player_id,session_date,exit_velo,throwing_velo,sprint_time,broad_jump,height_cm,weight_kg,control_exit_velo,attack_angle,shoulder_check)
 VALUES('${S}','${player}','2026-11-01',62,68,3.45,150,140,35,60,10,'PRIVATE MEDICAL NOTE'),('${S2}','${peer}','2026-11-02',99,75,3.2,160,145,36,70,12,'PRIVATE');`);
 h.share=async(metrics=['exit_velo'],roster=true)=>h.as(parent,`SELECT public.sdl_004_set_statistic_consent('${enrollment}','${await h.generation()}',${roster},ARRAY[${metrics.map(x=>`'${x}'`).join(',')}]::text[],'sdl004-baseball-statistics-v1')`);
 h.approve=(sid=S,who=coach,metrics=['exit_velo'])=>h.as(who,`SELECT public.sdl_004_approve_statistics('${sid}',ARRAY[${metrics.map(x=>`'${x}'`).join(',')}]::text[])`);
 h.roster=(who=teammate,tid=team)=>h.as(who,`SELECT * FROM public.sdl_004_clubhouse_roster('${tid}')`);
 h.board=(who=teammate,tid=team)=>h.as(who,`SELECT * FROM public.sdl_004_clubhouse_leaderboard('${tid}')`);
 return h;
}
test('parent statistics RPC returns only linked-child allowlisted history, with no sharing consent needed',{skip:!runtime},async t=>{
 const h=await fixture(t);const rows=await h.as(parent,`SELECT * FROM public.sdl_004_player_statistics('${player}')`);
 assert.equal(rows.length,1);assert.equal(rows[0].exit_velo,'62');
 assert.deepEqual(Object.keys(rows[0]).sort(),['id','player_id','session_date','exit_velo','throwing_velo','sprint_time','broad_jump','control_exit_velo','attack_angle','height_cm','weight_kg'].sort());
 for(const who of [teammate,outsider,coach])await assert.rejects(h.as(who,`SELECT * FROM public.sdl_004_player_statistics('${player}')`),/Not authorized/);
 assert.equal((await h.as(parent,`SELECT * FROM public.sdl_004_player_statistics('${secondClubPlayer}')`)).length,0);
});
test('roster requires current team access and separate profile/statistic consent; video consent is insufficient',{skip:!runtime},async t=>{
 const h=await fixture(t);await h.grant();assert.equal((await h.roster()).length,0);
 await h.share();const rows=await h.roster();assert.equal(rows.length,1);
 assert.deepEqual(Object.keys(rows[0]).sort(),['id','team_id','team_name','preferred_name','jersey','position','throws','bats'].sort());
 await assert.rejects(h.roster(outsider),/Not authorized/);await assert.rejects(h.roster(parent,otherTeam),/Not authorized/);
});
test('leaderboard requires explicit coach approval AND per-metric statistic consent, never raw sessions or parent videos',{skip:!runtime},async t=>{
 const h=await fixture(t);await h.share(['exit_velo']);assert.equal((await h.board()).length,0);
 await h.approve(S,coach,['exit_velo','throwing_velo']);const rows=await h.board();assert.equal(rows.length,1);assert.equal(rows[0].value,'62');assert.equal(rows[0].metric,'exit_velo');
 await assert.rejects(h.approve(S2,parent),/Not authorized/);await assert.rejects(h.approve(S,outsider),/Not authorized/);
 await h.approve(S,coach,[]);assert.equal((await h.board()).length,0);
});
test('official metric snapshots use SDL best/max/min and rounded jump-ratio definitions',{skip:!runtime},async t=>{
 const h=await fixture(t);const third=uuid(1003);
 await h.owner(`INSERT INTO public.sessions(id,player_id,session_date,exit_velo,throwing_velo,sprint_time,broad_jump,height_cm) VALUES('${third}','${player}','2026-11-03',64,67,3.6,155,140)`);
 const metrics=['exit_velo','throwing_velo','sprint_time','broad_jump_ratio'];await h.share(metrics);await h.approve(S,coach,metrics);await h.approve(third,coach,metrics);
 const rows=await h.board(),sessions=[{player_id:player,exit_velo:64,throwing_velo:67,sprint_time:3.6,broad_jump:155,height_cm:140},{player_id:player,exit_velo:62,throwing_velo:68,sprint_time:3.45,broad_jump:150,height_cm:140}];
 for(const metric of metrics.slice(0,3))assert.equal(Number(rows.find(r=>r.metric===metric).value),computeTopMetrics([{id:player}],sessions,metric,3,metric==='sprint_time')[0].value);
 assert.equal(Number(rows.find(r=>r.metric==='broad_jump_ratio').value),Number(computeTopJumpRatios([{id:player}],sessions)[0].ratio));
 assert.equal(rows.some(r=>'height_cm' in r||'weight_kg' in r||'shoulder_check' in r),false);
});
test('source-session edits invalidate approval until an authorized coach explicitly reapproves',{skip:!runtime},async t=>{
 const h=await fixture(t);await h.share();await h.approve();await h.owner(`UPDATE public.sessions SET exit_velo=120 WHERE id='${S}'`);
 assert.equal((await h.board()).length,0);await h.owner(`UPDATE public.sessions SET exit_velo=62 WHERE id='${S}'`);assert.equal((await h.board()).length,0,'Restoring an old value cannot revive an obsolete approval');
 await h.owner(`UPDATE public.sessions SET exit_velo=120 WHERE id='${S}'`);await h.approve();assert.equal((await h.board())[0].value,'120');
 assert.equal((await h.owner(`SELECT has_table_privilege('authenticated','public.sessions','UPDATE') AS allowed`))[0].allowed,false);
});
test('statistics withdrawal removes team visibility immediately and preserves private history and video consent',{skip:!runtime},async t=>{
 const h=await fixture(t);await h.grant();await h.share();await h.approve();await h.share([],false);
 assert.equal((await h.roster()).length,0);assert.equal((await h.board()).length,0);assert.equal((await h.consent()).consent_active,true);
 assert.equal((await h.as(parent,`SELECT * FROM public.sdl_004_player_statistics('${player}')`)).length,1);
 await h.share();await h.withdraw();assert.equal((await h.board()).length,1,'Video consent does not control statistics consent');
});
test('inactive enrollment revokes both caller access and subject sharing; same-ID rejoin cannot revive consent/approvals',{skip:!runtime},async t=>{
 const h=await fixture(t);await h.share();await h.approve();
 await h.owner(`UPDATE public.sdl_club_enrollments SET status='inactive',ended_at=now() WHERE id='${enrollment}'`);
 assert.equal((await h.roster()).length,0);await assert.rejects(h.as(parent,`SELECT * FROM public.sdl_004_player_statistics('${player}')`),/Not authorized/);
 await assert.rejects(h.roster(parent),/Not authorized/);
 await h.owner(`UPDATE public.sdl_club_enrollments SET status='active',ended_at=null WHERE id='${enrollment}'`);
 assert.equal((await h.board()).length,0);await h.share();assert.equal((await h.board()).length,0);await h.approve();assert.equal((await h.board()).length,1);
});
test('internal team transfer preserves club consent and approvals but shares only to the new current team',{skip:!runtime},async t=>{
 const h=await fixture(t),newTeam=uuid(24);await h.share();await h.approve();
 await h.exec(`INSERT INTO public.teams(id,organization_id,status)VALUES('${newTeam}','${org}','active');
 INSERT INTO public.team_memberships VALUES('${newTeam}','${parent}','active','parent');
 UPDATE public.player_team_memberships SET team_id='${newTeam}' WHERE player_id='${player}'`);
 assert.equal((await h.board()).length,0);assert.equal((await h.board(parent,newTeam)).length,1);await assert.rejects(h.board(teammate,newTeam),/Not authorized/);
});
test('separate-club enrollments and unrelated guardians cannot grant consent or approve across organizations',{skip:!runtime},async t=>{
 const h=await fixture(t);await h.share();await h.approve();await assert.rejects(h.approve(S,teammate),/Not authorized/);
 await assert.rejects(h.as(outsider,`SELECT public.sdl_004_set_statistic_consent('${enrollment}','${await h.generation()}',true,ARRAY['exit_velo'],'sdl004-baseball-statistics-v1')`),/Not authorized/);
 const remoteSession=uuid(1050);await h.owner(`INSERT INTO public.sessions(id,player_id,session_date,exit_velo)VALUES('${remoteSession}','${secondClubPlayer}',CURRENT_DATE,140)`);
 await assert.rejects(h.approve(remoteSession,coach),/Not authorized/);
 await h.approve(S,adminUser);assert.equal((await h.board()).length,1);
});
test('guardian verification revocation and later re-verification cannot reactivate old statistic consent',{skip:!runtime},async t=>{
 const h=await fixture(t);await h.share();await h.approve();await h.owner(`UPDATE public.athlete_guardians SET status='revoked' WHERE user_id='${parent}'`);
 assert.equal((await h.board()).length,0);await h.owner(`UPDATE public.athlete_guardians SET status='verified' WHERE user_id='${parent}'`);
 assert.equal((await h.board()).length,0);await h.share();assert.equal((await h.board()).length,1);
});
test('expired/revoked sessions, direct tables and internal helper calls are denied in PostgreSQL',{skip:!runtime},async t=>{
 const h=await fixture(t);await h.share();await h.approve();
 for(const role of ['anon','authenticated','service_role']){
  await h.exec('RESET ROLE;SET ROLE '+role);
  await assert.rejects(h.db.query('INSERT INTO public.sdl_official_statistics DEFAULT VALUES'),/permission denied/);
  await assert.rejects(h.db.query('UPDATE public.sdl_statistic_consents SET share_roster=true'),/permission denied/);
 }
 await h.exec('RESET ROLE;SET ROLE anon');await assert.rejects(h.db.query(`SELECT * FROM public.sdl_004_clubhouse_roster('${team}')`),/permission denied/);
 await assert.rejects(h.as(parent,`SELECT public.sdl_004_statistics_consent('${enrollment}')`),/permission denied/);
 await h.owner(`UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE user_id='${parent}'`);
 await assert.rejects(h.as(parent,`SELECT * FROM public.sdl_004_player_statistics('${player}')`),/Not authorized/);
 await h.owner(`DELETE FROM auth.sessions WHERE user_id='${teammate}'`);await assert.rejects(h.board(),/Not authorized/);
});
test('private fields and invalid metric grants fail closed; audit remains immutable',{skip:!runtime},async t=>{
 const h=await fixture(t);for(const metric of ['height_cm','weight_kg','shoulder_check']){await assert.rejects(h.share([metric]),/sharing choices/);await assert.rejects(h.approve(S,coach,[metric]),/Invalid official metrics/);}
 await h.share();await assert.rejects(h.owner(`UPDATE public.sdl_club_consent_events SET action='forged'`),/immutable/);
});
test('team rankings choose only approved values, limit to three per metric and exclude unapproved higher raw values',{skip:!runtime},async t=>{
 const h=await fixture(t),metrics=['exit_velo','throwing_velo','sprint_time','broad_jump_ratio'];await h.share(metrics);await h.approve(S,coach,metrics);
 for(let n=1;n<=3;n++){
  const pid=uuid(1100+n),aid=uuid(1200+n),eid=uuid(1300+n),sid=uuid(1400+n);
  await h.exec(`INSERT INTO public.players(id,athlete_id,organization_id)VALUES('${pid}','${aid}','${org}');
  INSERT INTO public.athlete_guardians VALUES('${aid}','${parent}','verified');
  INSERT INTO public.player_team_memberships(player_id,team_id,organization_id,status)VALUES('${pid}','${team}','${org}','active');
  INSERT INTO public.sdl_club_enrollments(id,athlete_id,organization_id)VALUES('${eid}','${aid}','${org}');
  INSERT INTO public.sessions(id,player_id,session_date,exit_velo,throwing_velo,sprint_time,broad_jump,height_cm)VALUES('${sid}','${pid}',CURRENT_DATE,${40+n*10},${50+n*10},${4+n/10},${120+n*5},140);`);
  await h.as(parent,`SELECT public.sdl_004_set_statistic_consent('${eid}','${await h.generation(eid)}',true,ARRAY['exit_velo','throwing_velo','sprint_time','broad_jump_ratio'],'sdl004-baseball-statistics-v1')`);await h.approve(sid,coach,metrics);
 }
 const rows=await h.board();assert.equal(rows.length,12);
 assert.deepEqual(rows.filter(r=>r.metric==='exit_velo').map(r=>Number(r.value)),[70,62,60]);
 assert.deepEqual(rows.filter(r=>r.metric==='sprint_time').map(r=>Number(r.value)),[3.45,4.1,4.2]);
 assert.equal(rows.some(r=>r.player_id===peer),false,'Unapproved raw 99 km/h is never included');
});
test('family history is deterministically bounded and official approvals reject invalid values',{skip:!runtime},async t=>{
 const h=await fixture(t);await h.exec(`INSERT INTO public.sessions(id,player_id,session_date,exit_velo)SELECT gen_random_uuid(),'${player}',CURRENT_DATE-n,50 FROM generate_series(1,210)n`);
 const rows=await h.as(parent,`SELECT * FROM public.sdl_004_player_statistics('${player}')`);assert.equal(rows.length,200);assert.ok(rows.every(r=>r.player_id===player));
 for(const value of ['0',"'NaN'::numeric","'Infinity'::numeric"]){await h.owner(`UPDATE public.sessions SET exit_velo=${value} WHERE id='${S}'`);await assert.rejects(h.approve(),/Metric unavailable or invalid/);}
});
test('guardian profile inactivation permanently invalidates sharing consent across later reactivation',{skip:!runtime},async t=>{
 const h=await fixture(t);await h.share();await h.approve();await h.owner(`UPDATE public.profiles SET status='inactive' WHERE id='${parent}'`);
 assert.equal((await h.board()).length,0);await h.owner(`UPDATE public.profiles SET status='active' WHERE id='${parent}'`);assert.equal((await h.board()).length,0);
 await h.share();assert.equal((await h.board()).length,1);
});
