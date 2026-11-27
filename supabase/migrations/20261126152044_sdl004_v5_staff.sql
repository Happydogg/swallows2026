BEGIN;
-- Scope is an organization for club_admin, a team for manager/coach.
-- First grant and removal are distinct transitions. An existing revoked row
-- cannot be renewed by replaying an earlier assignment.
CREATE FUNCTION public.sdl_v5_set_staff(p_scope uuid,p_target uuid,p_role text,p_grant boolean,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor uuid := auth.uid();
 org uuid;
 team uuid;
BEGIN
 IF actor IS NULL OR actor=p_target OR p_scope IS NULL OR p_target IS NULL OR p_grant IS NULL
 OR p_role IS NULL OR p_role NOT IN ('club_admin','manager','coach')
 OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
   RAISE EXCEPTION 'Invalid delegation' USING ERRCODE='22023';
 END IF;
 IF p_role='club_admin' THEN org:=p_scope;
 ELSE
   team:=p_scope;
   SELECT organization_id INTO org FROM public.teams WHERE id=team AND status='active';
 END IF;
 -- Serialize v5 role changes within an organization, then recheck actor scope.
 PERFORM 1 FROM public.organizations WHERE id=org AND status='active' FOR UPDATE;
 IF NOT FOUND OR (p_role='club_admin' AND NOT sdl_rbac_v5.is_platform_admin())
 OR (team IS NOT NULL AND NOT sdl_rbac_v5.team_role_gate(team,'assign_'||p_role)) THEN
   RAISE EXCEPTION 'Delegation denied' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.profiles WHERE id=p_target AND (NOT p_grant OR status='active') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ineligible target' USING ERRCODE='42501'; END IF;
 IF p_grant AND NOT EXISTS (SELECT 1 FROM public.organization_memberships
   WHERE organization_id=org AND user_id=p_target AND status='active') AND EXISTS (
   SELECT 1 FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id
   WHERE t.organization_id=org AND m.user_id=p_target AND m.role IN ('manager','coach') AND m.status='active') THEN
   RAISE EXCEPTION 'Dormant staff assignment requires review' USING ERRCODE='PT409';
 END IF;
 IF p_role='club_admin' THEN
   IF p_grant THEN
     INSERT INTO public.organization_memberships(organization_id,user_id,role,status)
     VALUES(org,p_target,'admin','active');
   ELSE
     UPDATE public.organization_memberships SET status='revoked',updated_at=now()
     WHERE organization_id=org AND user_id=p_target AND role='admin' AND status='active';
   END IF;
 ELSE
   IF p_grant THEN
     IF NOT EXISTS(SELECT 1 FROM public.organization_memberships
         WHERE organization_id=org AND user_id=p_target AND role IN ('staff','admin') AND status='active') THEN
       -- Never activate dormant assignments in sibling teams or reinstate a restricted account.
       IF EXISTS(SELECT 1 FROM public.organization_memberships WHERE organization_id=org AND user_id=p_target)
       OR EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id
         WHERE t.organization_id=org AND m.user_id=p_target AND m.role IN ('manager','coach') AND m.status='active') THEN
         RAISE EXCEPTION 'Conflicting membership requires review' USING ERRCODE='PT409';
       END IF;
       INSERT INTO public.organization_memberships(organization_id,user_id,role,status)
       VALUES(org,p_target,'staff','active');
       INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,target_id,reason)
       VALUES(actor,'staff_prerequisite_created',org,p_target,p_reason);
     END IF;
     INSERT INTO public.team_memberships(team_id,user_id,role,status)
     VALUES(team,p_target,p_role,'active');
   ELSE
     UPDATE public.team_memberships SET status='revoked',updated_at=now()
     WHERE team_id=team AND user_id=p_target AND role=p_role AND status='active';
   END IF;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Role already changed' USING ERRCODE='PT409'; END IF;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,team_id,target_id,reason)
 VALUES(actor,p_role||CASE WHEN p_grant THEN '_assigned' ELSE '_removed' END,org,team,p_target,p_reason);
 IF NOT p_grant AND team IS NOT NULL AND EXISTS(
   SELECT 1 FROM sdl_rbac_v5.events WHERE organization_id=org AND target_id=p_target AND action='staff_prerequisite_created')
 AND NOT EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.teams t ON t.id=m.team_id
   WHERE t.organization_id=org AND m.user_id=p_target AND m.role IN ('manager','coach') AND m.status='active') THEN
   UPDATE public.organization_memberships SET status='revoked',updated_at=now()
   WHERE organization_id=org AND user_id=p_target AND role='staff' AND status='active';
 END IF;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Existing assignment requires review' USING ERRCODE='PT409';
END;
$$;
REVOKE ALL ON FUNCTION public.sdl_v5_set_staff(uuid,uuid,text,boolean,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_set_staff(uuid,uuid,text,boolean,text) TO authenticated;

CREATE FUNCTION public.sdl_v5_register_player(p_team uuid,p_name text,p_jersey text,p_request uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; athlete uuid; player uuid; prior sdl_rbac_v5.events;
BEGIN
 IF NOT sdl_rbac_v5.team_role_gate(p_team,'manage_roster') THEN RAISE EXCEPTION 'Roster access denied' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
 OR p_jersey IS NULL OR btrim(p_jersey) !~ '^[0-9]{1,2}$' THEN RAISE EXCEPTION 'Invalid registration'; END IF;
 SELECT organization_id INTO org FROM public.teams WHERE id=p_team;
 PERFORM 1 FROM public.organizations WHERE id=org FOR UPDATE;
 IF NOT sdl_rbac_v5.team_role_gate(p_team,'manage_roster') THEN RAISE EXCEPTION 'Roster access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request::text,0));
 SELECT * INTO prior FROM sdl_rbac_v5.events WHERE actor=auth.uid() AND action='player_registered' AND target_id=p_request;
 IF FOUND THEN
   IF prior.team_id IS DISTINCT FROM p_team OR NOT EXISTS(SELECT 1 FROM public.players
      WHERE id=prior.player_id AND preferred_name=btrim(p_name) AND jersey=btrim(p_jersey))
   THEN RAISE EXCEPTION 'Registration conflict' USING ERRCODE='PT409'; END IF;
   RETURN prior.player_id;
 END IF;
 INSERT INTO public.athletes DEFAULT VALUES RETURNING id INTO athlete;
 INSERT INTO public.players(athlete_id,organization_id,preferred_name,jersey)
 VALUES(athlete,org,btrim(p_name),btrim(p_jersey)) RETURNING id INTO player;
 INSERT INTO public.player_team_memberships(player_id,team_id,organization_id,start_date,status)
 VALUES(player,p_team,org,CURRENT_DATE,'active');
 INSERT INTO public.sdl_club_enrollments(athlete_id,organization_id) VALUES(athlete,org);
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,team_id,player_id,target_id,reason)
 VALUES(auth.uid(),'player_registered',org,p_team,player,p_request,p_reason);
 RETURN player;
END;
$$;
REVOKE ALL ON FUNCTION public.sdl_v5_register_player(uuid,text,text,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_register_player(uuid,text,text,uuid,text) TO authenticated;
COMMIT;
