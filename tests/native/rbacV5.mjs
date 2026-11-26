// Optional native integration run. Requires initdb, pg_ctl and the pg client.
// Always create a new Unix-socket-only cluster with synthetic roles and data.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {checkRest} from './rbacRest.mjs';
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
 run('pg_ctl',['-D',data,'-o',"-c listen_addresses='' -k "+socket+' -p 54918','-l',join(socket,'server.log'),'-w','start']);
 try {
   process.env.SDL_TEST_SOCKET=socket;
   process.env.SDL004_PGLITE_RUNTIME=here;
   execFileSync(process.execPath,['--test',fileURLToPath(new URL('../rbac-v5-operations.test.mjs',import.meta.url))],{stdio:'inherit'});
   await competingWrites();
 } finally {
   run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
   rmSync(socket,{recursive:true});
 }
}

if(process.argv[1]===here)main().catch(error=>{console.error(error);process.exitCode=1;});
