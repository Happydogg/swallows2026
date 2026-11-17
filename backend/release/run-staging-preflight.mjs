// Prepared operator tool. Never invoked by build/tests or a deployment hook.
// Unit tests use planPreflight only; no live SQL is executed in local validation.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export class PreflightError extends Error {}
export const STAGING_PROJECT='wvurolqbjhuckkkjiiiv';
export function planPreflight({confirmation,manifest,databaseUrl,caFile,env={}}) {
 if(confirmation!==STAGING_PROJECT||manifest?.project_ref!==STAGING_PROJECT)throw new PreflightError('Explicit target staging project confirmation required.');
 const history=manifest.history;
 if(typeof history?.exists!=='boolean'||!Array.isArray(history.versions)||history.versions.some(v=>typeof v!=='string'||!/^\d{14}$/.test(v))
  ||new Set(history.versions).size!==history.versions.length||(!history.exists&&history.versions.length))throw new PreflightError('Reviewed migration history required.');
 let url;try{url=new URL(databaseUrl);}catch{throw new PreflightError('A staging database connection is required.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!==`db.${STAGING_PROJECT}.supabase.co`
  ||!url.password||url.pathname!=='/postgres'||(url.port&&url.port!=='5432')||url.search||url.hash||decodeURIComponent(url.username)!=='postgres')throw new PreflightError('Only the dedicated staging database host is allowed; overrides/poolers are not accepted.');
 if(/[\u0000\r\n]/.test(decodeURIComponent(url.password)))throw new PreflightError('Invalid database password encoding.');
 if(!caFile)throw new PreflightError('An approved staging CA file is required for verify-full TLS.');
 const safeEnv=Object.fromEntries(Object.entries(env).filter(([key])=>!/^(PG|SDL004_STAGING_DB_|SDL004_RESTORE_DB_)/i.test(key)));
 const quote=value=>"'"+value.replaceAll("'","''")+"'";
 return {args:['-X','--no-password','--set=ON_ERROR_STOP=1','--file=-'],env:{...safeEnv,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:'postgres',PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'postgres',PGSSLMODE:'verify-full',PGSSLROOTCERT:caFile},
  input:`SET sdl004.confirmed_project_ref=${quote(confirmation)};\nSET sdl004.expected_migration_history=${quote(JSON.stringify({exists:history.exists,versions:[...history.versions].sort()}))};\n`+
   fs.readFileSync(new URL('./staging-preflight.sql',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('./final-pilot-preflight.sql',import.meta.url),'utf8')};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
 try {
  const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
  if(!args.includes('--confirm-project')||!args.includes('--manifest'))throw new PreflightError('Supply --confirm-project and --manifest explicitly.');
  const manifest=JSON.parse(fs.readFileSync(value('--manifest'),'utf8'));
  const caFile=process.env.SDL004_STAGING_CA_FILE;
  if(!caFile||!fs.statSync(caFile).isFile())throw new PreflightError('Approved CA file missing.');
  const plan=planPreflight({confirmation:value('--confirm-project'),manifest,databaseUrl:process.env.SDL004_STAGING_DB_URL,caFile,env:process.env});
  const result=spawnSync('psql',plan.args,{env:plan.env,input:plan.input,encoding:'utf8'});
  if(result.status!==0)throw new PreflightError((result.stderr?.match(/ERROR:\s+SDL004 preflight:[^\n]*/g)||['Staging preflight failed; no migration was applied. Check connection/permissions locally.']).join('\n'));
  process.stdout.write(result.stdout);
 }catch(error){console.error(error instanceof PreflightError?error.message:'Staging preflight failed before SQL execution or could not complete. Inspect local paths, client and TLS configuration privately.');process.exitCode=1;}
}
