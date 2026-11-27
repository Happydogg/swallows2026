-- Before installation on a disposable candidate or separately approved staging database.
BEGIN READ ONLY;
DO $check$
DECLARE expected record; role_name text; table_name text;
BEGIN
 IF current_setting('server_version_num')::integer<150000 OR to_regnamespace('sdl_rbac_v5') IS NOT NULL THEN
   RAISE EXCEPTION 'Expected PostgreSQL 15+ and a pre-v5 baseline'; END IF;
 FOR expected IN SELECT * FROM (VALUES
    ('public.sdl_004_active_club_consent(uuid,uuid)','6c54b5966f701972d0aedb686f49f6b6970a7c1629266e61be963a3e7155e575'),
    ('public.sdl_004_club_consent(uuid,uuid,boolean,text)','41e0108c6f25dae2c6e1eb02093a6478f85d38f1ae10dcc426ab033bb4a85d35'),
    ('public.sdl_004_clubhouse_leaderboard(uuid)','dc8b7608e1509673862486a5de3e6cb16098cd6452c59115c0ae9ec4b95a7990'),
    ('public.sdl_004_clubhouse_member(uuid)','f124d2fedaf9ec84c2197c5b0d8e98705e875eed53e2f16e9b052382d8096d92'),
    ('public.sdl_004_finish_submission(uuid,uuid,uuid)','9b29ee61fb635a777046ea08128c4a68d51ccb8a97c8bcd95d4f5d31bf36ada5'),
    ('public.sdl_004_list_submissions(uuid)','19233d6de26a5f20204840c8a7495714df22ea6aa9c378985e0a0d86cfd62af2'),
    ('public.sdl_004_media_can_access(uuid,text)','ed654639f92dbbf8bd352c5b58f3796db1f99b7b781fba01639225182bec0077'),
    ('public.sdl_004_pilot_attest_session(uuid,text)','d7773b8a9eb972008217a41913569a98867ebd8e1c4ab2322bc1720584e4a455'),
    ('public.sdl_004_pilot_can_invite(uuid)','02738d830d3f968c624e90babee96cedfa8c161303b7c608dbc7daa769be2d5f'),
    ('public.sdl_004_pilot_can_measure(uuid)','7b4243c82865b49edc93730f244d34862433da30908f98aa1e2d0fc259c4a7c9'),
    ('public.sdl_004_pilot_contacts(uuid,text)','900df1f6c2e525d92c792a771db1e826f8572e01f288da39899ecde548b11b6b'),
    ('public.sdl_004_pilot_correct_performance(uuid,text,numeric,date,text,integer)','cba8fe9b00861990c27c81d3f7a4910f07852ea2da2164731863f1ed8de4bb47'),
    ('public.sdl_004_pilot_issue_invitation(uuid,text,text)','f57622ebf5f902073089e93ca7eb2d877f494713cb3a96343af86bb39d90d274'),
    ('public.sdl_004_pilot_officialize(uuid)','a0adcb2771c2a63c24881636318a1f00e4dff7143779355ef6557658e762c3d0'),
    ('public.sdl_004_pilot_performance(uuid,uuid,text)','1a885b00c520cd7ccfc7e707e09bdea693273fc9693f4ffe7fe73ce607c47822'),
    ('public.sdl_004_pilot_redeem_invitation(text)','9e1ef9245e2bf6ff431cbf29149e9a8b17be85b6cfce695523202140dace7df5'),
    ('public.sdl_004_pilot_review_performance(uuid,text,text,integer)','956614e3ddc23cd2c409ab576b563735e0ff8aa7a0cf1d816ef1dea2cd0d74e5'),
    ('public.sdl_004_pilot_save_growth(uuid,date,numeric,numeric,uuid,integer,text)','0b1f3ade82b8644ab7abdce5b81b2de09c3ae907848c075dd344940e489991df'),
    ('public.sdl_004_pilot_submit_performance(uuid,text,numeric,date,text,uuid,boolean,uuid,uuid)','b046771ed02d233c1b141ef097293b749ac0972f1f57c2af313b2e7ed7417910'),
    ('public.sdl_004_publish_submission(uuid,uuid[],uuid[])','a06500641dbffc061c00d13d57a080a45564075f70c9c5a7d1197d5ab43183a2'),
    ('public.sdl_004_reserve_submission(uuid,uuid,uuid,text,bigint,text)','0f31716fa80f7cde7386e7c5b83727e57fa15bf314d13601e6734957ee327ece'),
    ('public.sdl_004_review_queue(uuid,text)','fc8b955887f462e6478806bd4b87e8dcbac363fabbe70cfa6ec4c0a4461c66e1'),
    ('public.sdl_004_review_submission(uuid,text,text)','957b3a723ac3683847f38d5cfd0bba373d952d89a2fb6e59dd8b3f6ce8f6b1ed'),
    ('public.sdl_004_set_statistic_consent(uuid,uuid,boolean,text[],text)','391222ea49d369194f980282701f633dc22c05d8e7c9c0421bf3d6efa8af00bc'),
    ('public.sdl_004_statistics_consent(uuid)','bc93009a7c0aafed28b39e9b020b143ecf13a870027d218579ee1644700e5c9b'),
    ('public.sdl_004_submission_can_publish(uuid)','cf3ca99a707c8820f1777ecbb4e6842f08ccb34e26d76b74658b86d5f5fc02d2'),
    ('public.sdl_004_submission_can_read(uuid)','a6e861a3deafc39936b48efd4014c6a76e8a283fd50a5fbcf4894e90ea1ea031'),
    ('public.sdl_004_submission_can_review(uuid)','b8f154c41d27eb511eec588f9bb2ab89e02a1af9e4e32b549440f5508ba7c6f0'),
    ('public.sdl_004_submission_can_submit(uuid)','06a3b146a670d4ee331907592cc47cd64ceddb734041102ea575c6124f5b78e1'),
    ('public.sdl_004_submission_contract()','c0ddd04dde3d3ddc2f6f041bfd12a8c92d84484202230218286c214f4aa41647')
 ) f(signature,digest) LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature)
   AND encode(sha256(convert_to(replace(p.prosrc,chr(13),''),'UTF8')),'hex')=expected.digest) THEN
   RAISE EXCEPTION 'Baseline function differs. Reconcile before installation: %',expected.signature; END IF;
 END LOOP;
 FOREACH table_name IN ARRAY ARRAY['players','sessions','athletes','athlete_guardians','organizations','organization_memberships','teams','team_memberships','player_team_memberships','sdl_media_objects'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.'||table_name) AND c.relrowsecurity) THEN
     RAISE EXCEPTION 'Review missing RLS prerequisite: %',table_name; END IF;
   FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
     IF has_table_privilege(role_name,'public.'||table_name,'INSERT,UPDATE,DELETE,TRUNCATE')
     OR has_any_column_privilege(role_name,'public.'||table_name,'INSERT,UPDATE') THEN
       RAISE EXCEPTION 'Review direct writes before installation: % %',role_name,table_name; END IF;
   END LOOP;
 END LOOP;
END;
$check$;
ROLLBACK;
