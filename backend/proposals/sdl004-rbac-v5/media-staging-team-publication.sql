-- MEDIA-03B-03: staging-only scoped publication. Keep new public RPCs held until verification.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF (SELECT max(version) FROM supabase_migrations.schema_migrations)<>'20261127141339' OR (SELECT count(*) FROM sdl_rbac_v5.staging_media_fixtures)<>21 OR EXISTS(SELECT 1 FROM public.sdl_video_submissions WHERE cardinality(publication_team_ids)>0) THEN RAISE EXCEPTION 'Publication baseline drift'; END IF;
END;$guard$;
CREATE TABLE sdl_rbac_v5.media_team_publications (
 media_id uuid NOT NULL REFERENCES public.sdl_video_submissions(id),
 team_id uuid NOT NULL REFERENCES public.teams(id),
 assignment_id uuid NOT NULL REFERENCES public.player_team_memberships(id) ON DELETE CASCADE,
 consent_id uuid NOT NULL REFERENCES public.sdl_club_consents(id),
 published_by uuid NOT NULL REFERENCES public.profiles(id),
 published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 PRIMARY KEY(media_id,team_id)
);
ALTER TABLE sdl_rbac_v5.media_team_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sdl_rbac_v5.media_team_publications FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX media_team_publications_team_idx ON sdl_rbac_v5.media_team_publications(team_id,published_at DESC,media_id);
CREATE FUNCTION sdl_rbac_v5.revoke_media_on_assignment_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
BEGIN
 IF TG_OP='UPDATE' AND ROW(OLD.id,OLD.player_id,OLD.team_id,OLD.organization_id,OLD.status,OLD.start_date,OLD.end_date)
 IS NOT DISTINCT FROM ROW(NEW.id,NEW.player_id,NEW.team_id,NEW.organization_id,NEW.status,NEW.start_date,NEW.end_date) THEN RETURN NEW; END IF;
 WITH changed AS(UPDATE sdl_rbac_v5.media_team_publications SET revoked_at=clock_timestamp()
 WHERE assignment_id=OLD.id AND revoked_at IS NULL RETURNING media_id,team_id)
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 SELECT auth.uid(),'media_publication_revoked',OLD.organization_id,OLD.player_id,media_id,'Roster assignment changed' FROM changed;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;$f$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.revoke_media_on_assignment_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER sdl_media_assignment_revocation BEFORE UPDATE OF id,player_id,team_id,organization_id,status,start_date,end_date OR DELETE ON public.player_team_memberships
FOR EACH ROW EXECUTE FUNCTION sdl_rbac_v5.revoke_media_on_assignment_change();
CREATE FUNCTION sdl_rbac_v5.media_team_viewer(p_team uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $f$
 SELECT sdl_rbac_v5.active_actor() AND EXISTS(SELECT 1 FROM public.teams t JOIN public.organizations o ON o.id=t.organization_id
 WHERE t.id=p_team AND t.status='active' AND o.status='active' AND (
 sdl_rbac_v5.is_club_admin(o.id) OR sdl_rbac_v5.has_team_staff_role(t.id,'coach') OR sdl_rbac_v5.has_team_staff_role(t.id,'manager')
 OR (sdl_rbac_v5.guardian_team_allowed(auth.uid(),o.id,t.id) AND EXISTS(
 SELECT 1 FROM public.team_memberships tm JOIN public.athlete_guardians ag ON ag.user_id=tm.user_id AND ag.status='verified'
 JOIN public.players p ON p.athlete_id=ag.athlete_id AND p.organization_id=o.id
 JOIN public.player_team_memberships pm ON pm.player_id=p.id AND pm.organization_id=o.id AND pm.team_id=t.id
 WHERE tm.team_id=t.id AND tm.user_id=auth.uid() AND tm.role='parent' AND tm.status='active' AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=current_date
 AND public.sdl_004_statistics_enrollment(p.id) IS NOT NULL))));
$f$;
CREATE FUNCTION sdl_rbac_v5.media_publishable(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $f$
 SELECT EXISTS(SELECT 1 FROM public.sdl_video_submissions s JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 JOIN public.sdl_media_objects m ON m.id=s.id AND m.player_id=p.id AND m.object_key='pilot/'||p.id::text||'/'||s.id::text||'.mp4'
 JOIN public.sdl_submission_uploads u ON u.id=s.id AND u.completed AND u.clean_start
 WHERE s.id=p_id AND s.clean_start AND s.archived_at IS NULL AND s.status='approved' AND s.reviewed_by IS NOT NULL AND s.reviewed_by<>s.submitted_by
 AND s.reviewed_at IS NOT NULL AND s.subject_scope='single_athlete' AND s.subject_confirmed_by=s.reviewed_by AND s.subject_confirmed_at IS NOT NULL
 AND sdl_rbac_v5.staging_media_fixture(s.player_id,s.enrollment_id,s.enrollment_generation));
$f$;
CREATE FUNCTION sdl_rbac_v5.media_shared_visible(p_id uuid,p_team uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $f$
 SELECT sdl_rbac_v5.media_team_viewer(p_team) AND sdl_rbac_v5.media_publishable(p_id) AND EXISTS(
 SELECT 1 FROM sdl_rbac_v5.media_team_publications sh JOIN public.sdl_video_submissions s ON s.id=sh.media_id
 JOIN public.player_team_memberships pm ON pm.id=sh.assignment_id AND pm.player_id=s.player_id AND pm.organization_id=s.organization_id AND pm.team_id=sh.team_id
 WHERE sh.media_id=p_id AND sh.team_id=p_team AND sh.revoked_at IS NULL AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=current_date
 AND sh.consent_id=sdl_rbac_v5.active_media_share_consent(s.enrollment_id,s.enrollment_generation)
 AND NOT EXISTS(SELECT 1 FROM sdl_rbac_v5.guardian_objections ob WHERE ob.athlete_id=s.athlete_id AND ob.organization_id=s.organization_id AND ob.category='video' AND ob.recorded_at>=sh.published_at));
$f$;
REVOKE ALL ON FUNCTION sdl_rbac_v5.media_team_viewer(uuid),sdl_rbac_v5.media_publishable(uuid),sdl_rbac_v5.media_shared_visible(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.sdl_v5_media_publication_eligibility(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $f$
DECLARE s public.sdl_video_submissions%ROWTYPE; targets jsonb; reason text; c uuid;
BEGIN
 SELECT * INTO s FROM public.sdl_video_submissions WHERE id=p_id;
 IF NOT FOUND OR NOT s.clean_start OR s.archived_at IS NOT NULL OR NOT sdl_rbac_v5.staging_media_fixture(s.player_id,s.enrollment_id,s.enrollment_generation)
 OR NOT public.sdl_004_submission_can_review(s.player_id) THEN RAISE EXCEPTION 'Publication access denied' USING ERRCODE='42501'; END IF;
 c:=sdl_rbac_v5.active_media_share_consent(s.enrollment_id,s.enrollment_generation);
 SELECT coalesce(jsonb_agg(jsonb_build_object('team_id',t.id,'team_name',t.name,'published',EXISTS(SELECT 1 FROM sdl_rbac_v5.media_team_publications sh WHERE sh.media_id=s.id AND sh.team_id=t.id AND sh.revoked_at IS NULL),'visible',sdl_rbac_v5.media_shared_visible(s.id,t.id)) ORDER BY t.name,t.id),'[]'::jsonb) INTO targets
 FROM public.teams t WHERE t.organization_id=s.organization_id AND (sdl_rbac_v5.has_player_role(s.player_id,'club_admin') OR sdl_rbac_v5.has_team_staff_role(t.id,'coach'))
 AND ((t.status='active' AND EXISTS(SELECT 1 FROM public.player_team_memberships pm WHERE pm.player_id=s.player_id AND pm.team_id=t.id AND pm.organization_id=s.organization_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=current_date))
 OR t.id=ANY(s.publication_team_ids));
 reason:=CASE WHEN s.status<>'approved' OR s.reviewed_by IS NULL THEN 'approved_required' WHEN NOT sdl_rbac_v5.media_publishable(s.id) THEN 'subject_required' WHEN c IS NULL THEN 'consent_required'
 WHEN NOT EXISTS(SELECT 1 FROM public.player_team_memberships pm JOIN public.teams t ON t.id=pm.team_id AND t.status='active' WHERE pm.player_id=s.player_id AND pm.organization_id=s.organization_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=current_date AND (sdl_rbac_v5.has_player_role(s.player_id,'club_admin') OR sdl_rbac_v5.has_team_staff_role(t.id,'coach'))) THEN 'no_current_team' ELSE 'eligible' END;
 RETURN jsonb_build_object('eligible',reason='eligible','reason_code',reason,'targets',targets);
END;$f$;

CREATE FUNCTION public.sdl_v5_set_media_publication(p_id uuid,p_team uuid,p_publish boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE s public.sdl_video_submissions%ROWTYPE; a public.player_team_memberships%ROWTYPE; c uuid;
BEGIN
 IF p_publish IS NULL OR p_team IS NULL THEN RAISE EXCEPTION 'Invalid publication decision' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.sdl_video_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.clean_start IS DISTINCT FROM true OR s.archived_at IS NOT NULL OR NOT sdl_rbac_v5.staging_media_fixture(s.player_id,s.enrollment_id,s.enrollment_generation)
 OR NOT sdl_rbac_v5.active_actor() OR NOT EXISTS(SELECT 1 FROM public.teams t WHERE t.id=p_team AND t.organization_id=s.organization_id)
 OR NOT(sdl_rbac_v5.has_player_role(s.player_id,'club_admin') OR (sdl_rbac_v5.has_player_role(s.player_id,'coach') AND sdl_rbac_v5.has_team_staff_role(p_team,'coach'))) THEN RAISE EXCEPTION 'Publication access denied' USING ERRCODE='42501'; END IF;
 IF p_publish THEN
  IF NOT sdl_rbac_v5.media_publishable(s.id) THEN RAISE EXCEPTION 'Independent approval and subject confirmation required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.sdl_club_enrollments WHERE id=s.enrollment_id FOR SHARE;
  SELECT * INTO a FROM public.player_team_memberships pm WHERE pm.player_id=s.player_id AND pm.team_id=p_team AND pm.organization_id=s.organization_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=current_date FOR SHARE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.teams WHERE id=p_team AND organization_id=s.organization_id AND status='active') THEN RAISE EXCEPTION 'Current team required' USING ERRCODE='42501'; END IF;
  c:=sdl_rbac_v5.active_media_share_consent(s.enrollment_id,s.enrollment_generation);
  IF c IS NULL THEN RAISE EXCEPTION 'Current sharing consent required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.sdl_club_consents WHERE id=c FOR SHARE;
  IF sdl_rbac_v5.active_media_share_consent(s.enrollment_id,s.enrollment_generation) IS DISTINCT FROM c THEN RAISE EXCEPTION 'Consent changed' USING ERRCODE='PT409'; END IF;
  INSERT INTO sdl_rbac_v5.media_team_publications(media_id,team_id,assignment_id,consent_id,published_by,published_at,revoked_at)
  VALUES(s.id,p_team,a.id,c,auth.uid(),clock_timestamp(),NULL)
  ON CONFLICT(media_id,team_id) DO UPDATE SET assignment_id=EXCLUDED.assignment_id,consent_id=EXCLUDED.consent_id,published_by=EXCLUDED.published_by,published_at=EXCLUDED.published_at,revoked_at=NULL;
 ELSE
  UPDATE sdl_rbac_v5.media_team_publications SET revoked_at=clock_timestamp() WHERE media_id=s.id AND team_id=p_team AND revoked_at IS NULL;
 END IF;
 UPDATE public.sdl_video_submissions SET publication_team_ids=ARRAY(SELECT sh.team_id FROM sdl_rbac_v5.media_team_publications sh WHERE sh.media_id=s.id AND sh.revoked_at IS NULL),
 publication_consent_id=(SELECT sh.consent_id FROM sdl_rbac_v5.media_team_publications sh WHERE sh.media_id=s.id AND sh.revoked_at IS NULL ORDER BY sh.published_at DESC LIMIT 1)
 WHERE id=s.id;
 INSERT INTO sdl_rbac_v5.events(actor,action,organization_id,player_id,target_id,reason)
 VALUES(auth.uid(),CASE WHEN p_publish THEN 'media_published' ELSE 'media_unpublished' END,s.organization_id,s.player_id,s.id,'Team '||p_team::text);
 RETURN true;
END;$f$;

CREATE FUNCTION public.sdl_v5_shared_media_list(p_team uuid,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $f$
DECLARE rows jsonb;
BEGIN
 IF NOT sdl_rbac_v5.media_team_viewer(p_team) THEN RAISE EXCEPTION 'Team access denied' USING ERRCODE='42501'; END IF;
 IF (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'Invalid cursor' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'category',x.category,'display_name','Player','published_at',x.published_at) ORDER BY x.published_at DESC,x.id DESC),'[]'::jsonb) INTO rows
 FROM (SELECT s.id,s.category,sh.published_at FROM sdl_rbac_v5.media_team_publications sh JOIN public.sdl_video_submissions s ON s.id=sh.media_id
 WHERE sh.team_id=p_team AND (p_before IS NULL OR (sh.published_at,s.id)<(p_before,p_before_id)) AND sdl_rbac_v5.media_shared_visible(s.id,p_team)
 ORDER BY sh.published_at DESC,s.id DESC LIMIT 31) x;
 RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(rows)>30 THEN rows-30 ELSE rows END,
 'next_cursor',CASE WHEN jsonb_array_length(rows)>30 THEN (rows->29->>'published_at')||'|'||(rows->29->>'id') ELSE NULL END);
END;$f$;
CREATE FUNCTION public.sdl_v5_authorize_shared_playback(p_id uuid,p_team uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT sdl_rbac_v5.media_shared_visible(p_id,p_team);
$f$;
REVOKE ALL ON FUNCTION public.sdl_v5_media_publication_eligibility(uuid),public.sdl_v5_set_media_publication(uuid,uuid,boolean),public.sdl_v5_shared_media_list(uuid,timestamptz,uuid),public.sdl_v5_authorize_shared_playback(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve staff/family private playback while published; no team audience added here.
CREATE OR REPLACE FUNCTION sdl_rbac_v5.media_access(p_id uuid, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT p_action='playback' AND sdl_rbac_v5.active_actor() AND EXISTS(
 SELECT 1 FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 JOIN public.sdl_media_objects m ON m.id=s.id AND m.player_id=p.id
 WHERE s.id=p_id AND s.clean_start IS TRUE AND s.archived_at IS NULL
 AND s.subject_scope<>'multiple'
 AND (s.status IN ('approved','pending') OR (s.status='rejected' AND s.rejected_access_until>now()))
 AND sdl_rbac_v5.staging_media_fixture(s.player_id,s.enrollment_id,s.enrollment_generation)
 AND (sdl_rbac_v5.player_role_gate(p.id,'review_video')
 OR sdl_rbac_v5.has_player_role(p.id,'guardian') OR sdl_rbac_v5.platform_allowed('playback')));
$function$;
CREATE OR REPLACE FUNCTION public.sdl_004_submission_contract()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN public.sdl_004_session_active() THEN jsonb_build_object('rbacVersion',5,'mediaRevision','v5.1-clean-start','mediaReviewRevision','independent-review-v1','mediaConsentRevision','sdl004-clubhouse-view-download-v2','mediaPublicationRevision','team-publication-v1','revision','sdl004-club-enrollment-v2','enrollmentAdmin',true,'clubhouseRoster',true,'clubhouseLeaderboard',true,'parentStatistics',true,'statisticsConsent',true,'pilotWorkflow','sdl004-final-pilot-v1') ELSE NULL END;
$function$;
COMMIT;
