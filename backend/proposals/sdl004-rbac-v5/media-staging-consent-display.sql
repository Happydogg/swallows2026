BEGIN;
SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN IF (SELECT max(version) FROM supabase_migrations.schema_migrations)<>'20261127141456' THEN RAISE EXCEPTION 'Baseline drift'; END IF; END; $guard$;
CREATE OR REPLACE FUNCTION public.sdl_v5_media_consent_status(p_player uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE p public.players%ROWTYPE; e public.sdl_club_enrollments%ROWTYPE; c public.sdl_club_consents%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.players WHERE id=p_player;
 IF NOT FOUND OR NOT sdl_rbac_v5.active_actor() OR NOT public.sdl_004_guardian_athlete(auth.uid(),p.athlete_id) THEN RAISE EXCEPTION 'Guardian access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.sdl_club_enrollments WHERE id=public.sdl_004_statistics_enrollment(p.id);
 IF NOT FOUND OR NOT sdl_rbac_v5.staging_media_fixture(p.id,e.id,e.generation) THEN RAISE EXCEPTION 'Media fixture unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.sdl_club_consents WHERE id=sdl_rbac_v5.active_media_share_consent(e.id,e.generation);
 RETURN jsonb_build_object('player_id',p.id,'organization_name',(SELECT o.name FROM public.organizations o WHERE o.id=e.organization_id),'enrollment_id',e.id,'generation',e.generation,'policy_version','sdl004-clubhouse-view-download-v2',
 'active',c.id IS NOT NULL,'accepted_at',c.accepted_at,'can_accept',sdl_rbac_v5.guardian_participates(auth.uid(),p.id)
 AND NOT sdl_rbac_v5.has_unresolved_objection(e.athlete_id,e.organization_id,'video') AND NOT EXISTS(SELECT 1 FROM sdl_rbac_v5.preferences pr WHERE pr.enrollment_id=e.id AND pr.generation=e.generation AND pr.category='video' AND NOT pr.accepted AND pr.guardian<>auth.uid()),
 'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('action',x.action,'at',x.created_at,'policy_version',x.policy_version) ORDER BY x.created_at DESC) FROM
 (SELECT CASE WHEN cc.withdrawn_at IS NOT NULL THEN 'withdrawn' WHEN cc.invalidated_at IS NOT NULL THEN 'invalidated' ELSE 'accepted' END action,
 coalesce(cc.withdrawn_at,cc.invalidated_at,cc.accepted_at) created_at,cc.policy_version FROM public.sdl_club_consents cc
 WHERE cc.enrollment_id=e.id AND cc.enrollment_generation=e.generation AND cc.policy_version='sdl004-clubhouse-view-download-v2'
 ORDER BY coalesce(cc.withdrawn_at,cc.invalidated_at,cc.accepted_at) DESC LIMIT 30) x),'[]'::jsonb));
END; $function$;
COMMIT;
