-- Disposable verification and independent review only. Reconcile the hosted
-- bundle before assigning a migration version. CREATE OR REPLACE preserves ACLs.
BEGIN;
-- Two statements intentionally leave all pre-existing rows outside clean start.
ALTER TABLE public.sdl_video_submissions ADD COLUMN clean_start boolean,
 ADD COLUMN archived_at timestamptz,
 ADD COLUMN archived_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.sdl_submission_uploads ADD COLUMN clean_start boolean;
ALTER TABLE public.sdl_submission_uploads ALTER COLUMN clean_start SET DEFAULT true;
-- The service finalizer uses the reservation ID for the submission. A lease
-- issued under the old contract must not acquire clean-start status on retry.
CREATE FUNCTION sdl_rbac_v5.mark_clean_start_media()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 SELECT r.clean_start INTO NEW.clean_start FROM public.sdl_submission_uploads r
 WHERE r.id=NEW.id AND r.player_id=NEW.player_id AND r.user_id=NEW.submitted_by;
 IF NEW.clean_start IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Clean-start reservation required' USING ERRCODE='PT409';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.mark_clean_start_media() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER sdl_v5_mark_clean_start BEFORE INSERT ON public.sdl_video_submissions
 FOR EACH ROW EXECUTE FUNCTION sdl_rbac_v5.mark_clean_start_media();


