// Local metadata only. Never contacts Cloudflare or reads secret values.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
export const target={accountId:'702be60427145f59fa040e5250602bd7',name:'sdl-r2-staging-gate',compatibilityDate:'2026-11-16'};
const pilotBindings={MEDIA_BUCKET:{type:'r2',name:'sdl-media-staging'},SUPABASE_URL:{type:'json',value:'https://wvurolqbjhuckkkjiiiv.supabase.co'},
 SUPABASE_PUBLISHABLE_KEY:{type:'secret'},SUPABASE_SECRET_KEY:{type:'secret'}};
export function reviewedBaseline(baseline) {
 assert.equal(baseline?.confirmed,true,'Release blocked: a reviewed current staging settings baseline is required.');
 assert.equal(baseline.accountId,target.accountId,'Unexpected account');assert.equal(baseline.name,target.name,'Unexpected Worker');
 assert.equal(baseline.compatibilityDate,target.compatibilityDate,'Compatibility date drift requires review');
 assert.match(baseline.versionId||'',/^[a-zA-Z0-9-]+$/,'Current deployed version identifier required');
 assert.equal(baseline.otherSettingsReviewed,true,'Review settings outside this package before release');
 // The baseline lists binding metadata, never credentials. Unknown bindings block release.
 const expected={...pilotBindings};
 if(Object.hasOwn(baseline.env||{},'SUBMISSIONS_ENABLED'))expected.SUBMISSIONS_ENABLED={type:'json',value:'false'};
 assert.ok(isDeepStrictEqual(baseline.env,expected),'Binding drift: preserve all existing bindings; secret values are forbidden');
 assert.ok(Object.hasOwn(baseline,'observability'),'Explicit existing observability settings required, including null if absent');
 assert.ok(baseline.observability===null||typeof baseline.observability==='object'&&!Array.isArray(baseline.observability),'Invalid observability baseline');
 return baseline;
}
export function readBaseline(path=process.env.SDL004_WORKER_BASELINE) {
 return path?reviewedBaseline(JSON.parse(fs.readFileSync(path,'utf8'))):null;
}
export function deploymentBaseline(env=process.env) {
 const baseline=readBaseline(env.SDL004_WORKER_BASELINE);
 if(!baseline&&env.SDL004_LOCAL_BUILD_ONLY!=='1')throw Error('Release blocked: staging settings baseline missing. Use npm run build for local validation only.');
 return baseline;
}
export function preservedObservability(baseline) {
 return baseline?structuredClone(reviewedBaseline(baseline).observability):undefined;
}
export function verifyPreservation(config,baseline) {
 reviewedBaseline(baseline);
 assert.equal(config.name,baseline.name);assert.equal(config.compatibilityDate,baseline.compatibilityDate);
 assert.ok(isDeepStrictEqual(config.env,{...baseline.env,SUBMISSIONS_ENABLED:{type:'json',value:'false'}}),'Generated binding metadata drift');
 assert.deepEqual(config.observability??null,baseline.observability,'Observability drift: rebuild with the reviewed baseline');
}
