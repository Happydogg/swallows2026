BEGIN;
-- Reconciled evidence is private and operator-maintained. No historical grants
-- are inferred or seeded by the migration.
CREATE TABLE sdl_rbac_v5.historical_assignment_evidence (
 player_id uuid NOT NULL REFERENCES public.players(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 team_id uuid NOT NULL REFERENCES public.teams(id),
 staff_id uuid NOT NULL REFERENCES public.profiles(id),
 staff_role text NOT NULL CHECK(staff_role IN ('manager','coach')),
 record_kind text NOT NULL CHECK(record_kind IN ('session','performance','video')),
 record_id uuid NOT NULL,
 created_at timestamptz NOT NULL,
 assigned_from timestamptz NOT NULL,
 assigned_until timestamptz NOT NULL,
 verification_ref text NOT NULL CHECK(length(btrim(verification_ref)) BETWEEN 1 AND 500),
 PRIMARY KEY(record_kind,record_id,staff_id,team_id,staff_role),
 CHECK(assigned_from<=created_at AND created_at<assigned_until)
);
CREATE INDEX ON sdl_rbac_v5.historical_assignment_evidence(staff_id,player_id);
CREATE TABLE sdl_rbac_v5.retained_media_rights (
 video_id uuid PRIMARY KEY REFERENCES public.sdl_video_submissions(id),
 enrollment_generation uuid NOT NULL,
 view_allowed boolean NOT NULL,
 download_allowed boolean NOT NULL,
 valid_until timestamptz NOT NULL,
 revoked_at timestamptz,
 verification_ref text NOT NULL CHECK(length(btrim(verification_ref)) BETWEEN 1 AND 500),
 CHECK(NOT download_allowed OR view_allowed)
);
ALTER TABLE sdl_rbac_v5.historical_assignment_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdl_rbac_v5.retained_media_rights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sdl_rbac_v5.historical_assignment_evidence,sdl_rbac_v5.retained_media_rights
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION sdl_rbac_v5.historical_staff_view(p_player uuid,p_kind text,p_record uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM sdl_rbac_v5.historical_assignment_evidence e
 JOIN public.players p ON p.id=e.player_id AND p.organization_id=e.organization_id
 JOIN public.teams t ON t.id=e.team_id AND t.organization_id=e.organization_id
 WHERE e.player_id=p_player AND e.record_kind=p_kind AND e.record_id=p_record
 AND e.staff_id=auth.uid() AND e.assigned_until<=now()
 AND sdl_rbac_v5.has_team_staff_role(t.id,e.staff_role));
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.historical_staff_view(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION sdl_rbac_v5.private_statistics_page(p_player uuid,p_after uuid,p_limit integer,p_export boolean)
RETURNS TABLE(id uuid,session_date date,exit_velo numeric,throwing_velo numeric,sprint_time numeric,broad_jump numeric,
 control_exit_velo numeric,attack_angle numeric,height_cm numeric,weight_kg numeric)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE full_read boolean;
BEGIN
 SELECT sdl_rbac_v5.can_view_player(p_player) OR sdl_rbac_v5.is_club_admin(p.organization_id)
 INTO full_read FROM public.players p WHERE p.id=p_player;
 IF NOT coalesce(full_read,false) AND (p_export OR sdl_rbac_v5.csv_requested() OR NOT EXISTS(
 SELECT 1 FROM public.sessions candidate WHERE candidate.player_id=p_player
 AND sdl_rbac_v5.historical_staff_view(p_player,'session',candidate.id))) THEN RAISE EXCEPTION 'History access denied' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 INSERT INTO sdl_rbac_v5.events(actor,organization_id,player_id,action,reason)
 SELECT auth.uid(),p.organization_id,p.id,'private_history_read','Private session page' FROM public.players p WHERE p.id=p_player;
 RETURN QUERY SELECT s.id,s.session_date,s.exit_velo,s.throwing_velo,s.sprint_time,s.broad_jump,s.control_exit_velo,s.attack_angle,s.height_cm,s.weight_kg
 FROM public.sessions s WHERE s.player_id=p_player AND (p_after IS NULL OR s.id>p_after)
 AND (full_read OR sdl_rbac_v5.historical_staff_view(p_player,'session',s.id))
 AND NOT EXISTS(SELECT 1 FROM public.sdl_performance_submissions old WHERE old.session_id=s.id AND old.superseded_by IS NOT NULL)
 ORDER BY s.id LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.private_statistics_page(uuid,uuid,integer,boolean)
 FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.sdl_v5_private_statistics(p_player uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,session_date date,exit_velo numeric,throwing_velo numeric,sprint_time numeric,broad_jump numeric,
 control_exit_velo numeric,attack_angle numeric,height_cm numeric,weight_kg numeric)
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT * FROM sdl_rbac_v5.private_statistics_page(p_player,p_after,p_limit,false);
$$;
CREATE OR REPLACE FUNCTION public.sdl_v5_export_private_history(p_player uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,session_date date,exit_velo numeric,throwing_velo numeric,sprint_time numeric,broad_jump numeric,
 control_exit_velo numeric,attack_angle numeric,height_cm numeric,weight_kg numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT (sdl_rbac_v5.platform_allowed('export') OR sdl_rbac_v5.has_player_role(p_player,'guardian')
 OR sdl_rbac_v5.player_role_gate(p_player,'enter_official_statistics')
 OR EXISTS(SELECT 1 FROM public.players p WHERE p.id=p_player AND sdl_rbac_v5.is_club_admin(p.organization_id))) THEN
   RAISE EXCEPTION 'Export access denied' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT * FROM sdl_rbac_v5.private_statistics_page(p_player,p_after,p_limit,true);
 INSERT INTO sdl_rbac_v5.events(actor,organization_id,player_id,action,reason)
 SELECT auth.uid(),p.organization_id,p.id,'export_authorized','Private session page' FROM public.players p WHERE p.id=p_player;
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_v5_export_statistics(p_scope text,p_id uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,player_id uuid,recorded_at date,protocol_id text,metric text,value numeric,unit text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; team uuid; player uuid;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 IF p_scope='platform' AND p_id IS NULL AND sdl_rbac_v5.platform_allowed('export') THEN NULL;
 ELSIF p_scope='club' AND sdl_rbac_v5.is_club_admin(p_id) THEN org:=p_id;
 ELSIF p_scope='team' AND (sdl_rbac_v5.has_team_staff_role(p_id,'manager') OR sdl_rbac_v5.has_team_staff_role(p_id,'coach'))
 THEN team:=p_id;SELECT organization_id INTO org FROM public.teams WHERE teams.id=team;
 ELSIF p_scope='player' AND (sdl_rbac_v5.platform_allowed('export') AND EXISTS(SELECT 1 FROM public.players candidate WHERE candidate.id=p_id)
 OR EXISTS(SELECT 1 FROM public.players candidate WHERE candidate.id=p_id AND sdl_rbac_v5.is_club_admin(candidate.organization_id))
 OR sdl_rbac_v5.has_player_role(p_id,'guardian') OR sdl_rbac_v5.player_role_gate(p_id,'enter_official_statistics')) THEN
 player:=p_id;SELECT organization_id INTO org FROM public.players WHERE players.id=player;
 ELSE RAISE EXCEPTION 'Export access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,team_id,player_id,reason)
 VALUES(auth.uid(),'export_authorized',org,team,player,'Official statistics page');
 RETURN QUERY SELECT a.id,p.id,a.recorded_at,proto.id,a.metric,a.value,proto.unit
 FROM public.sdl_official_statistics a JOIN public.players p ON p.id=a.player_id AND p.athlete_id=a.athlete_id AND p.organization_id=a.organization_id
 JOIN public.sdl_measurement_protocols proto ON proto.id=a.protocol_id AND proto.metric=a.metric
 WHERE (p_after IS NULL OR a.id>p_after) AND (org IS NULL OR p.organization_id=org) AND (player IS NULL OR p.id=player)
 AND (team IS NULL OR EXISTS(SELECT 1 FROM public.player_team_memberships pm WHERE pm.team_id=team AND pm.player_id=p.id
 AND pm.organization_id=org AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE))
 AND (p_scope IN ('platform','club') OR (p_scope='player' AND (sdl_rbac_v5.has_player_role(p.id,'guardian') OR sdl_rbac_v5.platform_allowed('export') OR sdl_rbac_v5.is_club_admin(p.organization_id)))
 OR EXISTS(SELECT 1 FROM public.sdl_club_enrollments e WHERE e.id=public.sdl_004_statistics_enrollment(p.id) AND e.id=a.enrollment_id AND e.generation=a.enrollment_generation))
 AND a.invalidated_at IS NULL AND a.source_hash=public.sdl_004_statistics_source_hash(a.session_id)
 ORDER BY a.id LIMIT p_limit;
END;
$$;
CREATE OR REPLACE FUNCTION sdl_rbac_v5.media_access(p_id uuid,p_action text)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT sdl_rbac_v5.active_actor() AND EXISTS(
 SELECT 1 FROM public.sdl_video_submissions s JOIN public.players p
 ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 LEFT JOIN public.sdl_club_enrollments e ON e.id=s.enrollment_id AND e.generation=s.enrollment_generation
 AND e.athlete_id=p.athlete_id AND e.organization_id=p.organization_id
 JOIN public.sdl_media_objects m ON m.id=s.id AND m.player_id=p.id
 WHERE s.id=p_id
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id,s.player_id,s.athlete_id,s.category,s.status,s.source_kind,s.created_at,s.review_note,s.history,
 s.status='pending' AND s.submitted_by<>(SELECT auth.uid()) AND public.sdl_004_submission_can_review(s.player_id),
 public.sdl_004_submission_can_publish(s.id),s.publication_team_ids FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 WHERE s.player_id=p_player_id AND public.sdl_004_session_active() AND (sdl_rbac_v5.has_player_role(s.player_id,'guardian') OR sdl_rbac_v5.player_role_gate(s.player_id,'review_video') OR sdl_rbac_v5.platform_allowed('view') OR sdl_rbac_v5.is_club_admin(s.organization_id)
 OR sdl_rbac_v5.historical_staff_view(s.player_id,'video',s.id)) AND sdl_rbac_v5.media_access(s.id,'playback') ORDER BY s.created_at DESC LIMIT 30;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_review_submission(p_id uuid,p_decision text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sdl_video_submissions%ROWTYPE;
BEGIN
 IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') OR p_note IS NULL OR char_length(p_note)>1000 THEN RAISE EXCEPTION 'Invalid review' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.sdl_video_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=s.player_id AND athlete_id=s.athlete_id AND organization_id=s.organization_id) OR NOT public.sdl_004_submission_can_review(s.player_id) OR s.submitted_by=(SELECT auth.uid()) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF NOT sdl_rbac_v5.media_access(s.id,'playback') THEN RAISE EXCEPTION 'Media unavailable' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sdl_club_enrollments en WHERE en.id=s.enrollment_id
 AND en.generation=s.enrollment_generation AND en.id=public.sdl_004_statistics_enrollment(s.player_id)
 AND en.recording_storage_authorized) THEN RAISE EXCEPTION 'Current recording authorization required' USING ERRCODE='42501'; END IF;
 IF s.status<>'pending' THEN RAISE EXCEPTION 'Already reviewed' USING ERRCODE='PT409'; END IF;
 UPDATE public.sdl_video_submissions SET status=p_decision,review_note=p_note,reviewed_at=now(),reviewed_by=(SELECT auth.uid()),
 history=history||jsonb_build_array(jsonb_build_object('action',p_decision,'actor',(SELECT auth.uid()),'at',now(),'note',p_note)) WHERE id=s.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sdl_004_pilot_performance(p_player uuid DEFAULT NULL,p_team uuid DEFAULT NULL,p_status text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_session_active() OR (p_player IS NOT NULL AND NOT (sdl_rbac_v5.can_view_player(p_player)
 OR EXISTS(SELECT 1 FROM public.players pp WHERE pp.id=p_player AND sdl_rbac_v5.is_club_admin(pp.organization_id))
 OR (p_team IS NULL AND NOT sdl_rbac_v5.csv_requested() AND EXISTS(SELECT 1 FROM public.sdl_performance_submissions history WHERE history.player_id=p_player
 AND sdl_rbac_v5.historical_staff_view(p_player,'performance',history.id))))) OR (p_player IS NULL AND p_team IS NULL) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN('all','pending','approved','rejected','correction_requested') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE='22023'; END IF;
 IF p_team IS NOT NULL AND NOT (sdl_rbac_v5.team_role_gate(p_team,'manage_roster') OR sdl_rbac_v5.has_team_staff_role(p_team,'coach')
 OR (sdl_rbac_v5.platform_allowed('view') AND EXISTS(SELECT 1 FROM public.teams WHERE id=p_team))) THEN
 RAISE EXCEPTION 'Team access denied' USING ERRCODE='42501'; END IF;
 IF sdl_rbac_v5.platform_allowed('view') THEN INSERT INTO sdl_rbac_v5.events(actor,action,team_id,player_id,reason)
 VALUES(auth.uid(),'platform_performance_read',p_team,p_player,'Private performance page'); END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'player_id',p.player_id,'preferred_name',player.preferred_name,'protocol_id',p.protocol_id,'metric',proto.metric,'unit',proto.unit,'protocol_label',proto.label,'distance_m',proto.distance_m,
 'value',p.value,'measurement_date',p.measurement_date,'status',p.status,'source_kind',p.source_kind,'revision',p.revision,'evidence',p.evidence,'evidence_video_id',p.evidence_video_id,
 'review_note',p.review_note,'recorded_by',p.submitted_by,'reviewed_by',p.reviewed_by,'created_at',p.created_at,'supersedes',p.supersedes,'superseded_by',p.superseded_by,
 'can_review',p.submitted_by<>(SELECT auth.uid()) AND p.status='pending' AND public.sdl_004_coach_for((SELECT auth.uid()),p.player_id),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('action',ev.action,'actor',ev.actor,'at',ev.occurred_at,'details',ev.details) ORDER BY ev.event_order)FROM public.sdl_pilot_events ev WHERE ev.target=p.id),'[]'))ORDER BY p.created_at DESC,p.id)
 FROM(SELECT s.* FROM public.sdl_performance_submissions s WHERE (p_player IS NULL OR s.player_id=p_player)
 AND ((sdl_rbac_v5.can_view_player(s.player_id) AND (sdl_rbac_v5.has_player_role(s.player_id,'guardian') OR sdl_rbac_v5.platform_allowed('view')
 OR EXISTS(SELECT 1 FROM public.sdl_club_enrollments en WHERE en.id=public.sdl_004_statistics_enrollment(s.player_id) AND en.id=s.enrollment_id AND en.generation=s.enrollment_generation)))
 OR sdl_rbac_v5.is_club_admin(s.organization_id)
 OR (p_team IS NULL AND sdl_rbac_v5.historical_staff_view(s.player_id,'performance',s.id)))
 AND (p_status='all' OR s.status=p_status) AND (p_team IS NULL OR EXISTS(SELECT 1 FROM public.player_team_memberships pm WHERE pm.team_id=p_team AND pm.player_id=s.player_id
 AND pm.organization_id=s.organization_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE))
 ORDER BY s.created_at DESC,s.id LIMIT 100)p JOIN public.players player ON player.id=p.player_id JOIN public.sdl_measurement_protocols proto ON proto.id=p.protocol_id),'[]');
END;
$$;
COMMIT;
