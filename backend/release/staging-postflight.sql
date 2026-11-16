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
 ('public.sdl_video_submissions'::regclass,'public.sdl_submission_uploads'::regclass);
COMMIT;
