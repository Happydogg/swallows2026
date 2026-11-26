BEGIN;
CREATE FUNCTION public.sdl_v5_set_roster(p_player uuid,p_team uuid,p_add boolean,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.players; org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.teams WHERE id=p_team;
 PERFORM 1 FROM public.organizations WHERE id=org FOR UPDATE;
 SELECT * INTO p FROM public.players WHERE id=p_player AND organization_id=org FOR UPDATE;
 IF p.id IS NULL OR NOT sdl_rbac_v5.team_role_gate(p_team,'manage_roster') OR public.sdl_004_statistics_enrollment(p.id) IS NULL
 THEN RAISE EXCEPTION 'Roster access denied' USING ERRCODE='42501'; END IF;
 IF p_add THEN
   IF NOT sdl_rbac_v5.is_club_admin(org) AND EXISTS(SELECT 1 FROM public.player_team_memberships
     WHERE player_id=p.id AND team_id<>p_team AND end_date IS NULL AND status='active') THEN
     RAISE EXCEPTION 'Transfer approval required' USING ERRCODE='42501'; END IF;
   INSERT INTO public.player_team_memberships(player_id,organization_id,team_id,start_date,status)
   VALUES(p.id,org,p_team,CURRENT_DATE,'active');
 ELSIF p_add=false THEN
   UPDATE public.player_team_memberships SET status='inactive',end_date=CURRENT_DATE
   WHERE player_id=p.id AND organization_id=org AND team_id=p_team AND status='active' AND end_date IS NULL AND start_date<=CURRENT_DATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Roster changed' USING ERRCODE='PT409'; END IF;
 ELSE RAISE EXCEPTION 'Explicit decision required' USING ERRCODE='22023'; END IF;
 INSERT INTO sdl_rbac_v5.events(actor,organization_id,team_id,player_id,action,reason)
 VALUES(auth.uid(),org,p_team,p.id,CASE WHEN p_add THEN 'roster_added' ELSE 'roster_ended' END,p_reason);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Roster changed' USING ERRCODE='PT409';
END;
$$;
CREATE TABLE sdl_rbac_v5.transfers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid NOT NULL REFERENCES public.players(id),
 source_team uuid NOT NULL REFERENCES public.teams(id),source_membership uuid NOT NULL,
 destination_team uuid NOT NULL REFERENCES public.teams(id),enrollment uuid NOT NULL REFERENCES public.sdl_club_enrollments(id),
 generation uuid NOT NULL,requested_by uuid NOT NULL REFERENCES public.profiles(id),
 guardian uuid REFERENCES public.profiles(id),destination_approver uuid REFERENCES public.profiles(id),
 completed_at timestamptz,expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 CHECK(source_team<>destination_team));
ALTER TABLE sdl_rbac_v5.transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sdl_rbac_v5.transfers FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.sdl_v5_request_transfer(p_player uuid,p_from uuid,p_to uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE request_id uuid; org uuid; dest uuid; membership uuid; e public.sdl_club_enrollments;
BEGIN
 SELECT organization_id INTO org FROM public.teams WHERE id=p_from AND status='active';
 SELECT organization_id INTO dest FROM public.teams WHERE id=p_to AND status='active';
 SELECT pm.id INTO membership FROM public.player_team_memberships pm JOIN public.players p ON p.id=pm.player_id AND p.organization_id=pm.organization_id
 WHERE p.id=p_player AND pm.team_id=p_from AND pm.organization_id=org AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE FOR SHARE OF pm;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p_player) FOR SHARE;
 IF e.id IS NULL OR membership IS NULL OR p_from=p_to OR dest IS NULL OR NOT sdl_rbac_v5.team_role_gate(p_from,'manage_roster')
 OR (org<>dest AND NOT sdl_rbac_v5.is_club_admin(org)) THEN RAISE EXCEPTION 'Transfer denied' USING ERRCODE='42501'; END IF;
 INSERT INTO sdl_rbac_v5.transfers(player_id,source_team,source_membership,destination_team,enrollment,generation,requested_by)
 VALUES(p_player,p_from,membership,p_to,e.id,e.generation,auth.uid()) RETURNING id INTO request_id;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,team_id,player_id,target_id,reason)
 VALUES(auth.uid(),'transfer_requested',org,p_from,p_player,request_id,p_reason);
 RETURN request_id;
END;
$$;

