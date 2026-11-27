BEGIN;
ALTER TABLE public.sdl_statistic_consents DROP CONSTRAINT sdl_statistic_consents_policy_version_check,
 ADD CHECK(policy_version IN ('sdl004-baseball-statistics-v1','baseball-sessions-v5'));
CREATE TABLE sdl_rbac_v5.preferences(
 enrollment_id uuid REFERENCES public.sdl_club_enrollments(id), generation uuid NOT NULL,
 guardian uuid REFERENCES public.profiles(id), category text CHECK(category IN ('video','statistics')),
 accepted boolean NOT NULL, legacy_metrics text[], changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(enrollment_id,generation,category,guardian));
CREATE TABLE sdl_rbac_v5.shared_protocols(
 protocol_id text PRIMARY KEY REFERENCES public.sdl_measurement_protocols(id), notice text NOT NULL);
INSERT INTO sdl_rbac_v5.shared_protocols SELECT id,'baseball-sessions-v5' FROM public.sdl_measurement_protocols
 WHERE id IN ('exit-radar-v1','throw-radar-v1','standing-broad-jump-v1','sprint-18.29-hand-v1','sprint-18.29-electronic-v1','sprint-27.43-hand-v1');
ALTER TABLE sdl_rbac_v5.preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdl_rbac_v5.shared_protocols ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sdl_rbac_v5.preferences,sdl_rbac_v5.shared_protocols FROM PUBLIC,anon,authenticated,service_role;

-- Caller holds enrollment lock and has reverified the guardian relationship.
CREATE FUNCTION sdl_rbac_v5.record_preference(e uuid,g uuid,c text,decision boolean,metrics text[])
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO sdl_rbac_v5.preferences(enrollment_id,generation,guardian,category,accepted,legacy_metrics)
 VALUES(e,g,auth.uid(),c,decision,metrics)
 ON CONFLICT(enrollment_id,generation,category,guardian) DO UPDATE SET
 accepted=EXCLUDED.accepted,legacy_metrics=EXCLUDED.legacy_metrics,changed_at=now();
 INSERT INTO sdl_rbac_v5.events(actor,organization_id,target_id,action,reason)
 SELECT auth.uid(),organization_id,e,c||CASE WHEN decision THEN '_accepted' ELSE '_withdrawn' END,'Guardian preference'
 FROM public.sdl_club_enrollments WHERE id=e;
