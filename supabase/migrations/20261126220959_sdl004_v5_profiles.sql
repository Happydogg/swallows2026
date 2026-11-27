BEGIN;
ALTER TABLE sdl_rbac_v5.verified_cases DROP CONSTRAINT verified_cases_action_check,
 ADD CHECK(action IN ('guardian_unlink','team_support','private_correction'));
CREATE TABLE sdl_rbac_v5.profile_revisions(
 event_id bigint PRIMARY KEY REFERENCES sdl_rbac_v5.events(id),
 previous_values jsonb NOT NULL,new_values jsonb NOT NULL);
CREATE TABLE sdl_rbac_v5.guardian_contacts(
 athlete_id uuid NOT NULL,guardian uuid NOT NULL REFERENCES public.profiles(id),
 phone text NOT NULL,PRIMARY KEY(athlete_id,guardian));
ALTER TABLE sdl_rbac_v5.profile_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdl_rbac_v5.guardian_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sdl_rbac_v5.profile_revisions,sdl_rbac_v5.guardian_contacts FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE OR TRUNCATE ON sdl_rbac_v5.profile_revisions
 FOR EACH STATEMENT EXECUTE FUNCTION sdl_rbac_v5.keep_event();

CREATE FUNCTION public.sdl_v5_edit_profile(p_player uuid,p_fields jsonb,p_expected jsonb,p_reason text,p_case uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.players;old_fields jsonb;k text;v text;registration boolean;eid bigint;
BEGIN
 SELECT * INTO p FROM public.players WHERE id=p_player FOR UPDATE;
 IF p.id IS NULL OR NOT sdl_rbac_v5.active_actor() THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_fields) IS DISTINCT FROM 'object' OR p_fields='{}' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object'
 OR pg_column_size(p_fields)>2048 OR pg_column_size(p_expected)>2048 THEN RAISE EXCEPTION 'Invalid update' USING ERRCODE='22023'; END IF;
 registration:=p_fields ?| ARRAY['given_names','last_name','dob','hkll_reg_no'];
 IF p_case IS NOT NULL THEN
   IF NOT sdl_rbac_v5.is_platform_admin() THEN RAISE EXCEPTION 'Case denied' USING ERRCODE='42501'; END IF;
   UPDATE sdl_rbac_v5.verified_cases SET used_at=now() WHERE id=p_case AND action='private_correction' AND target_id=p.id
   AND scope_id=p.organization_id AND used_at IS NULL AND expires_at>now();
   IF NOT FOUND THEN RAISE EXCEPTION 'Verified case required' USING ERRCODE='42501'; END IF;
 ELSIF registration THEN
   IF NOT (sdl_rbac_v5.has_player_role(p.id,'club_admin') OR EXISTS(SELECT 1 FROM public.player_team_memberships pm
   WHERE pm.player_id=p.id AND pm.organization_id=p.organization_id AND pm.status='active' AND pm.start_date<=CURRENT_DATE AND pm.end_date IS NULL
   AND public.sdl_004_statistics_enrollment(p.id) IS NOT NULL AND sdl_rbac_v5.has_team_staff_role(pm.team_id,'manager')
   AND public.sdl_004_pilot_permission(p.organization_id,pm.team_id,'registration_contacts'))) THEN
   RAISE EXCEPTION 'Registration authority required' USING ERRCODE='42501'; END IF;
 ELSIF NOT public.sdl_004_pilot_can_measure(p.id) THEN RAISE EXCEPTION 'Baseball profile access denied' USING ERRCODE='42501'; END IF;
 old_fields:='{}';
 FOR k IN SELECT jsonb_object_keys(p_fields) LOOP
  v:=p_fields->>k;
  IF NOT (k=ANY(CASE WHEN registration THEN ARRAY['given_names','last_name','dob','hkll_reg_no']
       ELSE ARRAY['preferred_name','jersey','position','throws','bats'] END))
  OR jsonb_typeof(p_fields->k)<>'string' OR length(btrim(v)) NOT BETWEEN 1 AND 120 OR v ~ '[[:cntrl:]]'
  OR (k='jersey' AND v !~ '^[0-9]{1,2}$') OR (k IN ('throws','bats') AND v NOT IN ('L','R','S','B'))
  OR (k='dob' AND (v !~ '^\d{4}-\d{2}-\d{2}$' OR v::date>CURRENT_DATE OR v::date<'1900-01-01')) THEN
    RAISE EXCEPTION 'Invalid profile field' USING ERRCODE='22023'; END IF;
  old_fields:=old_fields||jsonb_build_object(k,to_jsonb(p)->k);
 END LOOP;
 IF old_fields<>p_expected THEN RAISE EXCEPTION 'Profile changed' USING ERRCODE='PT409'; END IF;
 UPDATE public.players SET preferred_name=coalesce(p_fields->>'preferred_name',preferred_name),jersey=coalesce(p_fields->>'jersey',jersey),
 position=coalesce(p_fields->>'position',position),throws=coalesce(p_fields->>'throws',throws),bats=coalesce(p_fields->>'bats',bats),
 given_names=coalesce(p_fields->>'given_names',given_names),last_name=coalesce(p_fields->>'last_name',last_name),
 dob=coalesce((p_fields->>'dob')::date,dob),hkll_reg_no=coalesce(p_fields->>'hkll_reg_no',hkll_reg_no) WHERE id=p.id;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 VALUES(auth.uid(),CASE WHEN registration THEN 'registration_changed' ELSE 'baseball_profile_changed' END,p.organization_id,p.id,p_case,p_reason) RETURNING id INTO eid;
 -- Only baseball fields have an additional historical copy. Keep legal identity out of ordinary audit projections.
 IF NOT registration THEN INSERT INTO sdl_rbac_v5.profile_revisions VALUES(eid,old_fields,p_fields); END IF;
