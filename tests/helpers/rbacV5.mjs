import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {finalPilot} from './finalPilot.mjs';

// Historical migrations run first. Supplement only the core schema objects
// supplied by the original project outside its versioned migrations.
export async function rbacV5(t) {
 const oldRuntime=process.env.SDL004_PGLITE_RUNTIME;
 process.env.SDL004_PGLITE_RUNTIME ??= fileURLToPath(import.meta.resolve('@electric-sql/pglite'));
 let fixture;
 try {fixture=await finalPilot(t);}
 finally {
   if(oldRuntime===undefined)delete process.env.SDL004_PGLITE_RUNTIME;
   else process.env.SDL004_PGLITE_RUNTIME=oldRuntime;
 }
 await fixture.db.exec(`RESET ROLE;
   CREATE TABLE public.athletes(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
   ALTER TABLE public.players ALTER COLUMN id SET DEFAULT gen_random_uuid();
   ALTER TABLE public.organization_memberships ADD COLUMN updated_at timestamptz DEFAULT now(),
     ADD PRIMARY KEY(organization_id,user_id,role);
   ALTER TABLE public.team_memberships ADD PRIMARY KEY(team_id,user_id,role);
   CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
   $$ SELECT jsonb_build_object('session_id',current_setting('request.jwt.claim.sub',true),'aal',current_setting('test.aal',true)) $$;`);
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 for(const name of (await readdir(dir)).filter(name=>name.includes('_sdl004_v5_')).sort()) {
   await fixture.db.exec(await readFile(new URL(name,dir),'utf8'));
 }
 return fixture;
}
