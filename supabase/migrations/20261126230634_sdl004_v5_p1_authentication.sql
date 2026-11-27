BEGIN;
CREATE FUNCTION sdl_rbac_v5.platform_grant_active()
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT sdl_rbac_v5.active_actor() AND EXISTS (
   SELECT 1 FROM sdl_rbac_v5.platform_admin_grants g
   WHERE g.user_id=auth.uid() AND g.granted_at<=now() AND g.revoked_at IS NULL);
$$;

CREATE FUNCTION sdl_rbac_v5.csv_requested()
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS (
     SELECT 1 FROM regexp_split_to_table(lower(coalesce(
       nullif(current_setting('request.headers',true),'')::jsonb->>'accept','')), ',') AS media_type
     WHERE btrim(split_part(media_type,';',1)) IN ('text/csv','application/csv','text/*')
   );
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.csv_requested() FROM PUBLIC,anon,authenticated,service_role;

-- Action callers opt in explicitly. Unlisted actions fail closed.
CREATE FUNCTION sdl_rbac_v5.platform_allowed(p_action text)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT sdl_rbac_v5.platform_grant_active() AND CASE
 WHEN p_action='playback' THEN coalesce(auth.jwt()->>'aal' IN ('aal1','aal2'),false)
 WHEN p_action='view' THEN coalesce(auth.jwt()->>'aal'='aal2' OR (
   auth.jwt()->>'aal'='aal1' AND NOT sdl_rbac_v5.csv_requested()),false)
 WHEN p_action IN ('download','export','sensitive_write') THEN coalesce(auth.jwt()->>'aal'='aal2',false)
 ELSE false END;
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.platform_grant_active(),sdl_rbac_v5.platform_allowed(text)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION sdl_rbac_v5.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT sdl_rbac_v5.platform_allowed('sensitive_write');
$$;

