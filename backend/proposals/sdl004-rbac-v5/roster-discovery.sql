-- SDL-004-RBAC-07: scoped account context and current roster discovery.
-- No membership changes, new table grants, consent changes or media access.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

CREATE FUNCTION sdl_rbac_v5.discovery_team_roles()
RETURNS TABLE(organization_id uuid,team_id uuid,scope_role text)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT t.organization_id,t.id,r.role
 FROM public.teams t JOIN public.organizations o ON o.id=t.organization_id
 CROSS JOIN LATERAL (VALUES ('platform_admin'),('club_admin'),('manager'),('coach'),('guardian')) r(role)
 WHERE sdl_rbac_v5.active_actor() AND t.status='active' AND o.status='active'
 AND CASE r.role
 WHEN 'platform_admin' THEN sdl_rbac_v5.platform_allowed('view')
 WHEN 'club_admin' THEN sdl_rbac_v5.is_club_admin(t.organization_id)
 WHEN 'manager' THEN sdl_rbac_v5.has_team_staff_role(t.id,'manager')
 WHEN 'coach' THEN sdl_rbac_v5.has_team_staff_role(t.id,'coach')
 WHEN 'guardian' THEN sdl_rbac_v5.guardian_team_allowed(auth.uid(),o.id,t.id)
  AND EXISTS(SELECT 1 FROM public.team_memberships tm WHERE tm.team_id=t.id AND tm.user_id=auth.uid() AND tm.role='parent' AND tm.status='active')
  AND EXISTS(SELECT 1 FROM public.athlete_guardians g
   JOIN public.players p ON p.athlete_id=g.athlete_id AND p.organization_id=o.id
   JOIN public.player_team_memberships pm ON pm.player_id=p.id AND pm.organization_id=o.id AND pm.team_id=t.id
   JOIN public.sdl_club_enrollments e ON e.athlete_id=p.athlete_id AND e.organization_id=o.id
   WHERE g.user_id=auth.uid() AND g.status='verified' AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE
   AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now())
 ELSE false END;
$$;
CREATE FUNCTION sdl_rbac_v5.discovery_org_roles()
RETURNS TABLE(organization_id uuid,scope_role text)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT o.id,'club_admin'::text FROM public.organizations o WHERE sdl_rbac_v5.is_club_admin(o.id)
 UNION SELECT o.id,'platform_admin'::text FROM public.organizations o WHERE o.status='active' AND sdl_rbac_v5.platform_allowed('view')
 UNION SELECT x.organization_id,x.scope_role FROM sdl_rbac_v5.discovery_team_roles() x;
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.discovery_team_roles(),sdl_rbac_v5.discovery_org_roles() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.sdl_v5_account_context()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; pa boolean;
BEGIN
 IF NOT sdl_rbac_v5.active_actor() THEN RAISE EXCEPTION 'Active session required' USING ERRCODE='42501'; END IF;
 pa:=sdl_rbac_v5.platform_allowed('view');
 -- Explicit failure rather than silently truncating a large account's scope.
 IF (SELECT count(*) FROM (SELECT DISTINCT x.team_id FROM sdl_rbac_v5.discovery_team_roles() x)y)>500
 OR (SELECT count(*) FROM (SELECT DISTINCT x.organization_id FROM sdl_rbac_v5.discovery_org_roles() x)y)>500 THEN
  RAISE EXCEPTION 'Account scope exceeds discovery limit' USING ERRCODE='54000';
 END IF;
 SELECT jsonb_build_object(
  'version',1,'user_id',auth.uid(),
  'roles',coalesce((SELECT jsonb_agg(role ORDER BY role) FROM (
   SELECT DISTINCT x.scope_role AS role FROM sdl_rbac_v5.discovery_org_roles() x
   UNION SELECT 'guardian' WHERE EXISTS(SELECT 1 FROM public.athlete_guardians g WHERE g.user_id=auth.uid() AND g.status='verified')
   UNION SELECT 'platform_admin' WHERE pa
  ) roles),'[]'::jsonb),
  'direct_memberships',jsonb_build_object(
    'organizations',coalesce((SELECT jsonb_agg(jsonb_build_object('organization_id',m.organization_id,'role',m.role) ORDER BY m.organization_id,m.role)
     FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id WHERE m.user_id=auth.uid() AND m.status='active' AND o.status='active'),'[]'::jsonb),
    'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('team_id',m.team_id,'role',m.role) ORDER BY m.team_id,m.role)
     FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id JOIN public.organizations o ON o.id=t.organization_id WHERE m.user_id=auth.uid() AND m.status='active' AND t.status='active' AND o.status='active'),'[]'::jsonb),
    'guardian_links',(SELECT count(*) FROM public.athlete_guardians g WHERE g.user_id=auth.uid() AND g.status='verified')),
  'organizations',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.name,q.id) FROM (
    SELECT o.id,o.name,array_agg(x.scope_role ORDER BY x.scope_role) AS roles FROM sdl_rbac_v5.discovery_org_roles() x JOIN public.organizations o ON o.id=x.organization_id GROUP BY o.id,o.name
   )q),'[]'::jsonb),
  'teams',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.name,q.id) FROM (
    SELECT t.id,t.organization_id,t.name,array_agg(x.scope_role ORDER BY x.scope_role) AS roles FROM sdl_rbac_v5.discovery_team_roles() x JOIN public.teams t ON t.id=x.team_id GROUP BY t.id,t.organization_id,t.name
   )q),'[]'::jsonb),
  'platform',jsonb_build_object('view',pa,'export',sdl_rbac_v5.platform_allowed('export'),'sensitive_write',sdl_rbac_v5.platform_allowed('sensitive_write'))
 ) INTO result;
 IF pa THEN INSERT INTO sdl_rbac_v5.events(actor,action,reason) VALUES(auth.uid(),'account_context_view','Platform account scope discovery'); END IF;
 RETURN result;
