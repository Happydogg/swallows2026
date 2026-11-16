// Optional real Workers runtime simulation, with all outbound traffic disabled.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/worker/package.json',import.meta.url));
let Miniflare,convert;try{({Miniflare,convertV4MiniflareOptions:convert}=require('miniflare'));}catch{}
const script=new URL('../backend/worker/.cloudflare/output/v1/workers/default/bundle/index.js',import.meta.url);
test('built Worker starts in workerd, keeps new features disabled and makes no outbound requests',{skip:!Miniflare||!fs.existsSync(script)},async t=>{
 let outbound=0;
 const mf=new Miniflare(convert({modules:true,scriptPath:script.pathname,compatibilityDate:'2026-11-16',
   bindings:{SUPABASE_URL:'https://wvurolqbjhuckkkjiiiv.supabase.co',SUBMISSIONS_ENABLED:'false'},r2Buckets:['MEDIA_BUCKET'],
   outboundService:()=>{outbound++;throw new Error('Outbound access forbidden');}}));
 t.after(()=>mf.dispose());
 const health=await mf.dispatchFetch('https://local.invalid/health');assert.equal(health.status,200);
 const disabled=await mf.dispatchFetch('https://local.invalid/v2/capabilities');assert.equal(disabled.status,503);
 const options=await mf.dispatchFetch('https://local.invalid/v2/submissions',{method:'OPTIONS',headers:{Origin:'http://localhost:5500'}});
 assert.equal(options.status,204);assert.match(options.headers.get('Access-Control-Allow-Headers'),/Idempotency-Key/);
 assert.equal(outbound,0);
});
