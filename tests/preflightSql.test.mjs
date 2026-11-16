// Read-only preflight executed against isolated local PostgreSQL/WASM fixtures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pilotDatabase} from './helpers/submissionDatabase.mjs';
const runtime=process.env.SDL004_PGLITE_RUNTIME;
const sql=fs.readFileSync(new URL('../backend/release/staging-preflight.sql',import.meta.url),'utf8');
test('staging preflight fails closed on missing dependencies, partial migrations and history drift',{skip:!runtime},async t=>{
 const db=await pilotDatabase(t,runtime);
 await db.exec(`CREATE TABLE public.sessions(id uuid); CREATE TABLE public.drill_videos(id uuid);
 ALTER TABLE public.players ENABLE ROW LEVEL SECURITY; ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY; ALTER TABLE public.drill_videos ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON FUNCTION public.sdl_004_media_can_access(uuid,text) FROM PUBLIC,anon;
 GRANT EXECUTE ON FUNCTION public.sdl_004_media_can_access(uuid,text) TO authenticated;
 SET sdl004.confirmed_project_ref='wvurolqbjhuckkkjiiiv';SET sdl004.expected_migration_history='{"exists":false,"versions":[]}';`);
 const pass=await db.exec(sql);assert.ok(pass.some(result=>result.rows?.some(row=>row.preflight==='PASS')));
 const cases=[
  ['missing explicit project',`SET sdl004.confirmed_project_ref=''`,/project confirmation/],
  ['wrong project',`SET sdl004.confirmed_project_ref='other'`,/project confirmation/],
  ['missing reviewed history',`SET sdl004.expected_migration_history=''`,/migration-history/],
  ['only submissions table exists','CREATE TABLE public.sdl_video_submissions(id uuid)',/both new tables/],
  ['only reservation table exists','CREATE TABLE public.sdl_submission_uploads(id uuid)',/both new tables/],
  ['leftover membership generation','ALTER TABLE public.player_team_memberships ADD COLUMN sdl_consent_epoch uuid',/drift/],
  ['missing pilot dependency','DROP TABLE public.drill_videos',/dependency/],
  ['incompatible dependency column','ALTER TABLE public.sdl_media_objects ALTER COLUMN byte_size TYPE integer',/dependency/],
  ['missing pilot RPC','DROP FUNCTION public.sdl_004_media_can_access(uuid,text)',/RPC contract/],
  ['anonymous pilot grant','GRANT EXECUTE ON FUNCTION public.sdl_004_media_can_access(uuid,text) TO anon',/RPC grants/],
  ['private media table grant','GRANT SELECT ON public.sdl_media_objects TO authenticated',/private-table/],
  ['disabled pilot RLS','ALTER TABLE public.players DISABLE ROW LEVEL SECURITY',/RLS/],
  ['unexpected migration history',`CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text)`,/presence differs/]
 ];
 for(const [name,mutation,error]of cases)await t.test(name,async()=>{
  await db.exec('BEGIN');await db.exec(mutation);
  // Keep mutations in an outer transaction; the preflight's own transaction commands
  // are stripped only here so a failure can be rolled back without rebuilding the fixture.
  await assert.rejects(db.exec(sql.replace('BEGIN READ ONLY;','').replace(/COMMIT;\s*$/,'')),error);
  await db.exec('ROLLBACK');
 });
 await t.test('reviewed exact migration history passes but stale or applied history fails',async()=>{
  await db.exec(`CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text);INSERT INTO supabase_migrations.schema_migrations VALUES('20261101000000');
  SET sdl004.expected_migration_history='{"exists":true,"versions":["20261101000000"]}';`);
  await db.exec(sql);
  await db.exec(`INSERT INTO supabase_migrations.schema_migrations VALUES('20261102000000')`);
  await assert.rejects(db.exec(sql),/versions differ/);await db.exec('ROLLBACK');
  await db.exec(`SET sdl004.expected_migration_history='{"exists":true,"versions":["20261101000000","20261102000000","20261116184847"]}';INSERT INTO supabase_migrations.schema_migrations VALUES('20261116184847')`);
  await assert.rejects(db.exec(sql),/release already recorded/);await db.exec('ROLLBACK');
 });
});
