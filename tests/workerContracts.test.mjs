// Exact downloaded staging Worker, executed locally with synthetic Supabase/R2.
// Proposal tests use mocked RPC decisions; they do NOT validate SQL or deployed RLS.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const VIDEO = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';
const ORIGIN = 'http://localhost:5500';
const bytes = new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]);
async function harness(role = 'coach') {
  const h = { role, records: [], objects: new Map(), calls: [], writes: 0, deletes: 0, expired: false };
  const env = { SUPABASE_URL: 'https://wvurolqbjhuckkkjiiiv.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', SUPABASE_SECRET_KEY: 'sb_secret_synthetic',
    MEDIA_BUCKET: {
      async put(key, value) { if (h.failPut) throw Error('R2 failed'); h.writes++; h.objects.set(key, value); },
      async delete(key) { h.deletes++; h.objects.delete(key); },
      async get(key) { const value = h.objects.get(key); if (!value) return null;
        return { body: new Blob([value]).stream(), size: value.byteLength }; }
    }
  };
  const fetchMock = async (url, init = {}) => {
    assert.equal(url.startsWith(env.SUPABASE_URL + '/'), true, 'only staging Supabase calls');
    h.calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return h.expired ? new Response(null, { status: 401 }) : Response.json({ id: USER });
    const rpc = url.split('/rpc/')[1];
    if (rpc && init.headers.apikey === env.SUPABASE_PUBLISHABLE_KEY) {
      if (h.failRpc) return new Response(null, { status: 503 });
      const body = JSON.parse(init.body);
      if (rpc === 'sdl_004_media_can_access') return Response.json(body.p_player_id === PLAYER &&
        (h.role === 'coach' || (h.role === 'parent' && body.p_action === 'read')));
      if (rpc === 'sdl_004_submission_can_submit') return Response.json(body.p_player_id === PLAYER && ['coach','parent'].includes(h.role));
      if (rpc === 'sdl_004_submission_is_guardian') return Response.json(h.role === 'parent');
      if (rpc === 'sdl_004_review_submission') return h.role === 'coach' ? Response.json(null) : new Response(null, { status: 403 });
      if (rpc === 'sdl_004_submission_can_read') return Response.json(h.role === 'parent' || h.role === 'coach' ||
        (h.role === 'teammate' && h.approved && h.consent));
      if (rpc === 'sdl_004_clubhouse_videos') return Response.json(h.approved && h.consent && h.role === 'teammate' ? [{ id: VIDEO, player_id: PLAYER, category: 'pitching' }] : []);
      if (rpc === 'sdl_004_list_submissions') return Response.json(h.role === 'parent' || h.role === 'coach' ? h.records : []);
      return new Response(null, { status: 403 });
    }
    assert.equal(init.headers.apikey, env.SUPABASE_SECRET_KEY);
    assert.equal(init.headers.Authorization, undefined, 'never confuse browser bearer and service key');
    if (h.failMetadata) return new Response(null, { status: 503 });
    if (rpc === 'sdl_004_record_submission') { h.savedSubmission = JSON.parse(init.body); return new Response(null, { status: 204 }); }
    if (init.method === 'POST') { h.records.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); }
    return Response.json(h.records);
  };
  const context = vm.createContext({ fetch: fetchMock, Headers, Request, Response, URL, Uint8Array, crypto: webcrypto });
  const source = fs.readFileSync(new URL('../backend/verified/staging-worker.phase2.mjs', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source + '\nexport { verifyIdentity, adminQuery, limitedBytes, configOk, validId, json, ORIGINS };', { context });
  await module.link(() => { throw Error('unexpected dependency'); }); await module.evaluate();
  h.worker = module.namespace.default;
  const proposalModule = new vm.SourceTextModule(fs.readFileSync(new URL('../backend/proposals/submissionRoutes.mjs', import.meta.url), 'utf8'), { context });
  await proposalModule.link(() => { throw Error('unexpected dependency'); }); await proposalModule.evaluate();
  h.proposal = proposalModule.namespace.createSubmissionRoutes(module.namespace);
  h.env = env;
  h.request = (path, { method = 'GET', body, auth = true, origin = ORIGIN, contentType = 'video/mp4' } = {}) => new Request('https://sdl-r2-staging-gate.sampson-ho.workers.dev' + path,
    { method, headers: { Origin: origin, ...(auth ? { Authorization: 'Bearer synthetic' } : {}),
      ...(body ? { 'Content-Type': contentType, 'Content-Length': String(body.byteLength ?? body.length) } : {}) }, ...(body ? { body } : {}) });
  h.seed = () => { const key = `pilot/${PLAYER}/${VIDEO}.mp4`;
    h.records = [{ id: VIDEO, player_id: PLAYER, object_key: key, byte_size: bytes.length, content_type: 'video/mp4' }];
    h.objects.set(key, bytes); };
  return h;
}

