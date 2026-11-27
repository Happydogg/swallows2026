
-- Staging-only overlay: owner authorized mock media, never real parental consent.
-- Limit active upload and playback to the exact original deterministic DEMO fixtures.
-- No permission to share, review, download or physically delete.
BEGIN;
CREATE TABLE sdl_rbac_v5.staging_media_fixtures (
 player_id uuid PRIMARY KEY REFERENCES public.players(id),
 enrollment_id uuid NOT NULL REFERENCES public.sdl_club_enrollments(id),
 enrollment_generation uuid NOT NULL,
 authorized_at timestamptz NOT NULL DEFAULT now(),
 authorization_ref text NOT NULL CHECK (authorization_ref='SDL-004-MEDIA-STAGING: owner-approved fictional fixture only')
);
ALTER TABLE sdl_rbac_v5.staging_media_fixtures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sdl_rbac_v5.staging_media_fixtures FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO sdl_rbac_v5.staging_media_fixtures(player_id,enrollment_id,enrollment_generation,authorization_ref)
SELECT p.id,e.id,e.generation,'SDL-004-MEDIA-STAGING: owner-approved fictional fixture only'
FROM public.players p JOIN public.sdl_club_enrollments e
 ON e.athlete_id=p.athlete_id AND e.organization_id=p.organization_id
WHERE e.id=md5('SDL-004-FIXTURE-002:enrollment:'||p.id::text)::uuid
 AND p.organization_id='8f24e090-0ccc-4c10-a00d-ace7d53a190c'
 AND p.preferred_name LIKE 'DEMO %' AND e.status='active' AND e.ended_at IS NULL
 AND NOT e.recording_storage_authorized
 AND EXISTS(SELECT 1 FROM public.player_team_memberships ptm WHERE ptm.player_id=p.id
 AND ptm.team_id='2847fab3-d5b7-4120-9468-324700578b48' AND ptm.status='active' AND ptm.end_date IS NULL);
DO $fixture_guard$
BEGIN
 IF (SELECT count(*) FROM sdl_rbac_v5.staging_media_fixtures)<>15 THEN
   RAISE EXCEPTION 'Expected exactly 15 documented fictional DEMO enrollments';
 END IF;
 IF EXISTS(SELECT 1 FROM public.sdl_video_submissions) OR EXISTS(SELECT 1 FROM public.sdl_submission_uploads) THEN
   RAISE EXCEPTION 'Unexpected existing v5 media; stop';
 END IF;
END;
$fixture_guard$;

