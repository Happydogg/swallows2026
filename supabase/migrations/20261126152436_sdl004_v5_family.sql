BEGIN;
ALTER TABLE public.sdl_guardian_invitations ADD COLUMN issued_team uuid REFERENCES public.teams(id),
 ADD COLUMN v5_scoped boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sdl_004_pilot_can_invite(p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT sdl_rbac_v5.player_role_gate(p_player,'issue_guardian_invitation');
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_issue_invitation(p_player uuid,p_email text,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.players%ROWTYPE;e public.sdl_club_enrollments%ROWTYPE;i public.sdl_guardian_invitations%ROWTYPE; BEGIN
 IF NOT public.sdl_004_pilot_can_invite(p_player) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_email IS NULL OR char_length(btrim(p_email))>254 OR btrim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_hash IS NULL OR p_hash!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid invitation' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player FOR SHARE;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p.id) FOR SHARE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Active enrollment required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND lower(email)=lower(btrim(p_email))) THEN
   RAISE EXCEPTION 'Independent invitation required' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.sdl_guardian_invitations(player_id,athlete_id,organization_id,enrollment_id,enrollment_generation,target_email,token_hash,issued_by,expires_at,issued_team,v5_scoped)
 VALUES(p.id,p.athlete_id,p.organization_id,e.id,e.generation,lower(btrim(p_email)),p_hash,(SELECT auth.uid()),now()+interval '72 hours',
 CASE WHEN NOT sdl_rbac_v5.is_club_admin(p.organization_id) THEN (
 SELECT pm.team_id FROM public.player_team_memberships pm WHERE pm.player_id=p.id AND pm.organization_id=p.organization_id
 AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE
 AND sdl_rbac_v5.has_team_staff_role(pm.team_id,'manager') ORDER BY pm.team_id LIMIT 1) END,true) RETURNING * INTO i;
 PERFORM public.sdl_004_pilot_audit(p.id,p.organization_id,'invitation_issued',i.id,jsonb_build_object('expires_at',i.expires_at));
 RETURN jsonb_build_object('id',i.id,'expires_at',i.expires_at);
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_redeem_invitation(p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.sdl_guardian_invitations%ROWTYPE;e public.sdl_club_enrollments%ROWTYPE;uid uuid=(SELECT auth.uid());mail text; BEGIN
 IF NOT public.sdl_004_session_active() THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
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
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_contacts(p_team uuid,p_purpose text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;result jsonb; BEGIN
 SELECT organization_id INTO org FROM public.teams WHERE id=p_team AND status='active';
 IF p_purpose IS NULL OR p_purpose NOT IN('family_contacts','registration_contacts') OR NOT (sdl_rbac_v5.is_club_admin(org) OR sdl_rbac_v5.is_platform_admin()
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

COMMIT;
