-- Synthetic staging: only explicitly published and currently consented team media.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF (SELECT max(version) FROM supabase_migrations.schema_migrations)<>'20261127144158' OR (SELECT count(*) FROM sdl_rbac_v5.staging_media_fixtures)<>21 THEN RAISE EXCEPTION 'Download baseline drift'; END IF;
END;$guard$;
CREATE FUNCTION public.sdl_v5_authorize_shared_download(p_id uuid,p_team uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE recorded integer;
BEGIN
 -- The same predicate as shared playback, including exact bound v2 receipt.
 -- Audit the authorization, not claimed transfer completion. Direct RPC callers
 -- can request authorization but cannot obtain object keys or bytes here.
 IF NOT sdl_rbac_v5.active_actor() OR p_id IS NULL OR p_team IS NULL THEN RETURN false; END IF;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,team_id,player_id,target_id,reason)
 SELECT auth.uid(),'shared_download_authorized',s.organization_id,sh.team_id,s.player_id,s.id,
 'Option C authorization; consent receipt '||sh.consent_id::text||'; transfer completion not asserted'
 FROM public.sdl_video_submissions s JOIN sdl_rbac_v5.media_team_publications sh ON sh.media_id=s.id AND sh.team_id=p_team
 WHERE s.id=p_id AND sdl_rbac_v5.media_shared_visible(s.id,p_team)
 AND EXISTS(SELECT 1 FROM public.sdl_club_consents c WHERE c.id=sh.consent_id AND c.policy_version='sdl004-clubhouse-view-download-v2'
 AND EXISTS(SELECT 1 FROM public.sdl_club_consent_events ev WHERE ev.consent_id=c.id AND ev.action='accepted' AND ev.actor=c.guardian_id
 AND ev.details->>'view'='true' AND ev.details->>'download'='true' AND ev.details->>'synthetic_fixture'='true'));
 GET DIAGNOSTICS recorded=ROW_COUNT;
 RETURN recorded=1;
END;$f$;
REVOKE ALL ON FUNCTION public.sdl_v5_authorize_shared_download(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.sdl_004_submission_contract()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN public.sdl_004_session_active() THEN jsonb_build_object('rbacVersion',5,'mediaRevision','v5.1-clean-start','mediaReviewRevision','independent-review-v1','mediaInboxRevision','review-inbox-v1','mediaConsentRevision','sdl004-clubhouse-view-download-v2','mediaPublicationRevision','team-publication-v1','mediaDownloadRevision','team-download-v1','revision','sdl004-club-enrollment-v2','enrollmentAdmin',true,'clubhouseRoster',true,'clubhouseLeaderboard',true,'parentStatistics',true,'statisticsConsent',true,'pilotWorkflow','sdl004-final-pilot-v1') ELSE NULL END;
$function$;
COMMIT;