END;
$$;
CREATE FUNCTION public.sdl_v5_family_contacts(p_player uuid,p_purpose text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.players; club boolean; is_guardian boolean; staff_access boolean;
BEGIN
 SELECT * INTO p FROM public.players WHERE id=p_player;
 club:=sdl_rbac_v5.has_player_role(p.id,'club_admin');
 is_guardian:=sdl_rbac_v5.has_player_role(p.id,'guardian');
 staff_access:=sdl_rbac_v5.is_platform_admin() OR club OR EXISTS(
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
CREATE FUNCTION public.sdl_v5_set_own_contact(p_player uuid,p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.players;
BEGIN
 SELECT * INTO p FROM public.players WHERE id=p_player FOR SHARE;
 IF NOT sdl_rbac_v5.has_player_role(p.id,'guardian') THEN RAISE EXCEPTION 'Verified guardian required' USING ERRCODE='42501'; END IF;
 IF p_phone IS NULL OR p_phone !~ '^[0-9+() -]{5,32}$' THEN RAISE EXCEPTION 'Invalid phone' USING ERRCODE='22023'; END IF;
 INSERT INTO sdl_rbac_v5.guardian_contacts VALUES(p.athlete_id,auth.uid(),p_phone) ON CONFLICT(athlete_id,guardian) DO UPDATE SET phone=EXCLUDED.phone;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,reason)
 VALUES(auth.uid(),'guardian_contact_updated',p.organization_id,p.id,'Own contact update');
END;
$$;
CREATE FUNCTION public.sdl_v5_team_settings(p_team uuid,p_name text,p_archive boolean,p_reason text,p_case uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid;
BEGIN
 SELECT organization_id INTO org FROM public.teams WHERE id=p_team AND status='active' FOR UPDATE;
 IF org IS NULL OR p_archive IS NULL OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid team change' USING ERRCODE='22023'; END IF;
 IF p_case IS NOT NULL AND sdl_rbac_v5.is_platform_admin() THEN
   UPDATE sdl_rbac_v5.verified_cases SET used_at=now() WHERE id=p_case AND scope_id=org AND target_id=p_team
   AND action='team_support' AND used_at IS NULL AND expires_at>now();
   IF NOT FOUND THEN RAISE EXCEPTION 'Verified case required' USING ERRCODE='42501'; END IF;
 ELSIF NOT sdl_rbac_v5.is_club_admin(org) AND (p_archive OR NOT sdl_rbac_v5.has_team_staff_role(p_team,'manager')) THEN
   RAISE EXCEPTION 'Team change denied' USING ERRCODE='42501'; END IF;
 UPDATE public.teams SET name=btrim(p_name),status=CASE WHEN p_archive THEN 'archived' ELSE 'active' END WHERE id=p_team;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,team_id,target_id,reason)
 VALUES(auth.uid(),CASE WHEN p_archive THEN 'team_archived' ELSE 'team_updated' END,org,p_team,p_case,p_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.sdl_v5_edit_profile(uuid,jsonb,jsonb,text,uuid),public.sdl_v5_family_contacts(uuid,text),
 public.sdl_v5_set_own_contact(uuid,text),public.sdl_v5_team_settings(uuid,text,boolean,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sdl_v5_edit_profile(uuid,jsonb,jsonb,text,uuid),public.sdl_v5_family_contacts(uuid,text),
 public.sdl_v5_set_own_contact(uuid,text),public.sdl_v5_team_settings(uuid,text,boolean,text,uuid) TO authenticated;
COMMIT;
