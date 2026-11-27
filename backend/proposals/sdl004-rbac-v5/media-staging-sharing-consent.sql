-- Synthetic staging only. Existing consent ledger and lifecycle retained.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF (SELECT max(version) FROM supabase_migrations.schema_migrations)<>'20261127134903'
 OR (SELECT count(*) FROM sdl_rbac_v5.staging_media_fixtures)<>21
 OR EXISTS(SELECT 1 FROM public.sdl_club_consents)
 OR EXISTS(SELECT 1 FROM public.sdl_video_submissions WHERE cardinality(publication_team_ids)>0)
 THEN RAISE EXCEPTION 'Consent staging baseline drift'; END IF;
END; $guard$;

CREATE FUNCTION sdl_rbac_v5.active_media_share_consent(p_enrollment uuid,p_generation uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $f$
 SELECT c.id FROM public.sdl_club_consents c
 WHERE c.id=public.sdl_004_active_club_consent(p_enrollment,p_generation)
 AND c.policy_version='sdl004-clubhouse-view-download-v2';
$f$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.active_media_share_consent(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Read-only per-player guardian contract, never returns unrelated family data.
CREATE FUNCTION public.sdl_v5_media_consent_status(p_player uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $f$
DECLARE p public.players%ROWTYPE; e public.sdl_club_enrollments%ROWTYPE; c public.sdl_club_consents%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.players WHERE id=p_player;
 IF NOT FOUND OR NOT sdl_rbac_v5.active_actor() OR NOT public.sdl_004_guardian_athlete(auth.uid(),p.athlete_id) THEN RAISE EXCEPTION 'Guardian access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p.id);
 IF NOT FOUND OR NOT sdl_rbac_v5.staging_media_fixture(p.id,e.id,e.generation) THEN RAISE EXCEPTION 'Media fixture unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.sdl_club_consents WHERE id=sdl_rbac_v5.active_media_share_consent(e.id,e.generation);
 RETURN jsonb_build_object('player_id',p.id,'enrollment_id',e.id,'generation',e.generation,'policy_version','sdl004-clubhouse-view-download-v2',
 'active',c.id IS NOT NULL,'accepted_at',c.accepted_at,'can_accept',sdl_rbac_v5.guardian_participates(auth.uid(),p.id)
 AND NOT sdl_rbac_v5.has_unresolved_objection(e.athlete_id,e.organization_id,'video'),
 'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('action',x.action,'at',x.created_at,'policy_version',x.policy_version) ORDER BY x.created_at DESC) FROM
 (SELECT CASE WHEN cc.withdrawn_at IS NOT NULL THEN 'withdrawn' WHEN cc.invalidated_at IS NOT NULL THEN 'invalidated' ELSE 'accepted' END action,
 coalesce(cc.withdrawn_at,cc.invalidated_at,cc.accepted_at) created_at,cc.policy_version FROM public.sdl_club_consents cc
 WHERE cc.enrollment_id=e.id AND cc.enrollment_generation=e.generation AND cc.policy_version='sdl004-clubhouse-view-download-v2'
 ORDER BY coalesce(cc.withdrawn_at,cc.invalidated_at,cc.accepted_at) DESC LIMIT 30) x),'[]'::jsonb));
END; $f$;

CREATE FUNCTION public.sdl_v5_set_media_consent(p_player uuid,p_generation uuid,p_accept boolean,p_policy text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE p public.players%ROWTYPE; e public.sdl_club_enrollments%ROWTYPE; c public.sdl_club_consents%ROWTYPE;
BEGIN
 IF p_accept IS NULL OR (p_accept AND p_policy IS DISTINCT FROM 'sdl004-clubhouse-view-download-v2') THEN RAISE EXCEPTION 'Explicit current policy required' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player;
 IF NOT FOUND OR NOT sdl_rbac_v5.active_actor() OR NOT public.sdl_004_guardian_athlete(auth.uid(),p.athlete_id) THEN RAISE EXCEPTION 'Guardian access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p.id) FOR UPDATE;
 IF NOT FOUND OR NOT sdl_rbac_v5.staging_media_fixture(p.id,e.id,e.generation) THEN RAISE EXCEPTION 'Media fixture unavailable' USING ERRCODE='42501'; END IF;
 IF e.generation IS DISTINCT FROM p_generation THEN RAISE EXCEPTION 'Enrollment changed' USING ERRCODE='PT409'; END IF;
 PERFORM 1 FROM public.athlete_guardians WHERE athlete_id=e.athlete_id AND user_id=auth.uid() AND status='verified' FOR SHARE;
 PERFORM 1 FROM public.profiles WHERE id=auth.uid() AND status='active' FOR SHARE;
 IF NOT public.sdl_004_guardian_athlete(auth.uid(),e.athlete_id) OR NOT sdl_rbac_v5.active_actor() THEN RAISE EXCEPTION 'Guardian access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.sdl_club_consents WHERE enrollment_id=e.id AND enrollment_generation=e.generation AND withdrawn_at IS NULL AND invalidated_at IS NULL FOR UPDATE;
 IF p_accept THEN
  IF NOT sdl_rbac_v5.guardian_participates(auth.uid(),p.id) OR sdl_rbac_v5.has_unresolved_objection(e.athlete_id,e.organization_id,'video')
  OR EXISTS(SELECT 1 FROM sdl_rbac_v5.preferences pr WHERE pr.enrollment_id=e.id AND pr.generation=e.generation AND pr.category='video' AND NOT pr.accepted AND pr.guardian<>auth.uid())
  THEN RAISE EXCEPTION 'Sharing restricted or unresolved objection' USING ERRCODE='42501'; END IF;
  IF c.id IS NOT NULL AND c.policy_version='sdl004-clubhouse-view-download-v2' AND sdl_rbac_v5.active_media_share_consent(e.id,e.generation)=c.id THEN RETURN public.sdl_v5_media_consent_status(p.id); END IF;
  IF c.id IS NOT NULL THEN
   UPDATE public.sdl_club_consents SET invalidated_at=now(),invalidation_reason='policy_replaced' WHERE id=c.id;
   INSERT INTO public.sdl_club_consent_events(enrollment_id,consent_id,actor,action,details) VALUES(e.id,c.id,auth.uid(),'invalidated',jsonb_build_object('reason','policy_replaced'));
  END IF;
  PERFORM sdl_rbac_v5.record_preference(e.id,e.generation,'video',true,NULL);
  INSERT INTO public.sdl_club_consents(enrollment_id,enrollment_generation,athlete_id,organization_id,guardian_id,policy_version)
  VALUES(e.id,e.generation,e.athlete_id,e.organization_id,auth.uid(),'sdl004-clubhouse-view-download-v2') RETURNING * INTO c;
  INSERT INTO public.sdl_club_consent_events(enrollment_id,consent_id,actor,action,details)
  VALUES(e.id,c.id,auth.uid(),'accepted',jsonb_build_object('policy_version',c.policy_version,'generation',e.generation,'view',true,'download',true,'synthetic_fixture',true));
  IF sdl_rbac_v5.active_media_share_consent(e.id,e.generation) IS DISTINCT FROM c.id THEN RAISE EXCEPTION 'Consent not effective' USING ERRCODE='42501'; END IF;
 ELSE
  PERFORM sdl_rbac_v5.record_preference(e.id,e.generation,'video',false,NULL);
  IF c.id IS NOT NULL THEN
   UPDATE public.sdl_club_consents SET withdrawn_at=now() WHERE id=c.id;
   INSERT INTO public.sdl_club_consent_events(enrollment_id,consent_id,actor,action,details)
   VALUES(e.id,c.id,auth.uid(),'withdrawn',jsonb_build_object('policy_version',c.policy_version,'generation',e.generation));
  END IF;
 END IF;
 RETURN public.sdl_v5_media_consent_status(p.id);
END; $f$;
REVOKE ALL ON FUNCTION public.sdl_v5_media_consent_status(uuid),public.sdl_v5_set_media_consent(uuid,uuid,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_media_consent_status(uuid),public.sdl_v5_set_media_consent(uuid,uuid,boolean,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.sdl_004_submission_contract()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN public.sdl_004_session_active() THEN jsonb_build_object('rbacVersion',5,'mediaRevision','v5.1-clean-start','mediaReviewRevision','independent-review-v1','mediaConsentRevision','sdl004-clubhouse-view-download-v2','revision','sdl004-club-enrollment-v2','enrollmentAdmin',true,'clubhouseRoster',true,'clubhouseLeaderboard',true,'parentStatistics',true,'statisticsConsent',true,'pilotWorkflow','sdl004-final-pilot-v1') ELSE NULL END;
$function$;
COMMIT;
