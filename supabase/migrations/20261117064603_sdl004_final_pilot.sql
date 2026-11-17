-- SDL-004 final pilot. Apply only after the base workflow migration and reviewed staging preflight.
-- No source-table RLS is weakened; all new writes are narrow caller-authorized RPCs.
BEGIN;
CREATE TABLE public.sdl_pilot_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_order bigint GENERATED ALWAYS AS IDENTITY,organization_id uuid,player_id uuid,actor uuid,
 action text NOT NULL,target uuid,details jsonb NOT NULL DEFAULT '{}',occurred_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON public.sdl_pilot_events(player_id,occurred_at);
CREATE TABLE public.sdl_staff_permissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),
 team_id uuid REFERENCES public.teams(id),permission text NOT NULL CHECK(permission IN('guardian_invite','family_contacts','registration_contacts')),
 active boolean NOT NULL DEFAULT true,granted_by uuid NOT NULL REFERENCES auth.users(id),granted_at timestamptz NOT NULL DEFAULT now(),
 CHECK(permission<>'family_contacts' OR team_id IS NOT NULL));
CREATE UNIQUE INDEX ON public.sdl_staff_permissions(user_id,organization_id,coalesce(team_id,'00000000-0000-0000-0000-000000000000'::uuid),permission);
CREATE TABLE public.sdl_guardian_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES public.players(id),athlete_id uuid NOT NULL,organization_id uuid NOT NULL,
 enrollment_id uuid NOT NULL REFERENCES public.sdl_club_enrollments(id),enrollment_generation uuid NOT NULL,
 target_email text NOT NULL,token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),issued_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,revoked_at timestamptz,redeemed_at timestamptz,redeemed_by uuid REFERENCES auth.users(id));
CREATE TABLE public.sdl_growth_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES public.sessions(id),player_id uuid NOT NULL REFERENCES public.players(id),
 revision integer NOT NULL,measurement_date date NOT NULL,height_cm numeric,weight_kg numeric,
 previous jsonb NOT NULL,reason text NOT NULL,recorded_by uuid NOT NULL REFERENCES auth.users(id),recorded_role text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),UNIQUE(session_id,revision));
CREATE INDEX ON public.sdl_growth_events(player_id,measurement_date DESC);
CREATE TABLE public.sdl_measurement_protocols(
 id text PRIMARY KEY,metric text NOT NULL CHECK(metric IN('exit_velo','throwing_velo','sprint_time','broad_jump')),
 label text NOT NULL,unit text NOT NULL,distance_m numeric,active boolean NOT NULL DEFAULT true,
 CHECK((metric='sprint_time' AND distance_m>0) OR (metric<>'sprint_time' AND distance_m IS NULL)));
INSERT INTO public.sdl_measurement_protocols(id,metric,label,unit,distance_m) VALUES
 ('exit-radar-v1','exit_velo','Exit velocity · radar','km/h',NULL),('throw-radar-v1','throwing_velo','Throwing velocity · radar','km/h',NULL),
 ('standing-broad-jump-v1','broad_jump','Standing broad jump','cm',NULL),
 ('sprint-18.29-hand-v1','sprint_time','18.29 m · standing start · hand timed','s',18.29),
 ('sprint-18.29-electronic-v1','sprint_time','18.29 m · standing start · electronic','s',18.29),
 ('sprint-27.43-hand-v1','sprint_time','27.43 m · standing start · hand timed','s',27.43);
ALTER TABLE public.sdl_official_statistics ADD COLUMN protocol_id text REFERENCES public.sdl_measurement_protocols(id);
ALTER TABLE public.sdl_official_statistics DROP CONSTRAINT sdl_official_statistics_metric_check;
ALTER TABLE public.sdl_official_statistics ADD CONSTRAINT sdl_official_statistics_metric_check CHECK(metric IN('exit_velo','throwing_velo','sprint_time','broad_jump','broad_jump_ratio'));
-- Old ratio consent never implies consent to absolute jump distance. No consent is backfilled.
ALTER TABLE public.sdl_statistic_consents DROP CONSTRAINT sdl_statistic_consents_metrics_check;
ALTER TABLE public.sdl_statistic_consents ADD CONSTRAINT sdl_statistic_consents_metrics_check CHECK(metrics <@ ARRAY['exit_velo','throwing_velo','sprint_time','broad_jump','broad_jump_ratio']::text[]);
CREATE TABLE public.sdl_performance_submissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES public.players(id),organization_id uuid NOT NULL,
 enrollment_id uuid NOT NULL REFERENCES public.sdl_club_enrollments(id),enrollment_generation uuid NOT NULL,
 protocol_id text NOT NULL REFERENCES public.sdl_measurement_protocols(id),value numeric NOT NULL CHECK(value>0 AND value<'Infinity'::numeric),measurement_date date NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN('parent','coach')),status text NOT NULL CHECK(status IN('pending','approved','rejected','correction_requested')),
 submitted_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),revision integer NOT NULL DEFAULT 1,
 evidence text NOT NULL CHECK(char_length(evidence) BETWEEN 1 AND 1000),evidence_video_id uuid REFERENCES public.sdl_video_submissions(id),
 review_note text NOT NULL DEFAULT '',reviewed_by uuid,reviewed_at timestamptz,session_id uuid REFERENCES public.sessions(id),
 supersedes uuid REFERENCES public.sdl_performance_submissions(id),request_key uuid NOT NULL,request_fingerprint text NOT NULL,
 UNIQUE(submitted_by,request_key));
CREATE INDEX ON public.sdl_performance_submissions(player_id,created_at DESC);
DO $tables$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['sdl_pilot_events','sdl_staff_permissions','sdl_guardian_invitations','sdl_growth_events','sdl_measurement_protocols','sdl_performance_submissions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO service_role',tab);
 END LOOP;
