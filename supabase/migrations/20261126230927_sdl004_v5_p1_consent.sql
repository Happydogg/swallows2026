BEGIN;
CREATE TABLE sdl_rbac_v5.guardian_objections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 athlete_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 enrollment_id uuid NOT NULL REFERENCES public.sdl_club_enrollments(id),
 generation uuid NOT NULL,
 guardian_id uuid NOT NULL REFERENCES public.profiles(id),
 category text NOT NULL CHECK(category IN ('statistics','video')),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(enrollment_id,generation,guardian_id,category,recorded_at)
);
CREATE INDEX ON sdl_rbac_v5.guardian_objections(athlete_id,organization_id,category);
CREATE TABLE sdl_rbac_v5.objection_resolutions (
 objection_id uuid PRIMARY KEY REFERENCES sdl_rbac_v5.guardian_objections(id),
 verification_ref text NOT NULL CHECK(length(btrim(verification_ref)) BETWEEN 1 AND 500),
 resolved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sdl_rbac_v5.reviewed_consent_expansions (
 category text NOT NULL CHECK(category IN ('statistics','video')),
 receipt_id uuid NOT NULL,
 enrollment_generation uuid NOT NULL,
 approved_metrics text[] NOT NULL DEFAULT '{}',
 review_ref text NOT NULL CHECK(length(btrim(review_ref)) BETWEEN 1 AND 500),
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(category,receipt_id),
 CHECK(category='statistics' OR cardinality(approved_metrics)=0)
);
ALTER TABLE sdl_rbac_v5.guardian_objections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdl_rbac_v5.objection_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdl_rbac_v5.reviewed_consent_expansions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sdl_rbac_v5.guardian_objections,sdl_rbac_v5.objection_resolutions,sdl_rbac_v5.reviewed_consent_expansions FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_objection BEFORE UPDATE OR DELETE OR TRUNCATE ON sdl_rbac_v5.guardian_objections
 FOR EACH STATEMENT EXECUTE FUNCTION sdl_rbac_v5.keep_event();
CREATE TRIGGER immutable_resolution BEFORE UPDATE OR DELETE OR TRUNCATE ON sdl_rbac_v5.objection_resolutions
 FOR EACH STATEMENT EXECUTE FUNCTION sdl_rbac_v5.keep_event();

-- Preserve existing withdrawal evidence. Enrollment generation rollover does
-- not erase an unresolved objection in the same club.
INSERT INTO sdl_rbac_v5.guardian_objections(athlete_id,organization_id,enrollment_id,generation,guardian_id,category,recorded_at)
 SELECT e.athlete_id,e.organization_id,p.enrollment_id,p.generation,p.guardian,p.category,p.changed_at
 FROM sdl_rbac_v5.preferences p JOIN public.sdl_club_enrollments e ON e.id=p.enrollment_id WHERE NOT p.accepted;

CREATE FUNCTION sdl_rbac_v5.resolve_objection(p_objection uuid,p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE objection sdl_rbac_v5.guardian_objections;
BEGIN
 SELECT * INTO STRICT objection FROM sdl_rbac_v5.guardian_objections WHERE id=p_objection FOR UPDATE;
 INSERT INTO sdl_rbac_v5.objection_resolutions VALUES(p_objection,p_reference,now());
 INSERT INTO sdl_rbac_v5.events(action,organization_id,target_id,reason)
 VALUES('guardian_objection_resolved',objection.organization_id,p_objection,'Independently verified resolution');
END;
$$;
CREATE FUNCTION sdl_rbac_v5.has_unresolved_objection(p_athlete uuid,p_club uuid,p_category text)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM sdl_rbac_v5.guardian_objections o
 WHERE o.athlete_id=p_athlete AND o.organization_id=p_club AND o.category=p_category
 AND NOT EXISTS(SELECT 1 FROM sdl_rbac_v5.objection_resolutions r WHERE r.objection_id=o.id));
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.resolve_objection(uuid,text),
 sdl_rbac_v5.has_unresolved_objection(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION sdl_rbac_v5.record_preference(e uuid,g uuid,c text,decision boolean,metrics text[])
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF decision AND NOT EXISTS(SELECT 1 FROM public.sdl_club_enrollments en JOIN public.players p
 ON p.athlete_id=en.athlete_id AND p.organization_id=en.organization_id WHERE en.id=e AND sdl_rbac_v5.guardian_participates(auth.uid(),p.id))
 THEN RAISE EXCEPTION 'Participation restricted' USING ERRCODE='42501'; END IF;
 IF NOT decision THEN
 INSERT INTO sdl_rbac_v5.guardian_objections(athlete_id,organization_id,enrollment_id,generation,guardian_id,category)
 SELECT athlete_id,organization_id,id,g,auth.uid(),c FROM public.sdl_club_enrollments WHERE id=e
 ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO sdl_rbac_v5.preferences(enrollment_id,generation,guardian,category,accepted,legacy_metrics)
 VALUES(e,g,auth.uid(),c,decision,metrics)
 ON CONFLICT(enrollment_id,generation,category,guardian) DO UPDATE SET
 accepted=EXCLUDED.accepted,legacy_metrics=EXCLUDED.legacy_metrics,changed_at=now();
 INSERT INTO sdl_rbac_v5.events(actor,organization_id,target_id,action,reason)
 SELECT auth.uid(),organization_id,e,c||CASE WHEN decision THEN '_accepted' ELSE '_withdrawn' END,'Guardian preference'
 FROM public.sdl_club_enrollments WHERE id=e;
END;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_active_club_consent(p_enrollment uuid,p_generation uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id FROM public.sdl_club_enrollments e JOIN public.sdl_club_consents c
 ON c.enrollment_id=e.id AND c.enrollment_generation=e.generation
 JOIN public.organizations o ON o.id=e.organization_id
 WHERE e.id=p_enrollment AND e.generation=p_generation AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()
 AND c.athlete_id=e.athlete_id AND c.organization_id=e.organization_id AND c.withdrawn_at IS NULL AND c.invalidated_at IS NULL
 AND o.status='active' AND public.sdl_004_guardian_athlete(c.guardian_id,e.athlete_id) AND NOT sdl_rbac_v5.has_unresolved_objection(e.athlete_id,e.organization_id,'video') AND NOT EXISTS(SELECT 1 FROM sdl_rbac_v5.preferences p WHERE p.enrollment_id=e.id AND p.generation=e.generation
 AND p.category='video' AND NOT p.accepted) LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.sdl_004_statistics_consent(p_enrollment uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id FROM public.sdl_club_enrollments e JOIN public.sdl_statistic_consents c
 ON c.enrollment_id=e.id AND c.enrollment_generation=e.generation
 JOIN public.organizations o ON o.id=e.organization_id AND o.status='active'
 WHERE e.id=p_enrollment AND e.status='active' AND e.ended_at IS NULL AND e.started_at<=now()
 AND c.withdrawn_at IS NULL AND c.invalidated_at IS NULL
 AND public.sdl_004_guardian_athlete(c.guardian_id,e.athlete_id)
 AND NOT sdl_rbac_v5.has_unresolved_objection(e.athlete_id,e.organization_id,'statistics') AND NOT EXISTS(SELECT 1 FROM sdl_rbac_v5.preferences p WHERE p.enrollment_id=e.id AND p.generation=e.generation AND p.category='statistics'
 AND (NOT p.accepted OR (p.legacy_metrics IS NOT NULL AND (c.policy_version='baseball-sessions-v5' OR NOT c.metrics <@ p.legacy_metrics))));
$$;
CREATE FUNCTION sdl_rbac_v5.consent_review_inventory()
RETURNS TABLE(category text,receipt_id uuid,classification text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH receipts AS (
   SELECT 'statistics' AS kind,id,enrollment_id,enrollment_generation,guardian_id,withdrawn_at,invalidated_at
   FROM public.sdl_statistic_consents
   UNION ALL
   SELECT 'video',id,enrollment_id,enrollment_generation,guardian_id,withdrawn_at,invalidated_at
   FROM public.sdl_club_consents
 )
 SELECT c.kind,c.id,CASE
 WHEN c.withdrawn_at IS NOT NULL OR c.invalidated_at IS NOT NULL OR e.status<>'active'
 OR e.ended_at IS NOT NULL OR e.started_at>now() OR e.generation<>c.enrollment_generation
 OR NOT public.sdl_004_guardian_athlete(c.guardian_id,e.athlete_id)
 OR sdl_rbac_v5.has_unresolved_objection(e.athlete_id,e.organization_id,c.kind) THEN 'ineligible'
 WHEN x.receipt_id IS NOT NULL THEN 'reviewed_scope'
 ELSE 'needs_privacy_review' END
 FROM receipts c JOIN public.sdl_club_enrollments e ON e.id=c.enrollment_id
 LEFT JOIN sdl_rbac_v5.reviewed_consent_expansions x ON x.category=c.kind AND x.receipt_id=c.id
 AND x.enrollment_generation=c.enrollment_generation;
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.consent_review_inventory() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION sdl_rbac_v5.audit_expansion_review() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO sdl_rbac_v5.events(action,target_id,reason)
 VALUES('consent_expansion_reviewed',NEW.receipt_id,'Reviewed legacy scope evidence');
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.audit_expansion_review() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER audit_expansion_review AFTER INSERT ON sdl_rbac_v5.reviewed_consent_expansions
 FOR EACH ROW EXECUTE FUNCTION sdl_rbac_v5.audit_expansion_review();
CREATE OR REPLACE FUNCTION public.sdl_v5_clubhouse_sessions(p_team uuid,p_after uuid DEFAULT NULL,p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid,player_id uuid,recorded_at date,protocol_id text,metric text,value numeric,unit text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
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
 AND t.id=p_team AND (p_after IS NULL OR a.id>p_after) AND a.invalidated_at IS NULL
 AND public.sdl_004_pilot_profile_approved(p.id) AND a.source_hash=public.sdl_004_statistics_source_hash(a.session_id)
 AND EXISTS(SELECT 1 FROM public.player_team_memberships pm WHERE pm.team_id=t.id AND pm.player_id=p.id
 AND pm.organization_id=t.organization_id AND pm.status='active' AND pm.start_date<=CURRENT_DATE AND pm.end_date IS NULL)
 ORDER BY a.id LIMIT p_limit;
END;
$$;

COMMIT;