END;
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.record_preference(uuid,uuid,text,boolean,text[]) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.sdl_004_club_consent(p_enrollment uuid,p_generation uuid,p_accept boolean,p_policy_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.sdl_club_enrollments%ROWTYPE; c public.sdl_club_consents%ROWTYPE;
BEGIN
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=p_enrollment FOR UPDATE;
 IF NOT FOUND OR NOT public.sdl_004_session_active() OR NOT public.sdl_004_guardian_athlete((SELECT auth.uid()),e.athlete_id) THEN
 RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF e.generation IS DISTINCT FROM p_generation THEN RAISE EXCEPTION 'Enrollment changed; refresh' USING ERRCODE='PT409'; END IF;
 IF p_accept IS NULL THEN RAISE EXCEPTION 'Explicit consent decision required' USING ERRCODE='22023'; END IF;
 IF p_accept AND (p_policy_version IS DISTINCT FROM 'sdl004-clubhouse-v1' OR e.status<>'active' OR e.ended_at IS NOT NULL OR e.started_at>now()
 OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=e.organization_id AND status='active')) THEN
 RAISE EXCEPTION 'Active enrollment and current consent policy required' USING ERRCODE='22023'; END IF;
 -- Lock the guardian/profile records before acceptance; revocation must serialize or roll back.
 PERFORM 1 FROM public.athlete_guardians WHERE athlete_id=e.athlete_id AND user_id=(SELECT auth.uid()) AND status='verified' FOR SHARE;
 PERFORM 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND status='active' FOR SHARE;
 IF NOT public.sdl_004_guardian_athlete((SELECT auth.uid()),e.athlete_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 PERFORM sdl_rbac_v5.record_preference(e.id,e.generation,'video',p_accept,NULL);
 SELECT * INTO c FROM public.sdl_club_consents WHERE enrollment_id=e.id AND enrollment_generation=e.generation
 AND withdrawn_at IS NULL AND invalidated_at IS NULL FOR UPDATE;
 IF p_accept THEN
  IF FOUND THEN RETURN; END IF; -- no annual renewal; repeated acceptance is idempotent
  INSERT INTO public.sdl_club_consents(enrollment_id,enrollment_generation,athlete_id,organization_id,guardian_id,policy_version)
  VALUES(e.id,e.generation,e.athlete_id,e.organization_id,(SELECT auth.uid()),p_policy_version) RETURNING * INTO c;
  INSERT INTO public.sdl_club_consent_events(enrollment_id,consent_id,actor,action,details)
  VALUES(e.id,c.id,(SELECT auth.uid()),'accepted',jsonb_build_object('generation',e.generation,'athlete_id',e.athlete_id,'organization_id',e.organization_id,'policy_version',c.policy_version,'accepted_at',c.accepted_at));
 ELSE
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.sdl_club_consents SET withdrawn_at=now() WHERE id=c.id;
  INSERT INTO public.sdl_club_consent_events(enrollment_id,consent_id,actor,action,details)
  VALUES(e.id,c.id,(SELECT auth.uid()),'withdrawn',jsonb_build_object('policy_version',c.policy_version,'accepted_at',c.accepted_at,'withdrawn_at',now()));
 END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_set_statistic_consent(p_enrollment uuid,p_generation uuid,p_roster boolean,p_metrics text[],p_policy_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.sdl_club_enrollments%ROWTYPE; receipt uuid;
BEGIN
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=p_enrollment FOR UPDATE;
 IF NOT FOUND OR NOT public.sdl_004_session_active() OR NOT public.sdl_004_guardian_athlete((SELECT auth.uid()),e.athlete_id) THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF e.generation IS DISTINCT FROM p_generation THEN RAISE EXCEPTION 'Enrollment changed; refresh' USING ERRCODE='PT409'; END IF;
 IF p_roster IS NULL OR p_metrics IS NULL OR array_position(p_metrics,NULL) IS NOT NULL
 OR NOT p_metrics <@ ARRAY['exit_velo','throwing_velo','sprint_time','broad_jump']::text[]
 OR (cardinality(p_metrics)>0 AND NOT p_roster)
 OR cardinality(p_metrics)<>(SELECT count(DISTINCT x) FROM unnest(p_metrics) x) THEN
  RAISE EXCEPTION 'Explicit baseball sharing choices required' USING ERRCODE='22023'; END IF;
 IF (p_roster OR cardinality(p_metrics)>0) AND ((p_policy_version IS NULL OR p_policy_version NOT IN ('sdl004-baseball-statistics-v1','baseball-sessions-v5'))
 OR e.status<>'active' OR e.ended_at IS NOT NULL OR e.started_at>now()
 OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=e.organization_id AND status='active')) THEN
  RAISE EXCEPTION 'Active enrollment and separate statistics policy required' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.athlete_guardians WHERE athlete_id=e.athlete_id AND user_id=(SELECT auth.uid()) AND status='verified' FOR SHARE;
 PERFORM 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND status='active' FOR SHARE;
 IF NOT public.sdl_004_guardian_athlete((SELECT auth.uid()),e.athlete_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_policy_version='baseball-sessions-v5' AND (NOT p_roster OR cardinality(p_metrics)<>4) THEN
 RAISE EXCEPTION 'Standing consent requires the entire approved category' USING ERRCODE='22023'; END IF;
 PERFORM sdl_rbac_v5.record_preference(e.id,e.generation,'statistics',p_roster,
 CASE WHEN p_policy_version='baseball-sessions-v5' THEN NULL ELSE p_metrics END);
 UPDATE public.sdl_statistic_consents SET withdrawn_at=now() WHERE enrollment_id=e.id
 AND enrollment_generation=e.generation AND withdrawn_at IS NULL AND invalidated_at IS NULL;
 IF p_roster THEN
  INSERT INTO public.sdl_statistic_consents(enrollment_id,enrollment_generation,guardian_id,policy_version,share_roster,metrics)
  VALUES(e.id,e.generation,(SELECT auth.uid()),p_policy_version,p_roster,p_metrics) RETURNING id INTO receipt;
 END IF;
 INSERT INTO public.sdl_club_consent_events(enrollment_id,actor,action,details)
 VALUES(e.id,(SELECT auth.uid()),'statistics_consent',jsonb_build_object('receipt',receipt,'generation',e.generation,
 'roster',p_roster,'metrics',p_metrics,'policy_version',p_policy_version));
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_clubhouse_member(p_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.teams t JOIN public.organizations o ON o.id=t.organization_id
 WHERE t.id=p_team_id AND t.status='active' AND o.status='active' AND (sdl_rbac_v5.is_platform_admin()
 OR sdl_rbac_v5.team_role_gate(t.id,'manage_roster'))) OR public.sdl_004_session_active() AND EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.organizations o ON o.id=t.organization_id
    JOIN public.team_memberships tm ON tm.team_id=t.id
    JOIN public.profiles pr ON pr.id=tm.user_id
    WHERE t.id=p_team_id AND t.status='active' AND o.status='active'
      AND tm.user_id=(SELECT auth.uid()) AND tm.status='active' AND pr.status='active'
      AND (
        (tm.role='coach' AND EXISTS (SELECT 1 FROM public.organization_memberships om
          WHERE om.organization_id=t.organization_id AND om.user_id=tm.user_id
            AND om.status='active' AND om.role IN ('staff','admin')))
        OR (tm.role='parent' AND EXISTS (SELECT 1 FROM public.athlete_guardians ag
          JOIN public.players child ON child.athlete_id=ag.athlete_id
          JOIN public.sdl_club_enrollments enrollment ON enrollment.athlete_id=child.athlete_id AND enrollment.organization_id=child.organization_id AND enrollment.status='active' AND enrollment.ended_at IS NULL AND enrollment.started_at<=now()
          JOIN public.player_team_memberships ptm ON ptm.player_id=child.id
            AND ptm.organization_id=child.organization_id
          WHERE ag.user_id=tm.user_id AND ag.status='verified'
            AND ptm.team_id=t.id AND ptm.organization_id=t.organization_id
            AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE))
      )
  );
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_active_club_consent(p_enrollment uuid,p_generation uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id FROM public.sdl_club_enrollments e JOIN public.sdl_club_consents c
 ON c.enrollment_id=e.id AND c.enrollment_generation=e.generation
 JOIN public.organizations o ON o.id=e.organization_id
 WHERE e.id=p_enrollment AND e.generation=p_generation AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()
 AND c.athlete_id=e.athlete_id AND c.organization_id=e.organization_id AND c.withdrawn_at IS NULL AND c.invalidated_at IS NULL
 AND o.status='active' AND public.sdl_004_guardian_athlete(c.guardian_id,e.athlete_id) AND NOT EXISTS(SELECT 1 FROM sdl_rbac_v5.preferences p WHERE p.enrollment_id=e.id AND p.generation=e.generation
 AND p.category='video' AND NOT p.accepted) LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_statistics_consent(p_enrollment uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id FROM public.sdl_club_enrollments e JOIN public.sdl_statistic_consents c
 ON c.enrollment_id=e.id AND c.enrollment_generation=e.generation
 JOIN public.organizations o ON o.id=e.organization_id AND o.status='active'
 WHERE e.id=p_enrollment AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()
 AND c.withdrawn_at IS NULL AND c.invalidated_at IS NULL
 AND public.sdl_004_guardian_athlete(c.guardian_id,e.athlete_id)
 AND NOT EXISTS(SELECT 1 FROM sdl_rbac_v5.preferences p WHERE p.enrollment_id=e.id AND p.generation=e.generation AND p.category='statistics'
 AND (NOT p.accepted OR (p.legacy_metrics IS NOT NULL AND (c.policy_version='baseball-sessions-v5' OR NOT c.metrics <@ p.legacy_metrics))));
$$;
CREATE INDEX sdl_v5_official_page ON public.sdl_official_statistics(organization_id,id) WHERE invalidated_at IS NULL;
CREATE FUNCTION public.sdl_v5_clubhouse_sessions(p_team uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid,player_id uuid,recorded_at date,protocol_id text,metric text,value numeric,unit text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_clubhouse_member(p_team) THEN RAISE EXCEPTION 'Team access denied' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT a.id,a.player_id,a.recorded_at::date,a.protocol_id,a.metric,a.value,proto.unit
 FROM public.teams t JOIN public.sdl_official_statistics a ON a.organization_id=t.organization_id
 JOIN public.players p ON p.id=a.player_id AND p.athlete_id=a.athlete_id AND p.organization_id=a.organization_id
 JOIN public.sdl_measurement_protocols proto ON proto.id=a.protocol_id AND proto.metric=a.metric AND proto.active
 JOIN sdl_rbac_v5.shared_protocols catalog ON catalog.protocol_id=proto.id
 JOIN public.sdl_club_enrollments e ON e.id=public.sdl_004_statistics_enrollment(p.id) AND e.id=a.enrollment_id AND e.generation=a.enrollment_generation
 JOIN public.sdl_statistic_consents c ON c.id=public.sdl_004_statistics_consent(e.id) AND c.share_roster AND c.policy_version=catalog.notice
 WHERE t.id=p_team AND (p_after IS NULL OR a.id>p_after) AND a.invalidated_at IS NULL
 AND public.sdl_004_pilot_profile_approved(p.id) AND a.source_hash=public.sdl_004_statistics_source_hash(a.session_id)
 AND EXISTS(SELECT 1 FROM public.player_team_memberships pm WHERE pm.team_id=t.id AND pm.player_id=p.id
 AND pm.organization_id=t.organization_id AND pm.status='active' AND pm.start_date<=CURRENT_DATE AND pm.end_date IS NULL)
 ORDER BY a.id LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.sdl_v5_clubhouse_sessions(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_clubhouse_sessions(uuid,uuid,integer) TO authenticated;

COMMIT;
