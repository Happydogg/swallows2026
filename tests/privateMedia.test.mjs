import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, deferred, user } from './helpers/appHarness.mjs';
const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const VIDEO = '33333333-3333-4333-8333-333333333333';
const row = { id: VIDEO, player_id: PLAYER, content_type: 'video/mp4', byte_size: 12, created_at: '2026-11-17T00:00:00Z' };
const file = { name: 'clip.mp4', type: 'video/mp4', size: 12 };
function xhrMock(status = 201, response = row, failure = null) {
  const xhr = { headers: {}, upload: {}, open(method, url) { this.method = method; this.url = url; },
    setRequestHeader(k, v) { this.headers[k] = v; },
    send(body) { this.body = body; this.upload.onprogress({ lengthComputable: true, loaded: 6, total: 12 });
      if (failure) this[failure](); else { this.status = status; this.responseText = JSON.stringify(response); this.onload(); } },
    abort() { this.onabort(); } };
  return xhr;
}
async function serviceHarness(t, options = {}) {
  const h = await harness(t, user('parent'));
  const requests = [], xhr = xhrMock();
  const client = { auth: { getSession: async () => ({ data: { session: {
    user: h.user, access_token: 'synthetic-token', expires_at: Date.now() / 1000 + 3600
  } }, error: null }) } };
  const service = h.module('js/privateMediaService.js').createPrivateMediaService({
    auth: h.app, client, xhrFactory: () => xhr,
    fetchImpl: async (url, init) => { requests.push({ url, init }); return Response.json({ allowed: true }); }, ...options
  });
  return { h, service, requests, xhr };
}
async function controllerHarness(t, overrides = {}, options = {}) {
  const h = await harness(t, user('parent'));
  h.app.players.value = [{ id: PLAYER, athlete_id: 'athlete', preferred_name: 'My child', parent_phone: 'private' }, { id: OTHER, athlete_id: 'other', preferred_name: 'Other' }];
  h.app.guardianLinks.value = [{ athlete_id: 'athlete', status: 'verified' }];
  const calls = [], revoked = [];
  const api = { authorize: async (_id, action) => action === 'read', list: async () => [row],
    playback: async () => new Blob(['synthetic'], { type: 'video/mp4' }), upload: async () => row, ...overrides };
  const controller = h.module('composables/usePrivateMedia.js').usePrivateMedia({ auth: h.app, players: h.app.players,
    coachRoster: h.app.coachRoster, analyzer: {
      resetAnalyzer() { calls.push('reset'); }, initPoseTracker() { calls.push('init'); }, openAnalyzer(v) { calls.push(v); }
    }, service: api, urls: { createObjectURL: () => 'blob:private-test', revokeObjectURL: u => revoked.push(u) }, timeoutMs: 1000, ...options });
  t.after(() => controller.resetMedia());
  return { h, c: controller, calls, revoked };
}

test('media requests only target verified staging and carry bearer auth without cookies or redirects', async t => {
  const { service, requests } = await serviceHarness(t);
  assert.equal(await service.authorize(PLAYER, 'read'), true);
  const { url, init } = requests[0];
  assert.equal(url, 'https://sdl-r2-staging-gate.sampson-ho.workers.dev/v1/authorize');
  assert.equal(init.headers.Authorization, 'Bearer synthetic-token');
  assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
});

test('alternate Worker or Supabase environments fail before any network request', async t => {
  for (const overrides of [{ baseUrl: 'https://example.invalid' }, { supabaseUrl: 'https://example.invalid' }]) {
    let called = false;
    const { service } = await serviceHarness(t, { ...overrides, fetchImpl: () => { called = true; } });
    await assert.rejects(service.list(PLAYER), /restricted to the verified staging/); assert.equal(called, false);
  }
});

for (const status of [401, 403, 404, 503]) test(`playback HTTP ${status} is reported without a usable video`, async t => {
  const { service } = await serviceHarness(t, { fetchImpl: async () => new Response(null, { status }) });
  await assert.rejects(service.playback(VIDEO), e => e.status === status);
});

test('expired local session sends no upload or playback request', async t => {
  let requests = 0;
  const { service } = await serviceHarness(t, { client: { auth: { getSession: async () => ({ data: { session: {
    user: user('parent'), access_token: 'expired', expires_at: 1
  } } }) } }, fetchImpl: () => { requests++; }, xhrFactory: () => { requests++; } });
  await assert.rejects(service.playback(VIDEO), e => e.status === 401);
  await assert.rejects(service.upload(PLAYER, file), e => e.status === 401);
  assert.equal(requests, 0);
});

test('revoked session response is surfaced even if local token has not expired', async t => {
  const { service } = await serviceHarness(t, { fetchImpl: async () => new Response(null, { status: 401 }) });
  await assert.rejects(service.list(PLAYER), /expired or was revoked/);
});

test('session account mismatch is denied before sending the bearer', async t => {
  const { service } = await serviceHarness(t, { client: { auth: { getSession: async () => ({ data: { session: {
    user: user('other'), access_token: 'other-token', expires_at: Date.now() / 1000 + 600
  } } }) } } });
  await assert.rejects(service.list(PLAYER), e => e.status === 401);
});

