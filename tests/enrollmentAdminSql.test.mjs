// Actual local PostgreSQL/WASM with synthetic records. No live SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {clubWorkflow,enrollment,adminUser,secondClubEnrollment} from './helpers/clubWorkflow.mjs';
import {uuid,parent,coach,outsider,player,org,otherOrg,athlete,team} from './helpers/submissionDatabase.mjs';
const runtime=process.env.SDL004_PGLITE_RUNTIME;
test('manual enrollment administration: organization authorization, privacy and existing mutation contracts',{skip:!runtime},async t=>{
 const {as,owner,grant}=await clubWorkflow(t,runtime);
 const list=id=>as(adminUser,`SELECT * FROM public.sdl_004_admin_enrollments('${id}')`);
 async function isolated(name,work){await t.test(name,async()=>{await owner('BEGIN');try{await work();}finally{await owner('ROLLBACK');}});}
 await isolated('only active organization admins discover clubs and read minimal enrollment summaries',async()=>{
  assert.deepEqual((await as(adminUser,'SELECT * FROM public.sdl_004_admin_organizations()')).map(o=>o.id),[org]);
  for(const who of[parent,coach,outsider]){assert.equal((await as(who,'SELECT * FROM public.sdl_004_admin_organizations()')).length,0);await assert.rejects(as(who,`SELECT * FROM public.sdl_004_admin_enrollments('${org}')`),/Not authorized/);}
  const row=(await list(org)).find(r=>r.athlete_id===athlete);assert.equal(row.enrollment_id,enrollment);assert.equal(row.consent_active,false);assert.equal(row.recording_active,false);
  assert.deepEqual(Object.keys(row).sort(),['athlete_id','preferred_name','organization_id','enrollment_id','generation','status','started_at','ended_at','recording_storage_authorized','recording_active','recording_permission_ref','consent_active','consent_policy_version'].sort());
 });
 await isolated('cross-organization reads and enrollment/recording mutations are denied at the RPC boundary',async()=>{
  await assert.rejects(list(otherOrg),/Not authorized/);
  await assert.rejects(as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${otherOrg}','ended','${secondClubEnrollment}')`),/Not authorized/);
  await assert.rejects(as(adminUser,`SELECT public.sdl_004_set_recording_permission('${secondClubEnrollment}',true,'foreign evidence')`),/Not authorized/);
  await assert.rejects(as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${org}','ended','${secondClubEnrollment}')`),/Not authorized/);
 });
 await isolated('multiple authorized organizations remain independently scoped',async()=>{
  await owner(`INSERT INTO public.organization_memberships VALUES('${otherOrg}','${adminUser}','active','admin')`);
  assert.equal((await as(adminUser,'SELECT * FROM public.sdl_004_admin_organizations()')).length,2);
  const first=await list(org),second=await list(otherOrg);assert.ok(first.length);assert.ok(second.length);
  assert.ok(first.every(r=>r.organization_id===org));assert.ok(second.every(r=>r.organization_id===otherOrg));
  assert.ok(!first.some(r=>r.enrollment_id===secondClubEnrollment));assert.ok(!second.some(r=>r.enrollment_id===enrollment));
 });
 await isolated('existing player profiles without enrollment can be manually enrolled without any automatic consent',async()=>{
  const child=uuid(75);await owner(`INSERT INTO public.players(id,athlete_id,organization_id,preferred_name)VALUES('${uuid(76)}','${child}','${org}','New athlete')`);
  let row=(await list(org)).find(r=>r.athlete_id===child);assert.equal(row.status,'not_enrolled');assert.equal(row.enrollment_id,null);
  await as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${child}','${org}','active')`);
  row=(await list(org)).find(r=>r.athlete_id===child);assert.equal(row.status,'active');assert.ok(row.generation);assert.equal(row.consent_active,false);assert.equal(row.recording_storage_authorized,false);
 });
 await isolated('team transfers preserve enrollment and consent; departure and same-ID rejoin require fresh guardian consent',async()=>{
  await grant();const before=(await list(org)).find(r=>r.athlete_id===athlete);assert.equal(before.consent_active,true);
  await owner(`UPDATE public.player_team_memberships SET status='inactive' WHERE player_id='${player}'`);
  let row=(await list(org)).find(r=>r.athlete_id===athlete);assert.equal(row.generation,before.generation);assert.equal(row.consent_active,true);
  await as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${org}','inactive','${enrollment}')`);
  assert.equal((await list(org)).find(r=>r.athlete_id===athlete).consent_active,false);
  await as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${org}','ended','${enrollment}')`);
  await as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${org}','active','${enrollment}')`);
  row=(await list(org)).find(r=>r.athlete_id===athlete);assert.equal(row.enrollment_id,enrollment);assert.notEqual(row.generation,before.generation);assert.equal(row.consent_active,false);
  await assert.rejects(as(adminUser,`SELECT public.sdl_004_club_consent('${enrollment}','${row.generation}',true,'sdl004-clubhouse-v1')`),/Not authorized/);
 });
 await isolated('recording grants and revocations require evidence, remain separate from sharing consent and are reset on departure',async()=>{
  for(const evidence of['','   '])await assert.rejects(as(adminUser,`SELECT public.sdl_004_set_recording_permission('${enrollment}',true,'${evidence}')`),/reference required/);
  await as(adminUser,`SELECT public.sdl_004_set_recording_permission('${enrollment}',true,'case-123')`);
  let row=(await list(org)).find(r=>r.athlete_id===athlete);assert.equal(row.recording_active,true);assert.equal(row.recording_permission_ref,'case-123');assert.equal(row.consent_active,false);
  await assert.rejects(as(adminUser,`SELECT public.sdl_004_set_recording_permission('${enrollment}',false,'')`),/reference required/);
  await as(adminUser,`SELECT public.sdl_004_set_recording_permission('${enrollment}',false,'revoke-case-123')`);
  row=(await list(org)).find(r=>r.athlete_id===athlete);assert.equal(row.recording_active,false);assert.equal(row.recording_permission_ref,'revoke-case-123');
  await as(adminUser,`SELECT public.sdl_004_set_recording_permission('${enrollment}',true,'case-456')`);
  await as(adminUser,`SELECT public.sdl_004_set_club_enrollment('${athlete}','${org}','ended','${enrollment}')`);
  row=(await list(org)).find(r=>r.athlete_id===athlete);assert.equal(row.recording_storage_authorized,false);assert.equal(row.recording_permission_ref,'');
 });
 await isolated('search is literal, groups club profiles per athlete and excludes other organization names',async()=>{
  await owner(`UPDATE public.players SET preferred_name='Ada % Junior' WHERE id='${player}'`);
  const rows=await as(adminUser,`SELECT * FROM public.sdl_004_admin_enrollments('${org}','%')`);assert.equal(rows.length,1);assert.equal(rows[0].athlete_id,athlete);
  await assert.rejects(as(adminUser,`SELECT * FROM public.sdl_004_admin_enrollments('${org}','${'a'.repeat(101)}')`),/Invalid search/);
 });
 await isolated('revoked administrator membership and expired sessions immediately deny reads and mutations',async()=>{
  await owner(`UPDATE public.organization_memberships SET status='inactive' WHERE user_id='${adminUser}'`);
  assert.equal((await as(adminUser,'SELECT * FROM public.sdl_004_admin_organizations()')).length,0);await assert.rejects(list(org),/Not authorized/);
  await assert.rejects(as(adminUser,`SELECT public.sdl_004_set_recording_permission('${enrollment}',true,'case')`),/Not authorized/);
  await owner(`UPDATE public.organization_memberships SET status='active' WHERE user_id='${adminUser}'`);await owner(`DELETE FROM auth.sessions WHERE user_id='${adminUser}'`);await assert.rejects(list(org),/Not authorized/);
 });
});
