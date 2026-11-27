-- SDL-004-RBAC-10A: revision integrity, candidate from hosted v5.1 baseline.
-- No record deletion, no membership/consent changes, no grants added.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $baseline$ BEGIN
 IF md5(pg_get_functiondef('sdl_004_clubhouse_leaderboard(uuid)'::regprocedure)) IS DISTINCT FROM '161b1cc1ff98d37f1c2850a31ac64457' THEN RAISE EXCEPTION 'Baseline changed: sdl_004_clubhouse_leaderboard(uuid)'; END IF;
 IF md5(pg_get_functiondef('sdl_004_pilot_attest_session(uuid,text)'::regprocedure)) IS DISTINCT FROM 'dd1ec55545b165e91a546f66f5747809' THEN RAISE EXCEPTION 'Baseline changed: sdl_004_pilot_attest_session(uuid,text)'; END IF;
 IF md5(pg_get_functiondef('sdl_004_pilot_coach_statistics(uuid)'::regprocedure)) IS DISTINCT FROM '69e74f4ddcb20b630b091ad8491c5f46' THEN RAISE EXCEPTION 'Baseline changed: sdl_004_pilot_coach_statistics(uuid)'; END IF;
 IF md5(pg_get_functiondef('sdl_004_pilot_growth(uuid)'::regprocedure)) IS DISTINCT FROM 'dc11850e03c58064baf61b73198e6fd9' THEN RAISE EXCEPTION 'Baseline changed: sdl_004_pilot_growth(uuid)'; END IF;
 IF md5(pg_get_functiondef('sdl_004_pilot_officialize(uuid)'::regprocedure)) IS DISTINCT FROM '08140905c17a94ea472706da0854a889' THEN RAISE EXCEPTION 'Baseline changed: sdl_004_pilot_officialize(uuid)'; END IF;
 IF md5(pg_get_functiondef('sdl_004_pilot_performance(uuid,uuid,text)'::regprocedure)) IS DISTINCT FROM '93fdaed43574875f18f7692eda5d84f2' THEN RAISE EXCEPTION 'Baseline changed: sdl_004_pilot_performance(uuid,uuid,text)'; END IF;
 IF md5(pg_get_functiondef('sdl_004_pilot_review_performance(uuid,text,text,integer)'::regprocedure)) IS DISTINCT FROM '7eb998cb3e612634dfb241d34da9e459' THEN RAISE EXCEPTION 'Baseline changed: sdl_004_pilot_review_performance(uuid,text,text,integer)'; END IF;
 IF md5(pg_get_functiondef('sdl_004_pilot_submit_performance(uuid,text,numeric,date,text,uuid,boolean,uuid,uuid)'::regprocedure)) IS DISTINCT FROM '283f86200030757f24a11c95c418f712' THEN RAISE EXCEPTION 'Baseline changed: sdl_004_pilot_submit_performance(uuid,text,numeric,date,text,uuid,boolean,uuid,uuid)'; END IF;
 IF md5(pg_get_functiondef('sdl_004_player_statistics(uuid)'::regprocedure)) IS DISTINCT FROM 'bde9c0f2b59138f7a9a9b235b51a7ec3' THEN RAISE EXCEPTION 'Baseline changed: sdl_004_player_statistics(uuid)'; END IF;
 IF md5(pg_get_functiondef('sdl_rbac_v5.private_statistics_page(uuid,uuid,integer,boolean)'::regprocedure)) IS DISTINCT FROM '956ce2cf3b45026b54a7de94b109f4f6' THEN RAISE EXCEPTION 'Baseline changed: sdl_rbac_v5.private_statistics_page(uuid,uuid,integer,boolean)'; END IF;
 IF md5(pg_get_functiondef('sdl_v5_clubhouse_sessions(uuid,uuid,integer)'::regprocedure)) IS DISTINCT FROM '0df9c2f18ba4e3759bb00df7c1fe9eb5' THEN RAISE EXCEPTION 'Baseline changed: sdl_v5_clubhouse_sessions(uuid,uuid,integer)'; END IF;
 IF md5(pg_get_functiondef('sdl_v5_correct_official(uuid,text,numeric,date,text,uuid,text,uuid)'::regprocedure)) IS DISTINCT FROM 'b25d7c95049241d932be139cb4ab0c3d' THEN RAISE EXCEPTION 'Baseline changed: sdl_v5_correct_official(uuid,text,numeric,date,text,uuid,text,uuid)'; END IF;
 IF md5(pg_get_functiondef('sdl_v5_export_statistics(text,uuid,uuid,integer)'::regprocedure)) IS DISTINCT FROM '4ff144b196ea1fc28e0d3027910b304d' THEN RAISE EXCEPTION 'Baseline changed: sdl_v5_export_statistics(text,uuid,uuid,integer)'; END IF;
