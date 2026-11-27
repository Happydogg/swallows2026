-- Synthetic staging publication activation; actual v2 consent verified first.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $guard$
BEGIN
 IF (SELECT max(version) FROM supabase_migrations.schema_migrations)<>'20261127141823'
 OR (SELECT count(*) FROM sdl_rbac_v5.staging_media_fixtures)<>21
 OR EXISTS(SELECT 1 FROM sdl_rbac_v5.media_team_publications)
 OR (SELECT count(*) FROM public.sdl_video_submissions s JOIN public.players p ON p.id=s.player_id JOIN public.organizations o ON o.id=s.organization_id
 JOIN public.sdl_club_consents c ON c.id=sdl_rbac_v5.active_media_share_consent(s.enrollment_id,s.enrollment_generation)
 WHERE p.preferred_name='QA Player A1-2' AND o.slug='sdlqa-20261127-131024-puohl0y-club-a' AND sdl_rbac_v5.media_publishable(s.id)
 AND EXISTS(SELECT 1 FROM public.sdl_club_consent_events ev WHERE ev.consent_id=c.id AND ev.actor=c.guardian_id AND ev.action='accepted' AND ev.details->>'view'='true' AND ev.details->>'download'='true' AND ev.details->>'synthetic_fixture'='true'))<>1
 THEN RAISE EXCEPTION 'Actual consent or staging baseline not verified'; END IF;
END;$guard$;
GRANT EXECUTE ON FUNCTION public.sdl_v5_media_publication_eligibility(uuid),public.sdl_v5_set_media_publication(uuid,uuid,boolean),public.sdl_v5_shared_media_list(uuid,timestamptz,uuid),public.sdl_v5_authorize_shared_playback(uuid,uuid) TO authenticated;
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('sdl_v5_media_publication_eligibility','sdl_v5_set_media_publication','sdl_v5_shared_media_list','sdl_v5_authorize_shared_playback') AND (has_function_privilege('anon',oid,'execute') OR has_function_privilege('service_role',oid,'execute')))
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('sdl_v5_authorize_download','sdl_004_publish_submission','sdl_004_clubhouse_videos','sdl_004_clubhouse_visible') AND (has_function_privilege('authenticated',oid,'execute') OR has_function_privilege('anon',oid,'execute') OR has_function_privilege('service_role',oid,'execute')))
 THEN RAISE EXCEPTION 'Unexpected media ACL'; END IF;
END;$verify$;
COMMIT;
