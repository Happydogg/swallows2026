-- STAGING RELEASE CANDIDATE. Generated with Supabase CLI; not applied.
-- Additive only; requires the existing private-media pilot schema.
BEGIN;
-- An assignment generation prevents same-ID reactivation (including races) from reviving consent.
ALTER TABLE public.player_team_memberships ADD COLUMN sdl_consent_epoch uuid NOT NULL DEFAULT gen_random_uuid();

CREATE TABLE public.sdl_video_submissions (
  id uuid PRIMARY KEY REFERENCES public.sdl_media_objects(id),
  player_id uuid NOT NULL REFERENCES public.players(id),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  category text NOT NULL CHECK (category IN ('pitching','batting','throwing')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  share_with_team boolean NOT NULL DEFAULT false,
  consent_team_ids uuid[] NOT NULL DEFAULT '{}',
  consent_membership_ids uuid[] NOT NULL DEFAULT '{}',
  consent_membership_epochs jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_note text NOT NULL DEFAULT '' CHECK (char_length(review_note) <= 1000),
  history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(history) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.sdl_video_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sdl_video_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sdl_video_submissions TO service_role;
CREATE INDEX ON public.sdl_video_submissions(player_id,created_at DESC);
CREATE INDEX ON public.sdl_video_submissions(submitted_by,created_at DESC);
CREATE INDEX ON public.sdl_video_submissions(player_id,created_at DESC)
  WHERE status='approved' AND share_with_team;

-- SECURITY DEFINER is required only for narrow lookups into deny-by-default
-- tables. All functions have fixed search_path, explicit identity checks and grants.
CREATE FUNCTION public.sdl_004_session_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
   SELECT 1 FROM auth.sessions s WHERE s.user_id=(SELECT auth.uid())
   AND s.id=CASE WHEN auth.jwt()->>'session_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     THEN (auth.jwt()->>'session_id')::uuid END
   AND (s.not_after IS NULL OR s.not_after>now()));
$$;
CREATE FUNCTION public.sdl_004_guardian_for(p_user uuid,p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_user IS NOT NULL AND EXISTS (SELECT 1 FROM public.players p
 JOIN public.athlete_guardians ag ON ag.athlete_id=p.athlete_id
 JOIN public.profiles pr ON pr.id=ag.user_id
 WHERE p.id=p_player AND ag.user_id=p_user AND ag.status='verified' AND pr.status='active');
$$;
CREATE FUNCTION public.sdl_004_coach_for(p_user uuid,p_player uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_user IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.players p JOIN public.player_team_memberships ptm
 ON ptm.player_id=p.id AND ptm.organization_id=p.organization_id
 JOIN public.teams t ON t.id=ptm.team_id AND t.organization_id=ptm.organization_id
 JOIN public.organizations o ON o.id=t.organization_id
 JOIN public.team_memberships tm ON tm.team_id=t.id AND tm.user_id=p_user
 JOIN public.organization_memberships om ON om.organization_id=o.id AND om.user_id=p_user
 JOIN public.profiles pr ON pr.id=p_user
 WHERE p.id=p_player AND pr.status='active' AND o.status='active' AND t.status='active'
 AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE
 AND tm.status='active' AND tm.role='coach' AND om.status='active' AND om.role IN ('staff','admin'));
$$;
CREATE FUNCTION public.sdl_004_submission_can_submit(p_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND (public.sdl_004_guardian_for((SELECT auth.uid()),p_player_id)
 OR public.sdl_004_coach_for((SELECT auth.uid()),p_player_id));
$$;
CREATE FUNCTION public.sdl_004_submission_is_guardian(p_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND public.sdl_004_guardian_for((SELECT auth.uid()),p_player_id);
$$;
CREATE FUNCTION public.sdl_004_submission_can_review(p_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.sdl_004_session_active() AND public.sdl_004_coach_for((SELECT auth.uid()),p_player_id);
$$;

-- Team visibility requires current team membership. Parents must also have a
-- verified linked child actively assigned to that same team/organization.
CREATE FUNCTION public.sdl_004_clubhouse_member(p_team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.sdl_004_session_active() AND EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.organizations o ON o.id=t.organization_id
    JOIN public.team_memberships tm ON tm.team_id=t.id
    JOIN public.profiles pr ON pr.id=tm.user_id
    WHERE t.id=p_team_id AND t.status='active' AND o.status='active'
      AND tm.user_id=(SELECT auth.uid()) AND tm.status='active' AND pr.status='active'
      AND (
        (tm.role='coach' AND EXISTS (SELECT 1 FROM public.organization_memberships om
          WHERE om.organization_id=t.organization_id AND om.user_id=tm.user_id
            AND om.status='active' AND om.role IN ('staff','admin')))
        OR (tm.role='parent' AND EXISTS (SELECT 1 FROM public.athlete_guardians ag
          JOIN public.players child ON child.athlete_id=ag.athlete_id
          JOIN public.player_team_memberships ptm ON ptm.player_id=child.id
            AND ptm.organization_id=child.organization_id
          WHERE ag.user_id=tm.user_id AND ag.status='verified'
            AND ptm.team_id=t.id AND ptm.organization_id=t.organization_id
            AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE))
      )
  );
$$;

CREATE FUNCTION public.sdl_004_submission_can_read(p_submission_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.sdl_004_session_active() AND EXISTS (
    SELECT 1 FROM public.sdl_video_submissions s
    WHERE s.id=p_submission_id AND (
      -- Family visibility is rechecked, never based only on who uploaded.
      (s.submitted_by=(SELECT auth.uid()) AND public.sdl_004_submission_can_submit(s.player_id))
      OR public.sdl_004_submission_can_review(s.player_id)
      OR (s.status='approved' AND s.share_with_team
        -- Consent loses effect if the submitting guardian relationship is revoked.
        AND EXISTS (SELECT 1 FROM public.players p
          JOIN public.athlete_guardians ag ON ag.athlete_id=p.athlete_id
          WHERE p.id=s.player_id AND ag.user_id=s.submitted_by AND ag.status='verified'
          AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=ag.user_id AND pr.status='active'))
        AND EXISTS (SELECT 1 FROM public.player_team_memberships ptm
          JOIN public.players p ON p.id=ptm.player_id AND p.organization_id=ptm.organization_id
 JOIN public.teams consent_team ON consent_team.id=ptm.team_id AND consent_team.organization_id=ptm.organization_id AND consent_team.status='active'
 JOIN public.organizations consent_org ON consent_org.id=ptm.organization_id AND consent_org.status='active'
          WHERE ptm.player_id=s.player_id AND ptm.team_id=ANY(s.consent_team_ids) AND ptm.id=ANY(s.consent_membership_ids) AND s.consent_membership_epochs->>ptm.id::text=ptm.sdl_consent_epoch::text AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE
            AND public.sdl_004_clubhouse_member(ptm.team_id)))
    ));
$$;

CREATE FUNCTION public.sdl_004_list_submissions(p_player_id uuid)
RETURNS TABLE(id uuid,player_id uuid,category text,status text,share_with_team boolean,created_at timestamptz,review_note text,history jsonb,can_consent boolean,consent_team_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT s.id,s.player_id,s.category,s.status,s.share_with_team,s.created_at,s.review_note,s.history,(s.submitted_by=(SELECT auth.uid()) AND public.sdl_004_submission_is_guardian(s.player_id)),s.consent_team_ids
  FROM public.sdl_video_submissions s
  WHERE s.player_id=p_player_id AND (SELECT auth.uid()) IS NOT NULL
    AND ((s.submitted_by=(SELECT auth.uid()) AND public.sdl_004_submission_can_submit(s.player_id))
      OR public.sdl_004_submission_can_review(s.player_id))
  ORDER BY s.created_at DESC LIMIT 30;
$$;

-- Persistent idempotency reservations; only narrowly scoped RPCs are exposed.
CREATE TABLE public.sdl_submission_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id), request_key uuid NOT NULL,
 player_id uuid NOT NULL REFERENCES public.players(id), session_id uuid NOT NULL,
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
 byte_size bigint NOT NULL CHECK (byte_size>0 AND byte_size<=20971520),
 category text NOT NULL CHECK(category IN ('pitching','batting','throwing')),
 share_with_team boolean NOT NULL DEFAULT false,consent_invalidated boolean NOT NULL DEFAULT false,
 consent_team_ids uuid[] NOT NULL DEFAULT '{}',consent_membership_ids uuid[] NOT NULL DEFAULT '{}',consent_membership_epochs jsonb NOT NULL DEFAULT '{}'::jsonb,
 claim uuid NOT NULL, lease_until timestamptz NOT NULL, completed boolean NOT NULL DEFAULT false,
 UNIQUE(user_id,request_key)
);
ALTER TABLE public.sdl_submission_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sdl_submission_uploads FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.sdl_submission_uploads TO service_role;
CREATE INDEX ON public.sdl_submission_uploads(player_id);

CREATE FUNCTION public.sdl_004_reserve_submission(p_player_id uuid,p_request_key uuid,p_claim uuid,
 p_fingerprint text,p_size bigint,p_category text,p_share boolean,p_team_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.sdl_submission_uploads%ROWTYPE; result jsonb;
BEGIN
 IF NOT public.sdl_004_submission_can_submit(p_player_id)
   OR (p_share AND NOT public.sdl_004_submission_is_guardian(p_player_id)) THEN
   RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_share AND (p_team_ids IS NULL OR cardinality(p_team_ids)=0 OR cardinality(p_team_ids)>20
 OR EXISTS(SELECT 1 FROM unnest(p_team_ids) wanted WHERE NOT EXISTS(
 SELECT 1 FROM public.player_team_memberships ptm JOIN public.players p ON p.id=ptm.player_id AND p.organization_id=ptm.organization_id
 JOIN public.teams consent_team ON consent_team.id=ptm.team_id AND consent_team.organization_id=ptm.organization_id AND consent_team.status='active'
 JOIN public.organizations consent_org ON consent_org.id=ptm.organization_id AND consent_org.status='active'
 WHERE p.id=p_player_id AND ptm.team_id=wanted AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE))) THEN
 RAISE EXCEPTION 'Invalid team consent scope' USING ERRCODE='22023'; END IF;
 IF p_claim IS NULL OR p_request_key IS NULL OR p_share IS NULL THEN
   RAISE EXCEPTION 'Invalid upload' USING ERRCODE='22023'; END IF;
 INSERT INTO public.sdl_submission_uploads(user_id,request_key,player_id,session_id,fingerprint,byte_size,category,share_with_team,consent_team_ids,consent_membership_ids,consent_membership_epochs,claim,lease_until)
 VALUES((SELECT auth.uid()),p_request_key,p_player_id,(auth.jwt()->>'session_id')::uuid,p_fingerprint,p_size,p_category,p_share,CASE WHEN p_share THEN p_team_ids ELSE '{}'::uuid[] END,
 ARRAY(SELECT ptm.id FROM public.player_team_memberships ptm JOIN public.players p ON p.id=ptm.player_id AND p.organization_id=ptm.organization_id
 JOIN public.teams consent_team ON consent_team.id=ptm.team_id AND consent_team.organization_id=ptm.organization_id AND consent_team.status='active'
 JOIN public.organizations consent_org ON consent_org.id=ptm.organization_id AND consent_org.status='active' WHERE p.id=p_player_id AND ptm.team_id=ANY(p_team_ids) AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE),coalesce((SELECT jsonb_object_agg(ptm.id::text,ptm.sdl_consent_epoch::text) FROM public.player_team_memberships ptm JOIN public.players p ON p.id=ptm.player_id AND p.organization_id=ptm.organization_id
 JOIN public.teams consent_team ON consent_team.id=ptm.team_id AND consent_team.organization_id=ptm.organization_id AND consent_team.status='active'
 JOIN public.organizations consent_org ON consent_org.id=ptm.organization_id AND consent_org.status='active' WHERE p.id=p_player_id AND ptm.team_id=ANY(p_team_ids) AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE),'{}'::jsonb),p_claim,now()+interval '2 minutes')
 ON CONFLICT(user_id,request_key) DO NOTHING;
 SELECT * INTO r FROM public.sdl_submission_uploads
 WHERE user_id=(SELECT auth.uid()) AND request_key=p_request_key FOR UPDATE;
 IF r.fingerprint<>p_fingerprint OR r.player_id<>p_player_id OR r.byte_size<>p_size
 OR r.category<>p_category OR r.share_with_team<>p_share THEN
 RAISE EXCEPTION 'Idempotency key reused for different upload' USING ERRCODE='PT409'; END IF;
 IF r.completed THEN
   SELECT jsonb_build_object('state','complete','id',s.id,'player_id',s.player_id,'category',s.category,
    'status',s.status,'share_with_team',s.share_with_team) INTO result FROM public.sdl_video_submissions s WHERE s.id=r.id;
   RETURN result;
 END IF;
 IF r.claim<>p_claim AND r.lease_until>now() THEN
 RAISE EXCEPTION 'Upload already in progress' USING ERRCODE='PT409'; END IF;
 UPDATE public.sdl_submission_uploads SET claim=p_claim,lease_until=now()+interval '2 minutes',session_id=(auth.jwt()->>'session_id')::uuid WHERE id=r.id;
 RETURN jsonb_build_object('state','reserved','id',r.id,'object_key','pilot/'||r.player_id::text||'/'||r.id::text||'.mp4');
END;
$$;
CREATE FUNCTION public.sdl_004_finish_submission(p_request_key uuid,p_claim uuid,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.sdl_submission_uploads%ROWTYPE; result jsonb;
BEGIN
 SELECT * INTO r FROM public.sdl_submission_uploads WHERE user_id=p_user_id AND request_key=p_request_key FOR UPDATE;
 IF NOT FOUND OR r.claim<>p_claim THEN RAISE EXCEPTION 'Upload conflict' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=r.session_id AND s.user_id=p_user_id AND (s.not_after IS NULL OR s.not_after>now()))
 OR NOT (public.sdl_004_guardian_for(p_user_id,r.player_id) OR public.sdl_004_coach_for(p_user_id,r.player_id))
 OR (r.share_with_team AND NOT public.sdl_004_guardian_for(p_user_id,r.player_id)) THEN
 RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF NOT r.completed THEN
   IF r.lease_until<=now() THEN RAISE EXCEPTION 'Upload lease expired' USING ERRCODE='PT409'; END IF;
   INSERT INTO public.sdl_media_objects(id,player_id,uploaded_by,object_key,content_type,byte_size)
   VALUES(r.id,r.player_id,p_user_id,'pilot/'||r.player_id::text||'/'||r.id::text||'.mp4','video/mp4',r.byte_size);
   INSERT INTO public.sdl_video_submissions(id,player_id,submitted_by,category,share_with_team,history)
   VALUES(r.id,r.player_id,p_user_id,r.category,r.share_with_team,
   jsonb_build_array(jsonb_build_object('action','submitted','actor',p_user_id,'at',now(),'team_ids',r.consent_team_ids))||CASE WHEN r.consent_invalidated THEN jsonb_build_array(jsonb_build_object('action','consent_invalidated','reason','assignment_changed_during_upload','at',now())) ELSE '[]'::jsonb END);
   UPDATE public.sdl_video_submissions SET consent_team_ids=r.consent_team_ids,consent_membership_ids=r.consent_membership_ids,consent_membership_epochs=r.consent_membership_epochs WHERE id=r.id;
   UPDATE public.sdl_submission_uploads SET completed=true WHERE id=r.id;
 END IF;
 SELECT jsonb_build_object('id',s.id,'player_id',s.player_id,'category',s.category,'status',s.status,'share_with_team',s.share_with_team)
 INTO result FROM public.sdl_video_submissions s WHERE s.id=r.id;
 RETURN result;
END;
$$;

CREATE FUNCTION public.sdl_004_review_submission(p_id uuid,p_decision text,p_note text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.sdl_video_submissions%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_decision NOT IN ('approved','rejected') OR p_decision IS NULL
    OR p_note IS NULL OR char_length(p_note)>1000 THEN RAISE EXCEPTION 'Invalid review'; END IF;
  SELECT * INTO target FROM public.sdl_video_submissions WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.sdl_004_submission_can_review(target.player_id) OR target.submitted_by=(SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF target.status<>'pending' THEN RAISE EXCEPTION 'Already reviewed' USING ERRCODE='PT409'; END IF;
  UPDATE public.sdl_video_submissions SET status=p_decision,review_note=p_note,
    reviewed_at=now(),reviewed_by=(SELECT auth.uid()),
    history=history||jsonb_build_array(jsonb_build_object('action',p_decision,'actor',(SELECT auth.uid()),'at',now(),'note',p_note))
  WHERE id=p_id;
END;
$$;

CREATE FUNCTION public.sdl_004_submission_consent(p_id uuid,p_share boolean,p_team_ids uuid[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.sdl_video_submissions%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.sdl_video_submissions WHERE id=p_id FOR UPDATE;
  IF (SELECT auth.uid()) IS NULL OR NOT FOUND OR target.submitted_by<>(SELECT auth.uid())
    OR p_share IS NULL OR NOT public.sdl_004_submission_is_guardian(target.player_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
 IF p_share AND (p_team_ids IS NULL OR cardinality(p_team_ids)=0 OR cardinality(p_team_ids)>20
 OR EXISTS(SELECT 1 FROM unnest(p_team_ids) wanted WHERE NOT EXISTS(
 SELECT 1 FROM public.player_team_memberships ptm JOIN public.players p ON p.id=ptm.player_id AND p.organization_id=ptm.organization_id
 JOIN public.teams consent_team ON consent_team.id=ptm.team_id AND consent_team.organization_id=ptm.organization_id AND consent_team.status='active'
 JOIN public.organizations consent_org ON consent_org.id=ptm.organization_id AND consent_org.status='active'
 WHERE p.id=target.player_id AND ptm.team_id=wanted AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE))) THEN
 RAISE EXCEPTION 'Invalid team consent scope' USING ERRCODE='22023'; END IF;
  UPDATE public.sdl_video_submissions SET share_with_team=p_share,consent_team_ids=CASE WHEN p_share THEN p_team_ids ELSE '{}'::uuid[] END,
    consent_membership_ids=CASE WHEN p_share THEN ARRAY(SELECT ptm.id FROM public.player_team_memberships ptm JOIN public.players p ON p.id=ptm.player_id AND p.organization_id=ptm.organization_id
 JOIN public.teams consent_team ON consent_team.id=ptm.team_id AND consent_team.organization_id=ptm.organization_id AND consent_team.status='active'
 JOIN public.organizations consent_org ON consent_org.id=ptm.organization_id AND consent_org.status='active' WHERE p.id=target.player_id AND ptm.team_id=ANY(p_team_ids) AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE) ELSE '{}'::uuid[] END,
    consent_membership_epochs=CASE WHEN p_share THEN coalesce((SELECT jsonb_object_agg(ptm.id::text,ptm.sdl_consent_epoch::text) FROM public.player_team_memberships ptm JOIN public.players p ON p.id=ptm.player_id AND p.organization_id=ptm.organization_id
 JOIN public.teams consent_team ON consent_team.id=ptm.team_id AND consent_team.organization_id=ptm.organization_id AND consent_team.status='active'
 JOIN public.organizations consent_org ON consent_org.id=ptm.organization_id AND consent_org.status='active' WHERE p.id=target.player_id AND ptm.team_id=ANY(p_team_ids) AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE),'{}'::jsonb) ELSE '{}'::jsonb END,
    history=history||jsonb_build_array(jsonb_build_object('action','consent','share',p_share,'team_ids',CASE WHEN p_share THEN p_team_ids ELSE '{}'::uuid[] END,'actor',(SELECT auth.uid()),'at',now()))
  WHERE id=p_id;
END;
$$;

CREATE FUNCTION public.sdl_004_clubhouse_videos(p_team_id uuid)
RETURNS TABLE(id uuid,player_id uuid,category text,created_at timestamptz,preferred_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT s.id,s.player_id,s.category,s.created_at,(SELECT p.preferred_name FROM public.players p WHERE p.id=s.player_id) FROM public.sdl_video_submissions s
  WHERE public.sdl_004_clubhouse_member(p_team_id) AND s.status='approved' AND s.share_with_team
    AND public.sdl_004_submission_can_read(s.id)
    AND EXISTS (SELECT 1 FROM public.players owner_player
      JOIN public.athlete_guardians ag ON ag.athlete_id=owner_player.athlete_id
      JOIN public.profiles pr ON pr.id=ag.user_id
      WHERE owner_player.id=s.player_id AND ag.user_id=s.submitted_by AND ag.status='verified' AND pr.status='active')
    AND EXISTS (SELECT 1 FROM public.player_team_memberships ptm
      JOIN public.players p ON p.id=ptm.player_id AND p.organization_id=ptm.organization_id
 JOIN public.teams consent_team ON consent_team.id=ptm.team_id AND consent_team.organization_id=ptm.organization_id AND consent_team.status='active'
 JOIN public.organizations consent_org ON consent_org.id=ptm.organization_id AND consent_org.status='active'
      WHERE ptm.player_id=s.player_id AND ptm.team_id=p_team_id AND ptm.team_id=ANY(s.consent_team_ids) AND ptm.id=ANY(s.consent_membership_ids) AND s.consent_membership_epochs->>ptm.id::text=ptm.sdl_consent_epoch::text AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE)
  ORDER BY s.created_at DESC LIMIT 30;
$$;


CREATE FUNCTION public.sdl_004_workspace_players()
RETURNS TABLE(id uuid,athlete_id uuid,preferred_name text,organization_id uuid,organization_name text,team_id uuid,team_name text,is_guardian boolean,is_coach boolean,can_clubhouse boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id,p.athlete_id,p.preferred_name,p.organization_id,o.name,t.id,t.name,
 public.sdl_004_guardian_for((SELECT auth.uid()),p.id),public.sdl_004_coach_for((SELECT auth.uid()),p.id),public.sdl_004_clubhouse_member(t.id)
 FROM public.players p LEFT JOIN public.organizations o ON o.id=p.organization_id
 LEFT JOIN public.player_team_memberships ptm ON ptm.player_id=p.id AND ptm.organization_id=p.organization_id AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE
 LEFT JOIN public.teams t ON t.id=ptm.team_id AND t.organization_id=p.organization_id AND t.status='active'
 WHERE public.sdl_004_session_active() AND (public.sdl_004_guardian_for((SELECT auth.uid()),p.id)
 OR (public.sdl_004_coach_for((SELECT auth.uid()),p.id) AND EXISTS (SELECT 1 FROM public.team_memberships tm WHERE tm.team_id=t.id AND tm.user_id=(SELECT auth.uid()) AND tm.role='coach' AND tm.status='active')));
$$;
CREATE FUNCTION public.sdl_004_submission_contract()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN public.sdl_004_session_active() THEN jsonb_build_object('revision','sdl004-submissions-v1') ELSE NULL END;
$$;
CREATE FUNCTION public.sdl_004_review_queue(p_team_id uuid,p_status text DEFAULT 'pending')
RETURNS TABLE(id uuid,player_id uuid,preferred_name text,team_id uuid,team_name text,category text,status text,share_with_team boolean,created_at timestamptz,review_note text,history jsonb,can_review boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT s.id,s.player_id,p.preferred_name,t.id,t.name,s.category,s.status,s.share_with_team,s.created_at,s.review_note,s.history,(s.status='pending' AND s.submitted_by<>(SELECT auth.uid()))
 FROM public.sdl_video_submissions s JOIN public.players p ON p.id=s.player_id
 JOIN public.player_team_memberships ptm ON ptm.player_id=p.id AND ptm.organization_id=p.organization_id
 JOIN public.teams t ON t.id=ptm.team_id AND t.organization_id=ptm.organization_id
 WHERE t.id=p_team_id AND public.sdl_004_submission_can_review(s.player_id)
 AND EXISTS(SELECT 1 FROM public.team_memberships tm WHERE tm.team_id=t.id AND tm.user_id=(SELECT auth.uid()) AND tm.role='coach' AND tm.status='active')
 AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE
 AND (p_status='all' OR s.status=p_status)
 ORDER BY s.created_at DESC LIMIT 50;
$$;
CREATE FUNCTION public.sdl_004_advance_membership_consent_epoch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF ROW(OLD.id,OLD.player_id,OLD.team_id,OLD.organization_id,OLD.status,OLD.start_date,OLD.end_date,OLD.sdl_consent_epoch)
 IS DISTINCT FROM ROW(NEW.id,NEW.player_id,NEW.team_id,NEW.organization_id,NEW.status,NEW.start_date,NEW.end_date,NEW.sdl_consent_epoch) THEN
   NEW.sdl_consent_epoch=gen_random_uuid();
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER sdl_004_membership_consent_epoch BEFORE UPDATE OF id,player_id,team_id,organization_id,status,start_date,end_date,sdl_consent_epoch
 ON public.player_team_memberships FOR EACH ROW EXECUTE FUNCTION public.sdl_004_advance_membership_consent_epoch();

-- Consent must never revive when an existing membership/guardian/profile is reused.
-- These triggers only invalidate new submission consent, never v1 media or statistics.
CREATE FUNCTION public.sdl_004_invalidate_membership_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(OLD.id,OLD.player_id,OLD.team_id,OLD.organization_id,OLD.status,OLD.start_date,OLD.end_date)
  IS NOT DISTINCT FROM ROW(NEW.id,NEW.player_id,NEW.team_id,NEW.organization_id,NEW.status,NEW.start_date,NEW.end_date) THEN RETURN NEW; END IF;
 UPDATE public.sdl_video_submissions s SET
   consent_membership_ids=array_remove(s.consent_membership_ids,OLD.id),
   consent_membership_epochs=s.consent_membership_epochs-OLD.id::text,
   consent_team_ids=ARRAY(SELECT DISTINCT ptm.team_id FROM public.player_team_memberships ptm
     WHERE ptm.id=ANY(array_remove(s.consent_membership_ids,OLD.id)) AND ptm.team_id=ANY(s.consent_team_ids)
       AND ptm.status='active' AND ptm.end_date IS NULL AND ptm.start_date<=CURRENT_DATE),
   share_with_team=cardinality(array_remove(s.consent_membership_ids,OLD.id))>0,
   history=s.history||jsonb_build_array(jsonb_build_object('action','consent_invalidated','reason','membership_changed','at',now()))
 WHERE OLD.id=ANY(s.consent_membership_ids);
 UPDATE public.sdl_submission_uploads SET share_with_team=false,consent_team_ids='{}',consent_membership_ids='{}',consent_membership_epochs='{}',consent_invalidated=true
 WHERE OLD.id=ANY(consent_membership_ids) AND NOT completed;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER sdl_004_membership_consent_lifecycle
 AFTER UPDATE OF id,player_id,team_id,organization_id,status,start_date,end_date OR DELETE
 ON public.player_team_memberships FOR EACH ROW EXECUTE FUNCTION public.sdl_004_invalidate_membership_consent();

CREATE FUNCTION public.sdl_004_invalidate_guardian_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(OLD.user_id,OLD.athlete_id,OLD.status) IS NOT DISTINCT FROM ROW(NEW.user_id,NEW.athlete_id,NEW.status) THEN RETURN NEW; END IF;
 UPDATE public.sdl_video_submissions s SET share_with_team=false,consent_team_ids='{}',consent_membership_ids='{}',consent_membership_epochs='{}',
   history=s.history||jsonb_build_array(jsonb_build_object('action','consent_invalidated','reason','guardian_changed','at',now()))
 WHERE s.submitted_by=OLD.user_id AND s.share_with_team
  AND EXISTS(SELECT 1 FROM public.players p WHERE p.id=s.player_id AND p.athlete_id=OLD.athlete_id);
 UPDATE public.sdl_submission_uploads u SET share_with_team=false,consent_team_ids='{}',consent_membership_ids='{}',consent_membership_epochs='{}',consent_invalidated=true
 WHERE u.user_id=OLD.user_id AND u.share_with_team AND NOT completed
  AND EXISTS(SELECT 1 FROM public.players p WHERE p.id=u.player_id AND p.athlete_id=OLD.athlete_id);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER sdl_004_guardian_consent_lifecycle AFTER UPDATE OF user_id,athlete_id,status OR DELETE
 ON public.athlete_guardians FOR EACH ROW EXECUTE FUNCTION public.sdl_004_invalidate_guardian_consent();

CREATE FUNCTION public.sdl_004_invalidate_profile_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND ROW(OLD.id,OLD.status) IS NOT DISTINCT FROM ROW(NEW.id,NEW.status) THEN RETURN NEW; END IF;
 UPDATE public.sdl_video_submissions s SET share_with_team=false,consent_team_ids='{}',consent_membership_ids='{}',consent_membership_epochs='{}',
   history=s.history||jsonb_build_array(jsonb_build_object('action','consent_invalidated','reason','profile_changed','at',now()))
 WHERE s.submitted_by=OLD.id AND s.share_with_team;
 UPDATE public.sdl_submission_uploads SET share_with_team=false,consent_team_ids='{}',consent_membership_ids='{}',consent_membership_epochs='{}',consent_invalidated=true
 WHERE user_id=OLD.id AND share_with_team AND NOT completed;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER sdl_004_profile_consent_lifecycle AFTER UPDATE OF id,status OR DELETE
 ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sdl_004_invalidate_profile_consent();

DO $grants$ DECLARE r record; BEGIN FOR r IN SELECT p.oid::regprocedure AS sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(ARRAY['sdl_004_advance_membership_consent_epoch','sdl_004_invalidate_profile_consent','sdl_004_invalidate_guardian_consent','sdl_004_invalidate_membership_consent','sdl_004_review_queue','sdl_004_session_active','sdl_004_guardian_for','sdl_004_coach_for','sdl_004_submission_can_submit','sdl_004_submission_is_guardian','sdl_004_submission_can_review','sdl_004_clubhouse_member','sdl_004_submission_can_read','sdl_004_list_submissions','sdl_004_reserve_submission','sdl_004_finish_submission','sdl_004_review_submission','sdl_004_submission_consent','sdl_004_clubhouse_videos','sdl_004_workspace_players','sdl_004_submission_contract']) LOOP
EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM PUBLIC,anon,authenticated';
IF r.proname=ANY(ARRAY['sdl_004_advance_membership_consent_epoch','sdl_004_invalidate_profile_consent','sdl_004_invalidate_guardian_consent','sdl_004_invalidate_membership_consent','sdl_004_guardian_for','sdl_004_coach_for','sdl_004_finish_submission']) THEN EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.sig||' TO service_role'; ELSE EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.sig||' TO authenticated'; END IF;
END LOOP; END $grants$;
COMMIT;
