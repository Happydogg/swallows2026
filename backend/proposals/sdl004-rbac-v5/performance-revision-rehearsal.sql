-- Run inside BEGIN/ROLLBACK with the candidate installed or in the same transaction.
-- Hosted synthetic rehearsal only. Never use with real athletes.
-- Set sdl.qa_batch locally to an existing isolated QA batch.
DO $test$
DECLARE b text:=current_setting('sdl.qa_batch',true); player uuid; other_player uuid; team uuid; org uuid; r record; u uuid; s uuid; j jsonb; h jsonb; prior uuid; corrected uuid; prior2 uuid; pending uuid; old_session uuid; new_session uuid; k uuid; denied boolean; original_count bigint; current_count bigint; saved_reason text;
BEGIN
 IF b IS NULL OR b NOT LIKE 'sdlqa-%' THEN RAISE EXCEPTION 'Synthetic batch required'; END IF;
 SELECT o.id INTO STRICT org FROM public.organizations o WHERE o.slug=b||'-club-a';
 SELECT p.id INTO STRICT player FROM public.players p WHERE p.organization_id=org AND p.jersey='60';
 SELECT p.id INTO STRICT other_player FROM public.players p JOIN public.organizations o ON o.id=p.organization_id WHERE o.slug=b||'-club-b' AND p.jersey='64';
 SELECT id INTO STRICT team FROM public.teams WHERE slug=b||'-team-a1' AND organization_id=org;
 SELECT count(*) INTO original_count FROM public.sessions WHERE player_id=player;
 FOR r IN SELECT * FROM (VALUES ('club.admin.a',true,55::numeric,'approved'),('manager.a1',true,56::numeric,'approved'),('coach.a1',true,57::numeric,'approved'),('parent.a1',false,58::numeric,'pending')) v(account,official,value,expected) LOOP
 SELECT id INTO STRICT u FROM auth.users WHERE email=b||'.'||r.account||'@example.com';
 s:=gen_random_uuid(); INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal,not_after) VALUES(s,u,now(),now(),'aal1',now()+interval '5 minutes');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',s,'role','authenticated','aal','aal1')::text,true);
 SET LOCAL ROLE authenticated;
 IF jsonb_array_length(public.sdl_004_pilot_workspace()->'protocols')<>6 THEN RAISE EXCEPTION 'Catalog failure %',r.account; END IF;
 k:=gen_random_uuid();
 j:=public.sdl_004_pilot_submit_performance(player,'throw-radar-v1',r.value,CURRENT_DATE,'QA rollback-only test',k,r.official,NULL,NULL);
 IF j->>'status'<>r.expected THEN RAISE EXCEPTION 'Entry failure %',r.account; END IF;
 IF public.sdl_004_pilot_submit_performance(player,'throw-radar-v1',r.value,CURRENT_DATE,'QA rollback-only test',k,r.official,NULL,NULL)<>j THEN RAISE EXCEPTION 'Retry mismatch'; END IF;
 IF r.account='club.admin.a' THEN prior:=(j->>'id')::uuid; END IF;
 IF r.account='parent.a1' THEN pending:=(j->>'id')::uuid; END IF;
 denied:=false; BEGIN PERFORM public.sdl_004_pilot_submit_performance(other_player,'throw-radar-v1',60,CURRENT_DATE,'QA deny',gen_random_uuid(),r.official,NULL,NULL); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'Cross club write allowed'; END IF;
 RESET ROLE;
 END LOOP;
 -- Manager, admin, wrong coach and guardian cannot approve a parent submission.
 FOR r IN SELECT * FROM (VALUES('manager.a1'),('club.admin.a'),('coach.a2'),('parent.a1'),('club.admin.b'),('unrelated.user')) v(account) LOOP
 SELECT id INTO STRICT u FROM auth.users WHERE email=b||'.'||r.account||'@example.com';
 s:=gen_random_uuid(); INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal,not_after) VALUES(s,u,now(),now(),'aal1',now()+interval '5 minutes');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',s,'role','authenticated','aal','aal1')::text,true);
 SET LOCAL ROLE authenticated;
 denied:=false; BEGIN PERFORM public.sdl_004_pilot_review_performance(pending,'approved','QA deny',1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'Unauthorized review %',r.account; END IF;
 IF r.account IN ('coach.a2','club.admin.b','unrelated.user') THEN
 denied:=false; BEGIN PERFORM public.sdl_004_pilot_performance(player,NULL,'all'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'Unauthorized history %',r.account; END IF; END IF;
 RESET ROLE;
 END LOOP;
 SELECT id INTO STRICT u FROM auth.users WHERE email=b||'.coach.a1@example.com';
 s:=gen_random_uuid();INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal,not_after) VALUES(s,u,now(),now(),'aal1',now()+interval '5 minutes');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',s,'role','authenticated','aal','aal1')::text,true);
 SET LOCAL ROLE authenticated;
 PERFORM public.sdl_004_pilot_review_performance(pending,'approved','',1);
 denied:=false; BEGIN PERFORM public.sdl_004_pilot_submit_performance(player,'throw-radar-v1',54,CURRENT_DATE,'QA bypass',gen_random_uuid(),true,NULL,prior); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'Correction bypass accepted'; END IF;
 denied:=false; BEGIN PERFORM public.sdl_v5_correct_official(prior,'throw-radar-v1',54,CURRENT_DATE,'QA blank reason',gen_random_uuid(),' ',NULL); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'Blank reason accepted'; END IF;
 denied:=false; BEGIN PERFORM sdl_rbac_v5.submit_performance_core(player,'throw-radar-v1',54,CURRENT_DATE,'QA private bypass',gen_random_uuid(),true,NULL,prior,'reason'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'Private core callable'; END IF;
 k:=gen_random_uuid();j:=public.sdl_v5_correct_official(prior,'throw-radar-v1',54,CURRENT_DATE,'QA correction evidence',k,'QA calibration correction',NULL); corrected:=(j->>'id')::uuid;
 IF public.sdl_v5_correct_official(prior,'throw-radar-v1',54,CURRENT_DATE,'QA correction evidence',k,'QA calibration correction',NULL)<>j THEN RAISE EXCEPTION 'Correction retry mismatch'; END IF;
 denied:=false; BEGIN PERFORM public.sdl_v5_correct_official(prior,'throw-radar-v1',54,CURRENT_DATE,'QA correction evidence',k,'Changed reason',NULL); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'Changed reason accepted'; END IF;
 denied:=false; BEGIN PERFORM public.sdl_v5_correct_official(prior,'throw-radar-v1',53,CURRENT_DATE,'QA stale',gen_random_uuid(),'QA stale',NULL); EXCEPTION WHEN invalid_parameter_value OR SQLSTATE 'PT409' THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'Stale correction accepted'; END IF;
 RESET ROLE;
 SELECT session_id INTO STRICT old_session FROM public.sdl_performance_submissions WHERE id=prior AND superseded_by=corrected;
 SELECT session_id INTO STRICT new_session FROM public.sdl_performance_submissions WHERE id=corrected AND supersedes=prior;
 IF NOT EXISTS(SELECT 1 FROM public.sessions WHERE id=old_session AND throwing_velo=55) OR NOT EXISTS(SELECT 1 FROM public.sessions WHERE id=new_session AND throwing_velo=54) THEN RAISE EXCEPTION 'Original or corrected data lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sdl_official_statistics WHERE session_id=old_session AND invalidated_at IS NOT NULL) OR NOT EXISTS(SELECT 1 FROM public.sdl_official_statistics WHERE session_id=new_session AND invalidated_at IS NULL) THEN RAISE EXCEPTION 'Official invalidation failure'; END IF;
 IF (SELECT count(*) FROM sdl_rbac_v5.events WHERE target_id=corrected AND action='official_correction' AND reason='QA calibration correction')<>1 THEN RAISE EXCEPTION 'Audit reason missing or duplicate'; END IF;
 SET LOCAL ROLE authenticated;
 IF EXISTS(SELECT 1 FROM public.sdl_004_pilot_coach_statistics(player) WHERE id=old_session) OR NOT EXISTS(SELECT 1 FROM public.sdl_004_pilot_coach_statistics(player) WHERE id=new_session AND throwing_velo=54) THEN RAISE EXCEPTION 'Coach chart incorrect'; END IF;
 IF EXISTS(SELECT 1 FROM public.sdl_v5_private_statistics(player,NULL,200) WHERE id=old_session) OR NOT EXISTS(SELECT 1 FROM public.sdl_v5_private_statistics(player,NULL,200) WHERE id=new_session AND throwing_velo=54) THEN RAISE EXCEPTION 'V5 chart incorrect'; END IF;
 IF EXISTS(SELECT 1 FROM public.sdl_v5_export_statistics('player',player,NULL,200) WHERE metric='throwing_velo' AND value=55) OR NOT EXISTS(SELECT 1 FROM public.sdl_v5_export_statistics('player',player,NULL,200) WHERE metric='throwing_velo' AND value=54) THEN RAISE EXCEPTION 'Official export incorrect'; END IF;
 h:=public.sdl_004_pilot_performance(player,NULL,'all');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(h) x CROSS JOIN LATERAL jsonb_array_elements(x->'history') e WHERE x->>'id'=corrected::text AND e->>'action'='official_correction' AND e->'details'->>'reason'='QA calibration correction') THEN RAISE EXCEPTION 'Coach history reason missing'; END IF;
 RESET ROLE;
 SELECT id INTO STRICT u FROM auth.users WHERE email=b||'.parent.a1@example.com';
 s:=gen_random_uuid(); INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal,not_after) VALUES(s,u,now(),now(),'aal1',now()+interval '5 minutes');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',s,'role','authenticated','aal','aal1')::text,true);
 SET LOCAL ROLE authenticated;
 IF EXISTS(SELECT 1 FROM public.sdl_004_player_statistics(player) WHERE id=old_session) OR NOT EXISTS(SELECT 1 FROM public.sdl_004_player_statistics(player) WHERE id=new_session AND throwing_velo=54) THEN RAISE EXCEPTION 'Guardian chart incorrect'; END IF;
 h:=public.sdl_004_pilot_performance(player,NULL,'all');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(h) x CROSS JOIN LATERAL jsonb_array_elements(x->'history') e WHERE x->>'id'=corrected::text AND e->'details'->>'reason'='QA calibration correction') THEN RAISE EXCEPTION 'Guardian history reason missing'; END IF;
 pending:=(public.sdl_004_pilot_submit_performance(player,'throw-radar-v1',52,CURRENT_DATE,'QA guardian correction proposal',gen_random_uuid(),false,NULL,corrected)->>'id')::uuid;
 RESET ROLE;
 SELECT id INTO STRICT u FROM auth.users WHERE email=b||'.coach.a1@example.com';
 s:=gen_random_uuid(); INSERT INTO auth.sessions(id,user_id,created_at,updated_at,aal,not_after) VALUES(s,u,now(),now(),'aal1',now()+interval '5 minutes');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'session_id',s,'role','authenticated','aal','aal1')::text,true);
 SET LOCAL ROLE authenticated;
 denied:=false; BEGIN PERFORM public.sdl_004_pilot_review_performance(pending,'approved',' ',1); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END; IF NOT denied THEN RAISE EXCEPTION 'Reasonless parent correction approved'; END IF;
 PERFORM public.sdl_004_pilot_review_performance(pending,'approved','QA reviewed correction reason',1);
 RESET ROLE;
 IF NOT EXISTS(SELECT 1 FROM sdl_rbac_v5.events WHERE target_id=pending AND action='official_correction' AND reason='QA reviewed correction reason') THEN RAISE EXCEPTION 'Reviewed correction audit missing'; END IF;
 IF (SELECT count(*) FROM public.sessions WHERE player_id=player)<>original_count+6 THEN RAISE EXCEPTION 'Unexpected session count'; END IF;
END $test$;
