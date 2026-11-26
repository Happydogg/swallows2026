-- SDL-004B-RBAC-01: v5 authorization foundation, review candidate only.
-- Do not apply to a hosted database. Move into a CLI-generated migration after local QA.
-- No existing RPCs or RLS policies are changed. No admin is provisioned.
-- This private schema is not an API; role eligibility is not a complete resource authorization.
BEGIN;
CREATE SCHEMA sdl_rbac_v5;
REVOKE ALL ON SCHEMA sdl_rbac_v5 FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA sdl_rbac_v5 REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE sdl_rbac_v5.platform_admin_grants (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  revoked_at timestamptz,
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);
ALTER TABLE sdl_rbac_v5.platform_admin_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE sdl_rbac_v5.platform_admin_grants FROM PUBLIC, anon, authenticated, service_role;
-- Provisioning/revocation and immutable audit are a separate restricted workflow.
-- Do not grant API roles access to this table.

CREATE FUNCTION sdl_rbac_v5.active_actor() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $$
 SELECT coalesce(public.sdl_004_session_active(),false)
 AND EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id=(SELECT auth.uid()) AND p.status='active');
$$;

CREATE FUNCTION sdl_rbac_v5.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $$
 SELECT sdl_rbac_v5.active_actor()
 AND coalesce(auth.jwt()->>'aal'='aal2',false)
 AND EXISTS (SELECT 1 FROM sdl_rbac_v5.platform_admin_grants g
             WHERE g.user_id=(SELECT auth.uid())
               AND g.revoked_at IS NULL AND g.granted_at<=now());
$$;

CREATE FUNCTION sdl_rbac_v5.is_club_admin(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $$
 SELECT sdl_rbac_v5.active_actor() AND EXISTS (
 SELECT 1 FROM public.organization_memberships m
 JOIN public.organizations o ON o.id=m.organization_id
 WHERE m.user_id=(SELECT auth.uid()) AND m.organization_id=p_org
 AND m.role='admin' AND m.status='active' AND o.status='active');
$$;

CREATE FUNCTION sdl_rbac_v5.has_team_staff_role(p_team uuid,p_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $$
 SELECT sdl_rbac_v5.active_actor() AND EXISTS (
 SELECT 1 FROM public.teams t
 JOIN public.organizations o ON o.id=t.organization_id
 JOIN public.team_memberships tm ON tm.team_id=t.id
 JOIN public.organization_memberships om ON om.organization_id=t.organization_id
 AND om.user_id=tm.user_id
 WHERE t.id=p_team AND t.status='active' AND o.status='active'
 AND tm.user_id=(SELECT auth.uid()) AND tm.status='active'
 AND p_role IN ('manager','coach') AND tm.role=p_role
 AND om.status='active' AND om.role IN ('staff','admin'));
$$;

CREATE FUNCTION sdl_rbac_v5.has_player_role(p_player uuid,p_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $$
 SELECT sdl_rbac_v5.active_actor() AND EXISTS (
 SELECT 1 FROM public.players p WHERE p.id=p_player AND (
   (p_role='platform_admin' AND sdl_rbac_v5.is_platform_admin())
   OR (p_role='guardian' AND EXISTS (
     SELECT 1 FROM public.athlete_guardians ag
     WHERE ag.athlete_id=p.athlete_id AND ag.user_id=(SELECT auth.uid())
       AND ag.status='verified'))
   OR (p_role IN ('club_admin','manager','coach')
     AND EXISTS (SELECT 1 FROM public.sdl_club_enrollments e
       JOIN public.organizations o ON o.id=e.organization_id
       WHERE e.athlete_id=p.athlete_id AND e.organization_id=p.organization_id
         AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()
         AND o.status='active')
     AND (
       (p_role='club_admin' AND sdl_rbac_v5.is_club_admin(p.organization_id))
       OR (p_role IN ('manager','coach') AND EXISTS (
         SELECT 1 FROM public.player_team_memberships pm
         JOIN public.teams t ON t.id=pm.team_id AND t.organization_id=pm.organization_id
         WHERE pm.player_id=p.id AND pm.organization_id=p.organization_id
           AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE
           AND sdl_rbac_v5.has_team_staff_role(t.id,p_role)
       ))
     )
   )
 ));
$$;

-- Role gate only. Must be combined with measurement validation, audit, locks,
-- enrollment generation and consent/media constraints at each operation.
CREATE FUNCTION sdl_rbac_v5.player_role_gate(p_player uuid,p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $$
 SELECT CASE p_action
 WHEN 'read_private_statistics' THEN
   sdl_rbac_v5.has_player_role(p_player,'platform_admin')
   OR sdl_rbac_v5.has_player_role(p_player,'club_admin')
   OR sdl_rbac_v5.has_player_role(p_player,'manager')
   OR sdl_rbac_v5.has_player_role(p_player,'coach')
   OR sdl_rbac_v5.has_player_role(p_player,'guardian')
 WHEN 'enter_official_statistics' THEN
   sdl_rbac_v5.has_player_role(p_player,'club_admin')
   OR sdl_rbac_v5.has_player_role(p_player,'manager')
   OR sdl_rbac_v5.has_player_role(p_player,'coach')
 WHEN 'correct_official_statistics' THEN
   sdl_rbac_v5.has_player_role(p_player,'club_admin')
   OR sdl_rbac_v5.has_player_role(p_player,'manager')
   OR sdl_rbac_v5.has_player_role(p_player,'coach')
 WHEN 'review_parent_statistics' THEN
   sdl_rbac_v5.has_player_role(p_player,'coach')
 WHEN 'issue_guardian_invitation' THEN
   sdl_rbac_v5.has_player_role(p_player,'club_admin')
   OR sdl_rbac_v5.has_player_role(p_player,'manager')
 WHEN 'review_video' THEN
   sdl_rbac_v5.has_player_role(p_player,'club_admin')
   OR sdl_rbac_v5.has_player_role(p_player,'manager')
   OR sdl_rbac_v5.has_player_role(p_player,'coach')
 ELSE false END;
$$;

CREATE FUNCTION sdl_rbac_v5.team_role_gate(p_team uuid,p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $$
 SELECT EXISTS (SELECT 1 FROM public.teams t
 WHERE t.id=p_team AND t.status='active' AND CASE p_action
 WHEN 'assign_manager' THEN sdl_rbac_v5.is_club_admin(t.organization_id)
 WHEN 'assign_coach' THEN sdl_rbac_v5.is_club_admin(t.organization_id)
                         OR sdl_rbac_v5.has_team_staff_role(t.id,'manager')
 WHEN 'manage_roster' THEN sdl_rbac_v5.is_club_admin(t.organization_id)
                         OR sdl_rbac_v5.has_team_staff_role(t.id,'manager')
 ELSE false END);
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sdl_rbac_v5 FROM PUBLIC, anon, authenticated, service_role;
-- No new callable RPCs or direct access grants, no bootstrap rows.
COMMIT;
