BEGIN;
CREATE OR REPLACE FUNCTION public.sdl_004_submission_contract()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN public.sdl_004_session_active() THEN jsonb_build_object('rbacVersion',5,'revision','sdl004-club-enrollment-v2','enrollmentAdmin',true,'clubhouseRoster',true,'clubhouseLeaderboard',true,'parentStatistics',true,'statisticsConsent',true,'pilotWorkflow','sdl004-final-pilot-v1') ELSE NULL END;
$$;
CREATE OR REPLACE FUNCTION sdl_rbac_v5.media_access(p_id uuid,p_action text)
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
 (p_action IN ('playback','download') AND (sdl_rbac_v5.player_role_gate(p.id,'review_video') OR sdl_rbac_v5.has_player_role(p.id,'guardian') OR sdl_rbac_v5.is_platform_admin())
 AND (p_action='playback' OR (s.subject_scope='single_athlete' AND s.subject_confirmed_by IS NOT NULL)))
 OR (p_action='playback' AND EXISTS(SELECT 1 FROM unnest(s.publication_team_ids) team
 WHERE public.sdl_004_clubhouse_visible(s.id,team)))));
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_list_submissions(p_player_id uuid)
RETURNS TABLE(id uuid,player_id uuid,athlete_id uuid,category text,status text,source_kind text,created_at timestamptz,
 review_note text,history jsonb,can_review boolean,can_publish boolean,publication_team_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id,s.player_id,s.athlete_id,s.category,s.status,s.source_kind,s.created_at,s.review_note,s.history,
 s.status='pending' AND s.submitted_by<>(SELECT auth.uid()) AND public.sdl_004_submission_can_review(s.player_id),
 public.sdl_004_submission_can_publish(s.id),s.publication_team_ids FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 WHERE s.player_id=p_player_id AND public.sdl_004_session_active() AND (sdl_rbac_v5.has_player_role(s.player_id,'guardian') OR sdl_rbac_v5.player_role_gate(s.player_id,'review_video') OR sdl_rbac_v5.is_platform_admin()) AND sdl_rbac_v5.media_access(s.id,'playback') ORDER BY s.created_at DESC LIMIT 30;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_review_queue(p_team_id uuid,p_status text DEFAULT 'pending')
RETURNS TABLE(id uuid,player_id uuid,athlete_id uuid,preferred_name text,team_id uuid,team_name text,category text,status text,
 source_kind text,created_at timestamptz,review_note text,history jsonb,can_review boolean,can_publish boolean,publication_team_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id,s.player_id,s.athlete_id,p.preferred_name,t.id,t.name,s.category,s.status,s.source_kind,s.created_at,s.review_note,s.history,
 s.status='pending' AND s.submitted_by<>(SELECT auth.uid()),public.sdl_004_submission_can_publish(s.id),s.publication_team_ids
 FROM public.sdl_video_submissions s JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 JOIN public.teams t ON t.id=p_team_id AND t.organization_id=s.organization_id
 WHERE public.sdl_004_session_active() AND (sdl_rbac_v5.team_role_gate(t.id,'manage_roster') OR sdl_rbac_v5.has_team_staff_role(t.id,'coach'))
 AND EXISTS(SELECT 1 FROM public.player_team_memberships pm WHERE pm.player_id=p.id AND pm.team_id=t.id AND pm.organization_id=t.organization_id
 AND pm.status='active' AND pm.start_date<=CURRENT_DATE AND pm.end_date IS NULL) AND sdl_rbac_v5.media_access(s.id,'playback')
 AND (p_status='all' OR s.status=p_status) ORDER BY s.created_at DESC LIMIT 50;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_clubhouse_leaderboard(p_team_id uuid)
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
 WHERE t.id=p_team_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE AND a.invalidated_at IS NULL AND c.share_roster AND public.sdl_004_pilot_profile_approved(p.id) AND (c.policy_version<>'baseball-sessions-v5' OR EXISTS(SELECT 1 FROM sdl_rbac_v5.shared_protocols cat WHERE cat.protocol_id=proto.id AND cat.notice=c.policy_version)) AND a.metric=ANY(c.metrics) AND a.source_hash=public.sdl_004_statistics_source_hash(a.session_id)
 ), latest AS(SELECT DISTINCT ON(x.athlete_id,x.protocol_id) x.* FROM eligible x ORDER BY x.athlete_id,x.protocol_id,x.recorded_at DESC,x.approved_at DESC,x.id),
 ranked AS(SELECT x.*,row_number()OVER(PARTITION BY x.protocol_id ORDER BY CASE WHEN x.metric='sprint_time' THEN x.value ELSE -x.value END,x.athlete_id)::integer AS place FROM latest x)
 SELECT x.id,x.player_id,x.team_id,x.team_name,x.metric,x.preferred_name,x.jersey,x.value,x.unit,x.place,x.recorded_at::text,x.protocol_id,x.protocol_label,x.distance_m FROM ranked x WHERE x.place<=3 ORDER BY x.protocol_id,x.place;
END;
$$;
CREATE FUNCTION public.sdl_v5_authorize_playback(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT sdl_rbac_v5.media_access(p_id,'playback') THEN RETURN false; END IF;
 IF sdl_rbac_v5.is_platform_admin() THEN
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 SELECT auth.uid(),'platform_playback_authorized',organization_id,player_id,id,'Private playback' FROM public.sdl_video_submissions WHERE id=p_id;
 END IF;
 RETURN true;
END;
$$;
CREATE FUNCTION public.sdl_v5_confirm_subject(p_id uuid,p_athlete uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sdl_video_submissions;
BEGIN
 SELECT * INTO s FROM public.sdl_video_submissions WHERE id=p_id FOR UPDATE;
 IF s.id IS NULL OR s.athlete_id IS DISTINCT FROM p_athlete OR s.subject_scope='multiple' OR NOT sdl_rbac_v5.media_access(s.id,'playback')
 OR NOT sdl_rbac_v5.player_role_gate(s.player_id,'review_video') OR s.submitted_by=auth.uid()
 THEN RAISE EXCEPTION 'Independent subject verification required' USING ERRCODE='42501'; END IF;
 UPDATE public.sdl_video_submissions SET subject_scope='single_athlete',subject_confirmed_by=auth.uid(),subject_confirmed_at=now() WHERE id=s.id;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 VALUES(auth.uid(),'private_subject_confirmed',s.organization_id,s.player_id,s.id,p_reason);
END;
$$;
CREATE FUNCTION public.sdl_v5_private_statistics(p_player uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,session_date date,exit_velo numeric,throwing_velo numeric,sprint_time numeric,broad_jump numeric,
 control_exit_velo numeric,attack_angle numeric,height_cm numeric,weight_kg numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT sdl_rbac_v5.player_role_gate(p_player,'read_private_statistics') THEN RAISE EXCEPTION 'History access denied' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 INSERT INTO sdl_rbac_v5.events(actor,organization_id,player_id,action,reason)
 SELECT auth.uid(),p.organization_id,p.id,'private_history_read','Private session page' FROM public.players p WHERE p.id=p_player;
 RETURN QUERY SELECT s.id,s.session_date,s.exit_velo,s.throwing_velo,s.sprint_time,s.broad_jump,s.control_exit_velo,s.attack_angle,s.height_cm,s.weight_kg
 FROM public.sessions s WHERE s.player_id=p_player AND (p_after IS NULL OR s.id>p_after)
 AND NOT EXISTS(SELECT 1 FROM public.sdl_performance_submissions old WHERE old.session_id=s.id AND old.superseded_by IS NOT NULL)
 ORDER BY s.id LIMIT p_limit;
END;
$$;
CREATE FUNCTION public.sdl_v5_photo_eligible(p_player uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT sdl_rbac_v5.has_player_role(p_player,'guardian') OR sdl_rbac_v5.player_role_gate(p_player,'review_video') OR sdl_rbac_v5.has_player_role(p_player,'platform_admin');
$$;
REVOKE ALL ON FUNCTION public.sdl_v5_authorize_playback(uuid),public.sdl_v5_confirm_subject(uuid,uuid,text),
 public.sdl_v5_private_statistics(uuid,uuid,integer),public.sdl_v5_photo_eligible(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_authorize_playback(uuid),public.sdl_v5_confirm_subject(uuid,uuid,text),
 public.sdl_v5_private_statistics(uuid,uuid,integer),public.sdl_v5_photo_eligible(uuid) TO authenticated;

CREATE FUNCTION public.sdl_v5_legacy_media(p_player uuid)
RETURNS TABLE(id uuid,player_id uuid,byte_size bigint,content_type text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m.id,m.player_id,m.byte_size,m.content_type,m.created_at FROM public.sdl_media_objects m
 WHERE m.player_id=p_player AND sdl_rbac_v5.media_access(m.id,'playback') ORDER BY m.created_at DESC,m.id DESC LIMIT 30;
$$;
REVOKE ALL ON FUNCTION public.sdl_v5_legacy_media(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_legacy_media(uuid) TO authenticated;
CREATE TABLE sdl_rbac_v5.event_teams(event_id bigint REFERENCES sdl_rbac_v5.events(id),
 team_id uuid NOT NULL,PRIMARY KEY(team_id,event_id));
ALTER TABLE sdl_rbac_v5.event_teams ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sdl_rbac_v5.event_teams FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_event_team BEFORE UPDATE OR DELETE OR TRUNCATE ON sdl_rbac_v5.event_teams
 FOR EACH STATEMENT EXECUTE FUNCTION sdl_rbac_v5.keep_event();
CREATE FUNCTION sdl_rbac_v5.capture_event_scope() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.player_id IS NOT NULL AND NEW.team_id IS NULL THEN
 INSERT INTO sdl_rbac_v5.event_teams(team_id,event_id) SELECT DISTINCT pm.team_id,NEW.id
 FROM public.player_team_memberships pm WHERE pm.player_id=NEW.player_id AND pm.organization_id=NEW.organization_id
 AND pm.status='active' AND pm.start_date<=CURRENT_DATE AND pm.end_date IS NULL;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER scope_event AFTER INSERT ON sdl_rbac_v5.events FOR EACH ROW EXECUTE FUNCTION sdl_rbac_v5.capture_event_scope();
CREATE FUNCTION sdl_rbac_v5.capture_pilot_event() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 VALUES(NEW.actor,'pilot_'||NEW.action,NEW.organization_id,NEW.player_id,NEW.target,'Pilot workflow event');
 RETURN NEW;
END;
$$;
CREATE TRIGGER record_pilot_activity AFTER INSERT ON public.sdl_pilot_events FOR EACH ROW EXECUTE FUNCTION sdl_rbac_v5.capture_pilot_event();
REVOKE ALL ON FUNCTION sdl_rbac_v5.capture_event_scope(),sdl_rbac_v5.capture_pilot_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.sdl_v5_audit_history(p_scope text,p_id uuid,p_before bigint DEFAULT NULL,p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint,occurred_at timestamptz,action text,actor uuid,player_id uuid,target_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 IF NOT sdl_rbac_v5.active_actor() OR NOT COALESCE(CASE p_scope
 WHEN 'platform' THEN p_id IS NULL AND sdl_rbac_v5.is_platform_admin()
 WHEN 'club' THEN sdl_rbac_v5.is_club_admin(p_id)
 WHEN 'team' THEN sdl_rbac_v5.has_team_staff_role(p_id,'manager')
 WHEN 'own' THEN p_id=auth.uid()
 WHEN 'downloads' THEN sdl_rbac_v5.has_player_role(p_id,'guardian')
 ELSE false END,false) THEN RAISE EXCEPTION 'Audit access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT e.id,e.occurred_at,e.action,CASE WHEN p_scope<>'downloads' THEN e.actor END,e.player_id,e.target_id
 FROM sdl_rbac_v5.events e WHERE (p_before IS NULL OR e.id<p_before) AND CASE p_scope
 WHEN 'platform' THEN true WHEN 'club' THEN e.organization_id=p_id WHEN 'team' THEN e.team_id=p_id OR EXISTS(SELECT 1 FROM sdl_rbac_v5.event_teams et WHERE et.team_id=p_id AND et.event_id=e.id)
 WHEN 'own' THEN e.actor=auth.uid() AND (sdl_rbac_v5.has_team_staff_role(e.team_id,'coach') OR sdl_rbac_v5.has_player_role(e.player_id,'coach'))
 WHEN 'downloads' THEN e.action='download_authorized' AND e.player_id=p_id ELSE false END
 ORDER BY e.id DESC LIMIT p_limit;
 IF p_scope='platform' THEN
 INSERT INTO sdl_rbac_v5.events(actor,action,reason) VALUES(auth.uid(),'audit_access','Platform history page');
 END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_performance(p_player uuid DEFAULT NULL,p_team uuid DEFAULT NULL,p_status text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_session_active() OR (p_player IS NOT NULL AND NOT sdl_rbac_v5.player_role_gate(p_player,'read_private_statistics')) OR (p_player IS NULL AND p_team IS NULL) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN('all','pending','approved','rejected','correction_requested') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE='22023'; END IF;
 IF p_team IS NOT NULL AND NOT (sdl_rbac_v5.team_role_gate(p_team,'manage_roster') OR sdl_rbac_v5.has_team_staff_role(p_team,'coach')
 OR (sdl_rbac_v5.is_platform_admin() AND EXISTS(SELECT 1 FROM public.teams WHERE id=p_team))) THEN
 RAISE EXCEPTION 'Team access denied' USING ERRCODE='42501'; END IF;
 IF sdl_rbac_v5.is_platform_admin() THEN INSERT INTO sdl_rbac_v5.events(actor,action,team_id,player_id,reason)
 VALUES(auth.uid(),'platform_performance_read',p_team,p_player,'Private performance page'); END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'player_id',p.player_id,'preferred_name',player.preferred_name,'protocol_id',p.protocol_id,'metric',proto.metric,'unit',proto.unit,'protocol_label',proto.label,'distance_m',proto.distance_m,
 'value',p.value,'measurement_date',p.measurement_date,'status',p.status,'source_kind',p.source_kind,'revision',p.revision,'evidence',p.evidence,'evidence_video_id',p.evidence_video_id,
 'review_note',p.review_note,'recorded_by',p.submitted_by,'reviewed_by',p.reviewed_by,'created_at',p.created_at,'supersedes',p.supersedes,'superseded_by',p.superseded_by,
 'can_review',p.submitted_by<>(SELECT auth.uid()) AND p.status='pending' AND public.sdl_004_coach_for((SELECT auth.uid()),p.player_id),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('action',ev.action,'actor',ev.actor,'at',ev.occurred_at,'details',ev.details) ORDER BY ev.event_order)FROM public.sdl_pilot_events ev WHERE ev.target=p.id),'[]'))ORDER BY p.created_at DESC,p.id)
 FROM(SELECT s.* FROM public.sdl_performance_submissions s WHERE (p_player IS NULL OR s.player_id=p_player)
 AND sdl_rbac_v5.player_role_gate(s.player_id,'read_private_statistics')
 AND (sdl_rbac_v5.has_player_role(s.player_id,'guardian') OR sdl_rbac_v5.is_platform_admin()
 OR EXISTS(SELECT 1 FROM public.sdl_club_enrollments en WHERE en.id=public.sdl_004_statistics_enrollment(s.player_id) AND en.id=s.enrollment_id AND en.generation=s.enrollment_generation))
 AND (p_status='all' OR s.status=p_status) AND (p_team IS NULL OR EXISTS(SELECT 1 FROM public.player_team_memberships pm WHERE pm.team_id=p_team AND pm.player_id=s.player_id
 AND pm.organization_id=s.organization_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE))
 ORDER BY s.created_at DESC,s.id LIMIT 100)p JOIN public.players player ON player.id=p.player_id JOIN public.sdl_measurement_protocols proto ON proto.id=p.protocol_id),'[]');
END;
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
 -- Lock the previous revision before creating a foreign key to it. Concurrent
 -- writers must never both hold key-share and then try to upgrade to UPDATE.
 IF p_supersedes IS NOT NULL THEN
 PERFORM 1 FROM public.sdl_performance_submissions prior WHERE prior.id=p_supersedes AND prior.player_id=p_player FOR UPDATE;
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
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_attest_session(p_session uuid,p_protocol text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sessions%ROWTYPE;p public.players%ROWTYPE;e public.sdl_club_enrollments%ROWTYPE;r public.sdl_measurement_protocols%ROWTYPE;v numeric;BEGIN
 SELECT * INTO s FROM public.sessions WHERE id=p_session FOR SHARE;
 SELECT * INTO p FROM public.players WHERE id=s.player_id FOR NO KEY UPDATE;
 IF NOT public.sdl_004_session_active() OR NOT sdl_rbac_v5.player_role_gate(p.id,'enter_official_statistics') THEN RAISE EXCEPTION 'Assigned coach required' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p.id) FOR SHARE;
 SELECT * INTO r FROM public.sdl_measurement_protocols WHERE id=p_protocol AND active;
 IF EXISTS(SELECT 1 FROM public.sdl_performance_submissions WHERE session_id=s.id AND superseded_by IS NOT NULL)
 THEN RAISE EXCEPTION 'Superseded measurement' USING ERRCODE='PT409'; END IF;
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

-- The old performance contract uses its required evidence note to explain
-- corrections. New callers can provide a separate explicit correction reason.
CREATE FUNCTION public.sdl_v5_correct_official(p_prior uuid,p_protocol text,p_value numeric,p_date date,
 p_evidence text,p_request uuid,p_reason text,p_video uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior public.sdl_performance_submissions; receipt jsonb; previous_reason text;
BEGIN
 SELECT * INTO prior FROM public.sdl_performance_submissions WHERE id=p_prior;
 IF prior.status IS DISTINCT FROM 'approved' OR NOT sdl_rbac_v5.player_role_gate(prior.player_id,'correct_official_statistics') THEN
 RAISE EXCEPTION 'Official correction denied' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Correction reason required' USING ERRCODE='22023'; END IF;
 receipt:=public.sdl_004_pilot_submit_performance(prior.player_id,p_protocol,p_value,p_date,p_evidence,p_request,true,p_video,p_prior);
 SELECT e.reason INTO previous_reason FROM sdl_rbac_v5.events e WHERE e.target_id=(receipt->>'id')::uuid AND e.action='official_correction';
 IF FOUND THEN
   IF previous_reason<>p_reason THEN RAISE EXCEPTION 'Correction reason changed' USING ERRCODE='PT409'; END IF;
 ELSE
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 VALUES(auth.uid(),'official_correction',prior.organization_id,prior.player_id,(receipt->>'id')::uuid,p_reason);
 END IF;
 RETURN receipt;
END;
$$;
CREATE FUNCTION public.sdl_v5_export_private_history(p_player uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,session_date date,exit_velo numeric,throwing_velo numeric,sprint_time numeric,broad_jump numeric,
 control_exit_velo numeric,attack_angle numeric,height_cm numeric,weight_kg numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 RETURN QUERY SELECT * FROM public.sdl_v5_private_statistics(p_player,p_after,p_limit);
 INSERT INTO sdl_rbac_v5.events(actor,organization_id,player_id,action,reason)
 SELECT auth.uid(),p.organization_id,p.id,'export_authorized','Private session page' FROM public.players p WHERE p.id=p_player;
END;
$$;
REVOKE ALL ON FUNCTION public.sdl_v5_correct_official(uuid,text,numeric,date,text,uuid,text,uuid),
 public.sdl_v5_export_private_history(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_correct_official(uuid,text,numeric,date,text,uuid,text,uuid),
 public.sdl_v5_export_private_history(uuid,uuid,integer) TO authenticated;
COMMIT;
