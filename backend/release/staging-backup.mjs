// Native PostgreSQL tools. Default is a local-only plan; no provider API or live SQL in tests.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {STAGING_PROJECT} from './run-staging-preflight.mjs';
export const REPO=fileURLToPath(new URL('../../',import.meta.url));
export const BACKUP_ROOT=path.join(REPO,'work','backups','SDL-004');
const inventorySql=fileURLToPath(new URL('./backup-inventory.sql',import.meta.url));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});
export class BackupError extends Error {}
function ensure(ok,message){if(!ok)throw new BackupError(message);}
export function sourceEnvironment({confirmation,caFile,password,env=process.env}){
 ensure(confirmation===STAGING_PROJECT,'Exact staging project confirmation required.');
 ensure(caFile&&fs.statSync(caFile).isFile(),'Approved staging TLS CA file required.');
 ensure(typeof password==='string'&&password.length>0&&!/[\u0000\r\n]/.test(password),'Staging database password required via secure prompt/environment.');
 const clean=Object.fromEntries(Object.entries(env).filter(([k])=>!/^(PG|SDL004_STAGING_DB_|SDL004_RESTORE_DB_)/i.test(k)));
 return {...clean,PGHOST:`db.${STAGING_PROJECT}.supabase.co`,PGPORT:'5432',PGUSER:'postgres',PGDATABASE:'postgres',PGPASSWORD:password,
  PGSSLMODE:'verify-full',PGSSLROOTCERT:path.resolve(caFile),PGCONNECT_TIMEOUT:'15',PGAPPNAME:'sdl004-staging-backup',PGOPTIONS:'-c default_transaction_read_only=on -c lock_timeout=10000 -c statement_timeout=300000'};
}
export function backupPlan(){return {project:STAGING_PROJECT,host:`db.${STAGING_PROJECT}.supabase.co`,tls:'verify-full',postgresToolsMajor:17,
 outputRoot:BACKUP_ROOT,approvalRequired:true,quiescentSourceRequired:true,recoverabilityVerified:false,
 commands:[['pg_dumpall','--roles-only','--no-role-passwords','--no-password','--file=roles.sql'],['pg_dump','--format=custom','--no-password','--file=database.dump'],['pg_restore','--list','database.dump']],
 includes:'Full non-system database schema/data including managed Auth, Storage metadata, RLS, grants, functions and migration metadata when present. No custom schema/data exclusions; standard PostgreSQL extension-owned/system exclusions still apply.',
 excludes:'R2/Storage object bytes, external encryption/JWT/API keys, provider configuration, role passwords, PostgreSQL system catalogs/binaries.'};}
