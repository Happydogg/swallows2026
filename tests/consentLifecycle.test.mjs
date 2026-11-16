// Real SQL only in local, synthetic PGlite (explicitly authorized). No remote SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {uuid,parent,coach,teammate,outsider,player,peer,team,otherTeam,org,otherOrg,athlete,peerAthlete} from './helpers/submissionDatabase.mjs';
import {clubWorkflow,enrollment,secondClubEnrollment,adminUser} from './helpers/clubWorkflow.mjs';
const runtime=process.env.SDL004_PGLITE_RUNTIME;
test('standing consent follows continuous club enrollment, not team or video',{skip:!runtime},async t=>{
 const w=await clubWorkflow(t,runtime),{db,as,owner,generation,grant,withdraw,upload,publish,canRead,consent}=w;
 assert.equal((await consent()).consent_active,false,'default no sharing');
 const video=await upload();await as(coach,`SELECT public.sdl_004_review_submission('${video}','approved','Checked')`);
 await assert.rejects(publish(video),/consent/);await grant();await publish(video);assert.equal(await canRead(video),true);
 async function isolated(name,fn){await t.test(name,async()=>{await owner('BEGIN');try{await fn();}finally{await owner('ROLLBACK');}});}
 const membership=(await owner(`SELECT id FROM public.player_team_memberships WHERE player_id='${player}'`))[0].id;
 await isolated('one-time acceptance records policy, guardian, timestamp and immutable history; no annual renewal',async()=>{
  const [receipt]=await owner(`SELECT * FROM public.sdl_club_consents WHERE enrollment_id='${enrollment}'`);
  assert.equal(receipt.guardian_id,parent);assert.equal(receipt.policy_version,'sdl004-clubhouse-v1');assert.ok(receipt.accepted_at);
  await grant();const [after]=await owner(`SELECT * FROM public.sdl_club_consents WHERE enrollment_id='${enrollment}'`);assert.deepEqual(after,receipt);
  const [count]=await owner(`SELECT count(*)::int AS n FROM public.sdl_club_consents WHERE enrollment_id='${enrollment}'`);assert.equal(count.n,1);
  await assert.rejects(owner('UPDATE public.sdl_club_consent_events SET action=action'),/immutable/);await db.exec('ROLLBACK;BEGIN');
  await assert.rejects(owner('DELETE FROM public.sdl_club_consent_events'),/immutable/);await db.exec('ROLLBACK;BEGIN');
  await assert.rejects(owner('TRUNCATE public.sdl_club_consent_events CASCADE'),/immutable/);
 });
 await isolated('consent has no annual expiry while enrollment remains continuous',async()=>{
  await owner(`UPDATE public.sdl_club_consents SET accepted_at=accepted_at-interval '3 years' WHERE enrollment_id='${enrollment}'`);
  assert.equal((await consent()).consent_active,true);assert.equal(await canRead(video),true);
 });
 await isolated('team transfer within the same club preserves consent and permits coach publication to the new current team',async()=>{
  const before=await consent(),second=uuid(23);
  await owner(`INSERT INTO public.teams(id,organization_id,status)VALUES('${second}','${org}','active')`);
  await owner(`INSERT INTO public.team_memberships VALUES('${second}','${coach}','active','coach')`);
  await owner(`UPDATE public.player_team_memberships SET team_id='${second}' WHERE id='${membership}'`);
  assert.equal((await consent()).consent_active,true);assert.deepEqual((await consent()).accepted_at,before.accepted_at);
  assert.equal(await canRead(video),false,'old team loses exposure immediately');
  await publish(video,[second]);
  await owner(`UPDATE public.player_team_memberships SET team_id='${second}' WHERE player_id='${peer}'`);
  await owner(`INSERT INTO public.team_memberships VALUES('${second}','${teammate}','active','parent')`);
  assert.equal(await canRead(video),true);assert.deepEqual((await consent()).accepted_at,before.accepted_at);
 });
 await isolated('temporary team gap and same-ID roster reactivation do not end continuous club consent',async()=>{
  await owner(`UPDATE public.player_team_memberships SET status='inactive' WHERE id='${membership}'`);
  assert.equal((await consent()).consent_active,true);assert.equal(await canRead(video),false);
  await owner(`UPDATE public.player_team_memberships SET status='active' WHERE id='${membership}'`);
  assert.equal((await consent()).consent_active,true);assert.equal(await canRead(video),true);
 });
 for(const status of ['inactive','ended'])await isolated(`club ${status} invalidates consent; reusing the same enrollment ID requires a fresh acceptance`,async()=>{
  const old=await generation();await as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${org}','${status}','${enrollment}')`);
  assert.equal((await consent()).consent_active,false);assert.equal(await canRead(video),false);
  await as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${org}','active','${enrollment}')`);
  assert.notEqual(await generation(),old);assert.equal((await consent()).consent_active,false);
  await assert.rejects(as(parent,`SELECT public.sdl_004_club_consent('${enrollment}','${old}',true,'sdl004-clubhouse-v1')`),e=>e.code==='PT409');
  await grant();assert.equal((await consent()).consent_active,true);assert.equal(await canRead(video),false,'old enrollment publication cannot resurrect');
 });
 await isolated('later rejoin with a new enrollment defaults to no consent',async()=>{
  await as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${org}','ended','${enrollment}')`);
  const [row]=await as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${org}','active') AS id`);
  assert.notEqual(row.id,enrollment);assert.equal((await consent(row.id)).consent_active,false);assert.equal(await canRead(video),false);
 });
 await isolated('withdrawal removes all team visibility, preserves private family/staff videos and records withdrawal',async()=>{
  const [before]=await owner('SELECT count(*)::int AS n FROM public.sdl_media_objects');await withdraw();
  assert.equal(await canRead(video),false);assert.equal(await canRead(video,parent),true);assert.equal(await canRead(video,coach),true);
  const c=await consent();assert.equal(c.consent_active,false);assert.ok(c.withdrawn_at);assert.ok(c.history.some(e=>e.action==='withdrawn'));
  const [after]=await owner('SELECT count(*)::int AS n FROM public.sdl_media_objects');assert.equal(after.n,before.n);
  await grant();assert.equal(await canRead(video),false,'new acceptance does not silently republish withdrawn media');await publish(video);assert.equal(await canRead(video),true);
 });
 await isolated('clubs have separate consent and videos cannot cross organization boundaries',async()=>{
  assert.equal((await consent(secondClubEnrollment)).consent_active,false);await grant(secondClubEnrollment);await withdraw();
  assert.equal((await consent(secondClubEnrollment)).consent_active,true);assert.equal((await consent()).consent_active,false);
 });
 await isolated('cross-team and malformed cross-organization direct RPC publications fail',async()=>{
  await assert.rejects(publish(video,[otherTeam]),/Team access denied/);
  const second=uuid(23);await owner(`INSERT INTO public.teams(id,organization_id,status)VALUES('${second}','${org}','active')`);
  await assert.rejects(publish(video,[second]),/Team access denied/);
 });
 await isolated('a viewer whose club enrollment ended loses teammate access even with stale team rows',async()=>{
  await owner(`UPDATE public.sdl_club_enrollments SET status='ended',ended_at=now() WHERE athlete_id='${peerAthlete}'`);assert.equal(await canRead(video),false);
 });
 await isolated('unknown or multiple identifiable subjects are never authorized by one child consent',async()=>{
  await assert.rejects(publish(video,[team],[]),/subjects/);await assert.rejects(publish(video,[team],[athlete,peerAthlete]),/subjects/);await assert.rejects(publish(video,[team],[peerAthlete]),/subjects/);
 });
 await isolated('coaches cannot grant guardian consent and parents cannot approve/publish or create enrollment',async()=>{
  await assert.rejects(grant(enrollment,coach),/Not authorized/);await assert.rejects(grant(enrollment,outsider),/Not authorized/);
  await assert.rejects(publish(video,[team],[athlete],parent),/Not authorized/);
  await assert.rejects(as(parent,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${org}','active')`),/Not authorized/);
  await assert.rejects(as(coach,`SELECT public.sdl_004_set_recording_permission('${enrollment}',true,'forged')`),/Not authorized/);
 });
 await isolated('coach private uploads use separate recording/storage permissions, independent of sharing consent',async()=>{
  const [denied]=await as(coach,`SELECT public.sdl_004_submission_can_submit('${player}') AS allowed`);assert.equal(denied.allowed,false);
  await as(adminUser,`SELECT public.sdl_004_set_recording_permission('${enrollment}',true,'synthetic-recording-authorization')`);await withdraw();
  const id=await upload(coach);assert.equal(await canRead(id,coach),true);assert.equal(await canRead(id,parent),true);assert.equal(await canRead(id),false);
  const [row]=await as(coach,`SELECT * FROM public.sdl_004_list_submissions('${player}') WHERE id='${id}'`);assert.equal(row.status,'approved');assert.deepEqual(row.publication_team_ids,[]);
  await grant();await publish(id);assert.equal(await canRead(id),true);
 });
 await isolated('dual parent-coach uploads still require another coach approval',async()=>{
  await owner(`INSERT INTO public.athlete_guardians VALUES('${athlete}','${coach}','verified')`);
  const id=await upload(coach);const [row]=await as(coach,`SELECT * FROM public.sdl_004_list_submissions('${player}') WHERE id='${id}'`);
  assert.equal(row.status,'pending');assert.equal(row.source_kind,'parent');
  await assert.rejects(as(coach,`SELECT public.sdl_004_review_submission('${id}','approved','self')`),/Not authorized/);
  await assert.rejects(publish(id),/Approval/);
 });
 await isolated('player identifier reuse cannot expose old metadata or permit review to a new family',async()=>{
  await owner(`UPDATE public.players SET athlete_id='${peerAthlete}' WHERE id='${player}'`);
  assert.equal((await as(teammate,`SELECT * FROM public.sdl_004_list_submissions('${player}')`)).length,0);
  await assert.rejects(as(coach,`SELECT public.sdl_004_review_submission('${video}','rejected','wrong athlete')`),/Not authorized/);
  assert.equal(await canRead(video),false);
 });
 await isolated('parent-submitted videos need approval and deliberate publication; consent alone cannot publish',async()=>{
  const id=await upload();await assert.rejects(publish(id),/Approval/);
  await assert.rejects(as(parent,`SELECT public.sdl_004_review_submission('${id}','approved','forged')`),/Not authorized/);
  await as(coach,`SELECT public.sdl_004_review_submission('${id}','approved','Checked')`);assert.equal(await canRead(id),false);
  await publish(id);assert.equal(await canRead(id),true);
 });
 for(const entity of ['guardian','profile'])await isolated(`${entity} revocation and reactivation cannot revive standing consent`,async()=>{
  if(entity==='guardian'){await owner(`UPDATE public.athlete_guardians SET status='revoked' WHERE user_id='${parent}'`);await owner(`UPDATE public.athlete_guardians SET status='verified' WHERE user_id='${parent}'`);}
  else{await owner(`UPDATE public.profiles SET status='suspended' WHERE id='${parent}'`);await owner(`UPDATE public.profiles SET status='active' WHERE id='${parent}'`);}
  assert.equal((await consent()).consent_active,false);assert.equal(await canRead(video),false);
 });
 await isolated('expired/revoked sessions cannot consent, publish, review, or play',async()=>{
  await owner(`DELETE FROM auth.sessions WHERE user_id IN ('${parent}','${coach}','${teammate}')`);
  await assert.rejects(grant(),/Not authorized/);await assert.rejects(publish(video),/Not authorized/);assert.equal(await canRead(video,parent),false);assert.equal(await canRead(video),false);
 });
 await isolated('an interrupted parent upload finalized after a rejoin cannot inherit the new enrollment consent',async()=>{
  const key=uuid(401),claim=uuid(402);const r=(await as(parent,`SELECT public.sdl_004_reserve_submission('${player}','${key}','${claim}','${'c'.repeat(64)}',12,'throwing') AS r`))[0].r;
  await as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${org}','ended','${enrollment}')`);
  await as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${org}','active','${enrollment}')`);await grant();
  await db.exec('RESET ROLE;SET ROLE service_role');await db.query(`SELECT public.sdl_004_finish_submission('${key}','${claim}','${parent}')`);
  await as(coach,`SELECT public.sdl_004_review_submission('${r.id}','approved','Checked')`);
  await assert.rejects(publish(r.id),/consent/);assert.equal(await canRead(r.id,parent),true);assert.equal(await canRead(r.id),false);
 });
 await isolated('audit, consent, enrollment and publication tables deny direct authenticated/service mutation',async()=>{
  await assert.rejects(as(parent,'UPDATE public.sdl_club_consents SET withdrawn_at=null'),/permission denied/);
  await db.exec('RESET ROLE;SET ROLE service_role');await assert.rejects(db.exec('UPDATE public.sdl_club_consent_events SET action=action'),/permission denied/);
 });
});