END $tables$;
CREATE TRIGGER sdl_pilot_events_immutable BEFORE UPDATE OR DELETE ON public.sdl_pilot_events FOR EACH ROW EXECUTE FUNCTION public.sdl_004_immutable_consent_audit();
CREATE TRIGGER sdl_pilot_events_no_truncate BEFORE TRUNCATE ON public.sdl_pilot_events FOR EACH STATEMENT EXECUTE FUNCTION public.sdl_004_immutable_consent_audit();
CREATE TRIGGER sdl_growth_events_immutable BEFORE UPDATE OR DELETE ON public.sdl_growth_events FOR EACH ROW EXECUTE FUNCTION public.sdl_004_immutable_consent_audit();
CREATE TRIGGER sdl_growth_events_no_truncate BEFORE TRUNCATE ON public.sdl_growth_events FOR EACH STATEMENT EXECUTE FUNCTION public.sdl_004_immutable_consent_audit();
CREATE FUNCTION public.sdl_004_pilot_audit(p_player uuid,p_org uuid,p_action text,p_target uuid,p_details jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO public.sdl_pilot_events(player_id,organization_id,actor,action,target,details)VALUES(p_player,p_org,(SELECT auth.uid()),p_action,p_target,p_details);
$$;
CREATE FUNCTION public.sdl_004_pilot_permission(p_org uuid,p_team uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND EXISTS(SELECT 1 FROM public.sdl_staff_permissions g
 JOIN public.organization_memberships om ON om.user_id=g.user_id AND om.organization_id=g.organization_id AND om.status='active' AND om.role IN('staff','admin')
 JOIN public.organizations o ON o.id=g.organization_id AND o.status='active' JOIN public.profiles pr ON pr.id=g.user_id AND pr.status='active'
 WHERE g.user_id=(SELECT auth.uid()) AND g.organization_id=p_org AND g.permission=p_permission AND g.active
 AND (g.team_id IS NULL OR g.team_id=p_team) AND (g.team_id IS NULL OR EXISTS(SELECT 1 FROM public.team_memberships tm JOIN public.teams t ON t.id=tm.team_id
 WHERE tm.user_id=g.user_id AND tm.team_id=g.team_id AND tm.status='active' AND t.status='active' AND t.organization_id=p_org)));
$$;
CREATE FUNCTION public.sdl_004_pilot_can_invite(p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND EXISTS(SELECT 1 FROM public.players p WHERE p.id=p_player AND
 (public.sdl_004_club_admin(p.organization_id) OR public.sdl_004_pilot_permission(p.organization_id,NULL,'guardian_invite') OR EXISTS(
 SELECT 1 FROM public.player_team_memberships pm WHERE pm.player_id=p.id AND pm.organization_id=p.organization_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE
 AND public.sdl_004_pilot_permission(p.organization_id,pm.team_id,'guardian_invite'))));
$$;
CREATE FUNCTION public.sdl_004_pilot_can_measure(p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND (public.sdl_004_guardian_for((SELECT auth.uid()),p_player) OR (public.sdl_004_coach_for((SELECT auth.uid()),p_player) AND public.sdl_004_statistics_enrollment(p_player) IS NOT NULL));
$$;
CREATE FUNCTION public.sdl_004_pilot_set_permission(p_user uuid,p_org uuid,p_team uuid,p_permission text,p_active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; BEGIN
 IF NOT public.sdl_004_club_admin(p_org) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_active IS NULL OR p_permission IS NULL OR p_permission NOT IN('family_contacts','registration_contacts','guardian_invite') OR (p_permission='family_contacts' AND p_team IS NULL)
 OR (p_team IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.teams WHERE id=p_team AND organization_id=p_org AND status='active'))
 OR NOT EXISTS(SELECT 1 FROM public.organization_memberships om JOIN public.profiles pr ON pr.id=om.user_id WHERE om.user_id=p_user AND om.organization_id=p_org AND om.status='active' AND om.role IN('staff','admin') AND pr.status='active') THEN
 RAISE EXCEPTION 'Invalid scoped permission' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||p_org::text,0));
 SELECT id INTO result FROM public.sdl_staff_permissions WHERE user_id=p_user AND organization_id=p_org AND team_id IS NOT DISTINCT FROM p_team AND permission=p_permission FOR UPDATE;
 IF result IS NULL THEN INSERT INTO public.sdl_staff_permissions(user_id,organization_id,team_id,permission,active,granted_by)VALUES(p_user,p_org,p_team,p_permission,p_active,(SELECT auth.uid()))RETURNING id INTO result;
 ELSE UPDATE public.sdl_staff_permissions SET active=p_active,granted_by=(SELECT auth.uid()),granted_at=now() WHERE id=result; END IF;
 IF p_permission='guardian_invite' AND NOT p_active THEN UPDATE public.sdl_guardian_invitations SET revoked_at=now() WHERE issued_by=p_user AND organization_id=p_org AND revoked_at IS NULL AND redeemed_at IS NULL;END IF;
 PERFORM public.sdl_004_pilot_audit(NULL,p_org,'staff_permission',result,jsonb_build_object('user_id',p_user,'team_id',p_team,'permission',p_permission,'active',p_active));RETURN result;
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_staff_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oldrow jsonb=to_jsonb(OLD); BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(OLD)=to_jsonb(NEW) THEN RETURN NEW; END IF;
 -- Any membership identity/role/status change permanently removes explicit grants. Renew explicitly.
 WITH revoked AS(UPDATE public.sdl_staff_permissions SET active=false WHERE active AND
 CASE TG_TABLE_NAME WHEN 'profiles' THEN user_id=(oldrow->>'id')::uuid
 WHEN 'organization_memberships' THEN user_id=(oldrow->>'user_id')::uuid AND organization_id=(oldrow->>'organization_id')::uuid
 WHEN 'team_memberships' THEN user_id=(oldrow->>'user_id')::uuid AND team_id=(oldrow->>'team_id')::uuid ELSE false END RETURNING id,organization_id)
 INSERT INTO public.sdl_pilot_events(organization_id,actor,action,target,details)SELECT organization_id,(SELECT auth.uid()),'staff_permission_invalidated',id,jsonb_build_object('reason',TG_TABLE_NAME) FROM revoked;
 WITH revoked AS(UPDATE public.sdl_guardian_invitations SET revoked_at=now() WHERE revoked_at IS NULL AND redeemed_at IS NULL
 AND issued_by=CASE WHEN TG_TABLE_NAME='profiles' THEN (oldrow->>'id')::uuid ELSE (oldrow->>'user_id')::uuid END
 AND (TG_TABLE_NAME='profiles' OR organization_id=CASE WHEN TG_TABLE_NAME='organization_memberships' THEN (oldrow->>'organization_id')::uuid ELSE (SELECT organization_id FROM public.teams WHERE id=(oldrow->>'team_id')::uuid) END) RETURNING id,organization_id,player_id)
 INSERT INTO public.sdl_pilot_events(organization_id,player_id,actor,action,target,details)SELECT organization_id,player_id,(SELECT auth.uid()),'invitation_issuer_scope_revoked',id,jsonb_build_object('reason',TG_TABLE_NAME)FROM revoked;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER sdl_pilot_org_staff_changed AFTER UPDATE OF user_id,organization_id,role,status OR DELETE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION public.sdl_004_pilot_staff_lifecycle();
CREATE TRIGGER sdl_pilot_team_staff_changed AFTER UPDATE OF user_id,team_id,role,status OR DELETE ON public.team_memberships FOR EACH ROW EXECUTE FUNCTION public.sdl_004_pilot_staff_lifecycle();
CREATE TRIGGER sdl_pilot_profile_staff_changed AFTER UPDATE OF id,status OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sdl_004_pilot_staff_lifecycle();
CREATE FUNCTION public.sdl_004_pilot_issue_invitation(p_player uuid,p_email text,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.players%ROWTYPE;e public.sdl_club_enrollments%ROWTYPE;i public.sdl_guardian_invitations%ROWTYPE; BEGIN
 IF NOT public.sdl_004_pilot_can_invite(p_player) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_email IS NULL OR char_length(btrim(p_email))>254 OR btrim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_hash IS NULL OR p_hash!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player FOR SHARE;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p.id) FOR SHARE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Active enrollment required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.sdl_guardian_invitations(player_id,athlete_id,organization_id,enrollment_id,enrollment_generation,target_email,token_hash,issued_by,expires_at)
 VALUES(p.id,p.athlete_id,p.organization_id,e.id,e.generation,lower(btrim(p_email)),p_hash,(SELECT auth.uid()),now()+interval '72 hours') RETURNING * INTO i;
 PERFORM public.sdl_004_pilot_audit(p.id,p.organization_id,'invitation_issued',i.id,jsonb_build_object('expires_at',i.expires_at));
 RETURN jsonb_build_object('id',i.id,'expires_at',i.expires_at);
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_redeem_invitation(p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.sdl_guardian_invitations%ROWTYPE;e public.sdl_club_enrollments%ROWTYPE;uid uuid=(SELECT auth.uid());mail text; BEGIN
 IF NOT public.sdl_004_session_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT lower(email) INTO mail FROM auth.users WHERE id=uid AND email_confirmed_at IS NOT NULL;
 SELECT * INTO i FROM public.sdl_guardian_invitations WHERE token_hash=p_hash FOR UPDATE;
 IF i.id IS NULL THEN RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='22023'; END IF;
 IF mail IS NULL OR mail<>i.target_email THEN RAISE EXCEPTION 'Sign in with the verified invited email' USING ERRCODE='42501'; END IF;
 IF i.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already redeemed' USING ERRCODE='PT409'; END IF;
 IF i.revoked_at IS NOT NULL OR i.expires_at<=now() THEN RAISE EXCEPTION 'Invitation expired or revoked' USING ERRCODE='PT410'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=i.enrollment_id FOR SHARE;
 IF e.status<>'active' OR e.ended_at IS NOT NULL OR e.generation<>i.enrollment_generation OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=i.organization_id AND status='active')
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=i.player_id AND athlete_id=i.athlete_id AND organization_id=i.organization_id) THEN RAISE EXCEPTION 'Invitation no longer available' USING ERRCODE='PT410'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND status<>'active') THEN RAISE EXCEPTION 'Account not active' USING ERRCODE='42501'; END IF;
 INSERT INTO public.profiles(id,status,created_at,updated_at)VALUES(uid,'active',now(),now()) ON CONFLICT(id)DO NOTHING;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 IF EXISTS(SELECT 1 FROM public.athlete_guardians WHERE user_id=uid AND athlete_id=i.athlete_id) THEN
  UPDATE public.athlete_guardians SET status='verified',updated_at=now() WHERE user_id=uid AND athlete_id=i.athlete_id;
 ELSE INSERT INTO public.athlete_guardians(athlete_id,user_id,status,relationship,created_at,updated_at)VALUES(i.athlete_id,uid,'verified','parent',now(),now()); END IF;
 INSERT INTO public.team_memberships(team_id,user_id,role,status,created_at,updated_at)
 SELECT DISTINCT t.id,uid,'parent','active',now(),now() FROM public.player_team_memberships pm JOIN public.teams t ON t.id=pm.team_id AND t.organization_id=pm.organization_id AND t.status='active'
 WHERE pm.player_id=i.player_id AND pm.organization_id=i.organization_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE
 AND NOT EXISTS(SELECT 1 FROM public.team_memberships tm WHERE tm.team_id=t.id AND tm.user_id=uid) ON CONFLICT DO NOTHING;
 UPDATE public.team_memberships tm SET status='active',updated_at=now() WHERE tm.user_id=uid AND tm.role='parent' AND tm.status<>'active' AND EXISTS(
 SELECT 1 FROM public.player_team_memberships pm WHERE pm.player_id=i.player_id AND pm.organization_id=i.organization_id AND pm.team_id=tm.team_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE);
 UPDATE public.sdl_guardian_invitations SET redeemed_at=now(),redeemed_by=uid WHERE id=i.id;
 PERFORM public.sdl_004_pilot_audit(i.player_id,i.organization_id,'invitation_redeemed',i.id,'{}');RETURN jsonb_build_object('linked',true,'player_id',i.player_id);
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_revoke_invitation(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.sdl_guardian_invitations%ROWTYPE; BEGIN
 SELECT * INTO i FROM public.sdl_guardian_invitations WHERE id=p_id FOR UPDATE;
 IF i.id IS NULL OR NOT public.sdl_004_pilot_can_invite(i.player_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 UPDATE public.sdl_guardian_invitations SET revoked_at=coalesce(revoked_at,now()) WHERE id=i.id;
 PERFORM public.sdl_004_pilot_audit(i.player_id,i.organization_id,'invitation_revoked',i.id,'{}');
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_invitations(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT(public.sdl_004_club_admin(p_org) OR EXISTS(SELECT 1 FROM public.players WHERE organization_id=p_org AND public.sdl_004_pilot_can_invite(id)))THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'player_id',i.player_id,'preferred_name',p.preferred_name,'target_email',i.target_email,
 'expires_at',i.expires_at,'revoked_at',i.revoked_at,'redeemed_at',i.redeemed_at)ORDER BY i.created_at DESC),'[]') INTO result FROM(
 SELECT * FROM public.sdl_guardian_invitations WHERE organization_id=p_org AND public.sdl_004_pilot_can_invite(player_id)ORDER BY created_at DESC LIMIT 100)i JOIN public.players p ON p.id=i.player_id;
 PERFORM public.sdl_004_pilot_audit(NULL,p_org,'invitation_contact_history_access',NULL,jsonb_build_object('count',jsonb_array_length(result)));RETURN result;