test('successful upload uses existing POST contract and reports progress through commit receipt', async t => {
  const { service, xhr } = await serviceHarness(t); const progress = [];
  const result = await service.upload(PLAYER, file, { onProgress: n => progress.push(n) });
  assert.equal(result.id, VIDEO); assert.equal(xhr.method, 'POST');
  assert.equal(xhr.url, `https://sdl-r2-staging-gate.sampson-ho.workers.dev/v1/media?player_id=${PLAYER}`);
  assert.equal(xhr.headers['Content-Type'], 'video/mp4'); assert.equal(xhr.headers['Content-Length'], undefined);
  assert.equal(xhr.body, file); assert.deepEqual(progress, [50, 100]);
});

test('parent upload is denied when deployed authorization says false', async t => {
  const { c } = await controllerHarness(t);
  await c.selectMediaPlayer(PLAYER); c.mediaFile.value = file;
  await c.uploadPrivateMedia(); assert.equal(c.mediaUploadAllowed.value, false);
  assert.equal(c.mediaNotice.value, '');
});

test('unauthorized player IDs never trigger media authorization or upload', async t => {
  let calls = 0; const { c } = await controllerHarness(t, { authorize: () => { calls++; } });
  await c.selectMediaPlayer(OTHER); c.mediaFile.value = file; await c.uploadPrivateMedia();
  assert.equal(calls, 0); assert.equal(c.mediaPlayerId.value, '');
});

test('HTTP denied upload never returns success or progress 100', async t => {
  const progress = [];
  const { service } = await serviceHarness(t, { xhrFactory: () => xhrMock(403) });
  await assert.rejects(service.upload(PLAYER, file, { onProgress: n => progress.push(n) }), e => e.status === 403);
  assert.equal(progress.includes(100), false);
});

for (const failure of ['onerror', 'ontimeout']) test(`upload ${failure} reports uncertain persistence without automatic retry`, async t => {
  const { service } = await serviceHarness(t, { xhrFactory: () => xhrMock(0, null, failure) });
  await assert.rejects(service.upload(PLAYER, file), /Refresh the list before retrying/);
});

test('bad file type and oversized/empty files fail before network or XHR creation', async t => {
  let calls = 0; const { service } = await serviceHarness(t, { xhrFactory: () => { calls++; } });
  for (const bad of [{ ...file, type: 'video/quicktime' }, { ...file, size: 0 }, { ...file, size: 20971521 }]) {
    await assert.rejects(service.upload(PLAYER, bad));
  }
  assert.equal(calls, 0);
});

test('authorized playback returns a Blob; no public URL is constructed', async t => {
  const { service } = await serviceHarness(t, { fetchImpl: async () => new Response('012345678901', {
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': '12' }
  }) });
  assert.equal((await service.playback(VIDEO)).size, 12);
});

test('media listing rejects malformed rows and strips unknown storage/family fields', async t => {
  const { service } = await serviceHarness(t, { fetchImpl: async () => Response.json({ items: [{ ...row, object_key: 'secret', parent_phone: 'private' }] }) });
  const result = await service.list(PLAYER); assert.equal(result[0].object_key, undefined); assert.equal(result[0].parent_phone, undefined);
  const bad = await serviceHarness(t, { fetchImpl: async () => Response.json({ items: [{ ...row, player_id: OTHER }] }) });
  await assert.rejects(bad.service.list(PLAYER), /Invalid media listing/);
});

test('network and malformed JSON errors are handled explicitly', async t => {
  const a = await serviceHarness(t, { fetchImpl: async () => { throw Error('network'); } });
  await assert.rejects(a.service.list(PLAYER), /Check your connection/);
  const b = await serviceHarness(t, { fetchImpl: async () => new Response('broken') });
  await assert.rejects(b.service.list(PLAYER), /invalid response/);
});

test('player picker includes verified linked children without private family fields', async t => {
  const { c } = await controllerHarness(t);
  assert.equal(c.mediaPlayers.value.length, 1); assert.equal(c.mediaPlayers.value[0].id, PLAYER);
  assert.equal(c.mediaPlayers.value[0].parent_phone, undefined);
});

test('coach media access does not enable official statistics editing', async t => {
  const { h, c } = await controllerHarness(t, { authorize: async () => true });
  await c.selectMediaPlayer(PLAYER); assert.equal(c.mediaUploadAllowed.value, true);
  assert.equal(h.app.isCoach.value, false);
});

test('playback and analyzer reuse a revocable Blob; clearing media releases it', async t => {
  const { c, calls, revoked } = await controllerHarness(t);
  await c.selectMediaPlayer(PLAYER); await c.playPrivateMedia(row); c.analyzePrivateMedia();
  assert.equal(c.mediaPlaybackUrl.value, 'blob:private-test');
  assert.equal(calls.includes('init'), true); assert.equal(calls.at(-1).video_url, 'blob:private-test');
  c.resetMedia(); assert.deepEqual(revoked, ['blob:private-test']); assert.equal(c.mediaPlaybackUrl.value, '');
});

