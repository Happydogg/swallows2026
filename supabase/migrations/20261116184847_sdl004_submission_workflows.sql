-- STAGING RELEASE CANDIDATE. Existing CLI-generated migration, not applied.
-- Standing Clubhouse consent is scoped to one continuous athlete/club enrollment.
-- Team assignments are deliberately NOT enrollment lifecycle events.
BEGIN;
CREATE TABLE public.sdl_club_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 athlete_id uuid NOT NULL, organization_id uuid NOT NULL REFERENCES public.organizations(id),
 generation uuid NOT NULL DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','ended')),
 started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 recording_storage_authorized boolean NOT NULL DEFAULT false,
 recording_permission_ref text NOT NULL DEFAULT '',
 CHECK(NOT recording_storage_authorized OR char_length(btrim(recording_permission_ref)) BETWEEN 1 AND 500),
 CHECK(status<>'active' OR ended_at IS NULL)
);
CREATE UNIQUE INDEX ON public.sdl_club_enrollments(athlete_id,organization_id) WHERE status='active';
CREATE TABLE public.sdl_club_consents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 enrollment_id uuid NOT NULL REFERENCES public.sdl_club_enrollments(id),
 enrollment_generation uuid NOT NULL, athlete_id uuid NOT NULL, organization_id uuid NOT NULL,
 guardian_id uuid NOT NULL REFERENCES auth.users(id), policy_version text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz,
 invalidated_at timestamptz, invalidation_reason text
);
CREATE UNIQUE INDEX ON public.sdl_club_consents(enrollment_id,enrollment_generation)
 WHERE withdrawn_at IS NULL AND invalidated_at IS NULL;
CREATE TABLE public.sdl_club_consent_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id uuid NOT NULL REFERENCES public.sdl_club_enrollments(id),
 consent_id uuid REFERENCES public.sdl_club_consents(id), actor uuid, action text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(), details jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX ON public.sdl_club_consent_events(enrollment_id,occurred_at);
CREATE TABLE public.sdl_video_submissions (
 id uuid PRIMARY KEY REFERENCES public.sdl_media_objects(id),
 player_id uuid NOT NULL REFERENCES public.players(id), athlete_id uuid NOT NULL,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 enrollment_id uuid REFERENCES public.sdl_club_enrollments(id), enrollment_generation uuid,
 submitted_by uuid NOT NULL REFERENCES auth.users(id),
 source_kind text NOT NULL CHECK(source_kind IN ('parent','coach')),
 category text NOT NULL CHECK(category IN ('pitching','batting','throwing')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 publication_team_ids uuid[] NOT NULL DEFAULT '{}', publication_consent_id uuid REFERENCES public.sdl_club_consents(id),
 subject_scope text NOT NULL DEFAULT 'unknown' CHECK(subject_scope IN ('unknown','single_athlete','multiple')),
 subject_confirmed_by uuid REFERENCES auth.users(id), subject_confirmed_at timestamptz,
 review_note text NOT NULL DEFAULT '' CHECK(char_length(review_note)<=1000),
 history jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(history)='array'),
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by uuid REFERENCES auth.users(id)
);
CREATE INDEX ON public.sdl_video_submissions(player_id,created_at DESC);
CREATE TABLE public.sdl_submission_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 request_key uuid NOT NULL, player_id uuid NOT NULL REFERENCES public.players(id),
 athlete_id uuid NOT NULL, organization_id uuid NOT NULL, enrollment_id uuid REFERENCES public.sdl_club_enrollments(id),
 enrollment_generation uuid, source_kind text NOT NULL CHECK(source_kind IN ('parent','coach')),
 session_id uuid NOT NULL, fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
 byte_size bigint NOT NULL CHECK(byte_size>0 AND byte_size<=20971520),
 category text NOT NULL CHECK(category IN ('pitching','batting','throwing')),
 claim uuid NOT NULL, lease_until timestamptz NOT NULL, completed boolean NOT NULL DEFAULT false,
 UNIQUE(user_id,request_key)
);
DO $tables$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['sdl_club_enrollments','sdl_club_consents','sdl_club_consent_events','sdl_video_submissions','sdl_submission_uploads'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO service_role',tab);
 END LOOP;
END $tables$;
-- Mutations occur only through narrow RPCs. No direct service-key edits to consent/audit.
CREATE FUNCTION public.sdl_004_session_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
   SELECT 1 FROM auth.sessions s WHERE s.user_id=(SELECT auth.uid())
   AND s.id=CASE WHEN auth.jwt()->>'session_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     THEN (auth.jwt()->>'session_id')::uuid END
   AND (s.not_after IS NULL OR s.not_after>now()));
$$;

