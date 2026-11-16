// Local synthetic data only; no service connection.
import fs from 'node:fs';
import {pilotDatabase,uuid,parent,coach,teammate,player,peer,otherPlayer,team,otherTeam,org,otherOrg,athlete,peerAthlete} from './submissionDatabase.mjs';
export const enrollment=uuid(51),peerEnrollment=uuid(52),secondClubEnrollment=uuid(54),adminUser=uuid(5),secondClubPlayer=uuid(14);
export async function clubWorkflow(t,runtime){
 const db=await pilotDatabase(t,runtime);
 await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261116184847_sdl004_submission_workflows.sql',import.meta.url),'utf8'));
 await db.exec(`INSERT INTO auth.users VALUES('${adminUser}');INSERT INTO auth.sessions VALUES('${adminUser}','${adminUser}',null);
 INSERT INTO public.profiles VALUES('${adminUser}','active');INSERT INTO public.organization_memberships VALUES('${org}','${adminUser}','active','admin');
 INSERT INTO public.players(id,athlete_id,organization_id)VALUES('${secondClubPlayer}','${athlete}','${otherOrg}');
 INSERT INTO public.player_team_memberships(player_id,team_id,organization_id,status)VALUES('${secondClubPlayer}','${otherTeam}','${otherOrg}','active');
 INSERT INTO public.sdl_club_enrollments(id,athlete_id,organization_id)VALUES('${enrollment}','${athlete}','${org}'),('${peerEnrollment}','${peerAthlete}','${org}'),('${secondClubEnrollment}','${athlete}','${otherOrg}');`);
 let inTransaction=false;
 async function query(sql){
  if(!inTransaction)return(await db.query(sql)).rows;
  await db.exec('SAVEPOINT scenario_statement');
  try{const r=(await db.query(sql)).rows;await db.exec('RELEASE SAVEPOINT scenario_statement');return r;}
  catch(e){await db.exec('ROLLBACK TO SAVEPOINT scenario_statement;RELEASE SAVEPOINT scenario_statement');throw e;}
 }
 async function as(id,sql){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('SET ROLE authenticated');return query(sql);}
 async function owner(sql){
  if(sql==='ROLLBACK'){await db.exec('ROLLBACK');inTransaction=false;await db.exec('RESET ROLE');return [];}
  await db.exec('RESET ROLE');if(sql==='BEGIN'){await db.exec('BEGIN');inTransaction=true;return [];}
  return query(sql);
 }
 const generation=async(id=enrollment)=>(await owner(`SELECT generation FROM public.sdl_club_enrollments WHERE id='${id}'`))[0].generation;
 const grant=async(id=enrollment,who=parent)=>as(who,`SELECT public.sdl_004_club_consent('${id}','${await generation(id)}',true,'sdl004-clubhouse-v1')`);
 const withdraw=async()=>as(parent,`SELECT public.sdl_004_club_consent('${enrollment}','${await generation()}',false,null)`);
 let serial=100;
 async function upload(who=parent,pid=player){const key=uuid(++serial),claim=uuid(++serial);
  const r=(await as(who,`SELECT public.sdl_004_reserve_submission('${pid}','${key}','${claim}','${'a'.repeat(64)}',12,'pitching') AS r`))[0].r;
  await db.exec('RESET ROLE;SET ROLE service_role');await db.query(`SELECT public.sdl_004_finish_submission('${key}','${claim}','${who}')`);return r.id;
 }
 const publish=(id,teams=[team],subjects=[athlete],who=coach)=>as(who,`SELECT public.sdl_004_publish_submission('${id}',ARRAY[${teams.map(x=>`'${x}'::uuid`).join(',')}]::uuid[],ARRAY[${subjects.map(x=>`'${x}'::uuid`).join(',')}]::uuid[])`);
 const canRead=async(id,who=teammate)=>(await as(who,`SELECT public.sdl_004_submission_can_read('${id}') AS allowed`))[0].allowed;
 const consent=async(id=enrollment)=>(await as(parent,`SELECT * FROM public.sdl_004_list_club_consents('${athlete}') WHERE id='${id}'`))[0];
 return {db,as,owner,generation,grant,withdraw,upload,publish,canRead,consent};
}
