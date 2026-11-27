// Optional native integration run. Requires initdb, pg_ctl and the pg client.
// Always create a new Unix-socket-only cluster with synthetic roles and data.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {cpSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {checkRest} from './rbacRest.mjs';
import {finalPilot} from '../helpers/finalPilot.mjs';
import {rbacV5} from '../helpers/rbacV5.mjs';
import {coach,parent,player,uuid} from '../helpers/submissionDatabase.mjs';
import {adminUser} from '../helpers/clubWorkflow.mjs';

const here=fileURLToPath(import.meta.url);
const {default:pg}=await import(pathToFileURL(process.env.SDL_TEST_PG_MODULE).href);
const options=()=>({user:'fixture_owner',host:process.env.SDL_TEST_SOCKET,port:54918,database:'postgres'});

// The existing fixture factory accepts a constructor with exec/query/close.
export class PGlite {
 constructor(){this.ready=this.start();}
 async start(){
   assert.ok(process.env.SDL_TEST_SOCKET?.startsWith(join(tmpdir(),'sdl-native-')));
   const admin=new pg.Client(options());
   await admin.connect();
   this.name='fixture_'+randomUUID().replaceAll('-','');
   try{await admin.query('CREATE DATABASE '+this.name);}finally{await admin.end();}
   this.conn=new pg.Client({...options(),database:this.name});
   await this.conn.connect();
 }
 async exec(sql){
   await this.ready;
   // PostgreSQL roles are cluster-wide. Every database uses the same fixture roles.
   return this.conn.query(sql.replace(/CREATE ROLE (anon|authenticated|service_role)( BYPASSRLS)?;/g,
     stmt=>'DO $role$ BEGIN '+stmt+' EXCEPTION WHEN duplicate_object THEN NULL; END $role$;'));
 }
 async query(sql,args){await this.ready;return this.conn.query(sql,args);}
 async close(){await this.ready;await this.conn.end();}
}

const releaseSql=name=>readFileSync(new URL('../../backend/proposals/sdl004-rbac-v5/'+name,import.meta.url),'utf8');

async function checkPreflight(){
 let cleanup;
 const {db}=await finalPilot({after(fn){cleanup=fn;}});
 try {
   await db.exec('RESET ROLE');
   await assert.rejects(db.exec(releaseSql('preflight.sql')),/RLS prerequisite/);
   await db.exec('ROLLBACK; CREATE TABLE public.athletes(id uuid PRIMARY KEY)');
   for(const table of ['athletes','players','sessions','athlete_guardians','organizations','teams',
     'organization_memberships','team_memberships','player_team_memberships']){
     await db.exec('ALTER TABLE public.'+table+' ENABLE ROW LEVEL SECURITY');
   }
   await db.exec(releaseSql('preflight.sql'));
   console.log('Migration preflight accepted reviewed synthetic prerequisites and rejected drift.');
 } finally {
   await cleanup();
 }
}

function snapshot(result){
 return result.find(statement=>statement.command==='SELECT').rows.map(row=>row.jsonb_build_object);
}

async function backupFixture(){
 let cleanup;
 const {db,as}=await rbacV5({after(fn){cleanup=fn;}});
 try {
   const fixture=await as(coach,`SELECT public.sdl_004_pilot_submit_performance('${player}',
     'exit-radar-v1',77,CURRENT_DATE,'restore fixture','${uuid(808)}',true) AS receipt`);
   await db.exec(`RESET ROLE;
     CREATE SCHEMA supabase_migrations;
     CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
     INSERT INTO supabase_migrations.schema_migrations VALUES ('20261126151930'), ('20261126230927');`);
   const before=snapshot(await db.exec(releaseSql('baseline-inventory.sql')));
   assert.deepEqual(before.find(row=>row.section==='migration_ledger').evidence.versions,
     ['20261126151930','20261126230927']);
   assert.ok(before.some(row=>row.section==='function'&&row.evidence.definer));
   assert.ok(before.some(row=>row.section==='policy'&&row.evidence.mode==='RESTRICTIVE'));
   const historyRpc='public.sdl_v5_private_statistics(uuid,uuid,integer)';
   const functionEntry=rows=>rows.find(row=>row.section==='function'&&row.identity===historyRpc);
   await db.exec(`GRANT EXECUTE ON FUNCTION ${historyRpc} TO anon`);
   const drift=snapshot(await db.exec(releaseSql('baseline-inventory.sql')));
   assert.notDeepEqual(functionEntry(drift),functionEntry(before),'function ACL drift is recorded');
   await assert.rejects(db.exec(releaseSql('postflight.sql')),/Unexpected RPC privileges/);
   await db.exec(`ROLLBACK; REVOKE EXECUTE ON FUNCTION ${historyRpc} FROM anon`);
   await db.exec(releaseSql('containment-rehearsal.sql'));
   assert.deepEqual(snapshot(await db.exec(releaseSql('baseline-inventory.sql'))),before);
   return {database:db.name,inventory:before,record:fixture[0].receipt.id};
 } finally {
   await cleanup();
 }
}