CREATE FUNCTION sdl_rbac_v5.staging_media_fixture(p_player uuid,p_enrollment uuid,p_generation uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $fixture_fn$
 SELECT EXISTS(SELECT 1 FROM sdl_rbac_v5.staging_media_fixtures f
 JOIN public.players p ON p.id=f.player_id
 JOIN public.sdl_club_enrollments e ON e.id=f.enrollment_id AND e.generation=f.enrollment_generation
 AND e.athlete_id=p.athlete_id AND e.organization_id=p.organization_id
 WHERE f.player_id=p_player AND f.enrollment_id=p_enrollment AND f.enrollment_generation=p_generation
 AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()
 AND e.recording_storage_authorized
 AND e.recording_permission_ref=f.authorization_ref);
$fixture_fn$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.staging_media_fixture(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- This is test recording authorization for verified fictional subjects, not consent for real children.
UPDATE public.sdl_club_enrollments e SET recording_storage_authorized=true,recording_permission_ref=f.authorization_ref
FROM sdl_rbac_v5.staging_media_fixtures f WHERE e.id=f.enrollment_id AND e.generation=f.enrollment_generation;
INSERT INTO sdl_rbac_v5.events(action,organization_id,player_id,target_id,reason)
SELECT 'synthetic_media_fixture_authorized',p.organization_id,p.id,f.enrollment_id,f.authorization_ref
FROM sdl_rbac_v5.staging_media_fixtures f JOIN public.players p ON p.id=f.player_id;

CREATE OR REPLACE FUNCTION sdl_rbac_v5.upload_role(p_user uuid, p_player uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT CASE
 WHEN sdl_rbac_v5.guardian_participates(p_user,p.id) THEN 'parent'
 WHEN public.sdl_004_coach_for(p_user,p.id) THEN 'coach'
 WHEN EXISTS(SELECT 1 FROM public.organization_memberships m WHERE m.organization_id=p.organization_id
   AND m.user_id=p_user AND m.status='active' AND m.role='admin') THEN 'club_admin'
 WHEN EXISTS(SELECT 1 FROM public.organization_memberships m JOIN public.team_memberships tm
   ON tm.user_id=m.user_id AND tm.role='manager' AND tm.status='active'
   JOIN public.teams t ON t.id=tm.team_id AND t.status='active' AND t.organization_id=m.organization_id
   JOIN public.player_team_memberships pm ON pm.team_id=t.id AND pm.organization_id=t.organization_id
   WHERE m.organization_id=p.organization_id AND m.user_id=p_user AND m.status='active' AND m.role IN ('admin','staff')
   AND pm.player_id=p.id AND pm.status='active' AND pm.start_date<=CURRENT_DATE AND pm.end_date IS NULL) THEN 'manager'
 END FROM public.players p JOIN public.profiles pr ON pr.id=p_user AND pr.status='active'
 JOIN public.organizations o ON o.id=p.organization_id AND o.status='active'
 JOIN public.sdl_club_enrollments e ON e.id=public.sdl_004_statistics_enrollment(p.id)
 WHERE p.id=p_player AND sdl_rbac_v5.staging_media_fixture(p.id,e.id,e.generation) AND e.recording_storage_authorized AND nullif(btrim(e.recording_permission_ref),'') IS NOT NULL;
$function$;

-- Private current object playback only. No historical or published access in this temporary release.
CREATE OR REPLACE FUNCTION sdl_rbac_v5.media_access(p_id uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $media_fixture$
 SELECT p_action='playback' AND sdl_rbac_v5.active_actor() AND EXISTS(
 SELECT 1 FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 JOIN public.sdl_media_objects m ON m.id=s.id AND m.player_id=p.id
 WHERE s.id=p_id AND s.clean_start IS TRUE AND s.archived_at IS NULL
 AND cardinality(s.publication_team_ids)=0 AND s.subject_scope<>'multiple'
 AND (s.status IN ('approved','pending') OR (s.status='rejected' AND s.rejected_access_until>now()))
 AND sdl_rbac_v5.staging_media_fixture(s.player_id,s.enrollment_id,s.enrollment_generation)
 AND (sdl_rbac_v5.player_role_gate(p.id,'review_video')
 OR sdl_rbac_v5.has_player_role(p.id,'guardian') OR sdl_rbac_v5.platform_allowed('playback')));
$media_fixture$;

-- Archive only active test fixtures. Existing media_access enforces the archived marker.
CREATE OR REPLACE FUNCTION sdl_rbac_v5.can_archive_media(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $archive_fixture$
 SELECT sdl_rbac_v5.active_actor() AND EXISTS(
 SELECT 1 FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 WHERE s.id=p_id AND s.clean_start IS TRUE AND s.archived_at IS NULL
 AND cardinality(s.publication_team_ids)=0 AND s.status IN ('approved','pending','rejected')
 AND sdl_rbac_v5.staging_media_fixture(s.player_id,s.enrollment_id,s.enrollment_generation)
 AND (sdl_rbac_v5.has_player_role(s.player_id,'club_admin')
 OR sdl_rbac_v5.has_player_role(s.player_id,'coach')
 OR (s.status='pending' AND s.submitted_by=auth.uid()
 AND sdl_rbac_v5.has_player_role(s.player_id,'guardian')
 AND sdl_rbac_v5.guardian_participates(auth.uid(),s.player_id))));
$archive_fixture$;
-- All existing media RPC holds remain until separate activation below.
COMMIT;