-- Destination and guardian approve the same immutable request. A destination
-- jersey is supplied at completion because a separate club player record must
-- not reuse private history or collide with an existing number.
CREATE FUNCTION public.sdl_v5_approve_transfer(p_request uuid,p_as text,p_jersey text,p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r sdl_rbac_v5.transfers;src uuid;dst uuid;p public.players;new_player uuid;
BEGIN
 SELECT * INTO r FROM sdl_rbac_v5.transfers WHERE id=p_request FOR UPDATE;
 IF r.id IS NULL OR NOT sdl_rbac_v5.active_actor() THEN RAISE EXCEPTION 'Transfer denied' USING ERRCODE='42501'; END IF;
 SELECT organization_id INTO src FROM public.teams WHERE id=r.source_team AND status='active';
 SELECT organization_id INTO dst FROM public.teams WHERE id=r.destination_team AND status='active';
 PERFORM 1 FROM public.organizations WHERE id IN(src,dst) ORDER BY id FOR UPDATE;
 SELECT * INTO p FROM public.players WHERE id=r.player_id AND organization_id=src FOR UPDATE;
 IF src IS NULL OR dst IS NULL OR p.id IS NULL OR r.completed_at IS NOT NULL OR r.expires_at<=now()
 OR NOT EXISTS(SELECT 1 FROM public.sdl_club_enrollments e WHERE e.id=public.sdl_004_statistics_enrollment(p.id) AND e.id=r.enrollment AND e.generation=r.generation)
 OR NOT EXISTS(SELECT 1 FROM public.player_team_memberships pm WHERE pm.id=r.source_membership AND pm.status='active' AND pm.end_date IS NULL)
 THEN RAISE EXCEPTION 'Transfer changed' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.organization_memberships om JOIN public.profiles pr ON pr.id=om.user_id AND pr.status='active'
   JOIN public.organizations o ON o.id=om.organization_id AND o.status='active'
   WHERE om.user_id=r.requested_by AND om.organization_id=src AND om.status='active' AND
   (om.role='admin' OR (src=dst AND om.role='staff' AND EXISTS(SELECT 1 FROM public.team_memberships
   WHERE team_id=r.source_team AND user_id=r.requested_by AND role='manager' AND status='active'))))
 THEN RAISE EXCEPTION 'Source approval expired' USING ERRCODE='PT409'; END IF;
 IF p_as='guardian' AND src<>dst AND sdl_rbac_v5.has_player_role(p.id,'guardian') THEN
   UPDATE sdl_rbac_v5.transfers SET guardian=auth.uid() WHERE id=r.id;
 ELSIF p_as='destination' AND sdl_rbac_v5.team_role_gate(r.destination_team,'manage_roster')
 AND (src=dst OR sdl_rbac_v5.is_club_admin(dst)) THEN
   UPDATE sdl_rbac_v5.transfers SET destination_approver=auth.uid() WHERE id=r.id;
 ELSE RAISE EXCEPTION 'Transfer approval denied' USING ERRCODE='42501'; END IF;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,team_id,target_id,reason)
 VALUES(auth.uid(),'transfer_'||p_as||'_approved',CASE WHEN p_as='destination' THEN dst ELSE src END,
 CASE WHEN p_as='destination' THEN r.destination_team ELSE r.source_team END,r.id,p_reason);
 SELECT * INTO r FROM sdl_rbac_v5.transfers WHERE id=r.id;
 IF src=dst THEN
   new_player:=p.id;
   UPDATE public.player_team_memberships SET status='inactive',end_date=CURRENT_DATE WHERE id=r.source_membership;
 ELSE
   -- The destination administrator must perform final registration so another
   -- role cannot choose or change destination registration details.
   IF p_as<>'destination' OR r.guardian IS NULL THEN RETURN false; END IF;
   IF NOT public.sdl_004_guardian_athlete(r.guardian,p.athlete_id) THEN RAISE EXCEPTION 'Guardian approval expired' USING ERRCODE='PT409'; END IF;
   IF p_jersey IS NULL OR p_jersey !~ '^[0-9]{1,2}$' OR EXISTS(SELECT 1 FROM public.players WHERE organization_id=dst AND athlete_id=p.athlete_id)
   THEN RAISE EXCEPTION 'Destination registration requires review' USING ERRCODE='PT409'; END IF;
   INSERT INTO public.players(athlete_id,organization_id,preferred_name,jersey) VALUES(p.athlete_id,dst,p.preferred_name,p_jersey) RETURNING id INTO new_player;
   INSERT INTO public.sdl_club_enrollments(athlete_id,organization_id) VALUES(p.athlete_id,dst);
   UPDATE public.player_team_memberships SET status='inactive',end_date=greatest(start_date,CURRENT_DATE)
   WHERE player_id=p.id AND organization_id=src AND end_date IS NULL;
   UPDATE public.sdl_club_enrollments SET status='ended',ended_at=now() WHERE id=r.enrollment;
 END IF;
 INSERT INTO public.player_team_memberships(player_id,team_id,organization_id,start_date,status)
 VALUES(new_player,r.destination_team,dst,CURRENT_DATE,'active');
 UPDATE sdl_rbac_v5.transfers SET completed_at=now() WHERE id=r.id;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,team_id,player_id,target_id,reason)
 VALUES(auth.uid(),'transfer_completed',dst,r.destination_team,new_player,r.id,p_reason);
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.sdl_v5_set_roster(uuid,uuid,boolean,text),public.sdl_v5_request_transfer(uuid,uuid,uuid,text),
 public.sdl_v5_approve_transfer(uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_set_roster(uuid,uuid,boolean,text),public.sdl_v5_request_transfer(uuid,uuid,uuid,text),
 public.sdl_v5_approve_transfer(uuid,text,text,text) TO authenticated;
COMMIT;
