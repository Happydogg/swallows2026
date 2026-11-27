// Local build inspection only. This script never calls a provider API.
import {disabledMediaBindings} from './mediaGates.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const config=JSON.parse(fs.readFileSync(new URL('./.cloudflare/output/v1/workers/default/worker.config.json',import.meta.url),'utf8'));
assert.equal(config.previewUrls,false,'Preview URLs must remain disabled');
assert.equal(config.workersDev,true);
assert.equal(config.name,'sdl-r2-staging-gate');
assert.equal(config.env.MEDIA_BUCKET.name,'sdl-media-staging');
assert.equal(config.env.SUPABASE_URL.value,'https://wvurolqbjhuckkkjiiiv.supabase.co');
assert.equal(config.env.SUBMISSIONS_ENABLED.value,'false','Release candidate must not enable writes automatically');
for(const [name,binding] of Object.entries(disabledMediaBindings))assert.deepEqual(config.env[name],binding);
for(const key of ['SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY']) {
 assert.equal(config.env[key].type,'secret');assert.equal(config.env[key].value,undefined);
}
assert.ok(fs.existsSync(new URL('./.cloudflare/output/v1/workers/default/bundle/index.js',import.meta.url)));
console.log('Staging package verified; v2 remains disabled; no embedded secret values.');

import {readBaseline,verifyPreservation,verifyCurrentVersion} from './deploymentPreservation.mjs';
const baseline=readBaseline();
if(process.argv.includes('--release')||baseline)verifyPreservation(config,baseline);
else console.log('RELEASE BLOCKED: current staging bindings/observability baseline has not been reviewed. Local build only.');

if(process.argv.includes('--release'))verifyCurrentVersion(baseline,process.env.SDL004_CURRENT_WORKER_VERSION);
