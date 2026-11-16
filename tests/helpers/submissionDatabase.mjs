// Isolated synthetic pilot database, never a Supabase connection.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const parent = uuid(1), coach = uuid(2), teammate = uuid(3), outsider = uuid(4);
export const player = uuid(11), peer = uuid(12), otherPlayer = uuid(13), team = uuid(21), otherTeam = uuid(22), org = uuid(31), otherOrg = uuid(32), athlete = uuid(41), peerAthlete = uuid(42);

export async function pilotDatabase(t,runtime){
 const {PGlite}=await import(pathToFileURL(runtime).href);
 const db=new PGlite();t.after(()=>db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.sub',true),'')) $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,status text);
    CREATE TABLE public.organizations(id uuid PRIMARY KEY,status text,name text DEFAULT 'Organization');
    CREATE TABLE public.teams(id uuid PRIMARY KEY,organization_id uuid,status text,name text DEFAULT 'Team');
    CREATE TABLE public.players(id uuid PRIMARY KEY,athlete_id uuid,organization_id uuid,preferred_name text DEFAULT 'Player');
    CREATE TABLE public.athlete_guardians(athlete_id uuid,user_id uuid,status text);
    CREATE TABLE public.player_team_memberships(player_id uuid,team_id uuid,organization_id uuid,status text,end_date date,start_date date DEFAULT CURRENT_DATE,id uuid DEFAULT gen_random_uuid());
    CREATE TABLE public.team_memberships(team_id uuid,user_id uuid,status text,role text);
    CREATE TABLE public.organization_memberships(organization_id uuid,user_id uuid,status text,role text);
    CREATE TABLE public.sdl_media_objects(id uuid PRIMARY KEY,player_id uuid,uploaded_by uuid,object_key text UNIQUE,
      content_type text CHECK(content_type='video/mp4'),byte_size bigint CHECK(byte_size>0 AND byte_size<=20971520),created_at timestamptz DEFAULT now());
    ALTER TABLE public.sdl_media_objects ENABLE ROW LEVEL SECURITY;
    GRANT ALL ON public.sdl_media_objects TO service_role;
    INSERT INTO auth.users VALUES('${parent}'),('${coach}'),('${teammate}'),('${outsider}');
    INSERT INTO public.profiles SELECT id,'active' FROM auth.users;
    INSERT INTO auth.sessions SELECT id,id,null FROM auth.users;
    INSERT INTO public.organizations(id,status) VALUES('${org}','active'),('${otherOrg}','active');
    INSERT INTO public.teams(id,organization_id,status) VALUES('${team}','${org}','active'),('${otherTeam}','${otherOrg}','active');
    INSERT INTO public.players(id,athlete_id,organization_id) VALUES('${player}','${athlete}','${org}'),('${peer}','${peerAthlete}','${org}'),('${otherPlayer}','${uuid(43)}','${otherOrg}');
    INSERT INTO public.athlete_guardians VALUES('${athlete}','${parent}','verified'),('${peerAthlete}','${teammate}','verified');
    INSERT INTO public.player_team_memberships(player_id,team_id,organization_id,status,end_date) VALUES('${player}','${team}','${org}','active',null),('${peer}','${team}','${org}','active',null),('${otherPlayer}','${otherTeam}','${otherOrg}','active',null);
    INSERT INTO public.team_memberships VALUES('${team}','${coach}','active','coach'),('${team}','${teammate}','active','parent');
    INSERT INTO public.organization_memberships VALUES('${org}','${coach}','active','staff');
  `);
  await db.exec(fs.readFileSync(new URL('../fixtures/deployedMediaAuthorization.sql', import.meta.url), 'utf8'));
 return db;
}