END $baseline$;
CREATE FUNCTION sdl_rbac_v5.submit_performance_core(p_player uuid, p_protocol text, p_value numeric, p_date date, p_evidence text, p_key uuid, p_official boolean DEFAULT false, p_video uuid DEFAULT NULL::uuid, p_supersedes uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
DECLARE e public.sdl_club_enrollments%ROWTYPE;proto public.sdl_measurement_protocols%ROWTYPE;r public.sdl_performance_submissions%ROWTYPE;org uuid;fingerprint text;BEGIN
 IF NOT public.sdl_004_session_active() OR p_official IS NULL OR NOT(CASE WHEN p_official THEN sdl_rbac_v5.player_role_gate(p_player,'enter_official_statistics') ELSE sdl_rbac_v5.guardian_participates(auth.uid(),p_player) END) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_official AND p_supersedes IS NOT NULL AND (p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500) THEN RAISE EXCEPTION 'Correction reason required' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p_player) FOR SHARE;
 SELECT * INTO proto FROM public.sdl_measurement_protocols WHERE id=p_protocol AND active;
 IF e.id IS NULL OR proto.id IS NULL OR p_date IS NULL OR p_date>CURRENT_DATE OR p_date<'1900-01-01' OR p_value IS NULL OR NOT(p_value>0 AND p_value<='500')
 OR p_evidence IS NULL OR char_length(btrim(p_evidence)) NOT BETWEEN 1 AND 1000 OR p_key IS NULL THEN RAISE EXCEPTION 'Invalid performance measurement' USING ERRCODE='22023'; END IF;
 IF p_video IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sdl_video_submissions WHERE id=p_video AND player_id=p_player AND public.sdl_004_submission_can_read(id)) THEN RAISE EXCEPTION 'Evidence unavailable' USING ERRCODE='42501'; END IF;
 SELECT organization_id INTO org FROM public.players WHERE id=p_player;
 fingerprint=md5(jsonb_build_array(p_player,p_protocol,p_value,p_date,p_evidence,p_official,p_video,p_supersedes)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended((SELECT auth.uid())::text||p_key::text,0));
 SELECT * INTO r FROM public.sdl_performance_submissions WHERE submitted_by=(SELECT auth.uid()) AND request_key=p_key;
 IF r.id IS NOT NULL THEN
  IF r.request_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Request key conflict' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('id',r.id,'status',r.status,'revision',r.revision);
 END IF;
 -- Lock the previous revision before creating a foreign key to it. Concurrent
 -- writers must never both hold key-share and then try to upgrade to UPDATE.
 IF p_supersedes IS NOT NULL THEN
 PERFORM 1 FROM public.sdl_performance_submissions prior WHERE prior.id=p_supersedes AND prior.player_id=p_player FOR UPDATE;
 END IF;
 IF p_supersedes IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sdl_performance_submissions
 WHERE id=p_supersedes AND player_id=p_player AND superseded_by IS NULL AND enrollment_id=e.id AND enrollment_generation=e.generation
 AND (status='approved' OR (NOT p_official AND status='rejected' AND submitted_by=auth.uid()))) THEN
 RAISE EXCEPTION 'Invalid correction reference' USING ERRCODE='22023'; END IF;
 INSERT INTO public.sdl_performance_submissions(player_id,organization_id,enrollment_id,enrollment_generation,protocol_id,value,measurement_date,source_kind,status,submitted_by,evidence,evidence_video_id,reviewed_by,reviewed_at,supersedes,request_key,request_fingerprint)
 VALUES(p_player,org,e.id,e.generation,p_protocol,p_value,p_date,CASE WHEN p_official THEN CASE WHEN sdl_rbac_v5.has_player_role(p_player,'coach') THEN 'coach'
 WHEN sdl_rbac_v5.has_player_role(p_player,'manager') THEN 'manager' ELSE 'club_admin' END ELSE 'parent' END,CASE WHEN p_official THEN 'approved' ELSE 'pending' END,
 (SELECT auth.uid()),p_evidence,p_video,CASE WHEN p_official THEN (SELECT auth.uid()) END,CASE WHEN p_official THEN now() END,p_supersedes,p_key,fingerprint) RETURNING * INTO r;
 PERFORM public.sdl_004_pilot_audit(p_player,org,CASE WHEN p_official THEN r.source_kind||'_official_entry' ELSE 'performance_submitted' END,r.id,jsonb_build_object('value',p_value,'protocol_id',p_protocol,'measurement_date',p_date,'evidence',p_evidence,'evidence_video_id',p_video));
 IF p_official THEN PERFORM public.sdl_004_pilot_officialize(r.id); END IF;
 RETURN jsonb_build_object('id',r.id,'status',r.status,'revision',r.revision);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sdl_004_pilot_submit_performance(p_player uuid,p_protocol text,p_value numeric,p_date date,p_evidence text,p_key uuid,p_official boolean DEFAULT false,p_video uuid DEFAULT NULL::uuid,p_supersedes uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.sdl_004_session_active() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_official AND p_supersedes IS NOT NULL THEN RAISE EXCEPTION 'Use official correction RPC with reason' USING ERRCODE='22023'; END IF;
 RETURN sdl_rbac_v5.submit_performance_core(p_player,p_protocol,p_value,p_date,p_evidence,p_key,p_official,p_video,p_supersedes,NULL);
END; $$;

CREATE OR REPLACE FUNCTION public.sdl_v5_correct_official(p_prior uuid, p_protocol text, p_value numeric, p_date date, p_evidence text, p_request uuid, p_reason text, p_video uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE prior public.sdl_performance_submissions; receipt jsonb; previous_reason text;
BEGIN
 SELECT * INTO prior FROM public.sdl_performance_submissions WHERE id=p_prior;
 IF prior.status IS DISTINCT FROM 'approved' OR NOT sdl_rbac_v5.player_role_gate(prior.player_id,'correct_official_statistics') THEN
 RAISE EXCEPTION 'Official correction denied' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Correction reason required' USING ERRCODE='22023'; END IF;
 receipt:=sdl_rbac_v5.submit_performance_core(prior.player_id,p_protocol,p_value,p_date,p_evidence,p_request,true,p_video,p_prior,p_reason);
 SELECT e.reason INTO previous_reason FROM sdl_rbac_v5.events e WHERE e.target_id=(receipt->>'id')::uuid AND e.action='official_correction';
 IF FOUND THEN
   IF previous_reason<>p_reason THEN RAISE EXCEPTION 'Correction reason changed' USING ERRCODE='PT409'; END IF;
 ELSE
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 VALUES(auth.uid(),'official_correction',prior.organization_id,prior.player_id,(receipt->>'id')::uuid,p_reason);
 END IF;
 RETURN receipt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sdl_004_pilot_review_performance(p_id uuid, p_decision text, p_note text, p_revision integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.sdl_performance_submissions%ROWTYPE;BEGIN
 SELECT * INTO p FROM public.sdl_performance_submissions WHERE id=p_id FOR UPDATE;
 IF p.id IS NULL OR NOT public.sdl_004_session_active() OR NOT sdl_rbac_v5.player_role_gate(p.player_id,'review_parent_statistics') OR p.submitted_by=(SELECT auth.uid()) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p.source_kind<>'parent' OR NOT EXISTS(SELECT 1 FROM public.sdl_club_enrollments e
 WHERE e.id=public.sdl_004_statistics_enrollment(p.player_id) AND e.id=p.enrollment_id AND e.generation=p.enrollment_generation)
 THEN RAISE EXCEPTION 'Scope changed' USING ERRCODE='PT409'; END IF;
 IF p.revision IS DISTINCT FROM p_revision OR p.status<>'pending' THEN RAISE EXCEPTION 'Submission already changed; refresh' USING ERRCODE='PT409'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN('approved','rejected','correction_requested') OR p_note IS NULL OR char_length(p_note)>1000 OR (p_decision<>'approved' AND char_length(btrim(p_note))=0) THEN RAISE EXCEPTION 'Review decision and reason required' USING ERRCODE='22023'; END IF;
 IF p_decision='approved' AND p.supersedes IS NOT NULL AND length(btrim(p_note)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Correction approval requires a reason' USING ERRCODE='22023'; END IF;
 IF p_decision='approved' THEN PERFORM public.sdl_004_pilot_officialize(p.id); END IF;
 UPDATE public.sdl_performance_submissions SET status=p_decision,reviewed_by=(SELECT auth.uid()),reviewed_at=now(),review_note=p_note,revision=revision+1 WHERE id=p.id;
 IF p_decision='approved' AND p.supersedes IS NOT NULL THEN
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason) VALUES(auth.uid(),'official_correction',p.organization_id,p.player_id,p.id,p_note);
 END IF;
 PERFORM public.sdl_004_pilot_audit(p.player_id,p.organization_id,'performance_'||p_decision,p.id,jsonb_build_object('note',p_note,'revision',p.revision+1,'value',p.value,'protocol_id',p.protocol_id,'evidence',p.evidence));
END;
$function$;

CREATE OR REPLACE FUNCTION public.sdl_004_pilot_performance(p_player uuid DEFAULT NULL::uuid, p_team uuid DEFAULT NULL::uuid, p_status text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('action',ev.action,'actor',ev.actor,'at',ev.occurred_at,'details',ev.details) ORDER BY ev.event_order)FROM public.sdl_pilot_events ev WHERE ev.target=p.id),'[]') || coalesce((SELECT jsonb_agg(jsonb_build_object('action',ev.action,'actor',ev.actor,'at',ev.occurred_at,'details',jsonb_build_object('reason',ev.reason)) ORDER BY ev.occurred_at,ev.id) FROM sdl_rbac_v5.events ev WHERE ev.target_id=p.id AND ev.player_id=p.player_id AND ev.organization_id=p.organization_id AND ev.action='official_correction'),'[]'::jsonb))ORDER BY p.created_at DESC,p.id)
 FROM(SELECT s.* FROM public.sdl_performance_submissions s WHERE (p_player IS NULL OR s.player_id=p_player)
 AND ((sdl_rbac_v5.can_view_player(s.player_id) AND (sdl_rbac_v5.has_player_role(s.player_id,'guardian') OR sdl_rbac_v5.platform_allowed('view')
 OR EXISTS(SELECT 1 FROM public.sdl_club_enrollments en WHERE en.id=public.sdl_004_statistics_enrollment(s.player_id) AND en.id=s.enrollment_id AND en.generation=s.enrollment_generation)))
 OR sdl_rbac_v5.is_club_admin(s.organization_id)
 OR (p_team IS NULL AND sdl_rbac_v5.historical_staff_view(s.player_id,'performance',s.id)))
 AND (p_status='all' OR s.status=p_status) AND (p_team IS NULL OR EXISTS(SELECT 1 FROM public.player_team_memberships pm WHERE pm.team_id=p_team AND pm.player_id=s.player_id
 AND pm.organization_id=s.organization_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE))
 ORDER BY s.created_at DESC,s.id LIMIT 100)p JOIN public.players player ON player.id=p.player_id JOIN public.sdl_measurement_protocols proto ON proto.id=p.protocol_id),'[]');
