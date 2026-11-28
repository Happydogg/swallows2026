// Pure deployment planning/configuration tests. No Cloudflare or database connections.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planPreflight,STAGING_PROJECT} from '../backend/release/run-staging-preflight.mjs';
import {target,reviewedBaseline,preservedObservability,verifyPreservation,deploymentBaseline,verifyCurrentVersion} from '../backend/worker/deploymentPreservation.mjs';
const plan=overrides=>planPreflight({confirmation:STAGING_PROJECT,manifest:{project_ref:STAGING_PROJECT,history:{exists:false,versions:[]}},
 databaseUrl:`postgresql://postgres:synthetic@db.${STAGING_PROJECT}.supabase.co:5432/postgres`,caFile:'/synthetic/ca.crt',...overrides});
test('preflight requires explicit exact staging confirmation and reviewed migration history',()=>{
 assert.throws(()=>plan({confirmation:undefined}),/confirmation/);assert.throws(()=>plan({confirmation:'other'}),/confirmation/);
 assert.throws(()=>plan({manifest:{project_ref:STAGING_PROJECT}}),/history/);
 for(const history of [{exists:false,versions:['20261101000000']},{exists:true,versions:['invalid']},{exists:true,versions:['20261101000000','20261101000000']}])
  assert.throws(()=>plan({manifest:{project_ref:STAGING_PROJECT,history}}),/history/);
});
test('preflight rejects alternate hosts, poolers, insecure overrides and missing CA',()=>{
 for(const url of ['postgresql://postgres:synthetic@db.other.supabase.co/postgres',`postgresql://postgres:synthetic@db.${STAGING_PROJECT}.supabase.co/postgres?sslmode=disable`,
 `postgresql://postgres:synthetic@db.${STAGING_PROJECT}.supabase.co/other`,`postgresql://other:synthetic@db.${STAGING_PROJECT}.supabase.co/postgres`,
 `postgresql://postgres:synthetic@pooler.supabase.com/postgres`])assert.throws(()=>plan({databaseUrl:url}),/dedicated staging/);
 assert.throws(()=>plan({caFile:''}),/CA/);
});
test('preflight uses verify-full, no psql startup file, read-only SQL and no credential arguments',()=>{
 const p=plan({env:{PGHOST:'unexpected',PGOPTIONS:'-c role=other',PGSERVICE:'other',SDL004_STAGING_DB_URL:'private',pgservice:'untrusted',sdl004_staging_db_password:'private',PATH:'/bin'}});
 assert.equal(p.env.PGSSLMODE,'verify-full');assert.equal(p.env.PGSSLROOTCERT,'/synthetic/ca.crt');assert.equal(p.env.PGHOST,`db.${STAGING_PROJECT}.supabase.co`);assert.equal(p.env.PGDATABASE,'postgres');assert.equal(p.env.PGUSER,'postgres');
 assert.equal(p.env.PGOPTIONS,undefined);assert.equal(p.env.PGSERVICE,undefined);assert.equal(p.env.SDL004_STAGING_DB_URL,undefined);assert.equal(p.env.pgservice,undefined);assert.equal(p.env.sdl004_staging_db_password,undefined);
 assert.ok(p.args.includes('-X'));assert.ok(p.args.includes('--set=ON_ERROR_STOP=1'));assert.doesNotMatch(p.args.join(' '),/synthetic|postgresql/);
 assert.match(p.input,/BEGIN READ ONLY/);assert.match(p.input,new RegExp(`confirmed_project_ref='${STAGING_PROJECT}'`));
});
const baseline=()=>({...target,confirmed:true,versionId:'synthetic-version',otherSettingsReviewed:true,
 workerSettings:{workersDev:true,previewUrls:false,compatibilityFlags:[],logpush:false,tailConsumers:[],tags:[],usageModel:'standard',placement:null,limits:null},routeHandling:'preserve-unmanaged',unmanagedRoutesReviewed:true,rollback:{versionId:'synthetic-version',deploymentId:'synthetic-deployment',percentage:100},
 env:{MEDIA_BUCKET:{type:'r2',name:'sdl-media-staging'},SUPABASE_URL:{type:'json',value:`https://${STAGING_PROJECT}.supabase.co`},
 SUPABASE_PUBLISHABLE_KEY:{type:'secret'},SUPABASE_SECRET_KEY:{type:'secret'}},observability:{enabled:false,traces:{enabled:false}}});
