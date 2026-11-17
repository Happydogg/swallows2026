-- READ ONLY. Catalog/privileged counts do not prove browser authorization.
BEGIN READ ONLY;
SELECT 'players' AS relation,count(*) AS preserved_count FROM public.players
UNION ALL SELECT 'sessions',count(*) FROM public.sessions
UNION ALL SELECT 'drill_videos',count(*) FROM public.drill_videos
UNION ALL SELECT 'sdl_media_objects',count(*) FROM public.sdl_media_objects;
SELECT role_name,
 has_table_privilege(role_name,'public.sdl_video_submissions','SELECT') AS direct_select_must_be_false,
 has_table_privilege(role_name,'public.sdl_video_submissions','INSERT') AS direct_insert_must_be_false,
 has_table_privilege(role_name,'public.sdl_submission_uploads','UPDATE') AS direct_update_must_be_false,
 has_function_privilege(role_name,'public.sdl_004_finish_submission(uuid,uuid,uuid)','EXECUTE') AS finalize_must_be_false
FROM (VALUES ('anon'),('authenticated')) roles(role_name);
SELECT relname,relrowsecurity FROM pg_class WHERE oid IN
 ('public.sdl_video_submissions'::regclass,'public.sdl_submission_uploads'::regclass,'public.sdl_club_enrollments'::regclass,'public.sdl_club_consents'::regclass,'public.sdl_club_consent_events'::regclass,'public.sdl_statistic_consents'::regclass,'public.sdl_official_statistics'::regclass);
SELECT role_name,relation,
 has_table_privilege(role_name,relation,'INSERT,UPDATE,DELETE,TRUNCATE') AS direct_mutation_must_be_false
FROM (VALUES ('anon'),('authenticated'),('service_role')) roles(role_name)
CROSS JOIN (VALUES ('public.sdl_club_enrollments'),('public.sdl_club_consents'),('public.sdl_club_consent_events'),('public.sdl_statistic_consents'),('public.sdl_official_statistics')) tables(relation);
SELECT role_name,relation,has_table_privilege(role_name,relation,'SELECT') AS direct_read_must_be_false
FROM (VALUES ('anon'),('authenticated')) roles(role_name)
CROSS JOIN (VALUES ('public.sdl_statistic_consents'),('public.sdl_official_statistics')) tables(relation);
SELECT public.sdl_004_submission_contract() AS authenticated_contract_must_include_safe_statistics;
-- With an owner connection the contract is null. Verify flags with synthetic authenticated users.
COMMIT;