CREATE FUNCTION sdl_rbac_v5.can_view_player(p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT sdl_rbac_v5.player_role_gate(p_player,'read_private_statistics')
   OR (sdl_rbac_v5.platform_allowed('view') AND EXISTS(SELECT 1 FROM public.players WHERE id=p_player));
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.can_view_player(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION sdl_rbac_v5.session_exists()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
   SELECT 1 FROM auth.sessions s WHERE s.user_id=(SELECT auth.uid())
   AND s.id=CASE WHEN auth.jwt()->>'session_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     THEN (auth.jwt()->>'session_id')::uuid END
   AND (s.not_after IS NULL OR s.not_after>now()));
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.session_exists() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.sdl_004_session_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT sdl_rbac_v5.session_exists() AND EXISTS(
   SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active');
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_redeem_invitation(p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.sdl_guardian_invitations%ROWTYPE;e public.sdl_club_enrollments%ROWTYPE;uid uuid=(SELECT auth.uid());mail text; BEGIN
 IF NOT sdl_rbac_v5.session_exists() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 SELECT lower(email) INTO mail FROM auth.users WHERE id=uid AND email_confirmed_at IS NOT NULL;
 SELECT * INTO i FROM public.sdl_guardian_invitations WHERE token_hash=p_hash FOR UPDATE;
 IF i.id IS NULL THEN RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='22023'; END IF;
 IF i.issued_by=uid OR NOT i.v5_scoped OR NOT EXISTS(
 SELECT 1 FROM public.organization_memberships om JOIN public.profiles pr ON pr.id=om.user_id AND pr.status='active'
 WHERE om.organization_id=i.organization_id AND om.status='active' AND om.user_id=i.issued_by AND (
 (i.issued_team IS NULL AND om.role='admin') OR (om.role IN ('admin','staff') AND EXISTS (
 SELECT 1 FROM public.team_memberships tm JOIN public.teams t ON t.id=tm.team_id AND t.status='active'
 JOIN public.player_team_memberships pm ON pm.team_id=t.id AND pm.organization_id=t.organization_id
 WHERE tm.team_id=i.issued_team AND t.organization_id=i.organization_id AND tm.user_id=om.user_id
 AND tm.role='manager' AND tm.status='active' AND pm.player_id=i.player_id
 AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE)))) THEN
 RAISE EXCEPTION 'Invitation requires reissue' USING ERRCODE='PT410'; END IF;
 IF mail IS NULL OR mail<>i.target_email THEN RAISE EXCEPTION 'Sign in with the verified invited email' USING ERRCODE='42501'; END IF;
 IF i.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already redeemed' USING ERRCODE='PT409'; END IF;
 IF i.revoked_at IS NOT NULL OR i.expires_at<=now() THEN RAISE EXCEPTION 'Invitation expired or revoked' USING ERRCODE='PT410'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=i.enrollment_id FOR SHARE;
 IF e.status<>'active' OR e.ended_at IS NOT NULL OR e.generation<>i.enrollment_generation OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=i.organization_id AND status='active')
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=i.player_id AND athlete_id=i.athlete_id AND organization_id=i.organization_id) THEN RAISE EXCEPTION 'Invitation no longer available' USING ERRCODE='PT410'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND status<>'active') THEN RAISE EXCEPTION 'Account not active' USING ERRCODE='42501'; END IF;
 INSERT INTO public.profiles(id,status,created_at,updated_at)VALUES(uid,'active',now(),now()) ON CONFLICT(id)DO NOTHING;
 PERFORM 1 FROM public.profiles WHERE id=uid AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not active' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,0));
 IF EXISTS(SELECT 1 FROM public.athlete_guardians WHERE user_id=uid AND athlete_id=i.athlete_id) THEN
  IF NOT EXISTS(SELECT 1 FROM public.athlete_guardians WHERE user_id=uid AND athlete_id=i.athlete_id AND status='verified') THEN
    RAISE EXCEPTION 'Relationship requires review' USING ERRCODE='42501'; END IF;
 ELSE INSERT INTO public.athlete_guardians(athlete_id,user_id,status,relationship,created_at,updated_at)VALUES(i.athlete_id,uid,'verified','parent',now(),now()); END IF;
 INSERT INTO public.team_memberships(team_id,user_id,role,status,created_at,updated_at)
 SELECT DISTINCT t.id,uid,'parent','active',now(),now() FROM public.player_team_memberships pm JOIN public.teams t ON t.id=pm.team_id AND t.organization_id=pm.organization_id AND t.status='active'
 WHERE pm.player_id=i.player_id AND pm.organization_id=i.organization_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE
 AND (i.issued_team IS NULL OR i.issued_team=t.id) AND NOT EXISTS(SELECT 1 FROM public.team_memberships tm WHERE tm.team_id=t.id AND tm.user_id=uid AND tm.role='parent') ON CONFLICT DO NOTHING;
 UPDATE public.sdl_guardian_invitations SET redeemed_at=now(),redeemed_by=uid WHERE id=i.id;
 PERFORM public.sdl_004_pilot_audit(i.player_id,i.organization_id,'invitation_redeemed',i.id,'{}');RETURN jsonb_build_object('linked',true,'player_id',i.player_id);
