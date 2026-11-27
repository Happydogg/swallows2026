-- SDL-004B-RBAC-05-MEDIA-03B-01. Synthetic staging independent private review only.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF (SELECT max(version) FROM supabase_migrations.schema_migrations)<>'20261127132111' OR (SELECT count(*) FROM sdl_rbac_v5.staging_media_fixtures)<>21 OR EXISTS(SELECT 1 FROM public.sdl_submission_uploads WHERE NOT completed) OR EXISTS(SELECT 1 FROM public.sdl_video_submissions WHERE cardinality(publication_team_ids)>0) THEN RAISE EXCEPTION 'Staging baseline drift'; END IF;
END; $guard$;
CREATE OR REPLACE FUNCTION public.sdl_004_finish_submission(p_request_key uuid, p_claim uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  'pending',
  jsonb_build_array(jsonb_build_object('action','uploaded_private','actor',p_user_id,'at',now(),'source',r.source_kind)));
  UPDATE public.sdl_submission_uploads SET completed=true WHERE id=r.id;
 END IF;
 RETURN(SELECT jsonb_build_object('id',id,'player_id',player_id,'category',category,'status',status) FROM public.sdl_video_submissions WHERE id=r.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sdl_004_list_submissions(p_player_id uuid)
 RETURNS TABLE(id uuid, player_id uuid, athlete_id uuid, category text, status text, source_kind text, created_at timestamp with time zone, review_note text, history jsonb, can_review boolean, can_publish boolean, publication_team_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 s.status='pending' AND s.reviewed_by IS NULL AND s.submitted_by<>(SELECT auth.uid()) AND public.sdl_004_submission_can_review(s.player_id) AND sdl_rbac_v5.media_access(s.id,'playback'),
 false,s.publication_team_ids FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 WHERE s.player_id=p_player_id AND public.sdl_004_session_active() AND (sdl_rbac_v5.has_player_role(s.player_id,'guardian') OR sdl_rbac_v5.player_role_gate(s.player_id,'review_video') OR sdl_rbac_v5.platform_allowed('view') OR sdl_rbac_v5.is_club_admin(s.organization_id)
 OR sdl_rbac_v5.historical_staff_view(s.player_id,'video',s.id)) AND (sdl_rbac_v5.media_access(s.id,'playback') OR (s.status='rejected' AND sdl_rbac_v5.can_archive_media(s.id))) ORDER BY s.created_at DESC LIMIT 30;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sdl_004_submission_can_review(p_player_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT sdl_rbac_v5.has_player_role(p_player_id,'club_admin') OR sdl_rbac_v5.has_player_role(p_player_id,'coach');
$function$;

CREATE OR REPLACE FUNCTION public.sdl_004_submission_contract()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN public.sdl_004_session_active() THEN jsonb_build_object('rbacVersion',5,'mediaRevision','v5.1-clean-start','mediaReviewRevision','independent-review-v1','revision','sdl004-club-enrollment-v2','enrollmentAdmin',true,'clubhouseRoster',true,'clubhouseLeaderboard',true,'parentStatistics',true,'statisticsConsent',true,'pilotWorkflow','sdl004-final-pilot-v1') ELSE NULL END;
$function$;

CREATE FUNCTION public.sdl_v5_review_private_media(p_id uuid,p_decision text,p_note text,p_single_subject boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $review$
DECLARE s public.sdl_video_submissions%ROWTYPE;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') OR p_note IS NULL OR char_length(p_note)>1000 OR p_single_subject IS NULL
 OR (p_decision='rejected' AND (p_single_subject OR btrim(p_note)='')) THEN RAISE EXCEPTION 'Invalid review' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.sdl_video_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.clean_start IS DISTINCT FROM true OR s.archived_at IS NOT NULL OR cardinality(s.publication_team_ids)<>0
 OR s.submitted_by=auth.uid() OR NOT public.sdl_004_submission_can_review(s.player_id)
 OR NOT sdl_rbac_v5.media_access(s.id,'playback')
 OR NOT sdl_rbac_v5.staging_media_fixture(s.player_id,s.enrollment_id,s.enrollment_generation)
 THEN RAISE EXCEPTION 'Independent private review not authorized' USING ERRCODE='42501'; END IF;
 IF s.status<>'pending' OR s.reviewed_by IS NOT NULL THEN RAISE EXCEPTION 'Already reviewed' USING ERRCODE='PT409'; END IF;
 IF p_single_subject AND s.subject_scope='multiple' THEN RAISE EXCEPTION 'Multiple subjects cannot be confirmed' USING ERRCODE='22023'; END IF;
 UPDATE public.sdl_video_submissions SET status=p_decision,review_note=p_note,reviewed_at=now(),reviewed_by=auth.uid(),
 subject_scope=CASE WHEN p_single_subject THEN 'single_athlete' ELSE s.subject_scope END,
 subject_confirmed_by=CASE WHEN p_single_subject THEN auth.uid() ELSE NULL END,
 subject_confirmed_at=CASE WHEN p_single_subject THEN now() ELSE NULL END,
 rejected_access_until=CASE WHEN p_decision='rejected' THEN NULL ELSE s.rejected_access_until END,
 history=history||jsonb_build_array(jsonb_build_object('action',p_decision,'actor',auth.uid(),'at',now(),'note',p_note,'single_subject',p_single_subject,'private_only',true)) WHERE id=s.id;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 VALUES(auth.uid(),'media_'||p_decision,s.organization_id,s.player_id,s.id,'Independent private review');
 IF p_single_subject THEN INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 VALUES(auth.uid(),'private_subject_confirmed',s.organization_id,s.player_id,s.id,'Independent reviewer attested single identifiable athlete'); END IF;
 RETURN true;
END; $review$;
REVOKE ALL ON FUNCTION public.sdl_v5_review_private_media(uuid,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_review_private_media(uuid,text,text,boolean) TO authenticated;
DO $verify$
BEGIN
 IF NOT has_function_privilege('authenticated','public.sdl_v5_review_private_media(uuid,text,text,boolean)','EXECUTE')
 OR has_function_privilege('anon','public.sdl_v5_review_private_media(uuid,text,text,boolean)','EXECUTE')
 OR has_function_privilege('service_role','public.sdl_v5_review_private_media(uuid,text,text,boolean)','EXECUTE')
 OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('sdl_004_review_submission','sdl_004_review_queue','sdl_v5_confirm_subject','sdl_004_publish_submission','sdl_004_clubhouse_videos','sdl_v5_authorize_download') AND (has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE'))) THEN RAISE EXCEPTION 'Unexpected ACL'; END IF;
END; $verify$;
COMMIT;