END;
$function$;

CREATE FUNCTION sdl_rbac_v5.current_measurement_session(p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_session IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sdl_performance_submissions old WHERE old.session_id=p_session AND old.superseded_by IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.current_measurement_session(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.sdl_004_pilot_coach_statistics(p_player uuid)
 RETURNS TABLE(id uuid, player_id uuid, session_date date, exit_velo numeric, throwing_velo numeric, sprint_time numeric, broad_jump numeric, control_exit_velo numeric, attack_angle numeric, height_cm numeric, weight_kg numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT public.sdl_004_session_active() OR NOT public.sdl_004_coach_for((SELECT auth.uid()),p_player) OR public.sdl_004_statistics_enrollment(p_player) IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT s.id,s.player_id,s.session_date,s.exit_velo,s.throwing_velo,s.sprint_time,s.broad_jump,s.control_exit_velo,s.attack_angle,s.height_cm,s.weight_kg FROM public.sessions s WHERE s.player_id=p_player AND sdl_rbac_v5.current_measurement_session(s.id) ORDER BY s.session_date DESC,s.id LIMIT 200;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sdl_004_player_statistics(p_player_id uuid)
 RETURNS TABLE(id uuid, player_id uuid, session_date date, exit_velo numeric, throwing_velo numeric, sprint_time numeric, broad_jump numeric, control_exit_velo numeric, attack_angle numeric, height_cm numeric, weight_kg numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT public.sdl_004_session_active() OR NOT public.sdl_004_guardian_for((SELECT auth.uid()),p_player_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT s.id,s.player_id,s.session_date,s.exit_velo,s.throwing_velo,s.sprint_time,s.broad_jump,
 s.control_exit_velo,s.attack_angle,s.height_cm,s.weight_kg FROM public.sessions s
 WHERE s.player_id=p_player_id AND sdl_rbac_v5.current_measurement_session(s.id) ORDER BY s.session_date DESC,s.id DESC LIMIT 200;
END;
$function$;

CREATE OR REPLACE FUNCTION sdl_rbac_v5.private_statistics_page(p_player uuid, p_after uuid, p_limit integer, p_export boolean)
 RETURNS TABLE(id uuid, session_date date, exit_velo numeric, throwing_velo numeric, sprint_time numeric, broad_jump numeric, control_exit_velo numeric, attack_angle numeric, height_cm numeric, weight_kg numeric)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 AND sdl_rbac_v5.current_measurement_session(s.id)
 ORDER BY s.id LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sdl_004_pilot_attest_session(p_session uuid, p_protocol text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s public.sessions%ROWTYPE;p public.players%ROWTYPE;e public.sdl_club_enrollments%ROWTYPE;r public.sdl_measurement_protocols%ROWTYPE;v numeric;BEGIN
 SELECT * INTO s FROM public.sessions WHERE id=p_session FOR SHARE;
 SELECT * INTO p FROM public.players WHERE id=s.player_id FOR NO KEY UPDATE;
 IF NOT public.sdl_004_session_active() OR NOT sdl_rbac_v5.player_role_gate(p.id,'enter_official_statistics') THEN RAISE EXCEPTION 'Assigned coach required' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p.id) FOR SHARE;
 SELECT * INTO r FROM public.sdl_measurement_protocols WHERE id=p_protocol AND active;
 IF NOT sdl_rbac_v5.current_measurement_session(s.id)
 THEN RAISE EXCEPTION 'Superseded measurement' USING ERRCODE='PT409'; END IF;
 IF e.id IS NULL OR r.id IS NULL THEN RAISE EXCEPTION 'Active enrollment and explicit protocol required' USING ERRCODE='22023'; END IF;
 v=CASE r.metric WHEN 'exit_velo' THEN s.exit_velo WHEN 'throwing_velo' THEN s.throwing_velo WHEN 'sprint_time' THEN s.sprint_time WHEN 'broad_jump' THEN s.broad_jump END;
 IF v IS NULL OR v<=0 OR v>='Infinity'::numeric THEN RAISE EXCEPTION 'Invalid official value' USING ERRCODE='22023'; END IF;
 INSERT INTO public.sdl_official_statistics(session_id,player_id,athlete_id,organization_id,enrollment_id,enrollment_generation,metric,value,recorded_at,source_hash,approved_by,protocol_id)
 VALUES(s.id,p.id,p.athlete_id,p.organization_id,e.id,e.generation,r.metric,v,s.session_date,public.sdl_004_statistics_source_hash(s.id),(SELECT auth.uid()),r.id)
 ON CONFLICT(session_id,metric) DO UPDATE SET value=EXCLUDED.value,recorded_at=EXCLUDED.recorded_at,source_hash=EXCLUDED.source_hash,invalidated_at=NULL,
 approved_by=EXCLUDED.approved_by,approved_at=now(),protocol_id=EXCLUDED.protocol_id,enrollment_id=EXCLUDED.enrollment_id,enrollment_generation=EXCLUDED.enrollment_generation;
 PERFORM public.sdl_004_pilot_audit(p.id,p.organization_id,'official_statistic_attested',s.id,jsonb_build_object('metric',r.metric,'protocol_id',r.id,'value',v));
END;
$function$;

CREATE OR REPLACE FUNCTION public.sdl_004_clubhouse_leaderboard(p_team_id uuid)
 RETURNS TABLE(id uuid, player_id uuid, team_id uuid, team_name text, metric text, preferred_name text, jersey text, value numeric, unit text, rank integer, recorded_at text, protocol_id text, protocol_label text, distance_m numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT public.sdl_004_clubhouse_member(p_team_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH eligible AS(
 SELECT DISTINCT a.id,a.player_id,a.athlete_id,t.id AS team_id,t.name AS team_name,a.metric,p.preferred_name,p.jersey,a.value,a.recorded_at,a.approved_at,proto.id AS protocol_id,proto.label AS protocol_label,proto.unit,proto.distance_m
 FROM public.sdl_official_statistics a JOIN public.sdl_measurement_protocols proto ON proto.id=a.protocol_id AND proto.metric=a.metric AND proto.active
 JOIN public.players p ON p.id=a.player_id AND p.athlete_id=a.athlete_id AND p.organization_id=a.organization_id
 JOIN public.sdl_club_enrollments e ON e.id=a.enrollment_id AND e.generation=a.enrollment_generation AND e.id=public.sdl_004_statistics_enrollment(p.id)
 JOIN public.sdl_statistic_consents c ON c.id=public.sdl_004_statistics_consent(e.id)
 JOIN public.player_team_memberships pm ON pm.player_id=p.id AND pm.organization_id=p.organization_id JOIN public.teams t ON t.id=pm.team_id AND t.organization_id=p.organization_id
 WHERE t.id=p_team_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=CURRENT_DATE AND a.invalidated_at IS NULL AND sdl_rbac_v5.current_measurement_session(a.session_id) AND c.share_roster AND public.sdl_004_pilot_profile_approved(p.id) AND (c.policy_version<>'baseball-sessions-v5' OR EXISTS(SELECT 1 FROM sdl_rbac_v5.shared_protocols cat WHERE cat.protocol_id=proto.id AND cat.notice=c.policy_version)) AND a.metric=ANY(c.metrics) AND a.source_hash=public.sdl_004_statistics_source_hash(a.session_id)
 ), latest AS(SELECT DISTINCT ON(x.athlete_id,x.protocol_id) x.* FROM eligible x ORDER BY x.athlete_id,x.protocol_id,x.recorded_at DESC,x.approved_at DESC,x.id),
 ranked AS(SELECT x.*,row_number()OVER(PARTITION BY x.protocol_id ORDER BY CASE WHEN x.metric='sprint_time' THEN x.value ELSE -x.value END,x.athlete_id)::integer AS place FROM latest x)
 SELECT x.id,x.player_id,x.team_id,x.team_name,x.metric,x.preferred_name,x.jersey,x.value,x.unit,x.place,x.recorded_at::text,x.protocol_id,x.protocol_label,x.distance_m FROM ranked x WHERE x.place<=3 ORDER BY x.protocol_id,x.place;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sdl_v5_clubhouse_sessions(p_team uuid, p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, player_id uuid, recorded_at date, protocol_id text, metric text, value numeric, unit text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT public.sdl_004_clubhouse_member(p_team) THEN RAISE EXCEPTION 'Team access denied' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid page size' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT a.id,a.player_id,a.recorded_at::date,a.protocol_id,a.metric,a.value,proto.unit
 FROM public.teams t JOIN public.sdl_official_statistics a ON a.organization_id=t.organization_id
 JOIN public.players p ON p.id=a.player_id AND p.athlete_id=a.athlete_id AND p.organization_id=a.organization_id
 JOIN public.sdl_measurement_protocols proto ON proto.id=a.protocol_id AND proto.metric=a.metric AND proto.active
 JOIN sdl_rbac_v5.shared_protocols catalog ON catalog.protocol_id=proto.id
 JOIN public.sdl_club_enrollments e ON e.id=public.sdl_004_statistics_enrollment(p.id) AND e.id=a.enrollment_id AND e.generation=a.enrollment_generation
 JOIN public.sdl_statistic_consents c ON c.id=public.sdl_004_statistics_consent(e.id) AND c.share_roster
 WHERE (c.policy_version=catalog.notice OR EXISTS(
 SELECT 1 FROM sdl_rbac_v5.reviewed_consent_expansions x WHERE x.category='statistics'
 AND x.receipt_id=c.id AND x.enrollment_generation=e.generation AND a.metric=ANY(x.approved_metrics)))
 AND t.id=p_team AND (p_after IS NULL OR a.id>p_after) AND a.invalidated_at IS NULL AND sdl_rbac_v5.current_measurement_session(a.session_id)
 AND public.sdl_004_pilot_profile_approved(p.id) AND a.source_hash=public.sdl_004_statistics_source_hash(a.session_id)
 AND EXISTS(SELECT 1 FROM public.player_team_memberships pm WHERE pm.team_id=t.id AND pm.player_id=p.id
 AND pm.organization_id=t.organization_id AND pm.status='active' AND pm.start_date<=CURRENT_DATE AND pm.end_date IS NULL)
 ORDER BY a.id LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sdl_v5_export_statistics(p_scope text, p_id uuid, p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, player_id uuid, recorded_at date, protocol_id text, metric text, value numeric, unit text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 AND a.invalidated_at IS NULL AND sdl_rbac_v5.current_measurement_session(a.session_id) AND a.source_hash=public.sdl_004_statistics_source_hash(a.session_id)
 ORDER BY a.id LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sdl_004_pilot_growth(p_player uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT public.sdl_004_pilot_can_measure(p_player) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(x ORDER BY x.measurement_date DESC,x.id) FROM(
 SELECT s.id,s.session_date AS measurement_date,s.height_cm,s.weight_kg,coalesce(g.revision,0) AS revision,
 g.recorded_by,g.recorded_role,coalesce((SELECT jsonb_agg(jsonb_build_object('revision',h.revision,'previous',h.previous,'height_cm',h.height_cm,'weight_kg',h.weight_kg,'measurement_date',h.measurement_date,'reason',h.reason,'recorded_by',h.recorded_by,'recorded_role',h.recorded_role,'at',h.recorded_at)ORDER BY h.revision)FROM public.sdl_growth_events h WHERE h.session_id=s.id),'[]') AS history
 FROM public.sessions s LEFT JOIN LATERAL(SELECT e.* FROM public.sdl_growth_events e WHERE e.session_id=s.id ORDER BY e.revision DESC LIMIT 1)g ON true
 WHERE s.player_id=p_player AND sdl_rbac_v5.current_measurement_session(s.id) AND (s.height_cm IS NOT NULL OR s.weight_kg IS NOT NULL) ORDER BY s.session_date DESC,s.id LIMIT 200)x),'[]');
END;
$function$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.submit_performance_core(uuid,text,numeric,date,text,uuid,boolean,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
DO $check$ BEGIN
 IF has_function_privilege('authenticated','sdl_rbac_v5.submit_performance_core(uuid,text,numeric,date,text,uuid,boolean,uuid,uuid,text)','EXECUTE')
 OR has_function_privilege('anon','sdl_rbac_v5.submit_performance_core(uuid,text,numeric,date,text,uuid,boolean,uuid,uuid,text)','EXECUTE')
 OR has_function_privilege('service_role','sdl_rbac_v5.submit_performance_core(uuid,text,numeric,date,text,uuid,boolean,uuid,uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated','sdl_rbac_v5.current_measurement_session(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Private helper exposed'; END IF;
 IF has_function_privilege('authenticated','public.sdl_v5_clubhouse_sessions(uuid,uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'Staging Clubhouse restriction changed'; END IF;
END $check$;
COMMIT;
