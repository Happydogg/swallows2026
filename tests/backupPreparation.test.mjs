// Synthetic tool invocations only: never pg_dump/psql against any server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {backupPlan,sourceEnvironment,performBackup,inspectBackup,validateLocalRestore,localValidationPlan,BACKUP_ROOT,recoveryState} from '../backend/release/staging-backup.mjs';
const P='wvurolqbjhuckkkjiiiv';
function fixture(t){fs.mkdirSync(BACKUP_ROOT,{recursive:true});const root=fs.mkdtempSync(path.join(BACKUP_ROOT,'synthetic-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const ca=path.join(root,'synthetic-ca.crt');fs.writeFileSync(ca,'SYNTHETIC CERTIFICATE');
 return{root,ca,directory:path.join(root,'export'),confirmation:P,password:'synthetic-test-password',env:{}};}
const inventory={server_major:17,database:'postgres',role:'postgres',tls:true,schemas:['public','auth','storage'],counts:{'public.players':4,'auth.users':3,'auth.sessions':3,'public.sdl_media_objects':2},tables:[],columns:[],functions:[],policies:[],constraints:[],extensions:[],history_exists:false,roles:{},role_memberships:[]};
function fakeTools(overrides={}){const calls=[];let reads=0;return{calls,execute(tool,args,options){calls.push({tool,args,options});if(args[0]==='--version')return{status:0,stdout:tool+' (PostgreSQL) 17.11'};
 if(tool==='psql')return{status:0,stdout:JSON.stringify(overrides.inventory?.(++reads)??inventory)};
 if(tool==='pg_dumpall'||tool==='pg_dump'){if(overrides.fail===tool)return{status:1,stderr:'SECRET raw diagnostic must never be printed'};const file=args.find(a=>a.startsWith('--file=')).slice(7);fs.writeFileSync(file,tool==='pg_dump'?'PGDMP synthetic archive':'CREATE ROLE authenticated;');return{status:0,stdout:''};}
 if(tool==='pg_restore')return{status:0,stdout:'1; 0 0 TABLE DATA auth users postgres\n2; 0 0 TABLE DATA public players postgres\n'};
 return{status:0,stdout:''};}};}
test('backup default mode is a credential-free plan and performs no database operation',()=>{
 const r=spawnSync(process.execPath,['backend/release/staging-backup.mjs','--plan'],{encoding:'utf8'});assert.equal(r.status,0);const p=JSON.parse(r.stdout);assert.equal(p.project,P);assert.equal(p.approvalRequired,true);assert.equal(p.recoverabilityVerified,false);assert.match(p.tls,/verify-full/);assert.ok(p.commands[0].includes('--no-role-passwords'));assert.doesNotMatch(r.stdout,/postgresql:\/\/|PGPASSWORD/);
});
test('backup execution requires explicit approval, quiescent acknowledgement, correct project and approved CA before invoking tools',t=>{
 const f=fixture(t);let n=0;const execute=()=>{n++;throw Error('No process allowed');};
 for(const options of [{},{approved:true},{approved:true,quiescent:true,confirmation:'other'}, {approved:true,quiescent:true,caFile:''}])assert.throws(()=>performBackup({...f,caFile:f.ca,execute,...options}));assert.equal(n,0);
});
test('source credentials stay in child environment with exact staging host and verified TLS; inherited PostgreSQL overrides are removed',t=>{
 const {ca}=fixture(t);const env=sourceEnvironment({confirmation:P,caFile:ca,password:'synthetic',env:{PGHOST:'other',PGHOSTADDR:'1.2.3.4',PGSSLMODE:'disable',PGOPTIONS:'evil',SDL004_STAGING_DB_URL:'private',SDL004_STAGING_DB_PASSWORD:'private',pgservice:'untrusted',sdl004_restore_db_password:'private'}});
 assert.equal(env.PGHOST,'db.'+P+'.supabase.co');assert.equal(env.PGHOSTADDR,undefined);assert.equal(env.PGSSLMODE,'verify-full');assert.equal(env.PGSSLROOTCERT,ca);assert.match(env.PGOPTIONS,/default_transaction_read_only=on/);assert.equal(env.SDL004_STAGING_DB_URL,undefined);assert.equal(env.SDL004_STAGING_DB_PASSWORD,undefined);assert.equal(env.pgservice,undefined);assert.equal(env.sdl004_restore_db_password,undefined);
 assert.throws(()=>sourceEnvironment({confirmation:P,caFile:ca,password:'secret\0suffix'}),/password required/);
});
test('synthetic successful export includes full archive, roles, metadata and checksums but never certifies recoverability',t=>{
 const f=fixture(t),tools=fakeTools();const result=performBackup({...f,caFile:f.ca,approved:true,quiescent:true,execute:tools.execute});assert.equal(result.status,'EXPORT_SUCCEEDED_UNVERIFIED');assert.equal(result.recoverabilityVerified,false);
 const m=inspectBackup(result.directory);assert.equal(Object.keys(m.files).length,5);assert.equal(m.recoverabilityVerified,false);
 assert.equal(tools.calls.filter(c=>c.tool==='pg_dump').length,2); // version + one whole-database dump
 const dump=tools.calls.find(c=>c.tool==='pg_dump'&&c.args[0]!=='--version');assert.ok(dump.args.includes('--format=custom'));assert.ok(!dump.args.some(a=>/exclude|schema=|data-only|no-acl|no-owner/.test(a)));
 for(const c of tools.calls.filter(c=>['psql','pg_dump','pg_dumpall','pg_restore'].includes(c.tool))){assert.doesNotMatch(c.args.join(' '),/synthetic-test-password|postgresql:\/\//);assert.equal(c.options.env.PGSSLMODE,'verify-full');}
 for(const name of fs.readdirSync(result.directory))assert.ok(!fs.readFileSync(path.join(result.directory,name)).includes(Buffer.from(f.password)));
});
test('failed or changed exports remain incomplete and cannot pass archive inspection',t=>{
 for(const override of [{fail:'pg_dump'},{inventory:n=>({...inventory,counts:{'public.players':n}})}]){
  const f=fixture(t),tools=fakeTools(override);assert.throws(()=>performBackup({...f,caFile:f.ca,approved:true,quiescent:true,execute:tools.execute}));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.directory,'manifest.json'))).status,'FAILED_INCOMPLETE');assert.throws(()=>inspectBackup(f.directory),/No successfully/);
 }
});
test('hash validation detects archive tampering and refuses backup locations outside the Git-ignored root',t=>{
 const f=fixture(t),tools=fakeTools();performBackup({...f,caFile:f.ca,approved:true,quiescent:true,execute:tools.execute});fs.appendFileSync(path.join(f.directory,'database.dump'),'changed');assert.throws(()=>inspectBackup(f.directory),/integrity/);
 assert.throws(()=>performBackup({...f,directory:path.join(f.root,'..','..','..','..','outside'),caFile:f.ca,approved:true,quiescent:true,execute:tools.execute}),/dedicated Git-ignored/);
});
test('isolated validation cannot select staging/production host, database URI, default port or inherited connection',()=>{
 for(const database of ['postgres','production','postgresql://remote/db','sdl004_restore_x?host=remote'])assert.throws(()=>localValidationPlan({database,password:'synthetic'}),/Isolated database/);
 for(const port of [5432,'05432'])assert.throws(()=>localValidationPlan({database:'sdl004_restore_test',password:'synthetic',port}),/dedicated/);
 const p=localValidationPlan({database:'sdl004_restore_test',password:'synthetic',env:{PGHOST:'staging',PGSERVICE:'other',PGHOSTADDR:'8.8.8.8'}});assert.equal(p.env.PGHOST,'127.0.0.1');assert.equal(p.env.PGHOSTADDR,'127.0.0.1');assert.equal(p.env.PGSERVICE,undefined);assert.match(p.env.PGOPTIONS,/read_only=on/);
});
test('synthetic isolated inventory validation still requires manual restore/auth verification',t=>{
 const f=fixture(t),tools=fakeTools();performBackup({...f,caFile:f.ca,approved:true,quiescent:true,execute:tools.execute});
 const r=validateLocalRestore({approved:true,directory:f.directory,database:'sdl004_restore_test',password:'synthetic',execute:()=>({status:0,stdout:JSON.stringify({...inventory,database:'sdl004_restore_test',tls:false})})});
 assert.equal(r.inventoryMatches,true);assert.equal(r.recoverabilityVerified,false);assert.ok(r.manualChecksRequired.length);
 assert.throws(()=>validateLocalRestore({directory:f.directory}),/Separate approval/);
 assert.throws(()=>validateLocalRestore({approved:true,directory:f.directory,database:'sdl004_restore_test',password:'synthetic',execute:()=>({status:0,stdout:JSON.stringify({...inventory,database:'sdl004_restore_test',policies:['drift']})})}),/differ/);
});
test('Windows wrapper defaults to Plan, masks credentials, restores process environment and has no execution-policy bypass',()=>{
 const s=fs.readFileSync(new URL('../backend/release/Sdl004-Staging.ps1',import.meta.url),'utf8');assert.match(s,/Operation = 'Plan'/);assert.match(s,/Read-Host.*-AsSecureString/);assert.match(s,/finally/);assert.match(s,/ApprovedLiveBackup/);assert.match(s,/ApprovedReadOnlyPreflight/);assert.doesNotMatch(s,/ExecutionPolicy|Write-Host.*password|Start-Transcript|Invoke-Expression/);
 const acl=fs.readFileSync(new URL('../backend/release/ProtectBackupDirectory.ps1',import.meta.url),'utf8');assert.match(acl,/SetAccessRuleProtection\(\$true, \$false\)/);assert.match(acl,/Set-Acl -LiteralPath/);
});
test('backup inventory SQL prepares on local PostgreSQL/WASM without executing a live export',{skip:!process.env.SDL004_PGLITE_RUNTIME},async t=>{
 const {PGlite}=await import(pathToFileURL(process.env.SDL004_PGLITE_RUNTIME).href);const db=new PGlite();t.after(()=>db.close());
 const sql=fs.readFileSync(new URL('../backend/release/backup-inventory.sql',import.meta.url),'utf8').replace('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;','').replace(/COMMIT;\s*$/,'');
 await db.exec('EXPLAIN (COSTS OFF) '+sql);
});

test('native startup diagnostics and invalid TLS metadata never leak credentials or produce a successful export',t=>{
 const f=fixture(t);assert.throws(()=>performBackup({...f,caFile:f.ca,approved:true,quiescent:true,execute:()=>{throw Error('SENSITIVE_PASSWORD');}}),e=>!e.message.includes('SENSITIVE_PASSWORD'));
 const second=fixture(t),tools=fakeTools({inventory:()=>({...inventory,tls:false})});assert.throws(()=>performBackup({...second,caFile:second.ca,approved:true,quiescent:true,execute:tools.execute}),/TLS/);
 assert.equal(tools.calls.some(c=>c.tool==='pg_dump'&&c.args[0]!=='--version'),false);
});