test('verified Worker health and configured localhost preflight are read-only', async () => {
  const h = await harness();
  const response = await h.worker.fetch(h.request('/health', { auth: false }), h.env);
  assert.equal(response.status, 200); assert.equal((await response.json()).media_enabled, true);
  const options = await h.worker.fetch(h.request('/v1/media', { method: 'OPTIONS', auth: false }), h.env);
  assert.equal(options.status, 204); assert.equal(options.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(h.calls.length, 0); assert.equal(h.writes, 0);
});

test('verified Worker rejects unknown origins and non-staging Supabase configuration', async () => {
  const h = await harness();
  assert.equal((await h.worker.fetch(h.request('/v1/media', { origin: 'https://example.invalid' }), h.env)).status, 403);
  assert.equal((await h.worker.fetch(h.request('/v1/media'), { ...h.env, SUPABASE_URL: 'https://example.invalid' })).status, 503);
  assert.equal(h.calls.length, 0);
});

test('verified Worker coach upload generates its own R2 key and metadata receipt', async () => {
  const h = await harness();
  const response = await h.worker.fetch(h.request(`/v1/media?player_id=${PLAYER}`, { method: 'POST', body: bytes }), h.env);
  assert.equal(response.status, 201); const receipt = await response.json();
  assert.equal(receipt.player_id, PLAYER); assert.equal(h.writes, 1);
  assert.match(h.records[0].object_key, new RegExp(`^pilot/${PLAYER}/`));
  assert.equal(receipt.object_key, undefined); assert.equal(receipt.url, undefined);
});

for (const role of ['parent','unrelated']) test(`verified Worker denies ${role} upload before any R2 write`, async () => {
  const h = await harness(role);
  const response = await h.worker.fetch(h.request(`/v1/media?player_id=${PLAYER}`, { method: 'POST', body: bytes }), h.env);
  assert.equal(response.status, 403); assert.equal(h.writes, 0);
});

test('verified Worker forbids uploads to another player', async () => {
  const h = await harness();
  const response = await h.worker.fetch(h.request(`/v1/media?player_id=${OTHER}`, { method: 'POST', body: bytes }), h.env);
  assert.equal(response.status, 403); assert.equal(h.writes, 0);
});

test('verified Worker linked parent can list and play; unrelated user is denied', async () => {
  const h = await harness('parent'); h.seed();
  assert.equal((await h.worker.fetch(h.request(`/v1/media?player_id=${PLAYER}`), h.env)).status, 200);
  const playback = await h.worker.fetch(h.request(`/v1/media/${VIDEO}`), h.env);
  assert.equal(playback.status, 200); assert.equal(playback.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await playback.arrayBuffer()).byteLength, 12);
  h.role = 'unrelated';
  assert.equal((await h.worker.fetch(h.request(`/v1/media/${VIDEO}`), h.env)).status, 403);
});

test('verified Worker missing object, auth service failure and missing token fail closed', async () => {
  const h = await harness('parent'); h.seed(); h.objects.clear();
  assert.equal((await h.worker.fetch(h.request(`/v1/media/${VIDEO}`), h.env)).status, 404);
  h.expired = true;
  assert.equal((await h.worker.fetch(h.request(`/v1/media/${VIDEO}`), h.env)).status, 401);
  assert.equal((await h.worker.fetch(h.request('/v1/media', { auth: false }), h.env)).status, 401);
});

