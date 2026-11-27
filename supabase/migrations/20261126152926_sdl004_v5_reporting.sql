BEGIN;
CREATE FUNCTION public.sdl_v5_export_statistics(p_scope text,p_id uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS TABLE(id uuid,player_id uuid,recorded_at date,protocol_id text,metric text,value numeric,unit text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; team uuid; player uuid;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 IF p_scope='platform' AND p_id IS NULL AND sdl_rbac_v5.is_platform_admin() THEN NULL;
 ELSIF p_scope='club' AND sdl_rbac_v5.is_club_admin(p_id) THEN org:=p_id;
 ELSIF p_scope='team' AND (sdl_rbac_v5.has_team_staff_role(p_id,'manager') OR sdl_rbac_v5.has_team_staff_role(p_id,'coach'))
 THEN team:=p_id;SELECT organization_id INTO org FROM public.teams WHERE teams.id=team;
 ELSIF p_scope='player' AND sdl_rbac_v5.player_role_gate(p_id,'read_private_statistics') THEN
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
 AND (p_scope='platform' OR (p_scope='player' AND (sdl_rbac_v5.has_player_role(p.id,'guardian') OR sdl_rbac_v5.is_platform_admin()))
 OR EXISTS(SELECT 1 FROM public.sdl_club_enrollments e WHERE e.id=public.sdl_004_statistics_enrollment(p.id) AND e.id=a.enrollment_id AND e.generation=a.enrollment_generation))
 AND a.invalidated_at IS NULL AND a.source_hash=public.sdl_004_statistics_source_hash(a.session_id)
 ORDER BY a.id LIMIT p_limit;
END;
$$;

CREATE FUNCTION public.sdl_v5_audit_history(p_scope text,p_id uuid,p_before bigint DEFAULT NULL,p_limit integer DEFAULT 50)
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
 WHEN 'platform' THEN true WHEN 'club' THEN e.organization_id=p_id WHEN 'team' THEN e.team_id=p_id
 WHEN 'own' THEN e.actor=auth.uid() AND (sdl_rbac_v5.has_team_staff_role(e.team_id,'coach') OR sdl_rbac_v5.has_player_role(e.player_id,'coach'))
 WHEN 'downloads' THEN e.action='download_authorized' AND e.player_id=p_id ELSE false END
 ORDER BY e.id DESC LIMIT p_limit;
 IF p_scope='platform' THEN
 INSERT INTO sdl_rbac_v5.events(actor,action,reason) VALUES(auth.uid(),'audit_access','Platform history page');
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.sdl_v5_export_statistics(text,uuid,uuid,integer),public.sdl_v5_audit_history(text,uuid,bigint,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_export_statistics(text,uuid,uuid,integer),public.sdl_v5_audit_history(text,uuid,bigint,integer) TO authenticated;
COMMIT;