CREATE FUNCTION public.sdl_004_guardian_for(p_user uuid,p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_user IS NOT NULL AND EXISTS (SELECT 1 FROM public.players p
 JOIN public.athlete_guardians ag ON ag.athlete_id=p.athlete_id
 JOIN public.profiles pr ON pr.id=ag.user_id
 WHERE p.id=p_player AND ag.user_id=p_user AND ag.status='verified' AND pr.status='active');
$$;

CREATE FUNCTION public.sdl_004_coach_for(p_user uuid,p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_user IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.players p JOIN public.player_team_memberships ptm
 ON ptm.player_id=p.id AND ptm.organization_id=p.organization_id
 JOIN public.teams t ON t.id=ptm.team_id AND t.organization_id=ptm.organization_id
 JOIN public.organizations o ON o.id=t.organization_id
 JOIN public.team_memberships tm ON tm.team_id=t.id AND tm.user_id=p_user
 JOIN public.organization_memberships om ON om.organization_id=o.id AND om.user_id=p_user
 JOIN public.profiles pr ON pr.id=p_user
 WHERE p.id=p_player AND pr.status='active' AND o.status='active' AND t.status='active'
 AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE
 AND tm.status='active' AND tm.role='coach' AND om.status='active' AND om.role IN ('staff','admin'));
$$;

CREATE FUNCTION public.sdl_004_guardian_athlete(p_user uuid,p_athlete uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_user IS NOT NULL AND EXISTS(SELECT 1 FROM public.athlete_guardians g JOIN public.profiles pr ON pr.id=g.user_id
 WHERE g.user_id=p_user AND g.athlete_id=p_athlete AND g.status='verified' AND pr.status='active');
$$;
CREATE FUNCTION public.sdl_004_club_admin(p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND EXISTS(SELECT 1 FROM public.organization_memberships m
 JOIN public.organizations o ON o.id=m.organization_id JOIN public.profiles p ON p.id=m.user_id
 WHERE m.organization_id=p_org AND m.user_id=(SELECT auth.uid()) AND m.role='admin' AND m.status='active'
 AND o.status='active' AND p.status='active');
$$;
CREATE FUNCTION public.sdl_004_coach_team(p_user uuid,p_player uuid,p_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_coach_for(p_user,p_player) AND EXISTS(SELECT 1 FROM public.players p
 JOIN public.player_team_memberships pm ON pm.player_id=p.id AND pm.organization_id=p.organization_id
 JOIN public.teams t ON t.id=pm.team_id AND t.organization_id=p.organization_id
 JOIN public.team_memberships tm ON tm.team_id=t.id AND tm.user_id=p_user
 WHERE p.id=p_player AND t.id=p_team AND t.status='active' AND pm.status='active' AND pm.end_date IS NULL
 AND pm.start_date<=CURRENT_DATE AND tm.status='active' AND tm.role='coach');
$$;
CREATE FUNCTION public.sdl_004_recording_allowed(p_user uuid,p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_coach_for(p_user,p_player) AND EXISTS(SELECT 1 FROM public.players p
 JOIN public.sdl_club_enrollments e ON e.athlete_id=p.athlete_id AND e.organization_id=p.organization_id
 WHERE p.id=p_player AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now() AND e.recording_storage_authorized);
$$;
CREATE FUNCTION public.sdl_004_submission_can_submit(p_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND (public.sdl_004_guardian_for((SELECT auth.uid()),p_player_id)
 OR public.sdl_004_recording_allowed((SELECT auth.uid()),p_player_id));
$$;
CREATE FUNCTION public.sdl_004_submission_is_guardian(p_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND public.sdl_004_guardian_for((SELECT auth.uid()),p_player_id);
$$;

CREATE FUNCTION public.sdl_004_submission_can_review(p_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND public.sdl_004_coach_for((SELECT auth.uid()),p_player_id);
$$;

CREATE FUNCTION public.sdl_004_clubhouse_member(p_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.sdl_004_session_active() AND EXISTS (
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

-- Trusted enrollment administration is independent of team roster transfers.
-- No enrollment or recording permission is inferred/backfilled from existing team rows.
CREATE FUNCTION public.sdl_004_set_club_enrollment(p_athlete uuid,p_organization uuid,p_status text,p_enrollment uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.sdl_club_enrollments%ROWTYPE; result uuid;
BEGIN
 IF NOT public.sdl_004_club_admin(p_organization) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('active','inactive','ended') OR NOT EXISTS(
 SELECT 1 FROM public.players WHERE athlete_id=p_athlete AND organization_id=p_organization) THEN
 RAISE EXCEPTION 'Invalid enrollment' USING ERRCODE='22023'; END IF;
 IF p_enrollment IS NULL THEN
  INSERT INTO public.sdl_club_enrollments(athlete_id,organization_id,status,ended_at)
  VALUES(p_athlete,p_organization,p_status,CASE WHEN p_status<>'active' THEN now() END) RETURNING id INTO result;
 ELSE
  SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=p_enrollment FOR UPDATE;
  IF NOT FOUND OR e.athlete_id<>p_athlete OR e.organization_id<>p_organization THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  UPDATE public.sdl_club_enrollments SET status=p_status,ended_at=CASE WHEN p_status<>'active' THEN coalesce(ended_at,now()) END,
   started_at=CASE WHEN status<>'active' AND p_status='active' THEN now() ELSE started_at END WHERE id=e.id;
  result=e.id;
 END IF;
 RETURN result;
END;
$$;
CREATE FUNCTION public.sdl_004_set_recording_permission(p_enrollment uuid,p_allowed boolean,p_permission_ref text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.sdl_club_enrollments%ROWTYPE;
BEGIN
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=p_enrollment FOR UPDATE;
 IF NOT FOUND OR NOT public.sdl_004_club_admin(e.organization_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_allowed IS NULL OR p_permission_ref IS NULL OR char_length(btrim(p_permission_ref)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Recording permission reference required' USING ERRCODE='22023'; END IF;
 UPDATE public.sdl_club_enrollments SET recording_storage_authorized=p_allowed,recording_permission_ref=p_permission_ref WHERE id=e.id;
 INSERT INTO public.sdl_club_consent_events(enrollment_id,actor,action,details)
 VALUES(e.id,(SELECT auth.uid()),'recording_permission',jsonb_build_object('allowed',p_allowed,'reference',p_permission_ref));
END;
$$;
CREATE FUNCTION public.sdl_004_active_club_consent(p_enrollment uuid,p_generation uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id FROM public.sdl_club_enrollments e JOIN public.sdl_club_consents c
 ON c.enrollment_id=e.id AND c.enrollment_generation=e.generation
 JOIN public.organizations o ON o.id=e.organization_id
 WHERE e.id=p_enrollment AND e.generation=p_generation AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()
 AND c.athlete_id=e.athlete_id AND c.organization_id=e.organization_id AND c.withdrawn_at IS NULL AND c.invalidated_at IS NULL
 AND o.status='active' AND public.sdl_004_guardian_athlete(c.guardian_id,e.athlete_id) LIMIT 1;
$$;
CREATE FUNCTION public.sdl_004_club_consent(p_enrollment uuid,p_generation uuid,p_accept boolean,p_policy_version text)
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
CREATE FUNCTION public.sdl_004_list_club_consents(p_athlete uuid)
RETURNS TABLE(id uuid,generation uuid,athlete_id uuid,organization_id uuid,organization_name text,status text,
 consent_active boolean,policy_version text,accepted_at timestamptz,withdrawn_at timestamptz,history jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.id,e.generation,e.athlete_id,e.organization_id,o.name,e.status,
 public.sdl_004_active_club_consent(e.id,e.generation) IS NOT NULL,c.policy_version,c.accepted_at,c.withdrawn_at,
 coalesce((SELECT jsonb_agg(jsonb_build_object('action',h.action,'at',h.occurred_at,'policy_version',h.details->>'policy_version') ORDER BY h.occurred_at,h.id)
 FROM public.sdl_club_consent_events h WHERE h.enrollment_id=e.id),'[]'::jsonb)
 FROM public.sdl_club_enrollments e JOIN public.organizations o ON o.id=e.organization_id
 LEFT JOIN LATERAL(SELECT cc.* FROM public.sdl_club_consents cc WHERE cc.enrollment_id=e.id AND cc.enrollment_generation=e.generation ORDER BY cc.accepted_at DESC,cc.id DESC LIMIT 1)c ON true
 WHERE e.athlete_id=p_athlete AND public.sdl_004_session_active() AND public.sdl_004_guardian_athlete((SELECT auth.uid()),p_athlete);
$$;
CREATE FUNCTION public.sdl_004_enrollment_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.sdl_club_consent_events(enrollment_id,actor,action,details)
  VALUES(NEW.id,(SELECT auth.uid()),'enrollment_created',jsonb_build_object('generation',NEW.generation,'status',NEW.status)); RETURN NEW;
 END IF;
 IF ROW(OLD.id,OLD.athlete_id,OLD.organization_id,OLD.status,OLD.started_at,OLD.ended_at,OLD.generation)
 IS DISTINCT FROM ROW(NEW.id,NEW.athlete_id,NEW.organization_id,NEW.status,NEW.started_at,NEW.ended_at,NEW.generation) THEN
  NEW.generation=gen_random_uuid();
  NEW.recording_storage_authorized=false; NEW.recording_permission_ref='';
  WITH invalidated AS(UPDATE public.sdl_club_consents SET invalidated_at=now(),invalidation_reason='enrollment_changed'
   WHERE enrollment_id=OLD.id AND withdrawn_at IS NULL AND invalidated_at IS NULL RETURNING id)
  INSERT INTO public.sdl_club_consent_events(enrollment_id,consent_id,actor,action,details)
  SELECT OLD.id,id,(SELECT auth.uid()),'invalidated',jsonb_build_object('reason','enrollment_changed','old_generation',OLD.generation,'new_generation',NEW.generation) FROM invalidated;
  INSERT INTO public.sdl_club_consent_events(enrollment_id,actor,action,details)
  VALUES(OLD.id,(SELECT auth.uid()),'enrollment_changed',jsonb_build_object('from',OLD.status,'to',NEW.status,'new_generation',NEW.generation));
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER sdl_004_enrollment_created AFTER INSERT ON public.sdl_club_enrollments FOR EACH ROW EXECUTE FUNCTION public.sdl_004_enrollment_lifecycle();
CREATE TRIGGER sdl_004_enrollment_changed BEFORE UPDATE ON public.sdl_club_enrollments FOR EACH ROW EXECUTE FUNCTION public.sdl_004_enrollment_lifecycle();
CREATE FUNCTION public.sdl_004_immutable_consent_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Consent audit is immutable' USING ERRCODE='42501'; END;
$$;
CREATE TRIGGER sdl_004_immutable_consent_events BEFORE UPDATE OR DELETE ON public.sdl_club_consent_events FOR EACH ROW EXECUTE FUNCTION public.sdl_004_immutable_consent_audit();
CREATE TRIGGER sdl_004_no_truncate_consent_events BEFORE TRUNCATE ON public.sdl_club_consent_events FOR EACH STATEMENT EXECUTE FUNCTION public.sdl_004_immutable_consent_audit();
CREATE FUNCTION public.sdl_004_guardian_consent_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='athlete_guardians' THEN
  IF TG_OP='UPDATE' AND ROW(OLD.user_id,OLD.athlete_id,OLD.status) IS NOT DISTINCT FROM ROW(NEW.user_id,NEW.athlete_id,NEW.status) THEN RETURN NEW; END IF;
  WITH invalidated AS(UPDATE public.sdl_club_consents SET invalidated_at=now(),invalidation_reason='guardian_changed'
   WHERE guardian_id=OLD.user_id AND athlete_id=OLD.athlete_id AND withdrawn_at IS NULL AND invalidated_at IS NULL RETURNING id,enrollment_id)
  INSERT INTO public.sdl_club_consent_events(enrollment_id,consent_id,actor,action,details)
  SELECT enrollment_id,id,(SELECT auth.uid()),'invalidated',jsonb_build_object('reason','guardian_changed') FROM invalidated;
 ELSE
  IF TG_OP='UPDATE' AND ROW(OLD.id,OLD.status) IS NOT DISTINCT FROM ROW(NEW.id,NEW.status) THEN RETURN NEW; END IF;
  WITH invalidated AS(UPDATE public.sdl_club_consents SET invalidated_at=now(),invalidation_reason='guardian_profile_changed'
   WHERE guardian_id=OLD.id AND withdrawn_at IS NULL AND invalidated_at IS NULL RETURNING id,enrollment_id)
  INSERT INTO public.sdl_club_consent_events(enrollment_id,consent_id,actor,action,details)
  SELECT enrollment_id,id,(SELECT auth.uid()),'invalidated',jsonb_build_object('reason','guardian_profile_changed') FROM invalidated;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER sdl_004_guardian_consent_changed AFTER UPDATE OF user_id,athlete_id,status OR DELETE ON public.athlete_guardians FOR EACH ROW EXECUTE FUNCTION public.sdl_004_guardian_consent_lifecycle();
CREATE TRIGGER sdl_004_guardian_profile_changed AFTER UPDATE OF id,status OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sdl_004_guardian_consent_lifecycle();
CREATE FUNCTION public.sdl_004_reserve_submission(p_player_id uuid,p_request_key uuid,p_claim uuid,
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
 CASE WHEN public.sdl_004_guardian_for((SELECT auth.uid()),p_player_id) THEN 'parent' ELSE 'coach' END,
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
CREATE FUNCTION public.sdl_004_finish_submission(p_request_key uuid,p_claim uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.sdl_submission_uploads%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.sdl_submission_uploads WHERE user_id=p_user_id AND request_key=p_request_key FOR UPDATE;
 IF NOT FOUND OR r.claim<>p_claim THEN RAISE EXCEPTION 'Upload conflict' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=r.session_id AND user_id=p_user_id AND (not_after IS NULL OR not_after>now()))
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=r.player_id AND athlete_id=r.athlete_id AND organization_id=r.organization_id)
 OR NOT(CASE WHEN r.source_kind='parent' THEN public.sdl_004_guardian_for(p_user_id,r.player_id)
 ELSE public.sdl_004_recording_allowed(p_user_id,r.player_id) END) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
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
CREATE FUNCTION public.sdl_004_review_submission(p_id uuid,p_decision text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sdl_video_submissions%ROWTYPE;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') OR p_note IS NULL OR char_length(p_note)>1000 THEN RAISE EXCEPTION 'Invalid review' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.sdl_video_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=s.player_id AND athlete_id=s.athlete_id AND organization_id=s.organization_id) OR NOT public.sdl_004_submission_can_review(s.player_id) OR s.submitted_by=(SELECT auth.uid()) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF s.status<>'pending' THEN RAISE EXCEPTION 'Already reviewed' USING ERRCODE='PT409'; END IF;
 UPDATE public.sdl_video_submissions SET status=p_decision,review_note=p_note,reviewed_at=now(),reviewed_by=(SELECT auth.uid()),
 history=history||jsonb_build_array(jsonb_build_object('action',p_decision,'actor',(SELECT auth.uid()),'at',now(),'note',p_note)) WHERE id=s.id;
END;
$$;
CREATE FUNCTION public.sdl_004_submission_can_publish(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND EXISTS(SELECT 1 FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 WHERE s.id=p_id AND s.status='approved' AND public.sdl_004_coach_for((SELECT auth.uid()),s.player_id)
 AND public.sdl_004_active_club_consent(s.enrollment_id,s.enrollment_generation) IS NOT NULL);
$$;
CREATE FUNCTION public.sdl_004_publish_submission(p_id uuid,p_team_ids uuid[],p_subject_athletes uuid[])
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
  IF EXISTS(SELECT 1 FROM unnest(p_team_ids) wanted WHERE wanted IS NULL OR NOT public.sdl_004_coach_team((SELECT auth.uid()),s.player_id,wanted)
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
CREATE FUNCTION public.sdl_004_clubhouse_visible(p_id uuid,p_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_clubhouse_member(p_team) AND EXISTS(SELECT 1 FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 JOIN public.player_team_memberships pm ON pm.player_id=p.id AND pm.organization_id=s.organization_id
 JOIN public.teams t ON t.id=pm.team_id AND t.organization_id=s.organization_id
 WHERE s.id=p_id AND s.status='approved' AND s.subject_scope='single_athlete' AND s.subject_confirmed_by IS NOT NULL
 AND t.id=p_team AND t.status='active' AND p_team=ANY(s.publication_team_ids)
 AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE
 AND s.publication_consent_id=public.sdl_004_active_club_consent(s.enrollment_id,s.enrollment_generation));
$$;
CREATE FUNCTION public.sdl_004_submission_can_read(p_submission_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND EXISTS(SELECT 1 FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 WHERE s.id=p_submission_id AND (public.sdl_004_guardian_for((SELECT auth.uid()),s.player_id)
 OR public.sdl_004_coach_for((SELECT auth.uid()),s.player_id)
 OR EXISTS(SELECT 1 FROM unnest(s.publication_team_ids) team WHERE public.sdl_004_clubhouse_visible(s.id,team))));
$$;
CREATE FUNCTION public.sdl_004_list_submissions(p_player_id uuid)
RETURNS TABLE(id uuid,player_id uuid,athlete_id uuid,category text,status text,source_kind text,created_at timestamptz,
 review_note text,history jsonb,can_review boolean,can_publish boolean,publication_team_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id,s.player_id,s.athlete_id,s.category,s.status,s.source_kind,s.created_at,s.review_note,s.history,
 s.status='pending' AND s.submitted_by<>(SELECT auth.uid()) AND public.sdl_004_submission_can_review(s.player_id),
 public.sdl_004_submission_can_publish(s.id),s.publication_team_ids FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 WHERE s.player_id=p_player_id AND public.sdl_004_session_active() AND (public.sdl_004_guardian_for((SELECT auth.uid()),s.player_id)
 OR public.sdl_004_coach_for((SELECT auth.uid()),s.player_id)) ORDER BY s.created_at DESC LIMIT 30;
$$;
CREATE FUNCTION public.sdl_004_review_queue(p_team_id uuid,p_status text DEFAULT 'pending')
RETURNS TABLE(id uuid,player_id uuid,athlete_id uuid,preferred_name text,team_id uuid,team_name text,category text,status text,
 source_kind text,created_at timestamptz,review_note text,history jsonb,can_review boolean,can_publish boolean,publication_team_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id,s.player_id,s.athlete_id,p.preferred_name,t.id,t.name,s.category,s.status,s.source_kind,s.created_at,s.review_note,s.history,
 s.status='pending' AND s.submitted_by<>(SELECT auth.uid()),public.sdl_004_submission_can_publish(s.id),s.publication_team_ids
 FROM public.sdl_video_submissions s JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 JOIN public.teams t ON t.id=p_team_id AND t.organization_id=s.organization_id
 WHERE public.sdl_004_session_active() AND public.sdl_004_coach_team((SELECT auth.uid()),s.player_id,p_team_id)
 AND (p_status='all' OR s.status=p_status) ORDER BY s.created_at DESC LIMIT 50;
$$;
CREATE FUNCTION public.sdl_004_clubhouse_videos(p_team_id uuid)
RETURNS TABLE(id uuid,player_id uuid,category text,created_at timestamptz,preferred_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id,s.player_id,s.category,s.created_at,p.preferred_name FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id WHERE public.sdl_004_clubhouse_visible(s.id,p_team_id)
 ORDER BY s.created_at DESC LIMIT 30;
$$;
-- Minimal organization-scoped read model for the manual administrator pilot.
CREATE FUNCTION public.sdl_004_admin_organizations()
RETURNS TABLE(id uuid,name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT o.id,o.name FROM public.organizations o WHERE public.sdl_004_club_admin(o.id) ORDER BY o.name,o.id;
$$;
CREATE FUNCTION public.sdl_004_admin_enrollments(p_organization uuid,p_query text DEFAULT '')
RETURNS TABLE(athlete_id uuid,preferred_name text,organization_id uuid,enrollment_id uuid,generation uuid,status text,
 started_at timestamptz,ended_at timestamptz,recording_storage_authorized boolean,recording_active boolean,
 recording_permission_ref text,consent_active boolean,consent_policy_version text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_club_admin(p_organization) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_query IS NULL OR char_length(p_query)>100 THEN RAISE EXCEPTION 'Invalid search' USING ERRCODE='22023'; END IF;
 RETURN QUERY
 WITH athletes AS(
  SELECT p.athlete_id,min(p.preferred_name) AS label FROM public.players p
  WHERE p.organization_id=p_organization AND p.athlete_id IS NOT NULL
  GROUP BY p.athlete_id
 )
 SELECT a.athlete_id,a.label,p_organization,e.id,e.generation,coalesce(e.status,'not_enrolled'),
 e.started_at,e.ended_at,coalesce(e.recording_storage_authorized,false),
 coalesce(e.status='active' AND e.ended_at IS NULL AND e.started_at<=now() AND e.recording_storage_authorized,false),
 coalesce(e.recording_permission_ref,''),public.sdl_004_active_club_consent(e.id,e.generation) IS NOT NULL,c.policy_version
 FROM athletes a
 LEFT JOIN LATERAL(SELECT ce.* FROM public.sdl_club_enrollments ce
  WHERE ce.athlete_id=a.athlete_id AND ce.organization_id=p_organization
  ORDER BY (ce.status='active') DESC,ce.started_at DESC,ce.id DESC LIMIT 1)e ON true
 LEFT JOIN public.sdl_club_consents c ON c.id=public.sdl_004_active_club_consent(e.id,e.generation)
 WHERE strpos(lower(coalesce(a.label,'')),lower(btrim(p_query)))>0
 ORDER BY a.label,a.athlete_id LIMIT 100;
END;
$$;

CREATE FUNCTION public.sdl_004_submission_contract()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN public.sdl_004_session_active() THEN jsonb_build_object('revision','sdl004-club-enrollment-v2','enrollmentAdmin',true,'clubhouseRoster',true,'clubhouseLeaderboard',true,'parentStatistics',true,'statisticsConsent',true) ELSE NULL END;
$$;
CREATE FUNCTION public.sdl_004_workspace_players()
RETURNS TABLE(id uuid,athlete_id uuid,preferred_name text,organization_id uuid,organization_name text,team_id uuid,team_name text,is_guardian boolean,is_coach boolean,can_clubhouse boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id,p.athlete_id,p.preferred_name,p.organization_id,o.name,t.id,t.name,
 public.sdl_004_guardian_for((SELECT auth.uid()),p.id),public.sdl_004_coach_for((SELECT auth.uid()),p.id),public.sdl_004_clubhouse_member(t.id)
 FROM public.players p LEFT JOIN public.organizations o ON o.id=p.organization_id
 LEFT JOIN public.player_team_memberships ptm ON ptm.player_id=p.id AND ptm.organization_id=p.organization_id AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE
 LEFT JOIN public.teams t ON t.id=ptm.team_id AND t.organization_id=p.organization_id AND t.status='active'
 WHERE public.sdl_004_session_active() AND (public.sdl_004_guardian_for((SELECT auth.uid()),p.id)
 OR (public.sdl_004_coach_for((SELECT auth.uid()),p.id) AND EXISTS (SELECT 1 FROM public.team_memberships tm WHERE tm.team_id=t.id AND tm.user_id=(SELECT auth.uid()) AND tm.role='coach' AND tm.status='active')));
$$;

-- Parent-safe read APIs. No historical session is automatically official or team-shareable.
CREATE TABLE public.sdl_statistic_consents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 enrollment_id uuid NOT NULL REFERENCES public.sdl_club_enrollments(id),
 enrollment_generation uuid NOT NULL, guardian_id uuid NOT NULL REFERENCES auth.users(id),
 policy_version text NOT NULL CHECK(policy_version='sdl004-baseball-statistics-v1'),
 share_roster boolean NOT NULL DEFAULT false, metrics text[] NOT NULL DEFAULT '{}',
 accepted_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz, invalidated_at timestamptz,
 CHECK(metrics <@ ARRAY['exit_velo','throwing_velo','sprint_time','broad_jump_ratio']::text[]),
 CHECK(array_position(metrics,NULL) IS NULL), CHECK(cardinality(metrics)=0 OR share_roster)
);
CREATE UNIQUE INDEX ON public.sdl_statistic_consents(enrollment_id,enrollment_generation)
 WHERE withdrawn_at IS NULL AND invalidated_at IS NULL;
CREATE TABLE public.sdl_official_statistics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
 player_id uuid NOT NULL REFERENCES public.players(id), athlete_id uuid NOT NULL, organization_id uuid NOT NULL,
 enrollment_id uuid NOT NULL REFERENCES public.sdl_club_enrollments(id), enrollment_generation uuid NOT NULL,
 metric text NOT NULL CHECK(metric IN ('exit_velo','throwing_velo','sprint_time','broad_jump_ratio')),
 value numeric NOT NULL CHECK(value>0 AND value<'Infinity'::numeric), recorded_at date NOT NULL,
 source_hash text NOT NULL, invalidated_at timestamptz, approved_by uuid NOT NULL REFERENCES auth.users(id), approved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,metric)
);
CREATE INDEX ON public.sdl_official_statistics(player_id,metric);
DO $tables$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['sdl_statistic_consents','sdl_official_statistics'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO service_role',tab);
 END LOOP;
END $tables$;

-- Internal, non-browser helpers. Existing video consent is intentionally not consulted.
CREATE FUNCTION public.sdl_004_statistics_enrollment(p_player uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.id FROM public.players p JOIN public.sdl_club_enrollments e
 ON e.athlete_id=p.athlete_id AND e.organization_id=p.organization_id
 JOIN public.organizations o ON o.id=p.organization_id AND o.status='active'
 WHERE p.id=p_player AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now();
$$;
CREATE FUNCTION public.sdl_004_statistics_consent(p_enrollment uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id FROM public.sdl_club_enrollments e JOIN public.sdl_statistic_consents c
 ON c.enrollment_id=e.id AND c.enrollment_generation=e.generation
 JOIN public.organizations o ON o.id=e.organization_id AND o.status='active'
 WHERE e.id=p_enrollment AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()
 AND c.withdrawn_at IS NULL AND c.invalidated_at IS NULL
 AND public.sdl_004_guardian_athlete(c.guardian_id,e.athlete_id);
$$;
CREATE FUNCTION public.sdl_004_statistics_source_hash(p_session uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT md5(jsonb_build_array(s.id,s.player_id,s.session_date,s.exit_velo,s.throwing_velo,s.sprint_time,s.broad_jump,s.height_cm)::text)
 FROM public.sessions s WHERE s.id=p_session;
$$;

-- Explicit guardian authorization for the minimal roster and chosen official metrics.
-- This neither grants nor withdraws Clubhouse VIDEO consent.
CREATE FUNCTION public.sdl_004_set_statistic_consent(p_enrollment uuid,p_generation uuid,p_roster boolean,p_metrics text[],p_policy_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.sdl_club_enrollments%ROWTYPE; receipt uuid;
BEGIN
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=p_enrollment FOR UPDATE;
 IF NOT FOUND OR NOT public.sdl_004_session_active() OR NOT public.sdl_004_guardian_athlete((SELECT auth.uid()),e.athlete_id) THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF e.generation IS DISTINCT FROM p_generation THEN RAISE EXCEPTION 'Enrollment changed; refresh' USING ERRCODE='PT409'; END IF;
 IF p_roster IS NULL OR p_metrics IS NULL OR array_position(p_metrics,NULL) IS NOT NULL
 OR NOT p_metrics <@ ARRAY['exit_velo','throwing_velo','sprint_time','broad_jump_ratio']::text[]
 OR (cardinality(p_metrics)>0 AND NOT p_roster)
 OR cardinality(p_metrics)<>(SELECT count(DISTINCT x) FROM unnest(p_metrics) x) THEN
  RAISE EXCEPTION 'Explicit baseball sharing choices required' USING ERRCODE='22023'; END IF;
 IF (p_roster OR cardinality(p_metrics)>0) AND (p_policy_version IS DISTINCT FROM 'sdl004-baseball-statistics-v1'
 OR e.status<>'active' OR e.ended_at IS NOT NULL OR e.started_at>now()
 OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=e.organization_id AND status='active')) THEN
  RAISE EXCEPTION 'Active enrollment and separate statistics policy required' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.athlete_guardians WHERE athlete_id=e.athlete_id AND user_id=(SELECT auth.uid()) AND status='verified' FOR SHARE;
 PERFORM 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND status='active' FOR SHARE;
 IF NOT public.sdl_004_guardian_athlete((SELECT auth.uid()),e.athlete_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
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
CREATE FUNCTION public.sdl_004_list_statistic_consents(p_athlete uuid)
RETURNS TABLE(id uuid,generation uuid,organization_id uuid,organization_name text,status text,share_roster boolean,metrics text[],policy_version text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.id,e.generation,e.organization_id,o.name,e.status,coalesce(c.share_roster,false),coalesce(c.metrics,'{}'),c.policy_version
 FROM public.sdl_club_enrollments e JOIN public.organizations o ON o.id=e.organization_id
 LEFT JOIN public.sdl_statistic_consents c ON c.id=public.sdl_004_statistics_consent(e.id)
 WHERE e.athlete_id=p_athlete AND public.sdl_004_session_active()
 AND public.sdl_004_guardian_athlete((SELECT auth.uid()),p_athlete) ORDER BY o.name,e.started_at DESC,e.id LIMIT 100;
$$;
CREATE FUNCTION public.sdl_004_statistics_consent_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_row jsonb=to_jsonb(OLD);
BEGIN
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='sdl_club_enrollments' THEN
   IF OLD.generation=NEW.generation THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='athlete_guardians' THEN
   IF ROW(OLD.user_id,OLD.athlete_id,OLD.status) IS NOT DISTINCT FROM ROW(NEW.user_id,NEW.athlete_id,NEW.status) THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='profiles' THEN
   IF ROW(OLD.id,OLD.status) IS NOT DISTINCT FROM ROW(NEW.id,NEW.status) THEN RETURN NEW; END IF;
  END IF;
 END IF;
 WITH changed AS(UPDATE public.sdl_statistic_consents c SET invalidated_at=now()
 WHERE c.withdrawn_at IS NULL AND c.invalidated_at IS NULL AND CASE TG_TABLE_NAME
  WHEN 'sdl_club_enrollments' THEN c.enrollment_id=(old_row->>'id')::uuid
  WHEN 'athlete_guardians' THEN c.guardian_id=(old_row->>'user_id')::uuid AND EXISTS(
    SELECT 1 FROM public.sdl_club_enrollments e WHERE e.id=c.enrollment_id AND e.athlete_id=(old_row->>'athlete_id')::uuid)
  WHEN 'profiles' THEN c.guardian_id=(old_row->>'id')::uuid ELSE false END RETURNING c.id,c.enrollment_id)
 INSERT INTO public.sdl_club_consent_events(enrollment_id,actor,action,details)
 SELECT enrollment_id,(SELECT auth.uid()),'statistics_consent_invalidated',jsonb_build_object('receipt',id,'reason',TG_TABLE_NAME) FROM changed;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER sdl_004_stat_enrollment_changed AFTER UPDATE ON public.sdl_club_enrollments FOR EACH ROW EXECUTE FUNCTION public.sdl_004_statistics_consent_lifecycle();
CREATE TRIGGER sdl_004_stat_guardian_changed AFTER UPDATE OF user_id,athlete_id,status OR DELETE ON public.athlete_guardians FOR EACH ROW EXECUTE FUNCTION public.sdl_004_statistics_consent_lifecycle();
CREATE TRIGGER sdl_004_stat_profile_changed AFTER UPDATE OF id,status OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sdl_004_statistics_consent_lifecycle();

-- No legacy session is implicitly official. Only authorized current coaches/admins can
-- attest individual allowlisted values; these RPCs do not permit editing raw sessions.
CREATE FUNCTION public.sdl_004_approve_statistics(p_session uuid,p_metrics text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sessions%ROWTYPE; p public.players%ROWTYPE; e public.sdl_club_enrollments%ROWTYPE;
 metric_name text; metric_value numeric; height numeric;
BEGIN
 IF NOT public.sdl_004_session_active() THEN RAISE EXCEPTION 'Session expired or revoked' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.sessions WHERE id=p_session FOR SHARE;
 SELECT * INTO p FROM public.players WHERE id=s.player_id FOR UPDATE;
 IF p.id IS NULL OR NOT (public.sdl_004_coach_for((SELECT auth.uid()),p.id) OR public.sdl_004_club_admin(p.organization_id)) THEN
  RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p.id) FOR SHARE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Active enrollment required' USING ERRCODE='42501'; END IF;
 IF p_metrics IS NULL OR array_position(p_metrics,NULL) IS NOT NULL
 OR NOT p_metrics <@ ARRAY['exit_velo','throwing_velo','sprint_time','broad_jump_ratio']::text[]
 OR cardinality(p_metrics)<>(SELECT count(DISTINCT x) FROM unnest(p_metrics) x) THEN
  RAISE EXCEPTION 'Invalid official metrics' USING ERRCODE='22023'; END IF;
 -- Serialize conflicting reviews, even when no prior approval rows exist.
 DELETE FROM public.sdl_official_statistics WHERE session_id=s.id;
 FOREACH metric_name IN ARRAY p_metrics LOOP
  metric_value=CASE metric_name WHEN 'exit_velo' THEN s.exit_velo WHEN 'throwing_velo' THEN s.throwing_velo WHEN 'sprint_time' THEN s.sprint_time ELSE NULL END;
  IF metric_name='broad_jump_ratio' THEN
   height=s.height_cm;
   IF height IS NULL OR height=0 THEN SELECT height_cm INTO height FROM public.sessions WHERE player_id=p.id AND height_cm IS NOT NULL ORDER BY session_date DESC,id DESC LIMIT 1; END IF;
   IF height>0 THEN metric_value=round(s.broad_jump/height,2); END IF;
  END IF;
  IF metric_value IS NULL OR metric_value<=0 OR metric_value>='Infinity'::numeric THEN RAISE EXCEPTION 'Metric unavailable or invalid' USING ERRCODE='22023'; END IF;
  INSERT INTO public.sdl_official_statistics(session_id,player_id,athlete_id,organization_id,enrollment_id,enrollment_generation,metric,value,recorded_at,source_hash,approved_by)
  VALUES(s.id,p.id,p.athlete_id,p.organization_id,e.id,e.generation,metric_name,metric_value,s.session_date,public.sdl_004_statistics_source_hash(s.id),(SELECT auth.uid()));
 END LOOP;
 INSERT INTO public.sdl_club_consent_events(enrollment_id,actor,action,details)
 VALUES(e.id,(SELECT auth.uid()),'statistics_approved',jsonb_build_object('session_id',s.id,'metrics',p_metrics));
END;
$$;

-- Source corrections require a fresh approval even if the exact old value is later restored.
CREATE FUNCTION public.sdl_004_statistics_source_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF ROW(OLD.id,OLD.player_id,OLD.session_date,OLD.exit_velo,OLD.throwing_velo,OLD.sprint_time,OLD.broad_jump,OLD.height_cm)
 IS NOT DISTINCT FROM ROW(NEW.id,NEW.player_id,NEW.session_date,NEW.exit_velo,NEW.throwing_velo,NEW.sprint_time,NEW.broad_jump,NEW.height_cm) THEN RETURN NEW; END IF;
 WITH changed AS(UPDATE public.sdl_official_statistics SET invalidated_at=now()
 WHERE session_id=OLD.id AND invalidated_at IS NULL RETURNING enrollment_id,metric)
 INSERT INTO public.sdl_club_consent_events(enrollment_id,actor,action,details)
 SELECT enrollment_id,(SELECT auth.uid()),'statistics_source_invalidated',jsonb_build_object('session_id',OLD.id,'metric',metric) FROM changed;
 RETURN NEW;
END;
$$;
CREATE TRIGGER sdl_004_statistics_source_changed AFTER UPDATE OF id,player_id,session_date,exit_velo,throwing_velo,sprint_time,broad_jump,height_cm
 ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.sdl_004_statistics_source_lifecycle();

CREATE FUNCTION public.sdl_004_clubhouse_roster(p_team_id uuid)
RETURNS TABLE(id uuid,team_id uuid,team_name text,preferred_name text,jersey text,"position" text,throws text,bats text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_clubhouse_member(p_team_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT DISTINCT p.id,t.id,t.name,p.preferred_name,p.jersey,p.position,p.throws,p.bats
 FROM public.teams t JOIN public.player_team_memberships pm ON pm.team_id=t.id AND pm.organization_id=t.organization_id
 JOIN public.players p ON p.id=pm.player_id AND p.organization_id=t.organization_id
 JOIN public.sdl_statistic_consents c ON c.id=public.sdl_004_statistics_consent(public.sdl_004_statistics_enrollment(p.id))
 WHERE t.id=p_team_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE AND c.share_roster
 ORDER BY p.preferred_name,p.id LIMIT 100;
END;
$$;
CREATE FUNCTION public.sdl_004_clubhouse_leaderboard(p_team_id uuid)
RETURNS TABLE(id uuid,player_id uuid,team_id uuid,team_name text,metric text,preferred_name text,jersey text,value numeric,unit text,rank integer,recorded_at text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_clubhouse_member(p_team_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH eligible AS(
 SELECT DISTINCT a.id,a.player_id,t.id AS team_id,t.name AS team_name,a.metric,p.preferred_name,p.jersey,a.value,a.recorded_at
 FROM public.sdl_official_statistics a JOIN public.players p ON p.id=a.player_id AND p.athlete_id=a.athlete_id AND p.organization_id=a.organization_id
 JOIN public.sdl_club_enrollments e ON e.id=a.enrollment_id AND e.generation=a.enrollment_generation AND e.id=public.sdl_004_statistics_enrollment(p.id)
 JOIN public.sdl_statistic_consents c ON c.id=public.sdl_004_statistics_consent(e.id)
 JOIN public.player_team_memberships pm ON pm.player_id=p.id AND pm.organization_id=p.organization_id
 JOIN public.teams t ON t.id=pm.team_id AND t.organization_id=p.organization_id
 WHERE t.id=p_team_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE
 AND a.invalidated_at IS NULL AND c.share_roster AND a.metric=ANY(c.metrics) AND a.source_hash=public.sdl_004_statistics_source_hash(a.session_id)
 ), best AS(
 SELECT DISTINCT ON (x.metric,x.player_id) x.* FROM eligible x
 ORDER BY x.metric,x.player_id,CASE WHEN x.metric='sprint_time' THEN x.value ELSE -x.value END,x.recorded_at DESC,x.id
 ), ranked AS(
 SELECT x.*,row_number() OVER(PARTITION BY x.metric ORDER BY CASE WHEN x.metric='sprint_time' THEN x.value ELSE -x.value END,x.player_id)::integer AS place FROM best x
 ) SELECT x.id,x.player_id,x.team_id,x.team_name,x.metric,x.preferred_name,x.jersey,x.value,
 CASE x.metric WHEN 'sprint_time' THEN 's' WHEN 'broad_jump_ratio' THEN 'x' ELSE 'km/h' END,x.place,x.recorded_at::text
 FROM ranked x WHERE x.place<=3 ORDER BY x.metric,x.place;
END;
$$;
CREATE FUNCTION public.sdl_004_player_statistics(p_player_id uuid)
RETURNS TABLE(id uuid,player_id uuid,session_date date,exit_velo numeric,throwing_velo numeric,sprint_time numeric,broad_jump numeric,
 control_exit_velo numeric,attack_angle numeric,height_cm numeric,weight_kg numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_session_active() OR NOT public.sdl_004_guardian_for((SELECT auth.uid()),p_player_id)
 OR public.sdl_004_statistics_enrollment(p_player_id) IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT s.id,s.player_id,s.session_date,s.exit_velo,s.throwing_velo,s.sprint_time,s.broad_jump,
 s.control_exit_velo,s.attack_angle,s.height_cm,s.weight_kg FROM public.sessions s
 WHERE s.player_id=p_player_id ORDER BY s.session_date DESC,s.id DESC LIMIT 200;
END;
$$;
DO $statistics_grants$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname=ANY(ARRAY['sdl_004_statistics_enrollment','sdl_004_statistics_consent','sdl_004_statistics_source_hash',
 'sdl_004_set_statistic_consent','sdl_004_list_statistic_consents','sdl_004_statistics_consent_lifecycle','sdl_004_statistics_source_lifecycle','sdl_004_approve_statistics',
 'sdl_004_clubhouse_roster','sdl_004_clubhouse_leaderboard','sdl_004_player_statistics']) LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM PUBLIC,anon,authenticated,service_role';
  IF r.proname=ANY(ARRAY['sdl_004_set_statistic_consent','sdl_004_list_statistic_consents','sdl_004_approve_statistics','sdl_004_clubhouse_roster','sdl_004_clubhouse_leaderboard','sdl_004_player_statistics']) THEN
   EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.sig||' TO authenticated';
  END IF;
 END LOOP;
END $statistics_grants$;

DO $grants$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure AS sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname=ANY(ARRAY['sdl_004_admin_organizations','sdl_004_admin_enrollments','sdl_004_session_active','sdl_004_guardian_for','sdl_004_coach_for','sdl_004_guardian_athlete','sdl_004_club_admin','sdl_004_coach_team','sdl_004_recording_allowed','sdl_004_submission_can_submit','sdl_004_submission_is_guardian','sdl_004_submission_can_review','sdl_004_clubhouse_member','sdl_004_set_club_enrollment','sdl_004_set_recording_permission','sdl_004_active_club_consent','sdl_004_club_consent','sdl_004_list_club_consents','sdl_004_enrollment_lifecycle','sdl_004_immutable_consent_audit','sdl_004_guardian_consent_lifecycle','sdl_004_reserve_submission','sdl_004_finish_submission','sdl_004_review_submission','sdl_004_submission_can_publish','sdl_004_publish_submission','sdl_004_clubhouse_visible','sdl_004_submission_can_read','sdl_004_list_submissions','sdl_004_review_queue','sdl_004_clubhouse_videos','sdl_004_submission_contract','sdl_004_workspace_players']) LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM PUBLIC,anon,authenticated,service_role';
 IF r.proname=ANY(ARRAY['sdl_004_guardian_for','sdl_004_guardian_athlete','sdl_004_coach_for','sdl_004_club_admin','sdl_004_coach_team','sdl_004_recording_allowed','sdl_004_active_club_consent','sdl_004_finish_submission','sdl_004_enrollment_lifecycle','sdl_004_immutable_consent_audit','sdl_004_guardian_consent_lifecycle','sdl_004_clubhouse_visible']) THEN
 EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.sig||' TO service_role';
 ELSE EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.sig||' TO authenticated'; END IF;
 END LOOP;
END $grants$;
COMMIT;
