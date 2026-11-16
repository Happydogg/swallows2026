// Exact downloaded staging Worker, executed locally with synthetic Supabase/R2.
// Proposal tests use mocked RPC decisions; they do NOT validate SQL or deployed RLS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {workerHarness as harness,PLAYER,OTHER,VIDEO,USER,ORIGIN,bytes} from './helpers/workerHarness.mjs';

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
  assert.equal((await h.proposal.fetch(h.request(`/v2/submissions?player_id=${PLAYER}&category=pitching&share_with_team=true&team_ids=${OTHER}`, { method: 'POST', body: bytes }), h.env)).status, 403);
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
