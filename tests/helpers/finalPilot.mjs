import fs from 'node:fs';
import {clubWorkflow} from './clubWorkflow.mjs';
export async function finalPilot(t,{approveProfiles=true}={}){
 const c=await clubWorkflow(t,process.env.SDL004_PGLITE_RUNTIME);
 await c.db.exec(`ALTER TABLE auth.users ADD COLUMN email text,ADD COLUMN email_confirmed_at timestamptz;
 ALTER TABLE public.profiles ADD COLUMN display_name text,ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
 ALTER TABLE public.athlete_guardians ADD COLUMN relationship text DEFAULT 'parent',ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
 ALTER TABLE public.team_memberships ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
 ALTER TABLE public.players ADD COLUMN parent_phone text,ADD COLUMN given_names text,ADD COLUMN last_name text,ADD COLUMN dob date,ADD COLUMN hkll_reg_no text;
 UPDATE auth.users SET email=id::text||'@example.test',email_confirmed_at=now();`);
 await c.db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261117064603_sdl004_final_pilot.sql',import.meta.url),'utf8'));
 if(approveProfiles){await c.as('00000000-0000-4000-8000-000000000002',"SELECT public.sdl_004_pilot_approve_profile('00000000-0000-4000-8000-000000000011',true)");await c.as('00000000-0000-4000-8000-000000000002',"SELECT public.sdl_004_pilot_approve_profile('00000000-0000-4000-8000-000000000012',true)");}
 return c;
}