CREATE OR REPLACE FUNCTION sdl_rbac_v5.media_access(p_id uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT sdl_rbac_v5.active_actor() AND EXISTS(
 SELECT 1 FROM public.sdl_video_submissions s JOIN public.players p
 ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 LEFT JOIN public.sdl_club_enrollments e ON e.id=s.enrollment_id AND e.generation=s.enrollment_generation
 AND e.athlete_id=p.athlete_id AND e.organization_id=p.organization_id
 JOIN public.sdl_media_objects m ON m.id=s.id AND m.player_id=p.id
 WHERE s.id=p_id AND s.clean_start IS TRUE AND s.archived_at IS NULL
 AND (s.status IN ('approved','pending') OR (s.status='rejected' AND s.rejected_access_until>now()))
 AND s.subject_scope<>'multiple' AND (
 (e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()
 AND e.recording_storage_authorized AND nullif(btrim(e.recording_permission_ref),'') IS NOT NULL AND (
 (p_action IN ('playback','download') AND (sdl_rbac_v5.player_role_gate(p.id,'review_video') OR sdl_rbac_v5.has_player_role(p.id,'guardian') OR sdl_rbac_v5.platform_allowed(p_action))
 AND (p_action='playback' OR (s.subject_scope='single_athlete' AND s.subject_confirmed_by IS NOT NULL)))
 OR (p_action='playback' AND sdl_rbac_v5.historical_staff_view(p.id,'video',s.id))
 OR (p_action='playback' AND EXISTS(SELECT 1 FROM unnest(s.publication_team_ids) team
 WHERE public.sdl_004_clubhouse_visible(s.id,team)))))
 OR ((e.id IS NULL OR e.status<>'active' OR e.ended_at IS NOT NULL)
 AND EXISTS(SELECT 1 FROM sdl_rbac_v5.retained_media_rights rights
 WHERE rights.video_id=s.id AND rights.enrollment_generation=s.enrollment_generation
 AND rights.revoked_at IS NULL AND rights.valid_until>now() AND rights.view_allowed
 AND s.subject_scope='single_athlete' AND s.subject_confirmed_by IS NOT NULL AND (
   (p_action IN ('playback','download') AND (p_action='playback' OR rights.download_allowed)
    AND (sdl_rbac_v5.platform_allowed(p_action) OR sdl_rbac_v5.is_club_admin(s.organization_id)
    OR sdl_rbac_v5.has_player_role(p.id,'guardian')))
   OR (p_action='playback' AND sdl_rbac_v5.historical_staff_view(p.id,'video',s.id))))))
 );
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_list_submissions(p_player_id uuid)
RETURNS TABLE(id uuid,player_id uuid,athlete_id uuid,category text,status text,source_kind text,created_at timestamptz,
 review_note text,history jsonb,can_review boolean,can_publish boolean,publication_team_ids uuid[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT sdl_rbac_v5.active_actor() OR NOT (
   sdl_rbac_v5.has_player_role(p_player_id,'guardian')
   OR sdl_rbac_v5.player_role_gate(p_player_id,'review_video')
   OR EXISTS (SELECT 1 FROM public.players p WHERE p.id=p_player_id
     AND (sdl_rbac_v5.platform_allowed('view') OR sdl_rbac_v5.is_club_admin(p.organization_id)))
   OR EXISTS (SELECT 1 FROM public.sdl_video_submissions s WHERE s.player_id=p_player_id
     AND sdl_rbac_v5.historical_staff_view(p_player_id,'video',s.id)
     AND sdl_rbac_v5.media_access(s.id,'playback'))
 ) THEN RAISE EXCEPTION 'Media collection access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT s.id,s.player_id,s.athlete_id,s.category,s.status,s.source_kind,s.created_at,s.review_note,s.history,
 s.status='pending' AND s.submitted_by<>(SELECT auth.uid()) AND public.sdl_004_submission_can_review(s.player_id),
 public.sdl_004_submission_can_publish(s.id),s.publication_team_ids FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 WHERE s.player_id=p_player_id AND public.sdl_004_session_active() AND (sdl_rbac_v5.has_player_role(s.player_id,'guardian') OR sdl_rbac_v5.player_role_gate(s.player_id,'review_video') OR sdl_rbac_v5.platform_allowed('view') OR sdl_rbac_v5.is_club_admin(s.organization_id)
 OR sdl_rbac_v5.historical_staff_view(s.player_id,'video',s.id)) AND sdl_rbac_v5.media_access(s.id,'playback') ORDER BY s.created_at DESC LIMIT 30;
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_clubhouse_videos(p_team_id uuid)
RETURNS TABLE(id uuid,player_id uuid,category text,created_at timestamptz,preferred_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_clubhouse_member(p_team_id) THEN
   RAISE EXCEPTION 'Team media access denied' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT s.id,s.player_id,s.category,s.created_at,p.preferred_name
 FROM public.sdl_video_submissions s JOIN public.players p ON p.id=s.player_id
 WHERE s.clean_start IS TRUE AND public.sdl_004_clubhouse_visible(s.id,p_team_id)
 AND sdl_rbac_v5.media_access(s.id,'playback')
 ORDER BY s.created_at DESC,s.id LIMIT 30;
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_submission_can_publish(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND EXISTS(SELECT 1 FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 WHERE EXISTS(SELECT 1 FROM public.sdl_club_enrollments recording WHERE recording.id=s.enrollment_id AND recording.generation=s.enrollment_generation AND recording.status='active' AND recording.ended_at IS NULL AND recording.recording_storage_authorized AND nullif(btrim(recording.recording_permission_ref),'') IS NOT NULL) AND s.id=p_id AND s.clean_start IS TRUE AND s.archived_at IS NULL AND s.status='approved'
 AND s.subject_scope='single_athlete' AND s.subject_confirmed_by IS NOT NULL AND s.subject_confirmed_by<>s.submitted_by AND sdl_rbac_v5.player_role_gate(s.player_id,'review_video')
 AND public.sdl_004_active_club_consent(s.enrollment_id,s.enrollment_generation) IS NOT NULL);
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_publish_submission(p_id uuid,p_team_ids uuid[],p_subject_athletes uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sdl_video_submissions%ROWTYPE; consent uuid;
BEGIN
 SELECT * INTO s FROM public.sdl_video_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.clean_start IS DISTINCT FROM true OR s.archived_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=s.player_id AND athlete_id=s.athlete_id AND organization_id=s.organization_id) OR NOT public.sdl_004_submission_can_review(s.player_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_team_ids IS NULL OR cardinality(p_team_ids)>20 THEN RAISE EXCEPTION 'Invalid team scope' USING ERRCODE='22023'; END IF;
 IF cardinality(p_team_ids)>0 THEN
  IF s.subject_scope IS DISTINCT FROM 'single_athlete' OR s.subject_confirmed_by IS NULL
     OR s.subject_confirmed_by=s.submitted_by OR NOT public.sdl_004_submission_can_publish(s.id) THEN RAISE EXCEPTION 'Approval and active club consent required' USING ERRCODE='42501'; END IF;
  -- Publication consumes independently confirmed subject evidence.
  IF p_subject_athletes IS NULL OR cardinality(p_subject_athletes)<>1 OR p_subject_athletes[1] IS DISTINCT FROM s.athlete_id THEN
   RAISE EXCEPTION 'Multiple or unknown subjects cannot be published' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_team_ids) wanted WHERE wanted IS NULL OR NOT EXISTS(SELECT 1 FROM public.player_team_memberships pm WHERE pm.player_id=s.player_id AND pm.organization_id=s.organization_id
 AND pm.team_id=wanted AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE
 AND (sdl_rbac_v5.team_role_gate(wanted,'manage_roster') OR sdl_rbac_v5.has_team_staff_role(wanted,'coach')))
   OR NOT EXISTS(SELECT 1 FROM public.teams WHERE id=wanted AND organization_id=s.organization_id)) THEN RAISE EXCEPTION 'Team access denied' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.sdl_club_enrollments WHERE id=s.enrollment_id FOR SHARE;
  consent=public.sdl_004_active_club_consent(s.enrollment_id,s.enrollment_generation);
  PERFORM 1 FROM public.sdl_club_consents WHERE id=consent FOR SHARE;
  IF consent IS NULL OR public.sdl_004_active_club_consent(s.enrollment_id,s.enrollment_generation) IS DISTINCT FROM consent THEN RAISE EXCEPTION 'Consent changed; refresh' USING ERRCODE='PT409'; END IF;
 END IF;
 UPDATE public.sdl_video_submissions SET publication_team_ids=ARRAY(SELECT DISTINCT unnest(p_team_ids)),publication_consent_id=consent,
 history=history||jsonb_build_array(jsonb_build_object('action',CASE WHEN cardinality(p_team_ids)>0 THEN 'published' ELSE 'unpublished' END,
 'team_ids',p_team_ids,'consent_id',consent,'subject_athletes',p_subject_athletes,'safety_policy','single-athlete-v1','actor',(SELECT auth.uid()),'at',now())) WHERE id=s.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sdl_004_submission_contract()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN public.sdl_004_session_active() THEN jsonb_build_object('rbacVersion',5,'mediaRevision','v5.1-clean-start','revision','sdl004-club-enrollment-v2','enrollmentAdmin',true,'clubhouseRoster',true,'clubhouseLeaderboard',true,'parentStatistics',true,'statisticsConsent',true,'pilotWorkflow','sdl004-final-pilot-v1') ELSE NULL END;
$$;

-- Staging library removal: no physical deletion, no permanent-delete grant.
-- Only current, private, clean-start records may be archived here.
CREATE FUNCTION sdl_rbac_v5.can_archive_media(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $archive_fn$
 SELECT sdl_rbac_v5.active_actor() AND EXISTS(
 SELECT 1 FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 JOIN public.sdl_club_enrollments e ON e.id=s.enrollment_id AND e.generation=s.enrollment_generation
   AND e.athlete_id=s.athlete_id AND e.organization_id=s.organization_id
 WHERE s.id=p_id AND s.clean_start IS TRUE AND s.archived_at IS NULL
 AND cardinality(s.publication_team_ids)=0 AND s.status IN ('approved','pending','rejected')
 AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()
 AND (sdl_rbac_v5.has_player_role(s.player_id,'club_admin')
   OR sdl_rbac_v5.has_player_role(s.player_id,'coach')
   OR (s.status='pending' AND s.submitted_by=auth.uid()
       AND sdl_rbac_v5.has_player_role(s.player_id,'guardian')
       AND sdl_rbac_v5.guardian_participates(auth.uid(),s.player_id)))
 );
$archive_fn$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.can_archive_media(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.sdl_v5_media_archive_ids(p_player uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $archive_fn$
 SELECT coalesce(array_agg(eligible.id),ARRAY[]::uuid[]) FROM (
 SELECT s.id FROM public.sdl_video_submissions s
 WHERE s.player_id=p_player AND sdl_rbac_v5.can_archive_media(s.id)
 ORDER BY s.created_at DESC,s.id LIMIT 30) eligible;
$archive_fn$;

CREATE FUNCTION public.sdl_v5_archive_media(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $archive_fn$
DECLARE s public.sdl_video_submissions%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.sdl_video_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT sdl_rbac_v5.can_archive_media(p_id) THEN
   RAISE EXCEPTION 'Media removal not authorized' USING ERRCODE='42501';
 END IF;
 UPDATE public.sdl_video_submissions SET archived_at=now(),archived_by=auth.uid(),
  publication_team_ids=ARRAY[]::uuid[],publication_consent_id=NULL,
  history=history||jsonb_build_array(jsonb_build_object('action','archived','actor',auth.uid(),'at',now()))
 WHERE id=p_id;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 VALUES(auth.uid(),'media_archived',s.organization_id,s.player_id,s.id,'Private video removed from active library');
 RETURN true;
END;
$archive_fn$;
-- Hold until a separate reviewed staging activation. Do not grant here.
REVOKE ALL ON FUNCTION public.sdl_v5_media_archive_ids(uuid),public.sdl_v5_archive_media(uuid)
 FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