END;
$$;

CREATE FUNCTION public.sdl_004_pilot_growth(p_player uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_pilot_can_measure(p_player) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(x ORDER BY x.measurement_date DESC,x.id) FROM(
 SELECT s.id,s.session_date AS measurement_date,s.height_cm,s.weight_kg,coalesce(g.revision,0) AS revision,
 g.recorded_by,g.recorded_role,coalesce((SELECT jsonb_agg(jsonb_build_object('revision',h.revision,'previous',h.previous,'height_cm',h.height_cm,'weight_kg',h.weight_kg,'measurement_date',h.measurement_date,'reason',h.reason,'recorded_by',h.recorded_by,'recorded_role',h.recorded_role,'at',h.recorded_at)ORDER BY h.revision)FROM public.sdl_growth_events h WHERE h.session_id=s.id),'[]') AS history
 FROM public.sessions s LEFT JOIN LATERAL(SELECT e.* FROM public.sdl_growth_events e WHERE e.session_id=s.id ORDER BY e.revision DESC LIMIT 1)g ON true
 WHERE s.player_id=p_player AND (s.height_cm IS NOT NULL OR s.weight_kg IS NOT NULL) ORDER BY s.session_date DESC,s.id LIMIT 200)x),'[]');
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_save_growth(p_player uuid,p_date date,p_height numeric,p_weight numeric,p_session uuid DEFAULT NULL,p_revision integer DEFAULT 0,p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sessions%ROWTYPE;rev integer;result uuid;org uuid;role_name text; BEGIN
 IF NOT public.sdl_004_pilot_can_measure(p_player) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_date IS NULL OR p_date>CURRENT_DATE OR p_date<'1900-01-01' OR (p_height IS NULL AND p_weight IS NULL)
 OR (p_height IS NOT NULL AND NOT(p_height BETWEEN 30 AND 250)) OR (p_weight IS NOT NULL AND NOT(p_weight BETWEEN 2 AND 300))
 OR p_revision IS NULL OR p_reason IS NULL OR char_length(p_reason)>500 THEN RAISE EXCEPTION 'Invalid growth measurement' USING ERRCODE='22023'; END IF;
 SELECT organization_id INTO org FROM public.players WHERE id=p_player;
 IF p_session IS NULL THEN INSERT INTO public.sessions(id,player_id,session_date,height_cm,weight_kg)VALUES(gen_random_uuid(),p_player,p_date,p_height,p_weight) RETURNING * INTO s;
 ELSE SELECT * INTO s FROM public.sessions WHERE id=p_session AND player_id=p_player FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Correction reason required' USING ERRCODE='22023'; END IF;
  IF p_date<>s.session_date AND EXISTS(SELECT 1 FROM jsonb_each(to_jsonb(s)) item WHERE item.key NOT IN('id','player_id','session_date','height_cm','weight_kg','created_at','updated_at') AND item.value<>'null'::jsonb) THEN RAISE EXCEPTION 'Keep the performance session date; add a separate growth measurement if needed' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT coalesce(max(revision),0) INTO rev FROM public.sdl_growth_events WHERE session_id=s.id;
 IF rev<>p_revision THEN RAISE EXCEPTION 'Measurement changed; refresh' USING ERRCODE='PT409'; END IF;
 role_name=CASE WHEN public.sdl_004_guardian_for((SELECT auth.uid()),p_player) THEN 'guardian' ELSE 'coach' END;
 INSERT INTO public.sdl_growth_events(session_id,player_id,revision,measurement_date,height_cm,weight_kg,previous,reason,recorded_by,recorded_role)
 VALUES(s.id,p_player,rev+1,p_date,p_height,p_weight,CASE WHEN p_session IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('measurement_date',s.session_date,'height_cm',s.height_cm,'weight_kg',s.weight_kg)END,coalesce(p_reason,''),(SELECT auth.uid()),role_name);
 UPDATE public.sessions SET session_date=p_date,height_cm=p_height,weight_kg=p_weight WHERE id=s.id;
 PERFORM public.sdl_004_pilot_audit(p_player,org,'growth_saved',s.id,jsonb_build_object('revision',rev+1,'reason',p_reason));RETURN jsonb_build_object('id',s.id,'revision',rev+1);
END;
$$;
-- Explicit protocol attestation replaces implicit historical sprint/best-result publication.
CREATE FUNCTION public.sdl_004_pilot_attest_session(p_session uuid,p_protocol text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sessions%ROWTYPE;p public.players%ROWTYPE;e public.sdl_club_enrollments%ROWTYPE;r public.sdl_measurement_protocols%ROWTYPE;v numeric;BEGIN
 SELECT * INTO s FROM public.sessions WHERE id=p_session FOR SHARE;
 SELECT * INTO p FROM public.players WHERE id=s.player_id FOR UPDATE;
 IF NOT public.sdl_004_session_active() OR NOT public.sdl_004_coach_for((SELECT auth.uid()),p.id) THEN RAISE EXCEPTION 'Assigned coach required' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p.id) FOR SHARE;
 SELECT * INTO r FROM public.sdl_measurement_protocols WHERE id=p_protocol AND active;
 IF e.id IS NULL OR r.id IS NULL THEN RAISE EXCEPTION 'Active enrollment and explicit protocol required' USING ERRCODE='22023'; END IF;
 v=CASE r.metric WHEN 'exit_velo' THEN s.exit_velo WHEN 'throwing_velo' THEN s.throwing_velo WHEN 'sprint_time' THEN s.sprint_time WHEN 'broad_jump' THEN s.broad_jump END;
 IF v IS NULL OR v<=0 OR v>='Infinity'::numeric THEN RAISE EXCEPTION 'Invalid official value' USING ERRCODE='22023'; END IF;
 INSERT INTO public.sdl_official_statistics(session_id,player_id,athlete_id,organization_id,enrollment_id,enrollment_generation,metric,value,recorded_at,source_hash,approved_by,protocol_id)
 VALUES(s.id,p.id,p.athlete_id,p.organization_id,e.id,e.generation,r.metric,v,s.session_date,public.sdl_004_statistics_source_hash(s.id),(SELECT auth.uid()),r.id)
 ON CONFLICT(session_id,metric) DO UPDATE SET value=EXCLUDED.value,recorded_at=EXCLUDED.recorded_at,source_hash=EXCLUDED.source_hash,invalidated_at=NULL,
 approved_by=EXCLUDED.approved_by,approved_at=now(),protocol_id=EXCLUDED.protocol_id,enrollment_id=EXCLUDED.enrollment_id,enrollment_generation=EXCLUDED.enrollment_generation;
 PERFORM public.sdl_004_pilot_audit(p.id,p.organization_id,'official_statistic_attested',s.id,jsonb_build_object('metric',r.metric,'protocol_id',r.id,'value',v));
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_approve_statistics(p_session uuid,p_metrics text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pid uuid;BEGIN
 SELECT player_id INTO pid FROM public.sessions WHERE id=p_session;
 IF NOT public.sdl_004_session_active() OR NOT public.sdl_004_coach_for((SELECT auth.uid()),pid) THEN RAISE EXCEPTION 'Assigned coach required' USING ERRCODE='42501'; END IF;
 IF p_metrics IS NULL OR cardinality(p_metrics)>0 THEN RAISE EXCEPTION 'Explicit protocol attestation required; use the performance workflow' USING ERRCODE='22023'; END IF;
 UPDATE public.sdl_official_statistics SET invalidated_at=now() WHERE session_id=p_session;
 PERFORM public.sdl_004_pilot_audit(pid,(SELECT organization_id FROM public.players WHERE id=pid),'official_statistics_revoked',p_session,'{}');
END;
$$;
ALTER TABLE public.sdl_performance_submissions ADD COLUMN superseded_by uuid REFERENCES public.sdl_performance_submissions(id);
CREATE FUNCTION public.sdl_004_pilot_officialize(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.sdl_performance_submissions%ROWTYPE;prior public.sdl_performance_submissions%ROWTYPE;proto public.sdl_measurement_protocols%ROWTYPE;sid uuid=gen_random_uuid();BEGIN
 SELECT * INTO p FROM public.sdl_performance_submissions WHERE id=p_id FOR UPDATE;
 IF NOT public.sdl_004_session_active() OR NOT public.sdl_004_coach_for((SELECT auth.uid()),p.player_id) THEN RAISE EXCEPTION 'Assigned coach required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sdl_club_enrollments e WHERE e.id=p.enrollment_id AND e.generation=p.enrollment_generation AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()) THEN RAISE EXCEPTION 'Enrollment changed; resubmit' USING ERRCODE='PT409'; END IF;
 IF p.supersedes IS NOT NULL THEN
  SELECT * INTO prior FROM public.sdl_performance_submissions WHERE id=p.supersedes AND player_id=p.player_id FOR UPDATE;
  IF prior.id IS NULL OR prior.superseded_by IS NOT NULL THEN RAISE EXCEPTION 'Correction changed; refresh' USING ERRCODE='PT409'; END IF;
  UPDATE public.sdl_official_statistics SET invalidated_at=now() WHERE session_id=prior.session_id;
  UPDATE public.sdl_performance_submissions SET superseded_by=p.id WHERE id=prior.id;
 END IF;
 SELECT * INTO proto FROM public.sdl_measurement_protocols WHERE id=p.protocol_id AND active;
 IF proto.id IS NULL THEN RAISE EXCEPTION 'Protocol unavailable' USING ERRCODE='22023'; END IF;
 INSERT INTO public.sessions(id,player_id,session_date,exit_velo,throwing_velo,sprint_time,broad_jump)
 VALUES(sid,p.player_id,p.measurement_date,CASE WHEN proto.metric='exit_velo' THEN p.value END,CASE WHEN proto.metric='throwing_velo' THEN p.value END,
 CASE WHEN proto.metric='sprint_time' THEN p.value END,CASE WHEN proto.metric='broad_jump' THEN p.value END);
 PERFORM public.sdl_004_pilot_attest_session(sid,proto.id);
 UPDATE public.sdl_performance_submissions SET session_id=sid WHERE id=p.id;
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_submit_performance(p_player uuid,p_protocol text,p_value numeric,p_date date,p_evidence text,p_key uuid,p_official boolean DEFAULT false,p_video uuid DEFAULT NULL,p_supersedes uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.sdl_club_enrollments%ROWTYPE;proto public.sdl_measurement_protocols%ROWTYPE;r public.sdl_performance_submissions%ROWTYPE;org uuid;fingerprint text;BEGIN
 IF NOT public.sdl_004_session_active() OR p_official IS NULL OR NOT(CASE WHEN p_official THEN public.sdl_004_coach_for((SELECT auth.uid()),p_player) ELSE public.sdl_004_guardian_for((SELECT auth.uid()),p_player) END) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p_player) FOR SHARE;
 SELECT * INTO proto FROM public.sdl_measurement_protocols WHERE id=p_protocol AND active;
 IF e.id IS NULL OR proto.id IS NULL OR p_date IS NULL OR p_date>CURRENT_DATE OR p_date<'1900-01-01' OR p_value IS NULL OR NOT(p_value>0 AND p_value<='500')
 OR p_evidence IS NULL OR char_length(btrim(p_evidence)) NOT BETWEEN 1 AND 1000 OR p_key IS NULL THEN RAISE EXCEPTION 'Invalid performance measurement' USING ERRCODE='22023'; END IF;
 IF p_video IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sdl_video_submissions WHERE id=p_video AND player_id=p_player AND public.sdl_004_submission_can_read(id)) THEN RAISE EXCEPTION 'Evidence unavailable' USING ERRCODE='42501'; END IF;
 IF p_supersedes IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sdl_performance_submissions WHERE id=p_supersedes AND player_id=p_player AND superseded_by IS NULL AND status IN('approved','rejected')) THEN RAISE EXCEPTION 'Invalid correction reference' USING ERRCODE='22023'; END IF;
 SELECT organization_id INTO org FROM public.players WHERE id=p_player;
 fingerprint=md5(jsonb_build_array(p_player,p_protocol,p_value,p_date,p_evidence,p_official,p_video,p_supersedes)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended((SELECT auth.uid())::text||p_key::text,0));
 SELECT * INTO r FROM public.sdl_performance_submissions WHERE submitted_by=(SELECT auth.uid()) AND request_key=p_key;
 IF r.id IS NOT NULL THEN
  IF r.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Request key conflict' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('id',r.id,'status',r.status,'revision',r.revision);
 END IF;
 INSERT INTO public.sdl_performance_submissions(player_id,organization_id,enrollment_id,enrollment_generation,protocol_id,value,measurement_date,source_kind,status,submitted_by,evidence,evidence_video_id,reviewed_by,reviewed_at,supersedes,request_key,request_fingerprint)
 VALUES(p_player,org,e.id,e.generation,p_protocol,p_value,p_date,CASE WHEN p_official THEN 'coach' ELSE 'parent' END,CASE WHEN p_official THEN 'approved' ELSE 'pending' END,
 (SELECT auth.uid()),p_evidence,p_video,CASE WHEN p_official THEN (SELECT auth.uid()) END,CASE WHEN p_official THEN now() END,p_supersedes,p_key,fingerprint) RETURNING * INTO r;
 PERFORM public.sdl_004_pilot_audit(p_player,org,CASE WHEN p_official THEN 'coach_official_entry' ELSE 'performance_submitted' END,r.id,jsonb_build_object('value',p_value,'protocol_id',p_protocol,'measurement_date',p_date,'evidence',p_evidence,'evidence_video_id',p_video));
 IF p_official THEN PERFORM public.sdl_004_pilot_officialize(r.id); END IF;
 RETURN jsonb_build_object('id',r.id,'status',r.status,'revision',r.revision);
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_review_performance(p_id uuid,p_decision text,p_note text,p_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.sdl_performance_submissions%ROWTYPE;BEGIN
 SELECT * INTO p FROM public.sdl_performance_submissions WHERE id=p_id FOR UPDATE;
 IF p.id IS NULL OR NOT public.sdl_004_session_active() OR NOT public.sdl_004_coach_for((SELECT auth.uid()),p.player_id) OR p.submitted_by=(SELECT auth.uid()) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p.revision IS DISTINCT FROM p_revision OR p.status<>'pending' THEN RAISE EXCEPTION 'Submission already changed; refresh' USING ERRCODE='PT409'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN('approved','rejected','correction_requested') OR p_note IS NULL OR char_length(p_note)>1000 OR (p_decision<>'approved' AND char_length(btrim(p_note))=0) THEN RAISE EXCEPTION 'Review decision and reason required' USING ERRCODE='22023'; END IF;
 IF p_decision='approved' THEN PERFORM public.sdl_004_pilot_officialize(p.id); END IF;
 UPDATE public.sdl_performance_submissions SET status=p_decision,reviewed_by=(SELECT auth.uid()),reviewed_at=now(),review_note=p_note,revision=revision+1 WHERE id=p.id;
 PERFORM public.sdl_004_pilot_audit(p.player_id,p.organization_id,'performance_'||p_decision,p.id,jsonb_build_object('note',p_note,'revision',p.revision+1,'value',p.value,'protocol_id',p.protocol_id,'evidence',p.evidence));
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_correct_performance(p_id uuid,p_protocol text,p_value numeric,p_date date,p_evidence text,p_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.sdl_performance_submissions%ROWTYPE;BEGIN
 SELECT * INTO p FROM public.sdl_performance_submissions WHERE id=p_id FOR UPDATE;
 IF p.id IS NULL OR NOT public.sdl_004_session_active() OR NOT public.sdl_004_guardian_for((SELECT auth.uid()),p.player_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p.revision IS DISTINCT FROM p_revision OR p.status NOT IN('pending','correction_requested') THEN RAISE EXCEPTION 'Submission cannot be edited; submit a correction for coach review' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sdl_measurement_protocols WHERE id=p_protocol AND active) OR p_value IS NULL OR NOT(p_value>0 AND p_value<=500)
 OR p_date IS NULL OR p_date>CURRENT_DATE OR p_date<'1900-01-01' OR p_evidence IS NULL OR char_length(btrim(p_evidence)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid correction' USING ERRCODE='22023'; END IF;
 PERFORM public.sdl_004_pilot_audit(p.player_id,p.organization_id,'performance_corrected',p.id,jsonb_build_object('previous',jsonb_build_object('value',p.value,'protocol_id',p.protocol_id,'measurement_date',p.measurement_date,'evidence',p.evidence),'value',p_value,'protocol_id',p_protocol,'measurement_date',p_date,'evidence',p_evidence,'revision',p.revision+1));
 UPDATE public.sdl_performance_submissions SET protocol_id=p_protocol,value=p_value,measurement_date=p_date,evidence=p_evidence,status='pending',review_note='',reviewed_by=NULL,reviewed_at=NULL,revision=revision+1 WHERE id=p.id;
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_performance(p_player uuid DEFAULT NULL,p_team uuid DEFAULT NULL,p_status text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_session_active() OR (p_player IS NOT NULL AND NOT public.sdl_004_pilot_can_measure(p_player)) OR (p_player IS NULL AND p_team IS NULL) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN('all','pending','approved','rejected','correction_requested') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE='22023'; END IF;
 IF p_team IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.team_memberships tm JOIN public.teams t ON t.id=tm.team_id WHERE tm.user_id=(SELECT auth.uid()) AND tm.team_id=p_team AND tm.role='coach' AND tm.status='active' AND t.status='active' AND EXISTS(SELECT 1 FROM public.organization_memberships om JOIN public.profiles pr ON pr.id=om.user_id JOIN public.organizations o ON o.id=om.organization_id WHERE om.user_id=tm.user_id AND om.organization_id=t.organization_id AND om.status='active' AND om.role IN('staff','admin') AND pr.status='active' AND o.status='active')) THEN RAISE EXCEPTION 'Assigned coach required' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'player_id',p.player_id,'preferred_name',player.preferred_name,'protocol_id',p.protocol_id,'metric',proto.metric,'unit',proto.unit,'protocol_label',proto.label,'distance_m',proto.distance_m,
 'value',p.value,'measurement_date',p.measurement_date,'status',p.status,'source_kind',p.source_kind,'revision',p.revision,'evidence',p.evidence,'evidence_video_id',p.evidence_video_id,
 'review_note',p.review_note,'recorded_by',p.submitted_by,'reviewed_by',p.reviewed_by,'created_at',p.created_at,'supersedes',p.supersedes,'superseded_by',p.superseded_by,
 'can_review',p.submitted_by<>(SELECT auth.uid()) AND p.status='pending' AND public.sdl_004_coach_for((SELECT auth.uid()),p.player_id),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('action',ev.action,'actor',ev.actor,'at',ev.occurred_at,'details',ev.details) ORDER BY ev.event_order)FROM public.sdl_pilot_events ev WHERE ev.target=p.id),'[]'))ORDER BY p.created_at DESC,p.id)
 FROM(SELECT s.* FROM public.sdl_performance_submissions s WHERE (p_player IS NULL OR s.player_id=p_player)
 AND (p_status='all' OR s.status=p_status) AND (p_team IS NULL OR public.sdl_004_coach_team((SELECT auth.uid()),s.player_id,p_team))
 ORDER BY s.created_at DESC,s.id LIMIT 100)p JOIN public.players player ON player.id=p.player_id JOIN public.sdl_measurement_protocols proto ON proto.id=p.protocol_id),'[]');
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_sharing(p_enrollment uuid,p_generation uuid,p_mode text,p_roster boolean,p_metrics text[],p_video boolean,p_confirmed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_confirmed IS DISTINCT FROM true OR p_mode IS NULL OR p_mode NOT IN('all','none','advanced') THEN RAISE EXCEPTION 'Explicit confirmation required' USING ERRCODE='22023'; END IF;
 -- Each underlying function locks and authorizes the same enrollment. Atomic, separate receipts.
 IF p_mode='all' THEN p_roster=true;p_metrics=ARRAY['exit_velo','throwing_velo','sprint_time','broad_jump'];p_video=true;
 ELSIF p_mode='none' THEN p_roster=false;p_metrics='{}';p_video=false; END IF;
 IF p_video IS NULL THEN RAISE EXCEPTION 'Explicit video choice required' USING ERRCODE='22023'; END IF;
 PERFORM public.sdl_004_set_statistic_consent(p_enrollment,p_generation,p_roster,p_metrics,CASE WHEN p_roster THEN 'sdl004-baseball-statistics-v1' END);
 PERFORM public.sdl_004_club_consent(p_enrollment,p_generation,p_video,CASE WHEN p_video THEN 'sdl004-clubhouse-v1' END);
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_family(p_player uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
 IF NOT public.sdl_004_session_active() OR NOT public.sdl_004_guardian_for((SELECT auth.uid()),p_player) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('player_id',p.id,'preferred_name',p.preferred_name,'given_names',p.given_names,'last_name',p.last_name,'dob',p.dob,'parent_phone',p.parent_phone,'registration_number',p.hkll_reg_no) INTO result FROM public.players p WHERE p.id=p_player;
 RETURN result;
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_contacts(p_team uuid,p_purpose text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;result jsonb; BEGIN
 SELECT organization_id INTO org FROM public.teams WHERE id=p_team AND status='active';
 IF p_purpose IS NULL OR p_purpose NOT IN('family_contacts','registration_contacts') OR NOT coalesce(public.sdl_004_pilot_permission(org,p_team,p_purpose),false) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(x),'[]') INTO result FROM(
 SELECT DISTINCT p.id AS player_id,p.preferred_name,p.parent_phone,
 CASE WHEN p_purpose='registration_contacts' THEN p.given_names END AS given_names,
 CASE WHEN p_purpose='registration_contacts' THEN p.last_name END AS last_name,
 CASE WHEN p_purpose='registration_contacts' THEN p.dob END AS dob,
 CASE WHEN p_purpose='registration_contacts' THEN p.hkll_reg_no END AS registration_number
 FROM public.players p JOIN public.player_team_memberships pm ON pm.player_id=p.id AND pm.organization_id=p.organization_id
 WHERE pm.team_id=p_team AND p.organization_id=org AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE
 AND public.sdl_004_statistics_enrollment(p.id) IS NOT NULL ORDER BY p.id LIMIT 100)x;
 PERFORM public.sdl_004_pilot_audit(NULL,org,'contact_access',p_team,jsonb_build_object('purpose',p_purpose,'count',jsonb_array_length(result)));RETURN result;
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_workspace()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_session_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'players',coalesce((SELECT jsonb_agg(x) FROM(SELECT * FROM public.sdl_004_workspace_players() LIMIT 100)x),'[]'),
 'protocols',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'metric',metric,'label',label,'unit',unit,'distance_m',distance_m)ORDER BY id)FROM public.sdl_measurement_protocols WHERE active),'[]'),
 'invitation_organizations',coalesce((SELECT jsonb_agg(x) FROM(SELECT o.id,o.name FROM public.organizations o WHERE o.status='active' AND (public.sdl_004_club_admin(o.id) OR EXISTS(SELECT 1 FROM public.players p WHERE p.organization_id=o.id AND public.sdl_004_pilot_can_invite(p.id))) ORDER BY o.id LIMIT 100)x),'[]'),
 'staff_scopes',coalesce((SELECT jsonb_agg(x)FROM(SELECT DISTINCT t.id AS team_id,t.name AS team_name,t.organization_id,g.permission FROM public.teams t JOIN public.sdl_staff_permissions g ON g.organization_id=t.organization_id AND (g.team_id IS NULL OR g.team_id=t.id) WHERE t.status='active' AND g.user_id=(SELECT auth.uid()) AND g.permission IN('family_contacts','registration_contacts') AND public.sdl_004_pilot_permission(t.organization_id,t.id,g.permission) ORDER BY t.id,g.permission LIMIT 100)x),'[]'));
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_invitation_players(p_org uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(x),'[]') FROM(SELECT p.id,p.preferred_name FROM public.players p WHERE p.organization_id=p_org AND public.sdl_004_pilot_can_invite(p.id) AND public.sdl_004_statistics_enrollment(p.id) IS NOT NULL ORDER BY p.id LIMIT 100)x;
$$;
CREATE FUNCTION public.sdl_004_pilot_coach_statistics(p_player uuid)
RETURNS TABLE(id uuid,player_id uuid,session_date date,exit_velo numeric,throwing_velo numeric,sprint_time numeric,broad_jump numeric,control_exit_velo numeric,attack_angle numeric,height_cm numeric,weight_kg numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_session_active() OR NOT public.sdl_004_coach_for((SELECT auth.uid()),p_player) OR public.sdl_004_statistics_enrollment(p_player) IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT s.id,s.player_id,s.session_date,s.exit_velo,s.throwing_velo,s.sprint_time,s.broad_jump,s.control_exit_velo,s.attack_angle,s.height_cm,s.weight_kg FROM public.sessions s WHERE s.player_id=p_player ORDER BY s.session_date DESC,s.id LIMIT 200;
END;
$$;
-- Explicit staff approval of the public baseball projection, independent of guardian consent.
CREATE FUNCTION public.sdl_004_pilot_profile_approved(p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT ev.action='baseball_profile_approved' AND ev.details->>'enrollment_generation'=e.generation::text
 FROM public.players p JOIN public.sdl_club_enrollments e ON e.id=public.sdl_004_statistics_enrollment(p.id)
 JOIN LATERAL(SELECT * FROM public.sdl_pilot_events WHERE target=p.id AND action IN('baseball_profile_approved','baseball_profile_revoked','baseball_profile_changed') ORDER BY event_order DESC LIMIT 1)ev ON true
 WHERE p.id=p_player),false);
