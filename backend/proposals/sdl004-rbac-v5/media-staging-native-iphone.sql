-- SDL-005 / SDL-004 staging native iPhone video support. Hosted staging only.
-- Existing object keys retain the legacy opaque .mp4 suffix. Actual MIME is authoritative.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
BEGIN
 IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20261127124823' THEN
   RAISE EXCEPTION 'Unexpected staging ledger; stop';
 END IF;
 IF (SELECT count(*) FROM sdl_rbac_v5.staging_media_fixtures)<>15 THEN RAISE EXCEPTION 'Unexpected staging fixture scope'; END IF;
 IF EXISTS(SELECT 1 FROM public.sdl_submission_uploads WHERE NOT completed) THEN RAISE EXCEPTION 'Outstanding upload; retry after completion'; END IF;
END; $preflight$;
ALTER TABLE public.sdl_media_objects DROP CONSTRAINT sdl_media_objects_content_type_check,
 ADD CONSTRAINT sdl_media_objects_content_type_check CHECK(content_type IN ('video/mp4','video/quicktime')),
 DROP CONSTRAINT sdl_media_objects_byte_size_check,
 ADD CONSTRAINT sdl_media_objects_byte_size_check CHECK(byte_size>0 AND byte_size<=41943040);
ALTER TABLE public.sdl_submission_uploads DROP CONSTRAINT sdl_submission_uploads_byte_size_check,
 ADD CONSTRAINT sdl_submission_uploads_byte_size_check CHECK(byte_size>0 AND byte_size<=41943040);
-- The trusted Worker identifies the container from its bytes before reservation.
-- Delegate all existing claim, session, role, enrollment, consent and clean-start checks.
-- Update MIME in the same transaction as finalization; no file rewrite or relabeling of completed records.
CREATE FUNCTION public.sdl_v5_finish_quicktime(p_request_key uuid,p_claim uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $mov$
DECLARE r public.sdl_submission_uploads%ROWTYPE; receipt jsonb;
BEGIN
 SELECT * INTO r FROM public.sdl_submission_uploads
 WHERE user_id=p_user_id AND request_key=p_request_key FOR UPDATE;
 IF NOT FOUND OR r.claim IS DISTINCT FROM p_claim THEN RAISE EXCEPTION 'Upload conflict' USING ERRCODE='PT409'; END IF;
 IF r.completed AND NOT EXISTS(SELECT 1 FROM public.sdl_media_objects m WHERE m.id=r.id AND m.content_type='video/quicktime') THEN
   RAISE EXCEPTION 'Completed upload format conflict' USING ERRCODE='PT409';
 END IF;
 receipt:=public.sdl_004_finish_submission(p_request_key,p_claim,p_user_id);
 IF NOT r.completed THEN
   UPDATE public.sdl_media_objects SET content_type='video/quicktime' WHERE id=r.id AND player_id=r.player_id AND content_type='video/mp4';
   IF NOT FOUND THEN RAISE EXCEPTION 'Missing media metadata' USING ERRCODE='PT409'; END IF;
 END IF;
 RETURN receipt;
END; $mov$;
REVOKE ALL ON FUNCTION public.sdl_v5_finish_quicktime(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_finish_quicktime(uuid,uuid,uuid) TO service_role;
DO $postflight$
BEGIN
 IF has_function_privilege('authenticated','public.sdl_v5_finish_quicktime(uuid,uuid,uuid)','EXECUTE') OR has_function_privilege('anon','public.sdl_v5_finish_quicktime(uuid,uuid,uuid)','EXECUTE') OR NOT has_function_privilege('service_role','public.sdl_v5_finish_quicktime(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Unexpected MOV finalizer grants'; END IF;
 IF has_function_privilege('authenticated','public.sdl_v5_authorize_download(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.sdl_004_publish_submission(uuid,uuid[],uuid[])','EXECUTE') THEN RAISE EXCEPTION 'Sharing hold changed'; END IF;
END; $postflight$;
COMMIT;
