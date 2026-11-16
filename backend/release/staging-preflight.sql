-- READ ONLY. Review/run only in the confirmed staging project, never production.
BEGIN READ ONLY;
SELECT to_regclass('public.players') AS players,
 to_regclass('public.sdl_media_objects') AS pilot_media,
 to_regprocedure('public.sdl_004_media_can_access(uuid,text)') AS pilot_authorization,
 to_regclass('public.sdl_video_submissions') AS new_submissions_must_be_null;
SELECT 'players' AS relation,count(*) AS preserved_count FROM public.players
UNION ALL SELECT 'sessions',count(*) FROM public.sessions
UNION ALL SELECT 'drill_videos',count(*) FROM public.drill_videos
UNION ALL SELECT 'sdl_media_objects',count(*) FROM public.sdl_media_objects;
SELECT n.nspname,p.proname,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='sdl_004_media_can_access';
COMMIT;
