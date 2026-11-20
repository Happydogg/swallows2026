-- SDL-004-FIXTURE-002 | Synthetic staging club-enrollment compatibility only
-- Run ONLY against swallows-datalab-staging / wvurolqbjhuckkkjiiiv.
-- No user access, consent, recording permission, RLS or production changes.
-- Required for existing membership-scoped sdl_004_pilot_coach_statistics.
BEGIN;
DO $seed$
DECLARE
  v_org constant uuid := '8f24e090-0ccc-4c10-a00d-ace7d53a190c';
  v_team constant uuid := '2847fab3-d5b7-4120-9468-324700578b48';
  v_existing integer;
  v_inserted integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('SDL-004-FIXTURE-002'));
  SELECT count(*) INTO v_existing
    FROM public.players p
    JOIN public.player_team_memberships ptm ON ptm.player_id=p.id
    WHERE p.preferred_name LIKE 'DEMO %'
      AND p.organization_id=v_org AND ptm.team_id=v_team
      AND ptm.status='active' AND ptm.end_date IS NULL;
  IF v_existing<>15 THEN RAISE EXCEPTION 'Refusing enrollments: expected exactly 15 assigned DEMO players, found %',v_existing; END IF;
  IF EXISTS (SELECT 1 FROM public.sdl_club_enrollments e
    JOIN public.players p ON p.athlete_id=e.athlete_id
    WHERE p.preferred_name LIKE 'DEMO %' AND e.organization_id<>v_org)
    THEN RAISE EXCEPTION 'Unexpected cross-organization demo enrollment'; END IF;
  INSERT INTO public.sdl_club_enrollments
    (id,athlete_id,organization_id,status,started_at,
      recording_storage_authorized,recording_permission_ref)
  SELECT md5('SDL-004-FIXTURE-002:enrollment:'||p.id::text)::uuid,
    p.athlete_id,v_org,'active',TIMESTAMPTZ '2025-08-01 00:00:00+00',
    false,''
  FROM public.players p
  JOIN public.player_team_memberships ptm ON ptm.player_id=p.id
  WHERE p.preferred_name LIKE 'DEMO %' AND p.organization_id=v_org
    AND ptm.team_id=v_team AND ptm.status='active' AND ptm.end_date IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.sdl_club_enrollments e
      WHERE e.athlete_id=p.athlete_id AND e.organization_id=v_org)
  ON CONFLICT (id) DO NOTHING;
  SELECT count(*) INTO v_inserted
  FROM public.sdl_club_enrollments e JOIN public.players p
   ON p.athlete_id=e.athlete_id AND p.organization_id=e.organization_id
  WHERE p.preferred_name LIKE 'DEMO %' AND e.organization_id=v_org
    AND e.status='active' AND e.ended_at IS NULL AND e.recording_storage_authorized=false;
  IF v_inserted<>15 THEN RAISE EXCEPTION 'Expected 15 active, non-sharing DEMO enrollments; got %',v_inserted; END IF;
  IF EXISTS (
   SELECT 1 FROM public.sdl_club_consents c
   JOIN public.sdl_club_enrollments e ON e.id=c.enrollment_id
   JOIN public.players p ON p.athlete_id=e.athlete_id
   WHERE p.preferred_name LIKE 'DEMO %' AND c.withdrawn_at IS NULL AND c.invalidated_at IS NULL
  ) THEN RAISE EXCEPTION 'Unexpected active club consent on demo fixtures'; END IF;
END;
$seed$;
COMMIT;
