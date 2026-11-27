BEGIN;
CREATE TABLE sdl_rbac_v5.local_restrictions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guardian uuid NOT NULL REFERENCES public.profiles(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),team_id uuid REFERENCES public.teams(id),
 UNIQUE NULLS NOT DISTINCT(guardian,organization_id,team_id));
CREATE TABLE sdl_rbac_v5.verified_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),action text NOT NULL CHECK(action IN ('guardian_unlink','team_support')),
 target_id uuid NOT NULL,scope_id uuid NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz);
ALTER TABLE sdl_rbac_v5.local_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdl_rbac_v5.verified_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sdl_rbac_v5.local_restrictions,sdl_rbac_v5.verified_cases FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION sdl_rbac_v5.guardian_team_allowed(p_user uuid,p_org uuid,p_team uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM sdl_rbac_v5.local_restrictions r WHERE r.guardian=p_user AND r.organization_id=p_org
 AND (r.team_id IS NULL OR r.team_id=p_team));
$$;
CREATE FUNCTION sdl_rbac_v5.guardian_participates(p_user uuid,p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT public.sdl_004_guardian_for(p_user,p_player) AND EXISTS(SELECT 1 FROM public.players p
 JOIN public.player_team_memberships pm ON pm.player_id=p.id AND pm.organization_id=p.organization_id
 JOIN public.teams t ON t.id=pm.team_id AND t.organization_id=p.organization_id AND t.status='active'
 WHERE p.id=p_player AND pm.status='active' AND pm.start_date<=CURRENT_DATE AND pm.end_date IS NULL
 AND public.sdl_004_statistics_enrollment(p.id) IS NOT NULL AND sdl_rbac_v5.guardian_team_allowed(p_user,p.organization_id,t.id));
$$;
CREATE FUNCTION public.sdl_v5_restrict_guardian(p_user uuid,p_org uuid,p_team uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.organizations WHERE id=p_org FOR UPDATE;
 IF (p_team IS NULL AND NOT sdl_rbac_v5.is_club_admin(p_org)) OR
 (p_team IS NOT NULL AND (NOT sdl_rbac_v5.team_role_gate(p_team,'manage_roster')
 OR NOT EXISTS(SELECT 1 FROM public.teams WHERE id=p_team AND organization_id=p_org)))
 OR NOT EXISTS(SELECT 1 FROM public.athlete_guardians ag JOIN public.players p ON p.athlete_id=ag.athlete_id
 JOIN public.player_team_memberships pm ON pm.player_id=p.id AND pm.organization_id=p.organization_id
 WHERE ag.user_id=p_user AND ag.status='verified' AND p.organization_id=p_org
 AND (p_team IS NULL OR pm.team_id=p_team) AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE)
 THEN RAISE EXCEPTION 'Local scope denied' USING ERRCODE='42501'; END IF;
 INSERT INTO sdl_rbac_v5.local_restrictions(guardian,organization_id,team_id) VALUES(p_user,p_org,p_team) ON CONFLICT DO NOTHING;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,team_id,target_id,reason)
 VALUES(auth.uid(),'guardian_local_restriction',p_org,p_team,p_user,p_reason);
END;
$$;

CREATE FUNCTION public.sdl_v5_unlink_guardian(p_case uuid,p_athlete uuid,p_user uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT sdl_rbac_v5.is_platform_admin() THEN RAISE EXCEPTION 'Platform authorization required' USING ERRCODE='42501'; END IF;
 UPDATE sdl_rbac_v5.verified_cases SET used_at=now() WHERE id=p_case AND target_id=p_user AND scope_id=p_athlete
 AND action='guardian_unlink' AND expires_at>now() AND used_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verified case required' USING ERRCODE='42501'; END IF;
 UPDATE public.athlete_guardians SET status='revoked',updated_at=now()
 WHERE athlete_id=p_athlete AND user_id=p_user AND status='verified';
 IF NOT FOUND THEN RAISE EXCEPTION 'Relationship changed' USING ERRCODE='PT409'; END IF;
 INSERT INTO sdl_rbac_v5.events(actor,action,player_id,target_id,reason)
 SELECT auth.uid(),'guardian_unlinked',p.id,p_user,p_reason FROM public.players p WHERE p.athlete_id=p_athlete;
END;
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.guardian_team_allowed(uuid,uuid,uuid),sdl_rbac_v5.guardian_participates(uuid,uuid),
 public.sdl_v5_restrict_guardian(uuid,uuid,uuid,text),public.sdl_v5_unlink_guardian(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_restrict_guardian(uuid,uuid,uuid,text),public.sdl_v5_unlink_guardian(uuid,uuid,uuid,text) TO authenticated;
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
        OR (tm.role='parent' AND sdl_rbac_v5.guardian_team_allowed(auth.uid(),o.id,t.id) AND EXISTS (SELECT 1 FROM public.athlete_guardians ag
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
CREATE OR REPLACE FUNCTION sdl_rbac_v5.upload_role(p_user uuid,p_player uuid) RETURNS text
LANGUAGE sql STABLE SET search_path='' AS $$
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
 WHERE p.id=p_player AND e.recording_storage_authorized AND nullif(btrim(e.recording_permission_ref),'') IS NOT NULL;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_submit_performance(p_player uuid,p_protocol text,p_value numeric,p_date date,p_evidence text,p_key uuid,p_official boolean DEFAULT false,p_video uuid DEFAULT NULL,p_supersedes uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.sdl_club_enrollments%ROWTYPE;proto public.sdl_measurement_protocols%ROWTYPE;r public.sdl_performance_submissions%ROWTYPE;org uuid;fingerprint text;BEGIN
 IF NOT public.sdl_004_session_active() OR p_official IS NULL OR NOT(CASE WHEN p_official THEN sdl_rbac_v5.player_role_gate(p_player,'enter_official_statistics') ELSE sdl_rbac_v5.guardian_participates(auth.uid(),p_player) END) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p_player) FOR SHARE;
 SELECT * INTO proto FROM public.sdl_measurement_protocols WHERE id=p_protocol AND active;
 IF e.id IS NULL OR proto.id IS NULL OR p_date IS NULL OR p_date>CURRENT_DATE OR p_date<'1900-01-01' OR p_value IS NULL OR NOT(p_value>0 AND p_value<='500')
 OR p_evidence IS NULL OR char_length(btrim(p_evidence)) NOT BETWEEN 1 AND 1000 OR p_key IS NULL THEN RAISE EXCEPTION 'Invalid performance measurement' USING ERRCODE='22023'; END IF;
 IF p_video IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sdl_video_submissions WHERE id=p_video AND player_id=p_player AND public.sdl_004_submission_can_read(id)) THEN RAISE EXCEPTION 'Evidence unavailable' USING ERRCODE='42501'; END IF;
 SELECT organization_id INTO org FROM public.players WHERE id=p_player;
 fingerprint=md5(jsonb_build_array(p_player,p_protocol,p_value,p_date,p_evidence,p_official,p_video,p_supersedes)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended((SELECT auth.uid())::text||p_key::text,0));
 SELECT * INTO r FROM public.sdl_performance_submissions WHERE submitted_by=(SELECT auth.uid()) AND request_key=p_key;
 IF r.id IS NOT NULL THEN
  IF r.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Request key conflict' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('id',r.id,'status',r.status,'revision',r.revision);
 END IF;
 IF p_supersedes IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sdl_performance_submissions
 WHERE id=p_supersedes AND player_id=p_player AND superseded_by IS NULL AND enrollment_id=e.id AND enrollment_generation=e.generation
 AND (status='approved' OR (NOT p_official AND status='rejected' AND submitted_by=auth.uid()))) THEN
 RAISE EXCEPTION 'Invalid correction reference' USING ERRCODE='22023'; END IF;
 INSERT INTO public.sdl_performance_submissions(player_id,organization_id,enrollment_id,enrollment_generation,protocol_id,value,measurement_date,source_kind,status,submitted_by,evidence,evidence_video_id,reviewed_by,reviewed_at,supersedes,request_key,request_fingerprint)
 VALUES(p_player,org,e.id,e.generation,p_protocol,p_value,p_date,CASE WHEN p_official THEN CASE WHEN sdl_rbac_v5.has_player_role(p_player,'coach') THEN 'coach'
 WHEN sdl_rbac_v5.has_player_role(p_player,'manager') THEN 'manager' ELSE 'club_admin' END ELSE 'parent' END,CASE WHEN p_official THEN 'approved' ELSE 'pending' END,
 (SELECT auth.uid()),p_evidence,p_video,CASE WHEN p_official THEN (SELECT auth.uid()) END,CASE WHEN p_official THEN now() END,p_supersedes,p_key,fingerprint) RETURNING * INTO r;
 PERFORM public.sdl_004_pilot_audit(p_player,org,CASE WHEN p_official THEN r.source_kind||'_official_entry' ELSE 'performance_submitted' END,r.id,jsonb_build_object('value',p_value,'protocol_id',p_protocol,'measurement_date',p_date,'evidence',p_evidence,'evidence_video_id',p_video));
 IF p_official THEN PERFORM public.sdl_004_pilot_officialize(r.id); END IF;
 RETURN jsonb_build_object('id',r.id,'status',r.status,'revision',r.revision);
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_correct_performance(p_id uuid,p_protocol text,p_value numeric,p_date date,p_evidence text,p_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.sdl_performance_submissions%ROWTYPE;BEGIN
 SELECT * INTO p FROM public.sdl_performance_submissions WHERE id=p_id FOR UPDATE;
 IF p.id IS NULL OR p.submitted_by IS DISTINCT FROM auth.uid() OR p.source_kind<>'parent' OR NOT EXISTS(
 SELECT 1 FROM public.sdl_club_enrollments e WHERE e.id=public.sdl_004_statistics_enrollment(p.player_id)
 AND e.id=p.enrollment_id AND e.generation=p.enrollment_generation) OR NOT public.sdl_004_session_active() OR NOT sdl_rbac_v5.guardian_participates(auth.uid(),p.player_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p.revision IS DISTINCT FROM p_revision OR p.status NOT IN('pending','correction_requested') THEN RAISE EXCEPTION 'Submission cannot be edited; submit a correction for coach review' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sdl_measurement_protocols WHERE id=p_protocol AND active) OR p_value IS NULL OR NOT(p_value>0 AND p_value<=500)
 OR p_date IS NULL OR p_date>CURRENT_DATE OR p_date<'1900-01-01' OR p_evidence IS NULL OR char_length(btrim(p_evidence)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid correction' USING ERRCODE='22023'; END IF;
 PERFORM public.sdl_004_pilot_audit(p.player_id,p.organization_id,'performance_corrected',p.id,jsonb_build_object('previous',jsonb_build_object('value',p.value,'protocol_id',p.protocol_id,'measurement_date',p.measurement_date,'evidence',p.evidence),'value',p_value,'protocol_id',p_protocol,'measurement_date',p_date,'evidence',p_evidence,'revision',p.revision+1));
 UPDATE public.sdl_performance_submissions SET protocol_id=p_protocol,value=p_value,measurement_date=p_date,evidence=p_evidence,status='pending',review_note='',reviewed_by=NULL,reviewed_at=NULL,revision=revision+1 WHERE id=p.id;
END;
$$;
CREATE OR REPLACE FUNCTION sdl_rbac_v5.record_preference(e uuid,g uuid,c text,decision boolean,metrics text[])
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF decision AND NOT EXISTS(SELECT 1 FROM public.sdl_club_enrollments en JOIN public.players p
 ON p.athlete_id=en.athlete_id AND p.organization_id=en.organization_id WHERE en.id=e AND sdl_rbac_v5.guardian_participates(auth.uid(),p.id))
 THEN RAISE EXCEPTION 'Participation restricted' USING ERRCODE='42501'; END IF;
 INSERT INTO sdl_rbac_v5.preferences(enrollment_id,generation,guardian,category,accepted,legacy_metrics)
 VALUES(e,g,auth.uid(),c,decision,metrics)
 ON CONFLICT(enrollment_id,generation,category,guardian) DO UPDATE SET
 accepted=EXCLUDED.accepted,legacy_metrics=EXCLUDED.legacy_metrics,changed_at=now();
 INSERT INTO sdl_rbac_v5.events(actor,organization_id,target_id,action,reason)
 SELECT auth.uid(),organization_id,e,c||CASE WHEN decision THEN '_accepted' ELSE '_withdrawn' END,'Guardian preference'
 FROM public.sdl_club_enrollments WHERE id=e;
END;
$$;
COMMIT;
