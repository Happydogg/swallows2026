-- READ ONLY. Run together with the guarded fresh-install preflight, before EITHER migration.
-- This additional dependency guard does NOT authorize applying SQL or repair an existing install.
BEGIN READ ONLY;
DO $preflight$ DECLARE d record;BEGIN
 IF current_setting('sdl004.confirmed_project_ref',true) IS DISTINCT FROM 'wvurolqbjhuckkkjiiiv' THEN RAISE EXCEPTION 'SDL004 final preflight: explicit staging project required';END IF;
 FOR d IN SELECT * FROM(VALUES
 ('public','profiles','display_name','text'),('public','profiles','created_at','timestamp with time zone'),('public','profiles','updated_at','timestamp with time zone'),
 ('public','athlete_guardians','relationship','text'),('public','athlete_guardians','created_at','timestamp with time zone'),('public','athlete_guardians','updated_at','timestamp with time zone'),
 ('public','team_memberships','created_at','timestamp with time zone'),('public','team_memberships','updated_at','timestamp with time zone'),
 ('public','players','parent_phone','text'),('public','players','given_names','text'),('public','players','last_name','text'),('public','players','dob','date'),('public','players','hkll_reg_no','text'),
 ('auth','users','email_confirmed_at','timestamp with time zone'))deps(s,t,c,typ) LOOP
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=d.s AND table_name=d.t AND column_name=d.c AND data_type=d.typ)THEN RAISE EXCEPTION 'SDL004 final preflight: incompatible dependency %.%.%',d.s,d.t,d.c;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' AND column_name='email' AND data_type IN('text','character varying'))THEN RAISE EXCEPTION 'SDL004 final preflight: verified Auth email dependency missing';END IF;
 IF NOT has_table_privilege(current_user,'auth.users','SELECT') OR (NOT has_table_privilege(current_user,'public.athlete_guardians','INSERT') OR NOT has_table_privilege(current_user,'public.athlete_guardians','UPDATE')) OR (NOT has_table_privilege(current_user,'public.team_memberships','INSERT') OR NOT has_table_privilege(current_user,'public.team_memberships','UPDATE')) OR NOT has_table_privilege(current_user,'public.profiles','INSERT') THEN RAISE EXCEPTION 'SDL004 final preflight: migration owner permissions missing';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES('public.athlete_guardians'),('public.team_memberships'),('public.organization_memberships'),('public.player_team_memberships')) t(name) CROSS JOIN(VALUES('anon'),('authenticated')) r(name) WHERE has_table_privilege(r.name,t.name,'INSERT,UPDATE,DELETE'))THEN RAISE EXCEPTION 'SDL004 final preflight: direct browser membership writes must be locked';END IF;
END $preflight$;
SELECT 'PASS' AS final_pilot_dependencies,'wvurolqbjhuckkkjiiiv' AS confirmed_project;
-- Review these definitions against parent-role, verified-link and insert requirements. No repair here.
SELECT conrelid::regclass AS relation,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=ANY(ARRAY['public.profiles'::regclass,'public.athlete_guardians'::regclass,'public.team_memberships'::regclass])ORDER BY conrelid,conname;
COMMIT;