END;
$$;

CREATE FUNCTION public.sdl_v5_authorized_roster(p_role text,p_organization uuid DEFAULT NULL,p_team uuid DEFAULT NULL,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT sdl_rbac_v5.active_actor() THEN RAISE EXCEPTION 'Active session required' USING ERRCODE='42501'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('platform_admin','club_admin','manager','coach','guardian') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'Invalid roster parameters' USING ERRCODE='22023'; END IF;
 IF p_role IN ('manager','coach') AND p_team IS NULL THEN RAISE EXCEPTION 'Team scope required' USING ERRCODE='22023'; END IF;
 IF p_role IN ('club_admin','platform_admin') AND p_organization IS NULL THEN RAISE EXCEPTION 'Organization scope required' USING ERRCODE='22023'; END IF;
 IF p_role='platform_admin' AND NOT sdl_rbac_v5.platform_allowed('view') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_role='guardian' AND NOT EXISTS(SELECT 1 FROM public.athlete_guardians g WHERE g.user_id=auth.uid() AND g.status='verified') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_organization IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sdl_rbac_v5.discovery_org_roles() x WHERE x.organization_id=p_organization AND x.scope_role=p_role) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_team IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sdl_rbac_v5.discovery_team_roles() x WHERE x.team_id=p_team AND x.scope_role=p_role AND (p_organization IS NULL OR x.organization_id=p_organization)) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 WITH scoped_teams AS MATERIALIZED (
  SELECT x.organization_id,x.team_id FROM sdl_rbac_v5.discovery_team_roles() x WHERE x.scope_role=p_role
 ), candidates AS (
  SELECT p.id,p.preferred_name,p.jersey,p.position,p.throws,p.bats,p.organization_id,
  ARRAY(SELECT DISTINCT pm.team_id FROM public.player_team_memberships pm JOIN scoped_teams st ON st.team_id=pm.team_id AND st.organization_id=pm.organization_id
   WHERE pm.player_id=p.id AND pm.organization_id=p.organization_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE
   AND (p_team IS NULL OR pm.team_id=p_team)
   AND (p_role<>'guardian' OR EXISTS(SELECT 1 FROM public.sdl_club_enrollments e WHERE e.athlete_id=p.athlete_id AND e.organization_id=p.organization_id AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now())) ORDER BY pm.team_id) AS team_ids
  FROM public.players p
  WHERE (p_after IS NULL OR p.id>p_after) AND (p_organization IS NULL OR p.organization_id=p_organization)
  AND CASE WHEN p_role='guardian' THEN sdl_rbac_v5.has_player_role(p.id,'guardian')
   ELSE EXISTS(SELECT 1 FROM public.sdl_club_enrollments e WHERE e.athlete_id=p.athlete_id AND e.organization_id=p.organization_id AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now())
   AND CASE WHEN p_role='platform_admin' THEN sdl_rbac_v5.platform_allowed('view') ELSE sdl_rbac_v5.has_player_role(p.id,p_role) END
  END
 ), page AS MATERIALIZED (
  SELECT * FROM candidates WHERE (p_team IS NULL OR p_team=ANY(team_ids)) ORDER BY id LIMIT p_limit+1
 ), visible AS MATERIALIZED (SELECT * FROM page ORDER BY id LIMIT p_limit)
 SELECT jsonb_build_object('version',1,'role',p_role,'rows',coalesce((SELECT jsonb_agg(
  jsonb_build_object('id',v.id,'preferred_name',v.preferred_name,'jersey',v.jersey,'position',v.position,'throws',v.throws,'bats',v.bats,
   'organization_id',v.organization_id,'team_ids',v.team_ids,'scope_actions',jsonb_build_object(
    'read_private_statistics',true,
    'enter_official_statistics',p_role IN ('club_admin','manager','coach'),
    'correct_official_statistics',p_role IN ('club_admin','manager','coach'),
    'review_parent_statistics',p_role='coach',
    'issue_guardian_invitation',p_role IN ('club_admin','manager')
   )) ORDER BY v.id) FROM visible v),'[]'::jsonb),
  'next_after',CASE WHEN (SELECT count(*) FROM page)>p_limit THEN (SELECT id FROM visible ORDER BY id DESC LIMIT 1) ELSE NULL END) INTO result;
 IF p_role='platform_admin' THEN INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,team_id,reason) VALUES(auth.uid(),'authorized_roster_view',p_organization,p_team,'Platform current roster discovery'); END IF;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.sdl_v5_account_context(),public.sdl_v5_authorized_roster(text,uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_account_context(),public.sdl_v5_authorized_roster(text,uuid,uuid,uuid,integer) TO authenticated;

-- Preserve the legacy roster signature and allowlist, but enforce current session and staff authority.
CREATE OR REPLACE FUNCTION public.sdl_004_coach_roster()
RETURNS TABLE(id uuid,team_id uuid,team_name text,jersey text,preferred_name text,name text,"position" text,throws text,bats text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id,t.id,t.name::text,p.jersey::text,
  coalesce(nullif(p.preferred_name,''),nullif(p.name,''),'Player')::text,
  coalesce(nullif(p.preferred_name,''),nullif(p.name,''),'Player')::text,
  p.position::text,p.throws::text,p.bats::text
 FROM public.player_team_memberships pm
 JOIN public.players p ON p.id=pm.player_id AND p.organization_id=pm.organization_id
 JOIN public.teams t ON t.id=pm.team_id AND t.organization_id=pm.organization_id
 WHERE sdl_rbac_v5.active_actor() AND sdl_rbac_v5.has_team_staff_role(t.id,'coach')
 AND sdl_rbac_v5.has_player_role(p.id,'coach')
 AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE;
$$;

DO $check$ DECLARE f regprocedure; BEGIN
 FOREACH f IN ARRAY ARRAY['public.sdl_v5_account_context()'::regprocedure,'public.sdl_v5_authorized_roster(text,uuid,uuid,uuid,integer)'::regprocedure] LOOP
 IF NOT has_function_privilege('authenticated',f,'EXECUTE') OR has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected discovery RPC grants'; END IF;
 END LOOP;
 IF has_function_privilege('authenticated','sdl_rbac_v5.discovery_team_roles()','EXECUTE') OR has_function_privilege('authenticated','sdl_rbac_v5.discovery_org_roles()','EXECUTE') THEN RAISE EXCEPTION 'Private discovery helper exposed'; END IF;
END $check$;
COMMIT;
