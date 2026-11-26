-- Read-only. Run on an isolated candidate first. Stop on any exception.
BEGIN READ ONLY;
DO $check$
DECLARE r record; role_name text;
BEGIN
 IF to_regprocedure('public.sdl_v5_private_statistics(uuid,uuid,integer)') IS NULL OR
 to_regprocedure('public.sdl_v5_approve_transfer(uuid,text,text,text)') IS NULL THEN
   RAISE EXCEPTION 'Missing v5 migrations'; END IF;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_schema_privilege(role_name,'sdl_rbac_v5','USAGE,CREATE') THEN RAISE EXCEPTION 'Private schema exposed'; END IF;
   FOR r IN SELECT oid FROM pg_class WHERE relnamespace='sdl_rbac_v5'::regnamespace AND relkind='r' LOOP
     IF has_table_privilege(role_name,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR
     has_any_column_privilege(role_name,r.oid,'SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Private table grant'; END IF;
   END LOOP;
 END LOOP;
 FOR r IN SELECT oid,prosecdef,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND starts_with(proname,'sdl_v5_') LOOP
   IF NOT r.prosecdef OR NOT coalesce('search_path=""'=ANY(r.proconfig),false) OR
   has_function_privilege('anon',r.oid,'EXECUTE') OR has_function_privilege('service_role',r.oid,'EXECUTE') OR
   NOT has_function_privilege('authenticated',r.oid,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected RPC privileges: %',r.oid::regprocedure; END IF;
 END LOOP;
 IF to_regprocedure('sdl_rbac_v5.platform_allowed(text)') IS NULL
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['profiles','players','sessions','athletes','athlete_guardians',
 'organizations','teams','organization_memberships','team_memberships','player_team_memberships','sdl_media_objects']) AS relation(name)
 WHERE NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=to_regclass('public.'||relation.name)
 AND p.polname='sdl_p1_active_account' AND NOT p.polpermissive AND p.polcmd='*')) THEN
   RAISE EXCEPTION 'Missing P1 assurance or restrictive core policy'; END IF;
 IF EXISTS(SELECT 1 FROM sdl_rbac_v5.platform_admin_grants) THEN RAISE EXCEPTION 'Fresh installation must not seed platform grants'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='sdl_rbac_v5.events'::regclass AND tgname='immutable_event' AND tgenabled='O') THEN
   RAISE EXCEPTION 'Missing audit integrity trigger'; END IF;
END;
$check$;
ROLLBACK;