async function verifyRestore(fixture){
 const connection=new pg.Client({...options(),database:fixture.database});
 await connection.connect();
 try {
   assert.deepEqual(snapshot(await connection.query(releaseSql('baseline-inventory.sql'))),fixture.inventory);
   await connection.query(releaseSql('postflight.sql'));
   const result=await connection.query('SELECT id FROM public.sdl_performance_submissions WHERE id=$1',[fixture.record]);
   assert.deepEqual(result.rows,[{id:fixture.record}]);
   await connection.query(releaseSql('containment-rehearsal.sql'));
   assert.deepEqual(snapshot(await connection.query(releaseSql('baseline-inventory.sql'))),fixture.inventory);
   console.log('Disposable backup restore retained synthetic records and catalog evidence. Containment and rollback passed.');
 } finally {
   await connection.end();
 }
}

async function competingWrites(){
 let cleanup;
 const {db,as}=await rbacV5({after(fn){cleanup=fn;}});
 const clients=[];
 try {
   await db.exec(readFileSync(new URL('../../backend/proposals/sdl004-rbac-v5/postflight.sql',import.meta.url),'utf8'));
   for(const uid of [coach,coach,adminUser,adminUser]){
     const client=new pg.Client({...options(),database:db.name});
     await client.connect();clients.push(client);
     await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid]);
     await client.query('SET ROLE authenticated');
   }
   const [submission]=await as(parent,`SELECT public.sdl_004_pilot_submit_performance('${player}',
     'exit-radar-v1',77,CURRENT_DATE,'fixture','${uuid(801)}',false) AS receipt`);
   const reviews=await Promise.allSettled(clients.slice(0,2).map(client=>client.query(
     "SELECT public.sdl_004_pilot_review_performance($1,'approved','checked',1)",[submission.receipt.id])));
   assert.equal(reviews.filter(row=>row.status==='fulfilled').length,1);
   assert.equal(reviews.find(row=>row.status==='rejected').reason.code,'PT409');
   const corrections=await Promise.allSettled(clients.slice(2).map((client,i)=>client.query(
     "SELECT public.sdl_004_pilot_submit_performance($1,'exit-radar-v1',78,CURRENT_DATE,'corrected evidence',$2,true,null,$3)",
     [player,uuid(802+i),submission.receipt.id])));
   assert.equal(corrections.filter(row=>row.status==='fulfilled').length,1);
   assert.ok(['PT409','22023'].includes(corrections.find(row=>row.status==='rejected').reason.code));
   console.log('Concurrent review and correction passed.');
   if(process.env.SDL_TEST_POSTGREST)await checkRest(db);
 } finally {
   await Promise.all(clients.map(client=>client.end()));
   await cleanup();
 }
}

async function main(){
 const socket=mkdtempSync(join(tmpdir(),'sdl-native-'));
 const data=join(socket,'data');
 const run=(bin,args)=>execFileSync(join(process.env.SDL_TEST_PGBIN,bin),args,{stdio:'inherit'});
 run('initdb',['-D',data,'-U','fixture_owner','-A','trust','--locale=C']);
 let activeData;
 const start=directory=>{
   run('pg_ctl',['-D',directory,'-o',"-c listen_addresses='' -k "+socket+' -p 54918','-l',join(socket,'server.log'),'-w','start']);
   activeData=directory;
 };
 const stop=()=>{
   run('pg_ctl',['-D',activeData,'-m','fast','-w','stop']);
   activeData=undefined;
 };
 try {
   start(data);
   process.env.SDL_TEST_SOCKET=socket;
   process.env.SDL004_PGLITE_RUNTIME=here;
   execFileSync(process.execPath,['--test','--test-concurrency=1',...['rbac-v5-operations.test.mjs','media-clean-start.test.mjs'].map(name=>fileURLToPath(new URL('../'+name,import.meta.url)))],{stdio:'inherit'});
   await checkPreflight();
   await competingWrites();
   const fixture=await backupFixture();
   stop();
   const backup=join(socket,'backup');
   const restored=join(socket,'restored');
   cpSync(data,backup,{recursive:true,verbatimSymlinks:true});
   cpSync(backup,restored,{recursive:true,verbatimSymlinks:true});
   start(restored);
   await verifyRestore(fixture);
 } finally {
   if(activeData)stop();
   rmSync(socket,{recursive:true});
 }
}

if(process.argv[1]===here)main().catch(error=>{console.error(error);process.exitCode=1;});