test('release fails closed without a reviewed current Worker settings baseline',()=>{
 assert.throws(()=>reviewedBaseline(null),/Release blocked/);assert.throws(()=>deploymentBaseline({}),/Release blocked/);
 assert.equal(deploymentBaseline({SDL004_LOCAL_BUILD_ONLY:'1'}),null);
 assert.throws(()=>verifyPreservation({},null),/Release blocked/);
});
test('existing observability is copied exactly, including disabled traces and sampling',()=>{
 for(const obs of [null,{enabled:false,traces:{enabled:false}},{enabled:true,logs:{enabled:true,headSamplingRate:0.2},traces:{enabled:false}}]){
  const b={...baseline(),observability:obs};assert.deepEqual(preservedObservability(b),obs);
  verifyPreservation({...target,workersDev:true,previewUrls:false,compatibilityFlags:[],logpush:false,tailConsumers:[],env:{...b.env,SUBMISSIONS_ENABLED:{type:'json',value:'false'}},...(obs?{observability:obs}:{})},b);
 }
 const b=baseline();assert.throws(()=>verifyPreservation({...target,workersDev:true,previewUrls:false,compatibilityFlags:[],logpush:false,tailConsumers:[],env:{...b.env,SUBMISSIONS_ENABLED:{type:'json',value:'false'}},observability:{enabled:true,traces:{enabled:true}}},b),/Observability drift/);
});
test('binding drift, embedded secret values, wrong targets and enabled v2 block release',()=>{
 for(const mutate of [b=>{b.env.EXTRA={type:'secret'};},b=>{b.env.SUPABASE_SECRET_KEY.value='forbidden';},b=>{b.env.MEDIA_BUCKET.name='other';},
 b=>{delete b.env.SUPABASE_PUBLISHABLE_KEY;},b=>{b.name='other';},b=>{b.accountId='other';},b=>{b.compatibilityDate='other';},
 b=>{b.env.SUBMISSIONS_ENABLED={type:'json',value:'true'};},b=>{delete b.observability;}]){
  const b=baseline();mutate(b);assert.throws(()=>reviewedBaseline(b));
 }
});
test('pinned Cloudflare uploader keeps existing secrets and local config adds no paid tracing opt-in',()=>{
 const dir=new URL('../backend/worker/node_modules/cf/dist/',import.meta.url);
 const upload=fs.readdirSync(dir).filter(n=>n.startsWith('static-assets-')&&n.endsWith('.mjs')).map(n=>fs.readFileSync(new URL(n,dir),'utf8')).join('');
 assert.match(upload,/keepSecrets:!0/,'Re-review secret preservation if the pinned deploy tool changes');
 const config=fs.readFileSync(new URL('../backend/worker/cloudflare.config.ts',import.meta.url),'utf8');
 assert.doesNotMatch(config,/traces:\s*\{\s*enabled:\s*true/);assert.match(config,/deploymentBaseline\(\)/);
});

test('preservation guard rejects enabled previews, managed routes, unknown settings and stale rollback receipts',()=>{
 const b=baseline(),config={...target,workersDev:true,previewUrls:false,compatibilityFlags:[],logpush:false,tailConsumers:[],env:{...b.env,SUBMISSIONS_ENABLED:{type:'json',value:'false'}},observability:b.observability};
 verifyPreservation(config,b);
 for(const change of [{previewUrls:true},{domains:[]},{triggers:[]},{routes:[]},{logpush:true},{tailConsumers:[{worker:'unexpected'}]},{compatibilityFlags:['nodejs_compat']}])assert.throws(()=>verifyPreservation({...config,...change},b));
 for(const change of [{workerSettings:{...b.workerSettings,previewUrls:true}},{routeHandling:'manage'},{unmanagedRoutesReviewed:false},{rollback:{...b.rollback,versionId:'other'}}])assert.throws(()=>reviewedBaseline({...b,...change}));
 assert.throws(()=>verifyCurrentVersion(b),/recheck/);assert.throws(()=>verifyCurrentVersion(b,'other-version'),/recheck/);verifyCurrentVersion(b,b.versionId);
});
test('pinned deploy tool skips route and domain mutations for unconfigured route lists',()=>{
 const dir=new URL('../backend/worker/node_modules/cf/dist/',import.meta.url),name=fs.readdirSync(dir).find(n=>n.startsWith('static-assets-')&&n.endsWith('.mjs'));
 const source=fs.readFileSync(new URL(name,dir),'utf8');assert.match(source,/o\.length>0&&d\.push\(Er/);assert.match(source,/s\.length>0&&d\.push\(Or/);
});
