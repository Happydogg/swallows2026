// Actual local SQL RPCs and triggers with synthetic data; no remote SQL or R2 calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pilotDatabase,uuid,parent,coach,teammate,player,peer,team,org,athlete,otherTeam} from './helpers/submissionDatabase.mjs';
const runtime=process.env.SDL004_PGLITE_RUNTIME;
test('consent lifecycle never resurrects obsolete grants',{skip:!runtime},async t=>{
 const db=await pilotDatabase(t,runtime);
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261116184847_sdl004_submission_workflows.sql',import.meta.url),'utf8'));
 async function as(id,sql){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated');return(await db.query(sql)).rows;}
 async function admin(sql){await db.exec('RESET ROLE');return(await db.query(sql)).rows;}
 const key=uuid(81),claim=uuid(82),fingerprint='d'.repeat(64);
 const reservation=(await as(parent,`SELECT public.sdl_004_reserve_submission('${player}','${key}','${claim}','${fingerprint}',12,'pitching',true,ARRAY['${team}'::uuid]) AS r`))[0].r;
 const id=reservation.id;
 await db.exec('RESET ROLE;SET ROLE service_role');await db.query(`SELECT public.sdl_004_finish_submission('${key}','${claim}','${parent}')`);
 await as(coach,`SELECT public.sdl_004_review_submission('${id}','approved','OK')`);
 const grant=()=>as(parent,`SELECT public.sdl_004_submission_consent('${id}',true,ARRAY['${team}'::uuid])`);
 const canRead=async()=> (await as(teammate,`SELECT public.sdl_004_submission_can_read('${id}') AS allowed`))[0].allowed;
 const membership=(await admin(`SELECT id,sdl_consent_epoch FROM public.player_team_memberships WHERE player_id='${player}' AND team_id='${team}'`))[0];
 await t.test('no-op roster synchronization preserves a current explicit grant',async()=>{
  assert.equal(await canRead(),true);await admin(`UPDATE public.player_team_memberships SET status=status WHERE id='${membership.id}'`);
  assert.equal(await canRead(),true);const [row]=await admin(`SELECT sdl_consent_epoch FROM public.player_team_memberships WHERE id='${membership.id}'`);assert.equal(row.sdl_consent_epoch,membership.sdl_consent_epoch);
 });
 const mutations=[
  ['same-ID status reactivation',`UPDATE public.player_team_memberships SET status='inactive' WHERE id='${membership.id}'`,`UPDATE public.player_team_memberships SET status='active' WHERE id='${membership.id}'`],
  ['same-ID ended membership reopens',`UPDATE public.player_team_memberships SET end_date=CURRENT_DATE WHERE id='${membership.id}'`,`UPDATE public.player_team_memberships SET end_date=null WHERE id='${membership.id}'`],
  ['future assignment restored',`UPDATE public.player_team_memberships SET start_date=CURRENT_DATE+1 WHERE id='${membership.id}'`,`UPDATE public.player_team_memberships SET start_date=CURRENT_DATE WHERE id='${membership.id}'`],
  ['same-ID transfer back',`UPDATE public.player_team_memberships SET team_id='${otherTeam}' WHERE id='${membership.id}'`,`UPDATE public.player_team_memberships SET team_id='${team}' WHERE id='${membership.id}'`],
  ['same-ID delete and reinsert',`DELETE FROM public.player_team_memberships WHERE id='${membership.id}'`,`INSERT INTO public.player_team_memberships(id,player_id,team_id,organization_id,status,end_date) VALUES('${membership.id}','${player}','${team}','${org}','active',null)`],
  ['guardian reverified',`UPDATE public.athlete_guardians SET status='revoked' WHERE user_id='${parent}'`,`UPDATE public.athlete_guardians SET status='verified' WHERE user_id='${parent}'`],
  ['profile reactivated',`UPDATE public.profiles SET status='suspended' WHERE id='${parent}'`,`UPDATE public.profiles SET status='active' WHERE id='${parent}'`]
 ];
 for(const[name,leave,rejoin]of mutations)await t.test(name,async()=>{
  await grant();assert.equal(await canRead(),true);
  await admin(leave);assert.equal(await canRead(),false);await admin(rejoin);assert.equal(await canRead(),false);
  const [row]=await as(parent,`SELECT * FROM public.sdl_004_list_submissions('${player}')`);
  assert.equal(row.share_with_team,false);assert.deepEqual(row.consent_team_ids,[]);
  assert.ok(row.history.some(e=>e.action==='consent_invalidated'));
  await grant();assert.equal(await canRead(),true,'only a new explicit grant restores sharing');
 });
 await t.test('withdrawal stays withdrawn after same-ID rejoin',async()=>{
  await as(parent,`SELECT public.sdl_004_submission_consent('${id}',false)`);
  await admin(mutations[0][1]);await admin(mutations[0][2]);assert.equal(await canRead(),false);
 });
 await t.test('membership generation rejects a stale captured grant even if an invalidator missed it',async()=>{
  await grant();const [old]=await admin(`SELECT consent_team_ids,consent_membership_ids,consent_membership_epochs FROM public.sdl_video_submissions WHERE id='${id}'`);
  await admin(mutations[0][1]);await admin(mutations[0][2]);
  // Simulate a concurrent stale insertion invisible to invalidation, using SQL owner only.
  await db.query(`UPDATE public.sdl_video_submissions SET share_with_team=true,consent_team_ids=$1,consent_membership_ids=$2,consent_membership_epochs=$3 WHERE id=$4`,[old.consent_team_ids,old.consent_membership_ids,JSON.stringify(old.consent_membership_epochs),id]);
  assert.equal(await canRead(),false);
 });
 await t.test('in-flight upload loses consent across a membership cycle before finalization',async()=>{
  const pending=uuid(83);const r=(await as(parent,`SELECT public.sdl_004_reserve_submission('${player}','${pending}','${claim}','${fingerprint}',12,'batting',true,ARRAY['${team}'::uuid]) AS r`))[0].r;
  await admin(mutations[0][1]);await admin(mutations[0][2]);
  await db.exec('RESET ROLE;SET ROLE service_role');await db.query(`SELECT public.sdl_004_finish_submission('${pending}','${claim}','${parent}')`);
  const [item]=await as(parent,`SELECT * FROM public.sdl_004_list_submissions('${player}') WHERE id='${r.id}'`);
  assert.equal(item.share_with_team,false);assert.deepEqual(item.consent_team_ids,[]);assert.ok(item.history.some(e=>e.action==='consent_invalidated'));
 });
 await t.test('team scope requires active matching team and organization, even with a malformed membership',async()=>{
  await admin(`INSERT INTO public.player_team_memberships(player_id,team_id,organization_id,status)VALUES('${player}','${otherTeam}','${org}','active')`);
  await assert.rejects(as(parent,`SELECT public.sdl_004_submission_consent('${id}',true,ARRAY['${otherTeam}'::uuid])`),/Invalid team/);
  const maliciousKey=uuid(84);
  await assert.rejects(as(parent,`SELECT public.sdl_004_reserve_submission('${player}','${maliciousKey}','${claim}','${fingerprint}',12,'batting',true,ARRAY['${otherTeam}'::uuid])`),/Invalid team/);
  await admin(`UPDATE public.teams SET status='inactive' WHERE id='${team}'`);
  await assert.rejects(grant(),/Invalid team/);
  await admin(`UPDATE public.teams SET status='active' WHERE id='${team}'`);
  await admin(`UPDATE public.organizations SET status='suspended' WHERE id='${org}'`);await assert.rejects(grant(),/Invalid team/);
  await admin(`UPDATE public.organizations SET status='active' WHERE id='${org}'`);
 });
 await t.test('individual team scope survives another team departure without expanding to another club',async()=>{
  const second=uuid(24);await db.exec('RESET ROLE');await db.exec(`INSERT INTO public.teams(id,organization_id,status)VALUES('${second}','${org}','active');
  INSERT INTO public.player_team_memberships(player_id,team_id,organization_id,status)VALUES('${player}','${second}','${org}','active'),('${peer}','${second}','${org}','active');
  INSERT INTO public.team_memberships VALUES('${second}','${teammate}','active','parent')`);
  await assert.rejects(as(parent,`SELECT public.sdl_004_submission_consent('${id}',true,ARRAY['${otherTeam}'::uuid])`),/Invalid team/);
  await as(parent,`SELECT public.sdl_004_submission_consent('${id}',true,ARRAY['${team}'::uuid,'${second}'::uuid])`);
  await admin(mutations[0][1]);assert.equal(await canRead(),true);
  const [item]=await as(parent,`SELECT * FROM public.sdl_004_list_submissions('${player}') WHERE id='${id}'`);assert.deepEqual(item.consent_team_ids,[second]);
  await admin(mutations[0][2]);const rows=await as(teammate,`SELECT * FROM public.sdl_004_clubhouse_videos('${team}')`);assert.equal(rows.length,0);
 });
});