END;
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
 (p_action IN ('playback','download') AND (sdl_rbac_v5.player_role_gate(p.id,'review_video') OR sdl_rbac_v5.has_player_role(p.id,'guardian') OR sdl_rbac_v5.platform_allowed(p_action))
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
 WHERE s.player_id=p_player_id AND public.sdl_004_session_active() AND (sdl_rbac_v5.has_player_role(s.player_id,'guardian') OR sdl_rbac_v5.player_role_gate(s.player_id,'review_video') OR sdl_rbac_v5.platform_allowed('view')) AND sdl_rbac_v5.media_access(s.id,'playback') ORDER BY s.created_at DESC LIMIT 30;
$$;
CREATE OR REPLACE FUNCTION public.sdl_v5_authorize_playback(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT sdl_rbac_v5.media_access(p_id,'playback') THEN RETURN false; END IF;
 IF sdl_rbac_v5.platform_allowed('playback') THEN
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 SELECT auth.uid(),'platform_playback_authorized',organization_id,player_id,id,'Private playback' FROM public.sdl_video_submissions WHERE id=p_id;
 END IF;
 RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_v5_private_statistics(p_player uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,session_date date,exit_velo numeric,throwing_velo numeric,sprint_time numeric,broad_jump numeric,
 control_exit_velo numeric,attack_angle numeric,height_cm numeric,weight_kg numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT sdl_rbac_v5.can_view_player(p_player) THEN RAISE EXCEPTION 'History access denied' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 INSERT INTO sdl_rbac_v5.events(actor,organization_id,player_id,action,reason)
 SELECT auth.uid(),p.organization_id,p.id,'private_history_read','Private session page' FROM public.players p WHERE p.id=p_player;
 RETURN QUERY SELECT s.id,s.session_date,s.exit_velo,s.throwing_velo,s.sprint_time,s.broad_jump,s.control_exit_velo,s.attack_angle,s.height_cm,s.weight_kg
 FROM public.sessions s WHERE s.player_id=p_player AND (p_after IS NULL OR s.id>p_after)
 AND NOT EXISTS(SELECT 1 FROM public.sdl_performance_submissions old WHERE old.session_id=s.id AND old.superseded_by IS NOT NULL)
 ORDER BY s.id LIMIT p_limit;
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_v5_audit_history(p_scope text,p_id uuid,p_before bigint DEFAULT NULL,p_limit integer DEFAULT 50)
RETURNS TABLE(id bigint,occurred_at timestamptz,action text,actor uuid,player_id uuid,target_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 IF NOT sdl_rbac_v5.active_actor() OR NOT COALESCE(CASE p_scope
 WHEN 'platform' THEN p_id IS NULL AND sdl_rbac_v5.platform_allowed('view')
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
 IF NOT public.sdl_004_session_active() OR (p_player IS NOT NULL AND NOT sdl_rbac_v5.can_view_player(p_player)) OR (p_player IS NULL AND p_team IS NULL) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
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
 AND sdl_rbac_v5.can_view_player(s.player_id)
 AND (sdl_rbac_v5.has_player_role(s.player_id,'guardian') OR sdl_rbac_v5.platform_allowed('view')
 OR EXISTS(SELECT 1 FROM public.sdl_club_enrollments en WHERE en.id=public.sdl_004_statistics_enrollment(s.player_id) AND en.id=s.enrollment_id AND en.generation=s.enrollment_generation))
 AND (p_status='all' OR s.status=p_status) AND (p_team IS NULL OR EXISTS(SELECT 1 FROM public.player_team_memberships pm WHERE pm.team_id=p_team AND pm.player_id=s.player_id
 AND pm.organization_id=s.organization_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE))
 ORDER BY s.created_at DESC,s.id LIMIT 100)p JOIN public.players player ON player.id=p.player_id JOIN public.sdl_measurement_protocols proto ON proto.id=p.protocol_id),'[]');
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_v5_family_contacts(p_player uuid,p_purpose text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.players; club boolean; is_guardian boolean; staff_access boolean;
BEGIN
 SELECT * INTO p FROM public.players WHERE id=p_player;
 club:=sdl_rbac_v5.has_player_role(p.id,'club_admin');
 is_guardian:=sdl_rbac_v5.has_player_role(p.id,'guardian');
 staff_access:=sdl_rbac_v5.platform_allowed('view') OR club OR EXISTS(
 SELECT 1 FROM public.player_team_memberships pm WHERE pm.player_id=p.id AND pm.organization_id=p.organization_id AND pm.status='active'
 AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE AND public.sdl_004_statistics_enrollment(p.id) IS NOT NULL
 AND ((p_purpose='family_contacts' AND sdl_rbac_v5.has_team_staff_role(pm.team_id,'manager'))
 OR ((sdl_rbac_v5.has_team_staff_role(pm.team_id,'manager') OR sdl_rbac_v5.has_team_staff_role(pm.team_id,'coach'))
 AND public.sdl_004_pilot_permission(p.organization_id,pm.team_id,p_purpose))));
 IF p.id IS NULL OR NOT (staff_access OR is_guardian) OR p_purpose IS NULL OR p_purpose NOT IN ('family_contacts','registration_contacts')
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,reason)
 VALUES(auth.uid(),p_purpose||'_read',p.organization_id,p.id,'Scoped private information');
 IF p_purpose='registration_contacts' THEN RETURN jsonb_build_object('given_names',p.given_names,'last_name',p.last_name,'dob',p.dob,'registration_number',p.hkll_reg_no); END IF;
 RETURN jsonb_build_object('legacy_phone',p.parent_phone,'contacts',coalesce((SELECT jsonb_agg(c.phone ORDER BY c.guardian)
 FROM sdl_rbac_v5.guardian_contacts c WHERE c.athlete_id=p.athlete_id AND public.sdl_004_guardian_athlete(c.guardian,p.athlete_id)
 AND (staff_access OR c.guardian=auth.uid())),'[]'::jsonb));
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_contacts(p_team uuid,p_purpose text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;result jsonb; BEGIN
 SELECT organization_id INTO org FROM public.teams WHERE id=p_team AND status='active';
 IF p_purpose IS NULL OR p_purpose NOT IN('family_contacts','registration_contacts') OR NOT (sdl_rbac_v5.is_club_admin(org) OR sdl_rbac_v5.platform_allowed('view')
 OR (sdl_rbac_v5.has_team_staff_role(p_team,'manager') AND p_purpose='family_contacts')
 OR ((sdl_rbac_v5.has_team_staff_role(p_team,'manager') OR sdl_rbac_v5.has_team_staff_role(p_team,'coach'))
 AND public.sdl_004_pilot_permission(org,p_team,p_purpose))) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(x),'[]') INTO result FROM(
 SELECT DISTINCT p.id AS player_id,p.preferred_name,CASE WHEN p_purpose='family_contacts' THEN p.parent_phone END AS parent_phone,
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
CREATE OR REPLACE FUNCTION public.sdl_004_clubhouse_member(p_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.teams t JOIN public.organizations o ON o.id=t.organization_id
 WHERE t.id=p_team_id AND t.status='active' AND o.status='active' AND (sdl_rbac_v5.platform_allowed('view')
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
 AND (p_scope='platform' OR (p_scope='player' AND (sdl_rbac_v5.has_player_role(p.id,'guardian') OR sdl_rbac_v5.platform_allowed('export')))
 OR EXISTS(SELECT 1 FROM public.sdl_club_enrollments e WHERE e.id=public.sdl_004_statistics_enrollment(p.id) AND e.id=a.enrollment_id AND e.generation=a.enrollment_generation))
 AND a.invalidated_at IS NULL AND a.source_hash=public.sdl_004_statistics_source_hash(a.session_id)
 ORDER BY a.id LIMIT p_limit;
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_v5_export_private_history(p_player uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,session_date date,exit_velo numeric,throwing_velo numeric,sprint_time numeric,broad_jump numeric,
 control_exit_velo numeric,attack_angle numeric,height_cm numeric,weight_kg numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT (sdl_rbac_v5.platform_allowed('export') OR sdl_rbac_v5.has_player_role(p_player,'guardian')
 OR sdl_rbac_v5.player_role_gate(p_player,'enter_official_statistics')) THEN
   RAISE EXCEPTION 'Export access denied' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT * FROM public.sdl_v5_private_statistics(p_player,p_after,p_limit);
 INSERT INTO sdl_rbac_v5.events(actor,organization_id,player_id,action,reason)
 SELECT auth.uid(),p.organization_id,p.id,'export_authorized','Private session page' FROM public.players p WHERE p.id=p_player;
END;
$$;
-- Restrictive policies intersect existing allow rules and add no read or write grants.
DO $policies$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['profiles','players','sessions','athletes','athlete_guardians',
 'organizations','teams','organization_memberships','team_memberships','player_team_memberships','sdl_media_objects']
 LOOP
   EXECUTE format('CREATE POLICY sdl_p1_active_account ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated
     USING ((SELECT public.sdl_004_session_active())) WITH CHECK ((SELECT public.sdl_004_session_active()))',relation);
 END LOOP;
END;
$policies$;

COMMIT;