test('late playback after logout/account switch never creates a URL', async t => {
  const pending = deferred(); const { h, c } = await controllerHarness(t, { playback: () => pending.promise });
  await c.selectMediaPlayer(PLAYER); const playing = c.playPrivateMedia(row);
  await h.app.signOutAndClear(); c.resetMedia(); pending.resolve(new Blob(['old'])); await playing;
  assert.equal(c.mediaPlaybackUrl.value, ''); assert.equal(c.mediaItems.value.length, 0);
});

test('late list/upload/progress cannot restore old account state', async t => {
  const upload = deferred(); let progress;
  const { c } = await controllerHarness(t, { authorize: async () => true,
    upload: (_id, _file, options) => { progress = options.onProgress; return upload.promise; } });
  await c.selectMediaPlayer(PLAYER); c.mediaFile.value = file; const task = c.uploadPrivateMedia();
  c.resetMedia(); progress(99); upload.resolve(row); await task;
  assert.equal(c.mediaProgress.value, 0); assert.equal(c.mediaItems.value.length, 0); assert.equal(c.mediaNotice.value, '');
});

test('a concurrent listing cannot repopulate media after playback authorization fails', async t => {
  const listing = deferred(), playback = deferred(); let count = 0;
  const { c } = await controllerHarness(t, { list: () => ++count === 1 ? Promise.resolve([row]) : listing.promise,
    playback: () => playback.promise });
  await c.selectMediaPlayer(PLAYER);
  const playing = c.playPrivateMedia(row), refreshing = c.refreshMedia();
  playback.reject(Object.assign(Error('Denied'), { status: 403 })); await playing;
  listing.resolve([row]); await refreshing;
  assert.equal(c.mediaPlaybackUrl.value, ''); assert.equal(c.mediaItems.value.length, 0);
  assert.equal(c.mediaReadAllowed.value, false);
});

test('an expired-session error clears previously listed media and permissions', async t => {
  const { c } = await controllerHarness(t, { playback: async () => { throw Object.assign(Error('Session expired'), { status: 401 }); } });
  await c.selectMediaPlayer(PLAYER); await c.playPrivateMedia(row);
  assert.equal(c.mediaItems.value.length, 0); assert.equal(c.mediaReadAllowed.value, false); assert.match(c.mediaError.value, /expired/);
});

test('unverified approval, parent-submission and teammate-sharing features remain unavailable', async t => {
  const { c } = await controllerHarness(t); assert.equal(c.submissionsEnabled, false);
  assert.equal(c.mediaItems.value.some(item => item.status === 'approved'), false);
});


test('application identity hook aborts private playback and clears all media automatically', async t => {
  const h = await harness(t, user('parent')); const c = h.app.privateMediaController;
  h.app.players.value = [{ id: PLAYER, athlete_id: 'child', preferred_name: 'Child' }];
  h.app.guardianLinks.value = [{ athlete_id: 'child', status: 'verified' }];
  let signal; const pending = deferred();
  h.fetchImpl = async (url, init) => {
    if (url.endsWith('/authorize')) return Response.json({ allowed: JSON.parse(init.body).action === 'read' });
    if (url.includes('?player_id=')) return Response.json({ items: [row] });
    signal = init.signal; return pending.promise;
  };
  await c.selectMediaPlayer(PLAYER); const playing = c.playPrivateMedia(row);
  // Let getSession resolve so the request is genuinely in flight.
  for (let n = 0; n < 10 && !signal; n++) await Promise.resolve();
  assert.ok(signal); await h.app.signOutAndClear();
  assert.equal(signal.aborted, true);
  pending.resolve(new Response('012345678901', { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '12' } }));
  await playing;
  assert.equal(c.mediaItems.value.length, 0); assert.equal(c.mediaPlaybackUrl.value, '');
  assert.equal(c.mediaPlayerId.value, ''); assert.equal(c.mediaPlayers.value.length, 0);
});


test('timed-out requests stop loading and allow the user to retry', async t => {
  let count = 0;
  const { c } = await controllerHarness(t, { list: (_id, { signal }) => ++count === 1
    ? Promise.resolve([row]) : new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    }) }, { timeoutMs: 10 });
  await c.selectMediaPlayer(PLAYER); await c.refreshMedia();
  assert.equal(c.mediaLoading.value, false); assert.match(c.mediaError.value, /timed out/);
});

test('aborting an in-flight upload cancels XHR without a successful receipt', async t => {
  const controller = new AbortController(); let started = false, aborted = false;
  const xhr = xhrMock();
  xhr.send = () => { started = true; };
  xhr.abort = () => { aborted = true; xhr.onabort(); };
  const { service } = await serviceHarness(t, { xhrFactory: () => xhr });
  const uploading = service.upload(PLAYER, file, { signal: controller.signal });
  for (let n = 0; n < 10 && !started; n++) await Promise.resolve();
  assert.equal(started, true); controller.abort();
  await assert.rejects(uploading, e => e.name === 'AbortError'); assert.equal(aborted, true);
});
