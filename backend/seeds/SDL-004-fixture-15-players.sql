-- SDL-004-FIXTURE-001 | Staging-only synthetic youth baseball development history
-- Project: swallows-datalab-staging (wvurolqbjhuckkkjiiiv), NEVER production.
-- 15 new fictional athletes; 15 team player profiles; 8 sessions each (120).
-- Idempotent primary keys; no deletes, policies, auth users, migrations or grants.
-- All names begin DEMO. Measurements are generated fixtures, NOT evidence of youth norms.
-- Do not promote generated heights, velocities or sprint times to actual athlete records.
BEGIN;
DO $seed$
DECLARE
  org_id constant uuid := '8f24e090-0ccc-4c10-a00d-ace7d53a190c';
  team_id constant uuid := '2847fab3-d5b7-4120-9468-324700578b48';
  r record;
  athlete_key uuid;
  player_key uuid;
  membership_key uuid;
  session_key uuid;
  step_number integer;
  base_height numeric;
  base_weight numeric;
  growth_height numeric;
  growth_weight numeric;
  base_exit numeric;
  base_throw numeric;
  base_sprint numeric;
  base_jump numeric;
  session_height numeric;
  session_weight numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('SDL-004-FIXTURE-001-v1'));
  IF NOT EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.team_memberships tm ON tm.team_id=t.id AND tm.role='coach' AND tm.status='active'
    JOIN public.organization_memberships om ON om.organization_id=t.organization_id
      AND om.user_id=tm.user_id AND om.role IN ('staff','admin') AND om.status='active'
    WHERE t.id=team_id AND t.organization_id=org_id AND t.status='active'
  ) THEN
    RAISE EXCEPTION 'SDL demo seed aborted: authorized staging coach-team context missing';
  END IF;

  FOR r IN SELECT * FROM (VALUES
    (1, 'aiden-chen', 'DEMO Aiden Chen', '21', 'SS', 'R', 'R'),
    (2, 'mateo-rivera', 'DEMO Mateo Rivera', '22', '2B', 'R', 'R'),
    (3, 'oliver-park', 'DEMO Oliver Park', '23', 'P', 'R', 'L'),
    (4, 'noah-patel', 'DEMO Noah Patel', '24', 'C', 'R', 'R'),
    (5, 'lucas-kim', 'DEMO Lucas Kim', '25', 'CF', 'L', 'L'),
    (6, 'ethan-wong', 'DEMO Ethan Wong', '26', '3B', 'R', 'R'),
    (7, 'leo-ramirez', 'DEMO Leo Ramirez', '27', 'LF', 'R', 'L'),
    (8, 'kai-morgan', 'DEMO Kai Morgan', '28', 'P', 'L', 'R'),
    (9, 'benjamin-shah', 'DEMO Benjamin Shah', '29', '1B', 'R', 'R'),
    (10, 'jayden-brooks', 'DEMO Jayden Brooks', '30', 'RF', 'R', 'L'),
    (11, 'elijah-tan', 'DEMO Elijah Tan', '31', 'SS', 'R', 'R'),
    (12, 'adrian-cruz', 'DEMO Adrian Cruz', '32', 'C', 'R', 'R'),
    (13, 'theo-nakamura', 'DEMO Theo Nakamura', '33', '2B', 'R', 'L'),
    (14, 'dylan-foster', 'DEMO Dylan Foster', '34', 'P', 'L', 'L'),
    (15, 'isaac-lin', 'DEMO Isaac Lin', '35', 'CF', 'R', 'R')
  ) AS demo(idx,slug,display_name,jersey_number,field_position,throw_hand,bat_hand)
  LOOP
    athlete_key := md5('SDL-004-FIXTURE-001:athlete:'||r.slug)::uuid;
    player_key := md5('SDL-004-FIXTURE-001:player:'||r.slug)::uuid;
    membership_key := md5('SDL-004-FIXTURE-001:team:'||r.slug)::uuid;

    base_height := 128 + ((r.idx*7)%24);
    base_weight := 27 + ((r.idx*5)%18);
    growth_height := 0.65 + (r.idx%4)*0.10;
    growth_weight := 0.40 + (r.idx%3)*0.12;
    base_exit := 56 + ((r.idx*7)%18);
    base_throw := 48 + ((r.idx*11)%19);
    base_sprint := 4.65 - ((r.idx*3)%9)*0.09;
    base_jump := 114 + ((r.idx*13)%43);

    INSERT INTO public.athletes(id) VALUES(athlete_key)
    ON CONFLICT(id) DO NOTHING;

    INSERT INTO public.players
      (id,athlete_id,organization_id,preferred_name,name,jersey,"position",throws,bats,
       dob,current_height_cm,current_weight_kg)
    VALUES (player_key,athlete_key,org_id,r.display_name,r.display_name,r.jersey_number,
      r.field_position,r.throw_hand,r.bat_hand,
      make_date(2012+(r.idx%4),1+((r.idx-1)%12),5+(r.idx%20)),
      round((base_height+7*growth_height)::numeric,1),
      round((base_weight+7*growth_weight)::numeric,1))
    ON CONFLICT(id) DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM public.players
      WHERE id=player_key AND athlete_id=athlete_key AND organization_id=org_id
        AND preferred_name=r.display_name AND jersey=r.jersey_number
    ) THEN
      RAISE EXCEPTION 'SDL demo seed aborted: player key collision for %',r.slug;
    END IF;

    INSERT INTO public.player_team_memberships
      (id,player_id,team_id,organization_id,start_date,end_date,status)
    VALUES(membership_key,player_key,team_id,org_id,DATE '2025-08-01',NULL,'active')
    ON CONFLICT(id) DO NOTHING;

    FOR step_number IN 0..7 LOOP
      session_key := md5('SDL-004-FIXTURE-001:session:'||r.slug||':'||step_number::text)::uuid;
      session_height := round((base_height+step_number*growth_height)::numeric,1);
      session_weight := round((base_weight+step_number*growth_weight)::numeric,1);
      INSERT INTO public.sessions
        (id,player_id,session_date,height_cm,weight_kg,exit_velo,
         control_exit_velo,throwing_velo,sprint_time,broad_jump,grip_dom,pinch,attack_angle,shoulder_check)
      VALUES(
        session_key,player_key,(DATE '2025-08-15'+make_interval(months=>step_number*2))::date,
        session_height,session_weight,
        round((base_exit+step_number*(1.1+(r.idx%4)*0.18)+(((r.idx+step_number)%3)-1)*0.35)::numeric,1),
        round((base_exit-3.5+step_number*(1.0+(r.idx%4)*0.14))::numeric,1),
        round((base_throw+step_number*(1.0+(r.idx%3)*0.23)+(((r.idx+step_number)%3)-1)*0.35)::numeric,1),
        round((base_sprint-step_number*(0.035+(r.idx%3)*0.007)+(((r.idx+step_number)%3)-1)*0.012)::numeric,2),
        round((base_jump+step_number*(1.6+(r.idx%3)*0.25))::numeric,1),
        round((12+((r.idx*7)%12)+step_number*0.6)::numeric,1),
        round((3+(r.idx%5)*0.5+step_number*0.18)::numeric,1),
        round((((r.idx%7)-1)+step_number*0.18)::numeric,1),
        NULL
      )
      ON CONFLICT(id) DO NOTHING;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM public.players WHERE id IN (
    SELECT md5('SDL-004-FIXTURE-001:player:'||slug)::uuid FROM
    (VALUES ('aiden-chen'),('mateo-rivera'),('oliver-park'),('noah-patel'),('lucas-kim'),('ethan-wong'),('leo-ramirez'),('kai-morgan'),('benjamin-shah'),('jayden-brooks'),('elijah-tan'),('adrian-cruz'),('theo-nakamura'),('dylan-foster'),('isaac-lin')) v(slug)
  )) <> 15 THEN RAISE EXCEPTION 'SDL demo seed incomplete: expected 15 players'; END IF;
  IF (SELECT count(*) FROM public.sessions WHERE player_id IN (
    SELECT md5('SDL-004-FIXTURE-001:player:'||slug)::uuid FROM
    (VALUES ('aiden-chen'),('mateo-rivera'),('oliver-park'),('noah-patel'),('lucas-kim'),('ethan-wong'),('leo-ramirez'),('kai-morgan'),('benjamin-shah'),('jayden-brooks'),('elijah-tan'),('adrian-cruz'),('theo-nakamura'),('dylan-foster'),('isaac-lin')) v(slug)
  )) <> 120 THEN RAISE EXCEPTION 'SDL demo seed incomplete: expected 120 sessions'; END IF;
END;
$seed$;
COMMIT;
-- Verification (separate read-only query):
-- SELECT count(*) FROM public.players WHERE preferred_name LIKE 'DEMO %';
-- SELECT count(*) FROM public.sessions s JOIN public.players p ON p.id=s.player_id WHERE p.preferred_name LIKE 'DEMO %';
