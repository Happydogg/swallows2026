-- READ ONLY, fail closed. Use run-staging-preflight.mjs with explicit staging confirmation.
-- The runner validates the dedicated staging host/TLS and supplies reviewed migration history.
BEGIN READ ONLY;
DO $preflight$
DECLARE dependency record; actual_exists boolean; expected jsonb; actual_versions jsonb;
BEGIN
 IF current_setting('sdl004.confirmed_project_ref',true) IS DISTINCT FROM 'wvurolqbjhuckkkjiiiv' THEN
   RAISE EXCEPTION 'SDL004 preflight: explicit staging project confirmation missing or wrong';
 END IF;
 expected=nullif(current_setting('sdl004.expected_migration_history',true),'')::jsonb;
 IF expected IS NULL OR jsonb_typeof(expected->'exists') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(expected->'versions') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'SDL004 preflight: reviewed migration-history expectation required';
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['public.sdl_video_submissions','public.sdl_submission_uploads','public.sdl_club_enrollments','public.sdl_club_consents','public.sdl_club_consent_events','public.sdl_statistic_consents','public.sdl_official_statistics','public.sdl_guardian_invitations','public.sdl_growth_events','public.sdl_performance_submissions','public.sdl_pilot_events','public.sdl_staff_permissions','public.sdl_measurement_protocols']) name WHERE to_regclass(name) IS NOT NULL) THEN
   RAISE EXCEPTION 'SDL004 preflight: all new workflow tables must be absent; existing or partial deployment detected';
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='player_team_memberships' AND column_name='sdl_consent_epoch')
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
   AND (p.proname=ANY(ARRAY['sdl_004_admin_organizations','sdl_004_admin_enrollments','sdl_004_session_active','sdl_004_guardian_for','sdl_004_coach_for','sdl_004_guardian_athlete','sdl_004_club_admin','sdl_004_coach_team','sdl_004_recording_allowed','sdl_004_submission_can_submit','sdl_004_submission_is_guardian','sdl_004_submission_can_review','sdl_004_clubhouse_member','sdl_004_set_club_enrollment','sdl_004_set_recording_permission','sdl_004_active_club_consent','sdl_004_club_consent','sdl_004_list_club_consents','sdl_004_enrollment_lifecycle','sdl_004_immutable_consent_audit','sdl_004_guardian_consent_lifecycle','sdl_004_reserve_submission','sdl_004_finish_submission','sdl_004_review_submission','sdl_004_submission_can_publish','sdl_004_publish_submission','sdl_004_clubhouse_visible','sdl_004_submission_can_read','sdl_004_list_submissions','sdl_004_review_queue','sdl_004_clubhouse_videos','sdl_004_submission_contract','sdl_004_workspace_players']) OR p.proname LIKE 'sdl_004_pilot_%' OR p.proname LIKE 'sdl_004_statistics_%' OR p.proname=ANY(ARRAY['sdl_004_clubhouse_roster','sdl_004_clubhouse_leaderboard','sdl_004_player_statistics','sdl_004_set_statistic_consent','sdl_004_list_statistic_consents','sdl_004_approve_statistics']) OR p.proname LIKE 'sdl_004_submission_%' OR p.proname LIKE 'sdl_004_invalidate_%'
   OR p.proname=ANY(ARRAY['sdl_004_admin_organizations','sdl_004_admin_enrollments','sdl_004_session_active','sdl_004_guardian_for','sdl_004_coach_for','sdl_004_clubhouse_member','sdl_004_clubhouse_videos','sdl_004_workspace_players','sdl_004_review_queue','sdl_004_review_submission','sdl_004_reserve_submission','sdl_004_finish_submission','sdl_004_advance_membership_consent_epoch']))) THEN
   RAISE EXCEPTION 'SDL004 preflight: release schema/function drift detected';
 END IF;
 FOR dependency IN SELECT * FROM (VALUES
  ('public','players','id','uuid'),('public','players','athlete_id','uuid'),('public','players','organization_id','uuid'),('public','players','preferred_name','text'),('public','players','jersey','text'),('public','players','position','text'),('public','players','throws','text'),('public','players','bats','text'),
  ('public','profiles','id','uuid'),('public','profiles','status','text'),
  ('public','organizations','id','uuid'),('public','organizations','status','text'),('public','organizations','name','text'),
  ('public','teams','id','uuid'),('public','teams','organization_id','uuid'),('public','teams','status','text'),('public','teams','name','text'),
  ('public','athlete_guardians','athlete_id','uuid'),('public','athlete_guardians','user_id','uuid'),('public','athlete_guardians','status','text'),
  ('public','team_memberships','team_id','uuid'),('public','team_memberships','user_id','uuid'),('public','team_memberships','role','text'),('public','team_memberships','status','text'),
  ('public','organization_memberships','organization_id','uuid'),('public','organization_memberships','user_id','uuid'),('public','organization_memberships','role','text'),('public','organization_memberships','status','text'),
  ('public','player_team_memberships','id','uuid'),('public','player_team_memberships','player_id','uuid'),('public','player_team_memberships','team_id','uuid'),('public','player_team_memberships','organization_id','uuid'),('public','player_team_memberships','status','text'),('public','player_team_memberships','start_date','date'),('public','player_team_memberships','end_date','date'),
  ('public','sdl_media_objects','id','uuid'),('public','sdl_media_objects','player_id','uuid'),('public','sdl_media_objects','uploaded_by','uuid'),('public','sdl_media_objects','object_key','text'),('public','sdl_media_objects','byte_size','bigint'),('public','sdl_media_objects','content_type','text'),('public','sdl_media_objects','created_at','timestamp with time zone'),
  ('public','sessions','id','uuid'),('public','sessions','player_id','uuid'),('public','sessions','session_date','date'),('public','sessions','exit_velo','numeric'),('public','sessions','throwing_velo','numeric'),('public','sessions','sprint_time','numeric'),('public','sessions','broad_jump','numeric'),('public','sessions','control_exit_velo','numeric'),('public','sessions','attack_angle','numeric'),('public','sessions','height_cm','numeric'),('public','sessions','weight_kg','numeric'),('public','drill_videos','id','uuid'),
  ('auth','users','id','uuid'),('auth','sessions','id','uuid'),('auth','sessions','user_id','uuid'),('auth','sessions','not_after','timestamp with time zone')
 ) deps(schema_name,table_name,column_name,data_type) LOOP
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema=dependency.schema_name
    AND c.table_name=dependency.table_name AND c.column_name=dependency.column_name AND c.data_type=dependency.data_type)
  OR NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=dependency.schema_name AND c.relname=dependency.table_name AND c.relkind IN ('r','p')) THEN
    RAISE EXCEPTION 'SDL004 preflight: missing or incompatible dependency %.%.%',dependency.schema_name,dependency.table_name,dependency.column_name;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid='public.sessions'::regclass AND i.indisunique
 AND i.indnkeyatts=1 AND i.indpred IS NULL AND i.indexprs IS NULL
 AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid='public.sessions'::regclass AND attname='id')) THEN
   RAISE EXCEPTION 'SDL004 preflight: sessions.id requires a unique dependency key';
 END IF;
 IF to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.jwt()') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.sdl_004_media_can_access(uuid,text)')
   AND prorettype='boolean'::regtype AND prosecdef AND provolatile='s') THEN
   RAISE EXCEPTION 'SDL004 preflight: required Auth or pilot RPC contract missing or incompatible';
 END IF;
 IF NOT has_function_privilege('authenticated','public.sdl_004_media_can_access(uuid,text)','EXECUTE')
 OR has_function_privilege('anon','public.sdl_004_media_can_access(uuid,text)','EXECUTE') THEN
   RAISE EXCEPTION 'SDL004 preflight: unexpected pilot authorization RPC grants';
 END IF;
 IF NOT has_schema_privilege(current_user,'public','CREATE') OR NOT has_table_privilege(current_user,'auth.sessions','SELECT')
 OR NOT has_table_privilege(current_user,'public.player_team_memberships','TRIGGER')
 OR NOT has_table_privilege(current_user,'public.athlete_guardians','TRIGGER')
 OR NOT has_table_privilege(current_user,'public.profiles','TRIGGER')
 OR NOT has_table_privilege(current_user,'public.sessions','TRIGGER')
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.player_team_memberships'::regclass AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN
   RAISE EXCEPTION 'SDL004 preflight: migration role lacks required owner/trigger/Auth permissions';
 END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('public.players'),('public.sessions'),('public.drill_videos'),('public.sdl_media_objects')) t(name)
   JOIN pg_class c ON c.oid=to_regclass(t.name) WHERE NOT c.relrowsecurity)
 OR EXISTS(SELECT 1 FROM (VALUES ('public.sessions'),('public.drill_videos'),('public.sdl_media_objects')) t(name)
   CROSS JOIN (VALUES ('anon'),('authenticated')) r(name)
   WHERE has_table_privilege(r.name,t.name,'SELECT,INSERT,UPDATE,DELETE')) THEN
   RAISE EXCEPTION 'SDL004 preflight: pilot RLS or private-table grants drifted';
 END IF;
 actual_exists=to_regclass('supabase_migrations.schema_migrations') IS NOT NULL;
 IF actual_exists IS DISTINCT FROM (expected->>'exists')::boolean THEN
   RAISE EXCEPTION 'SDL004 preflight: migration-history presence differs from reviewed expectation';
 END IF;
 IF actual_exists THEN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='supabase_migrations'
   AND table_name='schema_migrations' AND column_name='version' AND data_type='text') THEN
    RAISE EXCEPTION 'SDL004 preflight: incompatible migration-history schema';
  END IF;
  EXECUTE 'SELECT coalesce(jsonb_agg(version ORDER BY version),''[]''::jsonb) FROM supabase_migrations.schema_migrations' INTO actual_versions;
 ELSE actual_versions='[]'::jsonb; END IF;
 IF actual_versions IS DISTINCT FROM (SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) FROM jsonb_array_elements_text(expected->'versions'))
 OR actual_versions ? '20261116184847' OR actual_versions ? '20261117064603' THEN
   RAISE EXCEPTION 'SDL004 preflight: migration-history versions differ or release already recorded';
 END IF;
END;
$preflight$;
SELECT 'wvurolqbjhuckkkjiiiv' AS explicitly_confirmed_staging_project,'PASS' AS preflight;
SELECT 'players' AS relation,count(*) AS preserved_count FROM public.players
UNION ALL SELECT 'sessions',count(*) FROM public.sessions
UNION ALL SELECT 'drill_videos',count(*) FROM public.drill_videos
UNION ALL SELECT 'sdl_media_objects',count(*) FROM public.sdl_media_objects;
COMMIT;
