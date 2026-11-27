// Isolated synthetic SQL tests for the review-only role foundation.
 // These exercise predicates, not hosted auth, live RLS, RPC integration or R2.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [pa,ca,tm,co,gu,other,dual]=[1,2,3,4,5,6,7].map(uuid);
const [orgA,orgB,teamA,teamB,playerA,playerB,athleteA,athleteB]=[11,12,21,22,31,32,41,42].map(uuid);

test('v5 foundation: scoped roles, denial, lifecycle and ACLs in synthetic SQL',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
   $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
   CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
   $$ SELECT jsonb_build_object('aal',current_setting('test.aal',true)) $$;
   CREATE FUNCTION public.sdl_004_session_active() RETURNS boolean LANGUAGE sql STABLE AS
   $$ SELECT auth.uid() IS NOT NULL AND coalesce(current_setting('test.session',true)='active',false) $$;
   CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text NOT NULL);
   CREATE TABLE public.organizations(id uuid PRIMARY KEY,status text NOT NULL);
   CREATE TABLE public.teams(id uuid PRIMARY KEY,organization_id uuid NOT NULL,status text NOT NULL);
   CREATE TABLE public.organization_memberships(organization_id uuid,user_id uuid,role text,status text,PRIMARY KEY(organization_id,user_id,role));
   CREATE TABLE public.team_memberships(team_id uuid,user_id uuid,role text,status text,PRIMARY KEY(team_id,user_id,role));
   CREATE TABLE public.players(id uuid PRIMARY KEY,athlete_id uuid,organization_id uuid);
   CREATE TABLE public.athlete_guardians(athlete_id uuid,user_id uuid,status text);
   CREATE TABLE public.player_team_memberships(player_id uuid,team_id uuid,organization_id uuid,status text,start_date date,end_date date);
   CREATE TABLE public.sdl_club_enrollments(athlete_id uuid,organization_id uuid,status text,started_at timestamptz,ended_at timestamptz);
  `);
  for(const id of [pa,ca,tm,co,gu,other,dual])await db.query("INSERT INTO public.profiles VALUES ($1,'active')",[id]);
  for(const id of [orgA,orgB])await db.query("INSERT INTO public.organizations VALUES ($1,'active')",[id]);
  for(const [team,org,player,athlete] of [[teamA,orgA,playerA,athleteA],[teamB,orgB,playerB,athleteB]]){
   await db.query("INSERT INTO public.teams VALUES ($1,$2,'active')",[team,org]);
   await db.query("INSERT INTO public.players VALUES ($1,$2,$3)",[player,athlete,org]);
   await db.query("INSERT INTO public.player_team_memberships VALUES ($1,$2,$3,'active',CURRENT_DATE,NULL)",[player,team,org]);
   await db.query("INSERT INTO public.sdl_club_enrollments VALUES ($1,$2,'active',now(),NULL)",[athlete,org]);
  }
  for(const [org,id,role] of [[orgA,ca,'admin'],[orgA,tm,'staff'],[orgA,co,'staff'],[orgB,dual,'staff']])
   await db.query("INSERT INTO public.organization_memberships VALUES ($1,$2,$3,'active')",[org,id,role]);
  for(const [team,id,role] of [[teamA,tm,'manager'],[teamA,co,'coach'],[teamB,dual,'coach'],[teamA,dual,'parent']])
   await db.query("INSERT INTO public.team_memberships VALUES ($1,$2,$3,'active')",[team,id,role]);
  for(const id of [gu,dual])await db.query("INSERT INTO public.athlete_guardians VALUES ($1,$2,'verified')",[athleteA,id]);
  await db.exec(await readFile(new URL('../supabase/migrations/20261126151930_sdl004_v5_foundation.sql',import.meta.url),'utf8'));
  await db.query("SELECT sdl_rbac_v5.set_platform_grant($1,true,'synthetic fixture only')",[pa]);
  async function actor(id,aal='aal1',session='active'){
   await db.query("SELECT set_config('test.actor',$1,false),set_config('test.aal',$2,false),set_config('test.session',$3,false)",[id??'',aal,session]);
  }
  async function player(id,action,expected){
   const r=await db.query('SELECT sdl_rbac_v5.player_role_gate($1,$2) AS ok',[id,action]);
   assert.equal(r.rows[0].ok,expected,action+' '+id);
  }
  async function team(id,action,expected){
   const r=await db.query('SELECT sdl_rbac_v5.team_role_gate($1,$2) AS ok',[id,action]);
   assert.equal(r.rows[0].ok,expected,action+' '+id);
  }
  for(const role of ['anon','authenticated','service_role']){
   const r=await db.query("SELECT has_schema_privilege($1,'sdl_rbac_v5','USAGE') AS schema_ok, has_function_privilege($1,'sdl_rbac_v5.player_role_gate(uuid,text)','EXECUTE') AS fn_ok, has_table_privilege($1,'sdl_rbac_v5.platform_admin_grants','SELECT') AS table_ok",[role]);
   assert.deepEqual(r.rows[0],{schema_ok:false,fn_ok:false,table_ok:false});
  }
  // A definer RPC owns the private query. API callers cannot invoke the helper
  // or provision administrators directly. The fixture-only RPC returns a boolean.
  await db.exec(`CREATE FUNCTION public.fixture_gate(uuid,text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER SET search_path='' AS
    'SELECT sdl_rbac_v5.player_role_gate($1,$2)';
    REVOKE ALL ON FUNCTION public.fixture_gate(uuid,text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.fixture_gate(uuid,text) TO authenticated;`);
  await actor(pa,'aal2');
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query("SELECT sdl_rbac_v5.set_platform_grant($1,true,'test')",[other]),{code:'42501'});
  assert.equal((await db.query("SELECT public.fixture_gate($1,'read_private_statistics') AS ok",[playerB])).rows[0].ok,true);
  await actor(gu);
  assert.equal((await db.query("SELECT public.fixture_gate($1,'read_private_statistics') AS ok",[playerB])).rows[0].ok,false);
  await db.exec('RESET ROLE');
  await actor(pa);await player(playerA,'read_private_statistics',false);
  await actor(pa,'aal2');await player(playerA,'read_private_statistics',true);await player(playerB,'read_private_statistics',true);
  await player(playerA,'enter_official_statistics',false);await player(playerA,'issue_guardian_invitation',false);
  await actor(ca);await player(playerA,'enter_official_statistics',true);await player(playerA,'review_parent_statistics',false);await player(playerA,'review_video',true);
  await player(playerB,'read_private_statistics',false);await team(teamA,'assign_manager',true);await team(teamB,'assign_coach',false);
  await actor(tm);await player(playerA,'read_private_statistics',true);await player(playerA,'correct_official_statistics',true);await player(playerA,'issue_guardian_invitation',true);await player(playerA,'review_parent_statistics',false);await player(playerA,'review_video',true);
  await player(playerB,'read_private_statistics',false);await team(teamA,'assign_coach',true);await team(teamA,'assign_manager',false);await team(teamB,'manage_roster',false);
  await actor(co);await player(playerA,'review_parent_statistics',true);await player(playerA,'issue_guardian_invitation',false);await team(teamA,'assign_coach',false);
  await actor(gu);await player(playerA,'read_private_statistics',true);await player(playerB,'read_private_statistics',false);await player(playerA,'enter_official_statistics',false);
  await actor(dual);await player(playerA,'read_private_statistics',true);await player(playerA,'enter_official_statistics',false);await player(playerB,'enter_official_statistics',true);
  await actor(other);await player(playerA,'read_private_statistics',false);
  await actor(null);await player(playerA,'read_private_statistics',false);
  await actor(tm,'aal1','revoked');await player(playerA,'read_private_statistics',false);
  await actor(tm);await player(playerA,'unknown_action',false);await player(null,'read_private_statistics',false);
  await db.query("UPDATE public.profiles SET status='suspended' WHERE id=$1",[tm]);await player(playerA,'read_private_statistics',false);
  await db.query("UPDATE public.profiles SET status='active' WHERE id=$1",[tm]);
  await db.query("UPDATE public.player_team_memberships SET start_date=CURRENT_DATE+1 WHERE player_id=$1",[playerA]);await player(playerA,'read_private_statistics',false);
  await db.query("UPDATE public.player_team_memberships SET start_date=CURRENT_DATE WHERE player_id=$1",[playerA]);
  await db.query("UPDATE public.team_memberships SET status='revoked' WHERE user_id=$1",[tm]);await player(playerA,'read_private_statistics',false);
  await actor(ca);await db.query("UPDATE public.sdl_club_enrollments SET status='ended',ended_at=now() WHERE athlete_id=$1",[athleteA]);await player(playerA,'read_private_statistics',false);
  await actor(gu);await player(playerA,'read_private_statistics',true);
  await actor(pa,'aal2');await db.query("SELECT sdl_rbac_v5.set_platform_grant($1,false,'operator revocation')",[pa]);await player(playerA,'read_private_statistics',false);
  const events=await db.query('SELECT action FROM sdl_rbac_v5.events ORDER BY id');
  assert.deepEqual(events.rows.map(r=>r.action),['platform_granted','platform_revoked']);
  await assert.rejects(db.exec('UPDATE sdl_rbac_v5.events SET reason=reason'),{code:'42501'});
 }finally{await db.close();}
});
