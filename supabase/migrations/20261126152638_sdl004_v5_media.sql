BEGIN;
-- A release reviewer supplies a retention deadline only under an approved policy.
ALTER TABLE public.sdl_video_submissions ADD COLUMN rejected_access_until timestamptz;
CREATE OR REPLACE FUNCTION public.sdl_004_media_can_access(p_player_id uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 -- Legacy player-level requests cannot establish object lifecycle or recording consent.
 SELECT false;
$$;

CREATE OR REPLACE FUNCTION public.sdl_004_submission_can_review(p_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT sdl_rbac_v5.player_role_gate(p_player_id,'review_video');
$$;
CREATE FUNCTION sdl_rbac_v5.media_access(p_id uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT sdl_rbac_v5.active_actor() AND EXISTS(
 SELECT 1 FROM public.sdl_video_submissions s JOIN public.players p
 ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 JOIN public.sdl_club_enrollments e ON e.id=s.enrollment_id AND e.generation=s.enrollment_generation
 AND e.athlete_id=p.athlete_id AND e.organization_id=p.organization_id
 JOIN public.sdl_media_objects m ON m.id=s.id AND m.player_id=p.id
 WHERE s.id=p_id AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()
 AND e.recording_storage_authorized AND nullif(btrim(e.recording_permission_ref),'') IS NOT NULL
 AND (s.status IN ('approved','pending') OR (s.status='rejected' AND s.rejected_access_until>now()))
 AND s.subject_scope<>'multiple' AND (
 (p_action IN ('playback','download') AND sdl_rbac_v5.player_role_gate(p.id,'read_private_statistics')
 AND (p_action='playback' OR (s.subject_scope='single_athlete' AND s.subject_confirmed_by IS NOT NULL)))
 OR (p_action='playback' AND EXISTS(SELECT 1 FROM unnest(s.publication_team_ids) team
 WHERE public.sdl_004_clubhouse_visible(s.id,team)))));
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.media_access(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.sdl_004_submission_can_read(p_submission_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT sdl_rbac_v5.media_access(p_submission_id,'playback');
$$;
CREATE FUNCTION public.sdl_v5_authorize_download(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT sdl_rbac_v5.media_access(p_id,'download') THEN RETURN false; END IF;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 SELECT auth.uid(),'download_authorized',organization_id,player_id,id,'Private media request'
 FROM public.sdl_video_submissions WHERE id=p_id;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.sdl_v5_authorize_download(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_authorize_download(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.sdl_004_submission_can_publish(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND EXISTS(SELECT 1 FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 WHERE EXISTS(SELECT 1 FROM public.sdl_club_enrollments recording WHERE recording.id=s.enrollment_id AND recording.generation=s.enrollment_generation AND recording.status='active' AND recording.ended_at IS NULL AND recording.recording_storage_authorized AND nullif(btrim(recording.recording_permission_ref),'') IS NOT NULL) AND s.id=p_id AND s.status='approved' AND sdl_rbac_v5.player_role_gate(s.player_id,'review_video')
 AND public.sdl_004_active_club_consent(s.enrollment_id,s.enrollment_generation) IS NOT NULL);
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_publish_submission(p_id uuid,p_team_ids uuid[],p_subject_athletes uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sdl_video_submissions%ROWTYPE; consent uuid;
BEGIN
 SELECT * INTO s FROM public.sdl_video_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=s.player_id AND athlete_id=s.athlete_id AND organization_id=s.organization_id) OR NOT public.sdl_004_submission_can_review(s.player_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_team_ids IS NULL OR cardinality(p_team_ids)>20 THEN RAISE EXCEPTION 'Invalid team scope' USING ERRCODE='22023'; END IF;
 IF cardinality(p_team_ids)>0 THEN
  IF NOT public.sdl_004_submission_can_publish(s.id) THEN RAISE EXCEPTION 'Approval and active club consent required' USING ERRCODE='42501'; END IF;
  -- Unknown/multiple identifiable children are PRIVATE. This is an accountable coach
  -- single-subject safety attestation, not automatic detection or multi-subject consent.
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
 subject_scope=CASE WHEN cardinality(p_team_ids)>0 THEN 'single_athlete' ELSE 'unknown' END,
 subject_confirmed_by=CASE WHEN cardinality(p_team_ids)>0 THEN (SELECT auth.uid()) END,
 subject_confirmed_at=CASE WHEN cardinality(p_team_ids)>0 THEN now() END,
 history=history||jsonb_build_array(jsonb_build_object('action',CASE WHEN cardinality(p_team_ids)>0 THEN 'published' ELSE 'unpublished' END,
 'team_ids',p_team_ids,'consent_id',consent,'subject_athletes',p_subject_athletes,'safety_policy','single-athlete-v1','actor',(SELECT auth.uid()),'at',now())) WHERE id=s.id;
END;
$$;

ALTER TABLE public.sdl_submission_uploads DROP CONSTRAINT sdl_submission_uploads_source_kind_check,
 ADD CHECK(source_kind IN ('parent','coach','manager','club_admin'));
ALTER TABLE public.sdl_video_submissions DROP CONSTRAINT sdl_video_submissions_source_kind_check,
 ADD CHECK(source_kind IN ('parent','coach','manager','club_admin'));

-- The Worker finishes the upload using a service-only RPC. Resolve the saved
-- uploader's real role again without relying on a service JWT's identity.
CREATE FUNCTION sdl_rbac_v5.upload_role(p_user uuid,p_player uuid) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE
 WHEN public.sdl_004_guardian_for(p_user,p.id) THEN 'parent'
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
 WHERE p.id=p_player AND e.recording_storage_authorized AND nullif(btrim(e.recording_permission_ref),'') IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.upload_role(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.sdl_004_submission_can_submit(p_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT sdl_rbac_v5.active_actor() AND sdl_rbac_v5.upload_role(auth.uid(),p_player_id) IS NOT NULL;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_reserve_submission(p_player_id uuid,p_request_key uuid,p_claim uuid,
 p_fingerprint text,p_size bigint,p_category text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.sdl_submission_uploads%ROWTYPE; p public.players%ROWTYPE; e public.sdl_club_enrollments%ROWTYPE;
BEGIN
 IF NOT public.sdl_004_submission_can_submit(p_player_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_claim IS NULL OR p_request_key IS NULL THEN RAISE EXCEPTION 'Invalid upload' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE athlete_id=p.athlete_id AND organization_id=p.organization_id
 AND status='active' AND ended_at IS NULL AND started_at<=now() FOR SHARE;
 INSERT INTO public.sdl_submission_uploads(user_id,request_key,player_id,athlete_id,organization_id,enrollment_id,enrollment_generation,source_kind,session_id,fingerprint,byte_size,category,claim,lease_until)
 VALUES((SELECT auth.uid()),p_request_key,p_player_id,p.athlete_id,p.organization_id,e.id,e.generation,
 sdl_rbac_v5.upload_role(auth.uid(),p_player_id),
 (auth.jwt()->>'session_id')::uuid,p_fingerprint,p_size,p_category,p_claim,now()+interval '2 minutes')
 ON CONFLICT(user_id,request_key) DO NOTHING;
 SELECT * INTO r FROM public.sdl_submission_uploads WHERE user_id=(SELECT auth.uid()) AND request_key=p_request_key FOR UPDATE;
 IF r.fingerprint<>p_fingerprint OR r.player_id<>p_player_id OR r.byte_size<>p_size OR r.category<>p_category
 OR r.athlete_id IS DISTINCT FROM p.athlete_id OR r.organization_id IS DISTINCT FROM p.organization_id THEN
 RAISE EXCEPTION 'Idempotency key reused for different upload' USING ERRCODE='PT409'; END IF;
 IF r.completed THEN RETURN jsonb_build_object('state','complete','id',r.id,'player_id',r.player_id,'category',r.category,
 'status',(SELECT status FROM public.sdl_video_submissions WHERE id=r.id)); END IF;
 IF r.claim<>p_claim AND r.lease_until>now() THEN RAISE EXCEPTION 'Upload already in progress' USING ERRCODE='PT409'; END IF;
 UPDATE public.sdl_submission_uploads SET claim=p_claim,lease_until=now()+interval '2 minutes',session_id=(auth.jwt()->>'session_id')::uuid WHERE id=r.id;
 RETURN jsonb_build_object('state','reserved','id',r.id,'object_key','pilot/'||r.player_id::text||'/'||r.id::text||'.mp4');
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_finish_submission(p_request_key uuid,p_claim uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.sdl_submission_uploads%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.sdl_submission_uploads WHERE user_id=p_user_id AND request_key=p_request_key FOR UPDATE;
 IF NOT FOUND OR r.claim<>p_claim THEN RAISE EXCEPTION 'Upload conflict' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=p_user_id AND (not_after IS NULL OR not_after>now()))
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=r.player_id AND athlete_id=r.athlete_id AND organization_id=r.organization_id)
 OR sdl_rbac_v5.upload_role(p_user_id,r.player_id) IS DISTINCT FROM r.source_kind
 OR NOT EXISTS(SELECT 1 FROM public.sdl_club_enrollments e WHERE e.id=public.sdl_004_statistics_enrollment(r.player_id)
 AND e.id=r.enrollment_id AND e.generation=r.enrollment_generation) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF NOT r.completed THEN
  IF r.lease_until<=now() THEN RAISE EXCEPTION 'Upload lease expired' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.sdl_media_objects(id,player_id,uploaded_by,object_key,content_type,byte_size)
  VALUES(r.id,r.player_id,p_user_id,'pilot/'||r.player_id::text||'/'||r.id::text||'.mp4','video/mp4',r.byte_size);
  INSERT INTO public.sdl_video_submissions(id,player_id,athlete_id,organization_id,enrollment_id,enrollment_generation,submitted_by,source_kind,category,status,history)
  VALUES(r.id,r.player_id,r.athlete_id,r.organization_id,r.enrollment_id,r.enrollment_generation,p_user_id,r.source_kind,r.category,
  CASE WHEN r.source_kind='coach' THEN 'approved' ELSE 'pending' END,
  jsonb_build_array(jsonb_build_object('action','uploaded_private','actor',p_user_id,'at',now(),'source',r.source_kind)));
  UPDATE public.sdl_submission_uploads SET completed=true WHERE id=r.id;
 END IF;
 RETURN(SELECT jsonb_build_object('id',id,'player_id',player_id,'category',category,'status',status) FROM public.sdl_video_submissions WHERE id=r.id);
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_review_submission(p_id uuid,p_decision text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sdl_video_submissions%ROWTYPE;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') OR p_note IS NULL OR char_length(p_note)>1000 THEN RAISE EXCEPTION 'Invalid review' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.sdl_video_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=s.player_id AND athlete_id=s.athlete_id AND organization_id=s.organization_id) OR NOT public.sdl_004_submission_can_review(s.player_id) OR s.submitted_by=(SELECT auth.uid()) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF NOT sdl_rbac_v5.media_access(s.id,'playback') THEN RAISE EXCEPTION 'Media unavailable' USING ERRCODE='42501'; END IF;
 IF s.status<>'pending' THEN RAISE EXCEPTION 'Already reviewed' USING ERRCODE='PT409'; END IF;
 UPDATE public.sdl_video_submissions SET status=p_decision,review_note=p_note,reviewed_at=now(),reviewed_by=(SELECT auth.uid()),
 history=history||jsonb_build_array(jsonb_build_object('action',p_decision,'actor',(SELECT auth.uid()),'at',now(),'note',p_note)) WHERE id=s.id;
END;
$$;
COMMIT;
