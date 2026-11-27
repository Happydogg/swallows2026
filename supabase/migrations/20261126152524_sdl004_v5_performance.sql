BEGIN;
ALTER TABLE public.sdl_performance_submissions DROP CONSTRAINT sdl_performance_submissions_source_kind_check,
 ADD CHECK(source_kind IN ('parent','coach','manager','club_admin'));
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_can_measure(p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT sdl_rbac_v5.has_player_role(p_player,'guardian') OR sdl_rbac_v5.player_role_gate(p_player,'enter_official_statistics');
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_attest_session(p_session uuid,p_protocol text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sessions%ROWTYPE;p public.players%ROWTYPE;e public.sdl_club_enrollments%ROWTYPE;r public.sdl_measurement_protocols%ROWTYPE;v numeric;BEGIN
 SELECT * INTO s FROM public.sessions WHERE id=p_session FOR SHARE;
 SELECT * INTO p FROM public.players WHERE id=s.player_id FOR UPDATE;
 IF NOT public.sdl_004_session_active() OR NOT sdl_rbac_v5.player_role_gate(p.id,'enter_official_statistics') THEN RAISE EXCEPTION 'Assigned coach required' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p.id) FOR SHARE;
 SELECT * INTO r FROM public.sdl_measurement_protocols WHERE id=p_protocol AND active;
 IF EXISTS(SELECT 1 FROM public.sdl_performance_submissions WHERE session_id=s.id AND superseded_by IS NOT NULL)
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
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_officialize(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.sdl_performance_submissions%ROWTYPE;prior public.sdl_performance_submissions%ROWTYPE;proto public.sdl_measurement_protocols%ROWTYPE;sid uuid=gen_random_uuid();BEGIN
 SELECT * INTO p FROM public.sdl_performance_submissions WHERE id=p_id FOR UPDATE;
 IF NOT public.sdl_004_session_active() OR NOT sdl_rbac_v5.player_role_gate(p.player_id,'enter_official_statistics') THEN RAISE EXCEPTION 'Assigned coach required' USING ERRCODE='42501'; END IF;
 IF p.source_kind='parent' AND (NOT sdl_rbac_v5.player_role_gate(p.player_id,'review_parent_statistics')
 OR p.submitted_by=auth.uid() OR p.status<>'pending') THEN RAISE EXCEPTION 'Independent coach review required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sdl_club_enrollments e WHERE e.id=p.enrollment_id AND e.generation=p.enrollment_generation AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()) THEN RAISE EXCEPTION 'Enrollment changed; resubmit' USING ERRCODE='PT409'; END IF;
 IF p.supersedes IS NOT NULL THEN
  SELECT * INTO prior FROM public.sdl_performance_submissions WHERE id=p.supersedes AND player_id=p.player_id FOR UPDATE;
  IF prior.id IS NULL OR prior.superseded_by IS NOT NULL OR prior.enrollment_id<>p.enrollment_id
  OR prior.enrollment_generation<>p.enrollment_generation OR (p.source_kind<>'parent' AND prior.status<>'approved') THEN RAISE EXCEPTION 'Correction changed; refresh' USING ERRCODE='PT409'; END IF;
  UPDATE public.sdl_official_statistics SET invalidated_at=now() WHERE session_id=prior.session_id;
  UPDATE public.sdl_performance_submissions SET superseded_by=p.id WHERE id=prior.id;
 END IF;
 SELECT * INTO proto FROM public.sdl_measurement_protocols WHERE id=p.protocol_id AND active;
 IF proto.id IS NULL THEN RAISE EXCEPTION 'Protocol unavailable' USING ERRCODE='22023'; END IF;
 INSERT INTO public.sessions(id,player_id,session_date,exit_velo,throwing_velo,sprint_time,broad_jump)
 VALUES(sid,p.player_id,p.measurement_date,CASE WHEN proto.metric='exit_velo' THEN p.value END,CASE WHEN proto.metric='throwing_velo' THEN p.value END,
 CASE WHEN proto.metric='sprint_time' THEN p.value END,CASE WHEN proto.metric='broad_jump' THEN p.value END);
 PERFORM public.sdl_004_pilot_attest_session(sid,proto.id);
 UPDATE public.sdl_performance_submissions SET session_id=sid WHERE id=p.id;
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_submit_performance(p_player uuid,p_protocol text,p_value numeric,p_date date,p_evidence text,p_key uuid,p_official boolean DEFAULT false,p_video uuid DEFAULT NULL,p_supersedes uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.sdl_club_enrollments%ROWTYPE;proto public.sdl_measurement_protocols%ROWTYPE;r public.sdl_performance_submissions%ROWTYPE;org uuid;fingerprint text;BEGIN
 IF NOT public.sdl_004_session_active() OR p_official IS NULL OR NOT(CASE WHEN p_official THEN sdl_rbac_v5.player_role_gate(p_player,'enter_official_statistics') ELSE public.sdl_004_guardian_for((SELECT auth.uid()),p_player) END) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
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
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_review_performance(p_id uuid,p_decision text,p_note text,p_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.sdl_performance_submissions%ROWTYPE;BEGIN
 SELECT * INTO p FROM public.sdl_performance_submissions WHERE id=p_id FOR UPDATE;
 IF p.id IS NULL OR NOT public.sdl_004_session_active() OR NOT sdl_rbac_v5.player_role_gate(p.player_id,'review_parent_statistics') OR p.submitted_by=(SELECT auth.uid()) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p.source_kind<>'parent' OR NOT EXISTS(SELECT 1 FROM public.sdl_club_enrollments e
 WHERE e.id=public.sdl_004_statistics_enrollment(p.player_id) AND e.id=p.enrollment_id AND e.generation=p.enrollment_generation)
 THEN RAISE EXCEPTION 'Scope changed' USING ERRCODE='PT409'; END IF;
 IF p.revision IS DISTINCT FROM p_revision OR p.status<>'pending' THEN RAISE EXCEPTION 'Submission already changed; refresh' USING ERRCODE='PT409'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN('approved','rejected','correction_requested') OR p_note IS NULL OR char_length(p_note)>1000 OR (p_decision<>'approved' AND char_length(btrim(p_note))=0) THEN RAISE EXCEPTION 'Review decision and reason required' USING ERRCODE='22023'; END IF;
 IF p_decision='approved' THEN PERFORM public.sdl_004_pilot_officialize(p.id); END IF;
 UPDATE public.sdl_performance_submissions SET status=p_decision,reviewed_by=(SELECT auth.uid()),reviewed_at=now(),review_note=p_note,revision=revision+1 WHERE id=p.id;
 PERFORM public.sdl_004_pilot_audit(p.player_id,p.organization_id,'performance_'||p_decision,p.id,jsonb_build_object('note',p_note,'revision',p.revision+1,'value',p.value,'protocol_id',p.protocol_id,'evidence',p.evidence));
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_correct_performance(p_id uuid,p_protocol text,p_value numeric,p_date date,p_evidence text,p_revision integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.sdl_performance_submissions%ROWTYPE;BEGIN
 SELECT * INTO p FROM public.sdl_performance_submissions WHERE id=p_id FOR UPDATE;
 IF p.id IS NULL OR p.submitted_by IS DISTINCT FROM auth.uid() OR p.source_kind<>'parent' OR NOT EXISTS(
 SELECT 1 FROM public.sdl_club_enrollments e WHERE e.id=public.sdl_004_statistics_enrollment(p.player_id)
 AND e.id=p.enrollment_id AND e.generation=p.enrollment_generation) OR NOT public.sdl_004_session_active() OR NOT public.sdl_004_guardian_for((SELECT auth.uid()),p.player_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p.revision IS DISTINCT FROM p_revision OR p.status NOT IN('pending','correction_requested') THEN RAISE EXCEPTION 'Submission cannot be edited; submit a correction for coach review' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sdl_measurement_protocols WHERE id=p_protocol AND active) OR p_value IS NULL OR NOT(p_value>0 AND p_value<=500)
 OR p_date IS NULL OR p_date>CURRENT_DATE OR p_date<'1900-01-01' OR p_evidence IS NULL OR char_length(btrim(p_evidence)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid correction' USING ERRCODE='22023'; END IF;
 PERFORM public.sdl_004_pilot_audit(p.player_id,p.organization_id,'performance_corrected',p.id,jsonb_build_object('previous',jsonb_build_object('value',p.value,'protocol_id',p.protocol_id,'measurement_date',p.measurement_date,'evidence',p.evidence),'value',p_value,'protocol_id',p_protocol,'measurement_date',p_date,'evidence',p_evidence,'revision',p.revision+1));
 UPDATE public.sdl_performance_submissions SET protocol_id=p_protocol,value=p_value,measurement_date=p_date,evidence=p_evidence,status='pending',review_note='',reviewed_by=NULL,reviewed_at=NULL,revision=revision+1 WHERE id=p.id;
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_pilot_save_growth(p_player uuid,p_date date,p_height numeric,p_weight numeric,p_session uuid DEFAULT NULL,p_revision integer DEFAULT 0,p_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sessions%ROWTYPE;rev integer;result uuid;org uuid;role_name text; BEGIN
 IF NOT public.sdl_004_pilot_can_measure(p_player) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_date IS NULL OR p_date>CURRENT_DATE OR p_date<'1900-01-01' OR (p_height IS NULL AND p_weight IS NULL)
 OR (p_height IS NOT NULL AND NOT(p_height BETWEEN 30 AND 250)) OR (p_weight IS NOT NULL AND NOT(p_weight BETWEEN 2 AND 300))
 OR p_revision IS NULL OR p_reason IS NULL OR char_length(p_reason)>500 THEN RAISE EXCEPTION 'Invalid growth measurement' USING ERRCODE='22023'; END IF;
 SELECT organization_id INTO org FROM public.players WHERE id=p_player;
 IF p_session IS NULL THEN INSERT INTO public.sessions(id,player_id,session_date,height_cm,weight_kg)VALUES(gen_random_uuid(),p_player,p_date,p_height,p_weight) RETURNING * INTO s;
 ELSE SELECT * INTO s FROM public.sessions WHERE id=p_session AND player_id=p_player FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Correction reason required' USING ERRCODE='22023'; END IF;
  IF p_date<>s.session_date AND EXISTS(SELECT 1 FROM jsonb_each(to_jsonb(s)) item WHERE item.key NOT IN('id','player_id','session_date','height_cm','weight_kg','created_at','updated_at') AND item.value<>'null'::jsonb) THEN RAISE EXCEPTION 'Keep the performance session date; add a separate growth measurement if needed' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT coalesce(max(revision),0) INTO rev FROM public.sdl_growth_events WHERE session_id=s.id;
 IF rev<>p_revision THEN RAISE EXCEPTION 'Measurement changed; refresh' USING ERRCODE='PT409'; END IF;
 role_name=CASE WHEN public.sdl_004_guardian_for((SELECT auth.uid()),p_player) THEN 'guardian' WHEN sdl_rbac_v5.has_player_role(p_player,'coach') THEN 'coach'
 WHEN sdl_rbac_v5.has_player_role(p_player,'manager') THEN 'manager' ELSE 'club_admin' END;
 INSERT INTO public.sdl_growth_events(session_id,player_id,revision,measurement_date,height_cm,weight_kg,previous,reason,recorded_by,recorded_role)
 VALUES(s.id,p_player,rev+1,p_date,p_height,p_weight,CASE WHEN p_session IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('measurement_date',s.session_date,'height_cm',s.height_cm,'weight_kg',s.weight_kg)END,coalesce(p_reason,''),(SELECT auth.uid()),role_name);
 UPDATE public.sessions SET session_date=p_date,height_cm=p_height,weight_kg=p_weight WHERE id=s.id;
 PERFORM public.sdl_004_pilot_audit(p_player,org,'growth_saved',s.id,jsonb_build_object('revision',rev+1,'reason',p_reason));RETURN jsonb_build_object('id',s.id,'revision',rev+1);
END;
$$;

COMMIT;
