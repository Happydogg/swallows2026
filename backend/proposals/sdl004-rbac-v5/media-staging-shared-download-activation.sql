BEGIN;
SET LOCAL lock_timeout='5s';
DO $g$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations)<>'20261127144514' OR (SELECT count(*) FROM sdl_rbac_v5.staging_media_fixtures)<>21 THEN RAISE EXCEPTION 'Download baseline drift'; END IF; END;$g$;
GRANT EXECUTE ON FUNCTION public.sdl_v5_authorize_shared_download(uuid,uuid) TO authenticated;
DO $g$ BEGIN IF has_function_privilege('anon','public.sdl_v5_authorize_shared_download(uuid,uuid)','execute') OR has_function_privilege('service_role','public.sdl_v5_authorize_shared_download(uuid,uuid)','execute') OR has_function_privilege('authenticated','public.sdl_v5_authorize_download(uuid)','execute') THEN RAISE EXCEPTION 'Unexpected grant'; END IF; END;$g$;
COMMIT;
