-- MEDIA-03B-06: staging fixture-only read model, no mutation or new table grants.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$ BEGIN
 IF (SELECT max(version) FROM supabase_migrations.schema_migrations)<>'20261127142528' OR (SELECT count(*) FROM sdl_rbac_v5.staging_media_fixtures)<>21 THEN RAISE EXCEPTION 'Staging baseline drift'; END IF;
END; $guard$;

CREATE FUNCTION public.sdl_v5_video_review_inbox(
 p_role text,p_organization uuid DEFAULT NULL,p_scope_team uuid DEFAULT NULL,
 p_team uuid DEFAULT NULL,p_player uuid DEFAULT NULL,p_category text DEFAULT NULL,
 p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_limit integer DEFAULT 30,
 p_count_only boolean DEFAULT false,p_media uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $f$
DECLARE result jsonb;
BEGIN
 IF NOT sdl_rbac_v5.active_actor() OR p_role IS NULL OR p_role NOT IN ('coach','club_admin') THEN RAISE EXCEPTION 'Review scope denied' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>30 OR p_count_only IS NULL
 OR (p_category IS NOT NULL AND p_category NOT IN ('pitching','batting','throwing'))
 OR ((p_before IS NULL)<>(p_before_id IS NULL))
 OR (p_count_only AND (p_team IS NOT NULL OR p_player IS NOT NULL OR p_category IS NOT NULL OR p_before IS NOT NULL OR p_media IS NOT NULL))
 OR (p_media IS NOT NULL AND p_before IS NOT NULL)
 THEN RAISE EXCEPTION 'Invalid review filters' USING ERRCODE='22023'; END IF;
 -- A dual-role user cannot use their other role to expand the chosen workspace.
 IF NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.status='active'
 AND (p_organization IS NULL OR o.id=p_organization)
 AND ((p_role='club_admin' AND sdl_rbac_v5.is_club_admin(o.id))
 OR (p_role='coach' AND EXISTS(SELECT 1 FROM public.teams t WHERE t.organization_id=o.id AND sdl_rbac_v5.has_team_staff_role(t.id,'coach')))))
 THEN RAISE EXCEPTION 'Review scope denied' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY[p_scope_team,p_team]) AS x(id) WHERE x.id IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM public.teams t JOIN public.organizations o ON o.id=t.organization_id AND o.status='active'
 WHERE t.id=x.id AND t.status='active' AND (p_organization IS NULL OR o.id=p_organization)
 AND (p_scope_team IS NULL OR t.id=p_scope_team)
 AND CASE WHEN p_role='club_admin' THEN sdl_rbac_v5.is_club_admin(o.id) ELSE sdl_rbac_v5.has_team_staff_role(t.id,'coach') END))
 THEN RAISE EXCEPTION 'Review scope denied' USING ERRCODE='42501'; END IF;

 WITH scoped AS MATERIALIZED (
 SELECT s.id,s.player_id,s.category,s.created_at,s.source_kind,p.preferred_name AS player_label,
        p.organization_id,
        COALESCE(ta.ids,ARRAY[]::uuid[]) AS team_ids,
        ta.names AS team_names
 FROM public.sdl_video_submissions s
 JOIN public.players p ON p.id=s.player_id AND p.athlete_id=s.athlete_id AND p.organization_id=s.organization_id
 JOIN LATERAL (
 SELECT array_agg(t.id ORDER BY t.id) ids,array_agg(t.name ORDER BY t.id) names
 FROM (SELECT DISTINCT t.id,t.name FROM public.player_team_memberships pm JOIN public.teams t ON t.id=pm.team_id AND t.organization_id=p.organization_id AND t.status='active'
 WHERE pm.player_id=p.id AND pm.organization_id=p.organization_id AND pm.status='active' AND pm.end_date IS NULL AND pm.start_date<=current_date
 AND (p_scope_team IS NULL OR t.id=p_scope_team)
 AND (p_role='club_admin' OR sdl_rbac_v5.has_team_staff_role(t.id,'coach'))) t
 ) ta ON true
 WHERE s.clean_start IS TRUE AND s.archived_at IS NULL AND s.status='pending' AND s.reviewed_by IS NULL
 AND s.submitted_by<>auth.uid() AND cardinality(s.publication_team_ids)=0
 AND (p_organization IS NULL OR p.organization_id=p_organization)
 AND sdl_rbac_v5.has_player_role(p.id,p_role)
 AND (p_role='club_admin' AND p_scope_team IS NULL OR cardinality(ta.ids)>0)
 AND public.sdl_004_submission_can_review(p.id) AND sdl_rbac_v5.media_access(s.id,'playback')
 AND sdl_rbac_v5.staging_media_fixture(s.player_id,s.enrollment_id,s.enrollment_generation)
 ), filtered AS MATERIALIZED (
 SELECT * FROM scoped s WHERE (p_team IS NULL OR p_team=ANY(s.team_ids)) AND (p_player IS NULL OR s.player_id=p_player)
 AND (p_category IS NULL OR s.category=p_category) AND (p_media IS NULL OR s.id=p_media)
 ), page AS MATERIALIZED (
 SELECT * FROM filtered s WHERE NOT p_count_only AND (p_before IS NULL OR (s.created_at,s.id)<(p_before,p_before_id))
 ORDER BY s.created_at DESC,s.id DESC LIMIT p_limit+1
 ), payload AS (
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',s.id,'playerId',s.player_id,'playerLabel',coalesce(s.player_label,'Player'),
 'teamId',coalesce(p_team,s.team_ids[1]),'teamLabel',coalesce(s.team_names[array_position(s.team_ids,coalesce(p_team,s.team_ids[1]))],'Unassigned'),
 'teamIds',s.team_ids,'category',s.category,'status','pending','can_review',true,'createdAt',s.created_at,'sourceKind',s.source_kind
 ) ORDER BY s.created_at DESC,s.id DESC),'[]'::jsonb) AS rows FROM page s
 )
 SELECT jsonb_build_object('revision','review-inbox-v1','status','ready','complete',true,
 'pendingTotal',(SELECT count(*) FROM scoped),
 'filteredTotal',CASE WHEN p_count_only THEN NULL ELSE (SELECT count(*) FROM filtered) END,
 'items',CASE WHEN jsonb_array_length(payload.rows)>p_limit THEN payload.rows-p_limit ELSE payload.rows END,
 'nextCursor',CASE WHEN jsonb_array_length(payload.rows)>p_limit THEN (payload.rows->(p_limit-1)->>'createdAt')||'|'||(payload.rows->(p_limit-1)->>'id') ELSE NULL END,
 'teams',CASE WHEN p_count_only THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'label',t.name) ORDER BY t.name,t.id)
 FROM public.teams t WHERE EXISTS(SELECT 1 FROM scoped s WHERE t.id=ANY(s.team_ids))),'[]'::jsonb) END,
 'players',CASE WHEN p_count_only THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.player_id,'label',coalesce(x.player_label,'Player'),'teamIds',x.team_ids,'teamId',x.team_ids[1]) ORDER BY x.player_label,x.player_id)
 FROM (SELECT DISTINCT player_id,player_label,team_ids FROM scoped) x),'[]'::jsonb) END
 ) INTO result FROM payload;
 RETURN result;
END;$f$;
REVOKE ALL ON FUNCTION public.sdl_v5_video_review_inbox(text,uuid,uuid,uuid,uuid,text,timestamptz,uuid,integer,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.sdl_004_submission_contract()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN public.sdl_004_session_active() THEN jsonb_build_object('rbacVersion',5,'mediaRevision','v5.1-clean-start','mediaReviewRevision','independent-review-v1','mediaInboxRevision','review-inbox-v1','mediaConsentRevision','sdl004-clubhouse-view-download-v2','mediaPublicationRevision','team-publication-v1','revision','sdl004-club-enrollment-v2','enrollmentAdmin',true,'clubhouseRoster',true,'clubhouseLeaderboard',true,'parentStatistics',true,'statisticsConsent',true,'pilotWorkflow','sdl004-final-pilot-v1') ELSE NULL END;
$function$;
COMMIT;
