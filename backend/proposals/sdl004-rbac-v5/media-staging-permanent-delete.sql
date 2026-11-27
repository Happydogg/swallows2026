-- SDL-004B-RBAC-05 permanent deletion: staging only, future authorized actions only.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
BEGIN
 IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20261127130854' THEN RAISE EXCEPTION 'Staging ledger drift'; END IF;
 IF (SELECT count(*) FROM sdl_rbac_v5.staging_media_fixtures)<>15 THEN RAISE EXCEPTION 'Fixture drift'; END IF;
END; $preflight$;
CREATE TABLE sdl_rbac_v5.media_purge_queue(
 id uuid PRIMARY KEY REFERENCES public.sdl_video_submissions(id),
 player_id uuid NOT NULL REFERENCES public.players(id),
 object_key text NOT NULL UNIQUE,
 requested_at timestamptz NOT NULL DEFAULT now(),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 confirmed_at timestamptz,
 rechecked_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 CHECK(object_key='pilot/'||player_id::text||'/'||id::text||'.mp4'),
 CHECK(rechecked_at IS NULL OR confirmed_at IS NOT NULL)
);
ALTER TABLE sdl_rbac_v5.media_purge_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sdl_rbac_v5.media_purge_queue FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX media_purge_due ON sdl_rbac_v5.media_purge_queue(next_attempt_at) WHERE rechecked_at IS NULL;
-- Existing permission helper remains unchanged. Direct RPC callers cannot bypass queue creation.
CREATE OR REPLACE FUNCTION public.sdl_v5_archive_media(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $archive$
DECLARE s public.sdl_video_submissions%ROWTYPE; m public.sdl_media_objects%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.sdl_video_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Media removal not authorized' USING ERRCODE='42501'; END IF;
 -- A retry of the same already-authorized operation may finish cleanup, never expose media.
 IF s.archived_at IS NOT NULL AND s.archived_by=auth.uid() AND sdl_rbac_v5.active_actor()
   AND EXISTS(SELECT 1 FROM sdl_rbac_v5.media_purge_queue q WHERE q.id=s.id) THEN RETURN true; END IF;
 IF NOT sdl_rbac_v5.can_archive_media(p_id) THEN RAISE EXCEPTION 'Media removal not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM public.sdl_media_objects WHERE id=s.id AND player_id=s.player_id;
 IF NOT FOUND OR m.object_key IS DISTINCT FROM 'pilot/'||s.player_id::text||'/'||s.id::text||'.mp4'
 OR NOT EXISTS(SELECT 1 FROM public.sdl_submission_uploads r WHERE r.id=s.id AND r.player_id=s.player_id AND r.completed AND r.clean_start IS TRUE)
 THEN RAISE EXCEPTION 'Invalid removal metadata' USING ERRCODE='PT409'; END IF;
 UPDATE public.sdl_video_submissions SET archived_at=now(),archived_by=auth.uid(),
  publication_team_ids=ARRAY[]::uuid[],publication_consent_id=NULL,
  history=history||jsonb_build_array(jsonb_build_object('action','archived','actor',auth.uid(),'at',now()))
 WHERE id=p_id;
 INSERT INTO sdl_rbac_v5.media_purge_queue(id,player_id,object_key) VALUES(s.id,s.player_id,m.object_key);
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 VALUES(auth.uid(),'media_archived',s.organization_id,s.player_id,s.id,'Private video removed; physical deletion queued');
 RETURN true;
END; $archive$;

-- Service-only job lookup: queue entries are immutable, no caller-provided object path.
CREATE FUNCTION public.sdl_v5_media_purge_jobs(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $jobs$
 SELECT coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb) FROM (
 SELECT q.id,q.player_id,q.object_key,(q.confirmed_at IS NOT NULL) AS confirmed,
 (q.rechecked_at IS NULL AND q.next_attempt_at<=now()) AS due
 FROM sdl_rbac_v5.media_purge_queue q
 JOIN public.sdl_video_submissions s ON s.id=q.id AND s.player_id=q.player_id
 JOIN public.sdl_media_objects m ON m.id=q.id AND m.player_id=q.player_id AND m.object_key=q.object_key
 WHERE s.clean_start IS TRUE AND s.archived_at IS NOT NULL AND cardinality(s.publication_team_ids)=0
 AND ((p_id IS NOT NULL AND q.id=p_id) OR (p_id IS NULL AND q.rechecked_at IS NULL AND q.next_attempt_at<=now()))
 ORDER BY q.next_attempt_at,q.id LIMIT 10
 ) j;
$jobs$;
CREATE FUNCTION public.sdl_v5_record_media_purge(p_id uuid,p_absent boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $record$
DECLARE q sdl_rbac_v5.media_purge_queue%ROWTYPE; s public.sdl_video_submissions%ROWTYPE;
BEGIN
 SELECT * INTO q FROM sdl_rbac_v5.media_purge_queue WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO s FROM public.sdl_video_submissions WHERE id=q.id AND player_id=q.player_id AND clean_start IS TRUE AND archived_at IS NOT NULL AND cardinality(publication_team_ids)=0;
 IF NOT FOUND THEN RETURN false; END IF;
 IF q.rechecked_at IS NOT NULL THEN RETURN q.confirmed_at IS NOT NULL; END IF;
 IF p_absent IS DISTINCT FROM true THEN
  -- If another request already succeeded, don't undo its confirmation.
  IF q.next_attempt_at<=now() THEN UPDATE sdl_rbac_v5.media_purge_queue SET attempts=attempts+1,next_attempt_at=now()+interval '5 minutes' WHERE id=p_id; END IF;
  RETURN false;
 END IF;
 IF q.confirmed_at IS NULL THEN
  UPDATE sdl_rbac_v5.media_purge_queue SET confirmed_at=now(),attempts=attempts+1,
   next_attempt_at=greatest(now()+interval '10 minutes',coalesce((SELECT lease_until+interval '5 minutes' FROM public.sdl_submission_uploads WHERE id=q.id),now()))
   WHERE id=p_id;
  INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
  VALUES(s.archived_by,'media_permanently_deleted',s.organization_id,s.player_id,s.id,'Private R2 object confirmed absent');
 ELSIF q.next_attempt_at<=now() THEN
  UPDATE sdl_rbac_v5.media_purge_queue SET rechecked_at=now(),attempts=attempts+1 WHERE id=p_id;
 END IF;
 RETURN true;
END; $record$;
REVOKE ALL ON FUNCTION public.sdl_v5_media_purge_jobs(uuid),public.sdl_v5_record_media_purge(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_media_purge_jobs(uuid),public.sdl_v5_record_media_purge(uuid,boolean) TO service_role;
DO $postflight$
DECLARE f regprocedure;
BEGIN
 FOREACH f IN ARRAY ARRAY['public.sdl_v5_media_purge_jobs(uuid)'::regprocedure,'public.sdl_v5_record_media_purge(uuid,boolean)'::regprocedure] LOOP
 IF has_function_privilege('authenticated',f,'EXECUTE') OR has_function_privilege('anon',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected purge RPC grant'; END IF;
 END LOOP;
 IF NOT has_function_privilege('authenticated','public.sdl_v5_archive_media(uuid)','EXECUTE') OR has_function_privilege('anon','public.sdl_v5_archive_media(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.sdl_v5_authorize_download(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Existing permissions drift'; END IF;
 IF EXISTS(SELECT 1 FROM sdl_rbac_v5.media_purge_queue) THEN RAISE EXCEPTION 'Retroactive purge prohibited'; END IF;
END; $postflight$;
COMMIT;
