// SDL-004-UX-LIVE: Origin-only staging change. No public media access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ORIGINS } from '../backend/worker/pilot.mjs';
import entry from '../backend/worker/index.mjs';

const WORKER='https://sdl-r2-staging-gate.sampson-ho.workers.dev';
const STAGING='https://sdl-staging.pages.dev';
const LIVE='https://sdl-ux-live.pages.dev';
const LOCAL=['http://127.0.0.1:5500','http://localhost:5500'];

function request(origin,path='/v2/submissions',method='OPTIONS'){
  return new Request(WORKER+path, { method, headers: { Origin: origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization,Content-Type' } });
}

test('exact four authorized origins; synthetic design preview remains excluded',()=>{
  assert.deepEqual([...ORIGINS].sort(),[...LOCAL,STAGING,LIVE].sort());
  assert.equal(ORIGINS.has('https://sdl-ux-preview.pages.dev'),false);
  assert.equal(ORIGINS.has('http://sdl-ux-live.pages.dev'),false);
});

for(const origin of [...LOCAL,STAGING,LIVE]){
  test('OPTIONS private media CORS only echoes approved origin: '+origin,async()=>{
    const r=await entry.fetch(request(origin),{});
    assert.equal(r.status,204);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);
    assert.match(r.headers.get('Access-Control-Allow-Headers'),/Authorization/);
    assert.equal(r.headers.get('Vary'),'Origin');
  });
}

test('disallowed public origin is rejected without permissive CORS',async()=>{
  const r=await entry.fetch(request('https://untrusted.invalid'),{});
  assert.equal(r.status,403);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
});

test('new origin does not bypass media authentication',async()=>{
  const env={
    SUPABASE_URL:'https://wvurolqbjhuckkkjiiiv.supabase.co',
    SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',
    SUPABASE_SECRET_KEY:'sb_secret_synthetic',
    MEDIA_BUCKET:{},MEDIA_PLAYBACK_ENABLED:'true'
  };
  const r=await entry.fetch(request(LIVE,'/v2/submissions?player_id=00000000-0000-4000-8000-000000000000','GET'),env);
  assert.equal(r.status,401);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),LIVE);
  assert.match(await r.text(),/Authentication required/);
});

test('v2 CORS still permits exact origin while backend feature gate stays off',async()=>{
  const preflight=await entry.fetch(request(LIVE,'/v2/submissions','OPTIONS'),{});
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),LIVE);
  const denied=await entry.fetch(request(LIVE,'/v2/submissions','GET'),{SUBMISSIONS_ENABLED:'false'});
  assert.equal(denied.status,503);
  assert.match(await denied.text(),/disabled/);
});