export function recoveryState(inventory){
 const {database,role,tls,...state}=inventory;return state;
}
function secureDirectory(directory,execute){
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 if(process.platform==='win32'){
  // Restrict BEFORE any sensitive dump is written; no fallback to permissive ACLs.
  try{
   const acl=execute('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./ProtectBackupDirectory.ps1',import.meta.url)),'-Directory',directory],{encoding:'utf8',windowsHide:true,shell:false});
   ensure(!acl.error&&acl.status===0,'Cannot protect backup folder ACL.');
  }catch{throw new BackupError('Cannot protect backup folder ACL.');}
 }else fs.chmodSync(directory,0o700);
}
function checkedDirectory(directory){
 const resolved=path.resolve(directory),relative=path.relative(path.resolve(BACKUP_ROOT),resolved);
 ensure(relative&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'Backup must be in the dedicated Git-ignored backup folder.');
 let current=REPO;for(const part of path.relative(REPO,resolved).split(path.sep)){
  current=path.join(current,part);if(fs.existsSync(current))ensure(!fs.lstatSync(current).isSymbolicLink(),'Backup folder cannot use symlinks/junctions.');
 }
 return resolved;
}
export function protectedBackupDirectory(directory,execute=spawnSync){
 const resolved=checkedDirectory(directory),root=path.resolve(BACKUP_ROOT);
 const ignored=spawnSync('git',['check-ignore','--quiet','--',path.relative(REPO,resolved)],{cwd:REPO});ensure(ignored.status===0,'Backup location is not Git-ignored.');
 secureDirectory(root,execute);secureDirectory(resolved,execute);return resolved;
}
export function performBackup({approved=false,quiescent=false,confirmation,caFile,password,env,execute=spawnSync,directory=path.join(BACKUP_ROOT,new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID())}={}){
 ensure(approved&&quiescent,'Live backup requires separate approval and an acknowledged quiescent source.');
 const childEnv=sourceEnvironment({confirmation,caFile,password,env});
 ensure(!fs.existsSync(directory),'Refusing to overwrite an existing backup.');
 const dir=protectedBackupDirectory(directory,execute),manifestPath=path.join(dir,'manifest.json');
 const manifest={format:1,project_ref:STAGING_PROJECT,created_at:new Date().toISOString(),status:'INCOMPLETE',recoverabilityVerified:false,files:{},scope:backupPlan().includes,exclusions:backupPlan().excludes};write(manifestPath,manifest);
 function run(tool,args){
  let result;try{result=execute(tool,args,{env:childEnv,encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true,shell:false});}catch{throw new BackupError('PostgreSQL tool could not start; export incomplete.');}
  ensure(!result.error&&result.status===0,`${tool} failed. Export incomplete; inspect locally without publishing raw diagnostics.`);return result.stdout||'';
 }
 function inventory(){return JSON.parse(run('psql',['-X','--no-password','--quiet','--tuples-only','--no-align','--set=ON_ERROR_STOP=1','--file='+inventorySql]).trim());}
 try{
  for(const tool of['psql','pg_dump','pg_dumpall','pg_restore'])ensure(new RegExp('\\b17\\.').test(run(tool,['--version'])),'PostgreSQL 17 client tools required.');
  const before=inventory();ensure(before.database==='postgres'&&before.role==='postgres'&&before.tls===true&&before.server_major===17,'Unexpected staging identity, TLS, role or server major.');
  for(const schema of ['public','auth'])ensure(before.schemas?.includes(schema),'Required application/Auth schema missing.');
  for(const name of ['auth.users','auth.sessions','public.players','public.sdl_media_objects'])ensure(Object.hasOwn(before.counts||{},name),'Required Auth/pilot relation missing from export inventory.');
  write(path.join(dir,'inventory-before.json'),before);
  run('pg_dumpall',['--roles-only','--no-role-passwords','--no-password','--file='+path.join(dir,'roles.sql')]);
  run('pg_dump',['--format=custom','--no-password','--file='+path.join(dir,'database.dump')]);
  const toc=run('pg_restore',['--list',path.join(dir,'database.dump')]);
  ensure(toc.includes('TABLE DATA auth users')&&toc.includes('TABLE DATA public players'),'Archive missing required Auth/table data entries.');
  fs.writeFileSync(path.join(dir,'archive-toc.txt'),toc,{mode:0o600});
  const after=inventory();ensure(isDeepStrictEqual(recoveryState(before),recoveryState(after)),'Source changed during export. Keep incomplete artifacts private; approve/retry after quiescing activity.');
  write(path.join(dir,'inventory-after.json'),after);
  for(const name of ['roles.sql','database.dump','archive-toc.txt','inventory-before.json','inventory-after.json']){
   const file=path.join(dir,name);ensure(fs.statSync(file).size>0,'Empty backup artifact.');fs.chmodSync(file,0o600);manifest.files[name]={sha256:hash(file),bytes:fs.statSync(file).size};
  }
  manifest.status='EXPORT_SUCCEEDED_UNVERIFIED';write(manifestPath,manifest);return {directory:dir,status:manifest.status,recoverabilityVerified:false};
 }catch(e){manifest.status='FAILED_INCOMPLETE';write(manifestPath,manifest);throw e;}
}
export function inspectBackup(directory){
 const root=checkedDirectory(directory);ensure(!fs.lstatSync(path.join(root,'manifest.json')).isSymbolicLink(),'Backup manifest cannot be a symlink.');
 const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
 ensure(m.project_ref===STAGING_PROJECT&&m.status==='EXPORT_SUCCEEDED_UNVERIFIED','No successfully completed staging export in this folder.');
 const expected=['roles.sql','database.dump','archive-toc.txt','inventory-before.json','inventory-after.json'];
 ensure(isDeepStrictEqual(Object.keys(m.files).sort(),expected.sort()),'Incomplete backup manifest.');
 for(const [name,info]of Object.entries(m.files)){ensure(path.basename(name)===name,'Invalid backup filename.');const f=path.join(root,name);ensure(!fs.lstatSync(f).isSymbolicLink()&&fs.statSync(f).size===info.bytes&&hash(f)===info.sha256,'Backup integrity check failed.');}
 return m;
}
export function localValidationPlan({database,port='6543',password,env=process.env}){
 ensure(/^sdl004_restore_[a-z0-9_]+$/.test(database||''),'Isolated database name must start sdl004_restore_.');
 ensure(/^\d+$/.test(String(port))&&Number(port)>=1024&&Number(port)<=65535&&Number(port)!==5432,'Use a dedicated isolated local port, not 5432.');
 ensure(typeof password==='string'&&password.length>0&&!/[\u0000\r\n]/.test(password),'Separate isolated database password required.');
 const clean=Object.fromEntries(Object.entries(env).filter(([k])=>!/^(PG|SDL004_STAGING_DB_|SDL004_RESTORE_DB_)/i.test(k)));
 return {args:['-X','--no-password','--quiet','--tuples-only','--no-align','--set=ON_ERROR_STOP=1','--file='+inventorySql],
 env:{...clean,PGHOST:'127.0.0.1',PGHOSTADDR:'127.0.0.1',PGPORT:String(port),PGUSER:'postgres',PGDATABASE:database,PGPASSWORD:password,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGOPTIONS:'-c default_transaction_read_only=on'}};
 // TLS is disabled ONLY on an explicitly isolated loopback test DB, never the staging path.
}
export function validateLocalRestore({approved=false,directory,database,port,password,execute=spawnSync,env}={}){
 ensure(approved,'Separate approval required before querying an isolated restore.');const manifest=inspectBackup(directory);
 const plan=localValidationPlan({database,port,password,env});const result=execute('psql',plan.args,{env:plan.env,encoding:'utf8',maxBuffer:32*1024*1024,shell:false,windowsHide:true});
 ensure(!result.error&&result.status===0,'Isolated validation query failed.');const actual=JSON.parse(result.stdout.trim());
 const source=JSON.parse(fs.readFileSync(path.join(directory,'inventory-before.json')));
 ensure(actual.database===database&&isDeepStrictEqual(recoveryState(actual),recoveryState(source)),'Restored inventory, counts, policies, functions, constraints, roles/ACLs or extensions differ.');
 const report={archive_sha256:manifest.files['database.dump'].sha256,database,host:'127.0.0.1',port:String(port||'6543'),verified_at:new Date().toISOString(),inventoryMatches:true,recoverabilityVerified:false,
 manualChecksRequired:['Successful pg_restore --exit-on-error log for this exact archive and isolated target','Reviewed role/extension bootstrap; no skipped errors or weakened RLS','Auth/family/coach authorization smoke checks in isolation; external encryption keys/configuration and R2 retention review']};
 write(path.join(directory,'isolated-validation.json'),report);return report;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 try{
  const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];
  if(args.includes('--execute-backup')){
   const result=performBackup({approved:args.includes('--approved-live-backup'),quiescent:args.includes('--quiescent'),confirmation:value('--confirm-project'),caFile:value('--ca'),password:process.env.SDL004_STAGING_DB_PASSWORD});
   console.log(JSON.stringify(result));
  }else if(args.includes('--validate-local-restore')){
   const r=validateLocalRestore({approved:args.includes('--approved-local-validation'),directory:value('--directory'),database:value('--database'),port:value('--port'),password:process.env.SDL004_RESTORE_DB_PASSWORD});
   console.log(JSON.stringify({inventoryMatches:r.inventoryMatches,recoverabilityVerified:false}));
  }else if(args.includes('--inspect')){inspectBackup(value('--directory'));console.log('Archive files/checksums match; recoverability is NOT yet verified.');}
  else{ensure(args.length===0||args.length===1&&args[0]==='--plan','Unknown or incomplete command.');console.log(JSON.stringify(backupPlan(),null,2));}
 }catch(e){console.error('SDL004 backup: '+(e instanceof BackupError?e.message:'Local file/tool operation failed. Inspect privately; no recoverable backup is certified.'));process.exitCode=1;}
}
