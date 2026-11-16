-- Inspected staging function definition; fixture only, not an applied migration.
CREATE OR REPLACE FUNCTION public.sdl_004_media_can_access(p_player_id uuid, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND p_player_id IS NOT NULL
    AND p_action IN ('read', 'upload')
    AND (
      EXISTS (
        SELECT 1 FROM public.players p
        JOIN public.player_team_memberships ptm
          ON ptm.player_id = p.id AND ptm.organization_id = p.organization_id
        JOIN public.teams t
          ON t.id = ptm.team_id AND t.organization_id = p.organization_id
        JOIN public.team_memberships tm
          ON tm.team_id = t.id AND tm.user_id = (SELECT auth.uid())
        JOIN public.organization_memberships om
          ON om.organization_id = t.organization_id AND om.user_id = tm.user_id
        WHERE p.id = p_player_id
          AND ptm.status = 'active' AND ptm.end_date IS NULL
          AND tm.status = 'active' AND tm.role = 'coach'
          AND om.status = 'active' AND om.role IN ('staff', 'admin')
      )
      OR (
        p_action = 'read' AND EXISTS (
          SELECT 1 FROM public.players p
          JOIN public.athlete_guardians ag ON ag.athlete_id = p.athlete_id
          WHERE p.id = p_player_id
            AND ag.user_id = (SELECT auth.uid())
            AND ag.status = 'verified'
        )
      )
    );
$function$