test('verified Worker authorization provider failure never reaches object writes', async () => {
  const h = await harness(); h.failRpc = true;
  assert.equal((await h.worker.fetch(h.request(`/v1/media?player_id=${PLAYER}`, { method: 'POST', body: bytes }), h.env)).status, 503);
  assert.equal(h.writes, 0);
});

test('verified Worker metadata failure rolls back only the freshly written object locally', async () => {
  const h = await harness(); h.failMetadata = true;
  const response = await h.worker.fetch(h.request(`/v1/media?player_id=${PLAYER}`, { method: 'POST', body: bytes }), h.env);
  assert.equal(response.status, 503); assert.equal(h.objects.size, 0); assert.equal(h.deletes, 1);
});

test('verified Worker keeps deletion disabled and rejects non-MP4 container', async () => {
  const h = await harness();
  assert.equal((await h.worker.fetch(h.request(`/v1/media/${VIDEO}`, { method: 'DELETE' }), h.env)).status, 405);
  const response = await h.worker.fetch(h.request(`/v1/media?player_id=${PLAYER}`, { method: 'POST', body: new Uint8Array(12) }), h.env);
  assert.equal(response.status, 415); assert.equal(h.writes, 0);
});

test('proposal only: authorized parent can create a pending categorized submission', async () => {
  const h = await harness('parent');
  const response = await h.proposal.fetch(h.request(`/v2/submissions?player_id=${PLAYER}&category=throwing&share_with_team=false`, { method: 'POST', body: bytes }), h.env);
  assert.equal(response.status, 201); assert.equal((await response.json()).status, 'pending');
  assert.equal(h.savedSubmission.p_user_id, USER); assert.equal(h.savedSubmission.p_category, 'throwing');
});

test('proposal only: unauthorized player upload fails before R2 and coaches cannot grant guardian consent', async () => {
  const h = await harness('parent');
  assert.equal((await h.proposal.fetch(h.request(`/v2/submissions?player_id=${OTHER}&category=pitching&share_with_team=false`, { method: 'POST', body: bytes }), h.env)).status, 403);
  h.role = 'coach';
  assert.equal((await h.proposal.fetch(h.request(`/v2/submissions?player_id=${PLAYER}&category=pitching&share_with_team=true`, { method: 'POST', body: bytes }), h.env)).status, 403);
  assert.equal(h.writes, 0);
});

test('proposal only: review forwards caller token to authorization RPC, never a service-role decision', async () => {
  const h = await harness('parent');
  const body = JSON.stringify({ decision: 'approved', note: 'Checked' });
  assert.equal((await h.proposal.fetch(h.request(`/v2/submissions/${VIDEO}/review`, { method: 'POST', body, contentType: 'application/json' }), h.env)).status, 403);
  h.role = 'coach';
  assert.equal((await h.proposal.fetch(h.request(`/v2/submissions/${VIDEO}/review`, { method: 'POST', body, contentType: 'application/json' }), h.env)).status, 200);
  const rpcCall = h.calls.find(c => c.url.endsWith('sdl_004_review_submission'));
  assert.equal(rpcCall.init.headers.Authorization, 'Bearer synthetic');
  assert.equal(rpcCall.init.headers.apikey, 'sb_publishable_synthetic');
});

for (const [approved, consent, expected] of [[false,true,403],[true,false,403],[true,true,200]]) {
  test(`proposal only: teammate playback approved=${approved}, consent=${consent} -> ${expected} with mocked SQL decisions`, async () => {
    const h = await harness('teammate'); h.seed(); h.approved = approved; h.consent = consent;
    const response = await h.proposal.fetch(h.request(`/v2/submissions/${VIDEO}/playback`), h.env);
    assert.equal(response.status, expected);
    const list = await h.proposal.fetch(h.request(`/v2/clubhouse?team_id=${OTHER}`), h.env);
    assert.equal((await list.json()).items.length, expected === 200 ? 1 : 0);
  });
}

test('proposal only: expired session cannot upload or review', async () => {
  const h = await harness('parent'); h.expired = true;
  assert.equal((await h.proposal.fetch(h.request(`/v2/submissions?player_id=${PLAYER}&category=batting&share_with_team=false`, { method: 'POST', body: bytes }), h.env)).status, 401);
  assert.equal(h.writes, 0);
});