$$;
CREATE FUNCTION public.sdl_004_pilot_baseball_profile(p_player uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_pilot_can_measure(p_player)THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 RETURN(SELECT jsonb_build_object('player_id',id,'preferred_name',preferred_name,'jersey',jersey,'position',position,'throws',throws,'bats',bats,'approved',public.sdl_004_pilot_profile_approved(id))FROM public.players WHERE id=p_player);
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_approve_profile(p_player uuid,p_approved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.players%ROWTYPE;e public.sdl_club_enrollments%ROWTYPE;BEGIN
 SELECT * INTO p FROM public.players WHERE id=p_player FOR UPDATE;
 IF NOT public.sdl_004_session_active() OR NOT public.sdl_004_coach_for((SELECT auth.uid()),p_player)THEN RAISE EXCEPTION 'Assigned coach required' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p_player)FOR SHARE;
 IF e.id IS NULL OR p_approved IS NULL THEN RAISE EXCEPTION 'Active enrollment and explicit approval required' USING ERRCODE='22023';END IF;
 PERFORM public.sdl_004_pilot_audit(p.id,p.organization_id,CASE WHEN p_approved THEN 'baseball_profile_approved' ELSE 'baseball_profile_revoked' END,p.id,
 jsonb_build_object('enrollment_generation',e.generation,'profile',jsonb_build_object('preferred_name',p.preferred_name,'jersey',p.jersey,'position',p.position,'throws',p.throws,'bats',p.bats)));
END;
$$;
CREATE FUNCTION public.sdl_004_pilot_profile_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF ROW(OLD.id,OLD.athlete_id,OLD.organization_id,OLD.preferred_name,OLD.jersey,OLD.position,OLD.throws,OLD.bats)
 IS DISTINCT FROM ROW(NEW.id,NEW.athlete_id,NEW.organization_id,NEW.preferred_name,NEW.jersey,NEW.position,NEW.throws,NEW.bats)THEN
 PERFORM public.sdl_004_pilot_audit(NEW.id,NEW.organization_id,'baseball_profile_changed',NEW.id,'{}');END IF;RETURN NEW;
END;
$$;
CREATE TRIGGER sdl_pilot_baseball_changed AFTER UPDATE OF id,athlete_id,organization_id,preferred_name,jersey,position,throws,bats ON public.players FOR EACH ROW EXECUTE FUNCTION public.sdl_004_pilot_profile_changed();
-- Current official records only. Protocol-free historical approvals remain private.
DROP FUNCTION public.sdl_004_clubhouse_leaderboard(uuid);
CREATE FUNCTION public.sdl_004_clubhouse_leaderboard(p_team_id uuid)
RETURNS TABLE(id uuid,player_id uuid,team_id uuid,team_name text,metric text,preferred_name text,jersey text,value numeric,unit text,rank integer,recorded_at text,protocol_id text,protocol_label text,distance_m numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_clubhouse_member(p_team_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH eligible AS(
 SELECT DISTINCT a.id,a.player_id,a.athlete_id,t.id AS team_id,t.name AS team_name,a.metric,p.preferred_name,p.jersey,a.value,a.recorded_at,a.approved_at,proto.id AS protocol_id,proto.label AS protocol_label,proto.unit,proto.distance_m
 FROM public.sdl_official_statistics a JOIN public.sdl_measurement_protocols proto ON proto.id=a.protocol_id AND proto.metric=a.metric AND proto.active
 JOIN public.players p ON p.id=a.player_id AND p.athlete_id=a.athlete_id AND p.organization_id=a.organization_id
 JOIN public.sdl_club_enrollments e ON e.id=a.enrollment_id AND e.generation=a.enrollment_generation AND e.id=public.sdl_004_statistics_enrollment(p.id)
 JOIN public.sdl_statistic_consents c ON c.id=public.sdl_004_statistics_consent(e.id)
 JOIN public.player_team_memberships pm ON pm.player_id=p.id AND pm.organization_id=p.organization_id JOIN public.teams t ON t.id=pm.team_id AND t.organization_id=p.organization_id
 WHERE t.id=p_team_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE AND a.invalidated_at IS NULL AND c.share_roster AND public.sdl_004_pilot_profile_approved(p.id) AND a.metric=ANY(c.metrics) AND a.source_hash=public.sdl_004_statistics_source_hash(a.session_id)
 ), latest AS(SELECT DISTINCT ON(x.athlete_id,x.protocol_id) x.* FROM eligible x ORDER BY x.athlete_id,x.protocol_id,x.recorded_at DESC,x.approved_at DESC,x.id),
 ranked AS(SELECT x.*,row_number()OVER(PARTITION BY x.protocol_id ORDER BY CASE WHEN x.metric='sprint_time' THEN x.value ELSE -x.value END,x.athlete_id)::integer AS place FROM latest x)
 SELECT x.id,x.player_id,x.team_id,x.team_name,x.metric,x.preferred_name,x.jersey,x.value,x.unit,x.place,x.recorded_at::text,x.protocol_id,x.protocol_label,x.distance_m FROM ranked x WHERE x.place<=3 ORDER BY x.protocol_id,x.place;
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_submission_contract()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN public.sdl_004_session_active() THEN jsonb_build_object('revision','sdl004-club-enrollment-v2','enrollmentAdmin',true,'clubhouseRoster',true,'clubhouseLeaderboard',true,'parentStatistics',true,'statisticsConsent',true,'pilotWorkflow','sdl004-final-pilot-v1') ELSE NULL END;
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

CREATE OR REPLACE FUNCTION public.sdl_004_submission_can_publish(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND EXISTS(SELECT 1 FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 WHERE EXISTS(SELECT 1 FROM public.sdl_club_enrollments recording WHERE recording.id=s.enrollment_id AND recording.generation=s.enrollment_generation AND recording.status='active' AND recording.ended_at IS NULL AND recording.recording_storage_authorized AND nullif(btrim(recording.recording_permission_ref),'') IS NOT NULL) AND s.id=p_id AND s.status='approved' AND public.sdl_004_coach_for((SELECT auth.uid()),s.player_id)
 AND public.sdl_004_active_club_consent(s.enrollment_id,s.enrollment_generation) IS NOT NULL);
$$;

CREATE OR REPLACE FUNCTION public.sdl_004_clubhouse_visible(p_id uuid,p_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_clubhouse_member(p_team) AND EXISTS(SELECT 1 FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 JOIN public.player_team_memberships pm ON pm.player_id=p.id AND pm.organization_id=s.organization_id
 JOIN public.teams t ON t.id=pm.team_id AND t.organization_id=s.organization_id
 WHERE EXISTS(SELECT 1 FROM public.sdl_club_enrollments recording WHERE recording.id=s.enrollment_id AND recording.generation=s.enrollment_generation AND recording.status='active' AND recording.ended_at IS NULL AND recording.recording_storage_authorized AND nullif(btrim(recording.recording_permission_ref),'') IS NOT NULL) AND s.id=p_id AND s.status='approved' AND s.subject_scope='single_athlete' AND s.subject_confirmed_by IS NOT NULL
 AND t.id=p_team AND t.status='active' AND p_team=ANY(s.publication_team_ids)
 AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE
 AND s.publication_consent_id=public.sdl_004_active_club_consent(s.enrollment_id,s.enrollment_generation));
$$;

CREATE OR REPLACE FUNCTION public.sdl_004_player_statistics(p_player_id uuid)
RETURNS TABLE(id uuid,player_id uuid,session_date date,exit_velo numeric,throwing_velo numeric,sprint_time numeric,broad_jump numeric,
 control_exit_velo numeric,attack_angle numeric,height_cm numeric,weight_kg numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_session_active() OR NOT public.sdl_004_guardian_for((SELECT auth.uid()),p_player_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT s.id,s.player_id,s.session_date,s.exit_velo,s.throwing_velo,s.sprint_time,s.broad_jump,
 s.control_exit_velo,s.attack_angle,s.height_cm,s.weight_kg FROM public.sessions s
 WHERE s.player_id=p_player_id ORDER BY s.session_date DESC,s.id DESC LIMIT 200;
END;
$$;

CREATE FUNCTION public.sdl_004_pilot_administration(p_org uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_club_admin(p_org) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('members',coalesce((SELECT jsonb_agg(x)FROM(SELECT DISTINCT om.user_id AS id,coalesce(pr.display_name,'Staff member') AS name FROM public.organization_memberships om JOIN public.profiles pr ON pr.id=om.user_id WHERE om.organization_id=p_org AND om.status='active' AND om.role IN('staff','admin') AND pr.status='active' ORDER BY om.user_id LIMIT 100)x),'[]'),
 'teams',coalesce((SELECT jsonb_agg(x)FROM(SELECT id,name FROM public.teams WHERE organization_id=p_org AND status='active' ORDER BY id LIMIT 100)x),'[]'),
 'permissions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'team_id',team_id,'permission',permission,'active',active))FROM public.sdl_staff_permissions WHERE organization_id=p_org),'[]'));
END;
$$;
-- Follow a child's internal transfer without resetting enrollment or reviving explicitly revoked parent-team access.
CREATE FUNCTION public.sdl_004_pilot_parent_team_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='active' AND NEW.end_date IS NULL AND NEW.start_date<=CURRENT_DATE THEN
 INSERT INTO public.team_memberships(team_id,user_id,role,status,created_at,updated_at)
 SELECT DISTINCT NEW.team_id,ag.user_id,'parent','active',now(),now()
 FROM public.players p JOIN public.athlete_guardians ag ON ag.athlete_id=p.athlete_id AND ag.status='verified'
 JOIN public.profiles pr ON pr.id=ag.user_id AND pr.status='active'
 JOIN public.teams t ON t.id=NEW.team_id AND t.organization_id=NEW.organization_id AND t.status='active'
 WHERE p.id=NEW.player_id AND p.organization_id=NEW.organization_id AND public.sdl_004_statistics_enrollment(p.id) IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.team_memberships tm WHERE tm.team_id=NEW.team_id AND tm.user_id=ag.user_id) ON CONFLICT DO NOTHING;
 END IF;RETURN NEW;
END;
$$;
CREATE TRIGGER sdl_pilot_parent_transfer AFTER INSERT OR UPDATE OF player_id,team_id,organization_id,status,start_date,end_date ON public.player_team_memberships FOR EACH ROW EXECUTE FUNCTION public.sdl_004_pilot_parent_team_transfer();
DO $grants$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure AS sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'sdl_004_pilot_%' OR p.proname='sdl_004_clubhouse_leaderboard') LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM PUBLIC,anon,authenticated,service_role';
 IF r.proname=ANY(ARRAY['sdl_004_pilot_baseball_profile','sdl_004_pilot_approve_profile','sdl_004_pilot_administration','sdl_004_pilot_workspace','sdl_004_pilot_invitation_players','sdl_004_pilot_issue_invitation','sdl_004_pilot_redeem_invitation','sdl_004_pilot_revoke_invitation','sdl_004_pilot_invitations','sdl_004_pilot_growth','sdl_004_pilot_save_growth','sdl_004_pilot_submit_performance','sdl_004_pilot_correct_performance','sdl_004_pilot_review_performance','sdl_004_pilot_performance','sdl_004_pilot_sharing','sdl_004_pilot_family','sdl_004_pilot_contacts','sdl_004_pilot_set_permission','sdl_004_pilot_coach_statistics','sdl_004_clubhouse_leaderboard']) THEN EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.sig||' TO authenticated';END IF;
 END LOOP;
END $grants$;
CREATE OR REPLACE FUNCTION public.sdl_004_list_statistic_consents(p_athlete uuid)
RETURNS TABLE(id uuid,generation uuid,organization_id uuid,organization_name text,status text,share_roster boolean,metrics text[],policy_version text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.id,e.generation,e.organization_id,o.name,e.status,coalesce(c.share_roster,false),ARRAY(SELECT metric FROM unnest(coalesce(c.metrics,'{}'))metric WHERE metric=ANY(ARRAY['exit_velo','throwing_velo','sprint_time','broad_jump'])),c.policy_version
 FROM public.sdl_club_enrollments e JOIN public.organizations o ON o.id=e.organization_id
 LEFT JOIN public.sdl_statistic_consents c ON c.id=public.sdl_004_statistics_consent(e.id)
 WHERE e.athlete_id=p_athlete AND public.sdl_004_session_active()
 AND public.sdl_004_guardian_athlete((SELECT auth.uid()),p_athlete) ORDER BY o.name,e.started_at DESC,e.id LIMIT 100;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_clubhouse_roster(p_team_id uuid)
RETURNS TABLE(id uuid,team_id uuid,team_name text,preferred_name text,jersey text,"position" text,throws text,bats text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_clubhouse_member(p_team_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT DISTINCT p.id,t.id,t.name,p.preferred_name,p.jersey,p.position,p.throws,p.bats
 FROM public.teams t JOIN public.player_team_memberships pm ON pm.team_id=t.id AND pm.organization_id=t.organization_id
 JOIN public.players p ON p.id=pm.player_id AND p.organization_id=t.organization_id
 JOIN public.sdl_statistic_consents c ON c.id=public.sdl_004_statistics_consent(public.sdl_004_statistics_enrollment(p.id))
 WHERE t.id=p_team_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE AND c.share_roster AND public.sdl_004_pilot_profile_approved(p.id)
 ORDER BY p.preferred_name,p.id LIMIT 100;
END;
$$;
COMMIT;
