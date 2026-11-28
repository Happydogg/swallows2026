import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, deferred, until, user } from './helpers/appHarness.mjs';
const PLAYER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const VIDEO = '33333333-3333-4333-8333-333333333333';
const row = { id: VIDEO, player_id: PLAYER, content_type: 'video/mp4', byte_size: 12, category:'pitching', status:'pending', created_at: '2026-11-17T00:00:00Z' };
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
  assert.equal(await service.authorize(PLAYER, 'upload'), true);
  const { url, init } = requests[0];
  assert.equal(url, 'https://sdl-r2-staging-gate.sampson-ho.workers.dev/v2/submissions/upload-eligibility?player_id=' + PLAYER);
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
  await assert.rejects(service.upload(PLAYER, file, {submission:{category:'pitching',key:VIDEO}}), e => e.status === 401);
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
  const result = await service.upload(PLAYER, file, {submission:{category:'pitching',key:VIDEO}, onProgress: n => progress.push(n) });
  assert.equal(result.id, VIDEO); assert.equal(xhr.method, 'POST');
  assert.equal(xhr.url, `https://sdl-r2-staging-gate.sampson-ho.workers.dev/v2/submissions?player_id=${PLAYER}&category=pitching`);
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
  await assert.rejects(service.upload(PLAYER, file, {submission:{category:'pitching',key:VIDEO}, onProgress: n => progress.push(n) }), e => e.status === 403);
  assert.equal(progress.includes(100), false);
});

for (const failure of ['onerror', 'ontimeout']) test(`upload ${failure} reports uncertain persistence without automatic retry`, async t => {
  const { service } = await serviceHarness(t, { xhrFactory: () => xhrMock(0, null, failure) });
  await assert.rejects(service.upload(PLAYER, file, {submission:{category:'pitching',key:VIDEO}}), /Refresh the list before retrying/);
});

test('bad file type and oversized/empty files fail before network or XHR creation', async t => {
  let calls = 0; const { service } = await serviceHarness(t, { xhrFactory: () => { calls++; } });
  for (const bad of [{ ...file, name:'clip.avi', type: 'video/avi' }, { ...file, type:'image/jpeg' }, { ...file, size: 0 }, { ...file, size: 41943041 }]) {
    await assert.rejects(service.upload(PLAYER, bad, {submission:{category:'pitching',key:VIDEO}}));
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
  await c.selectMediaPlayer(PLAYER); await c.playPrivateMedia(row);
  c.analyzePrivateMedia();
  assert.equal(calls.includes('init'),false,'no guess at unknown recording metadata');
  assert.match(c.mediaError.value,/Choose the motion type/);
  c.analysisCategory.value='pitching';c.analysisFps.value='120';c.analyzePrivateMedia();
  assert.equal(c.mediaPlaybackUrl.value,'blob:private-test');
  assert.equal(calls.includes('init'),true);
  assert.equal(calls.at(-1).video_url,'blob:private-test');
  assert.equal(calls.at(-1).category,'pitching');
  assert.equal(calls.at(-1).fps_mode,120);
  c.resetMedia(); assert.deepEqual(revoked,['blob:private-test']);
  assert.equal(c.mediaPlaybackUrl.value,'');assert.equal(c.analysisCategory.value,'');assert.equal(c.analysisFps.value,'');
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
  await c.selectMediaPlayer(PLAYER); c.mediaFile.value = file; c.uploadCategory.value='pitching'; const task = c.uploadPrivateMedia();
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
  h.setFixtureRoles(['guardian']);
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
  const uploading = service.upload(PLAYER, file, { submission:{category:'pitching',key:VIDEO}, signal: controller.signal });
  for (let n = 0; n < 10 && !started; n++) await Promise.resolve();
  assert.equal(started, true); controller.abort();
  await assert.rejects(uploading, e => e.name === 'AbortError'); assert.equal(aborted, true);
});

test('v2 MP4 transport uploads privately and accepts a receipt without per-video consent',async t=>{
 const receipt={id:VIDEO,player_id:PLAYER,category:'pitching',status:'pending'},xhr=xhrMock(201,receipt);
 const {service}=await serviceHarness(t,{xhrFactory:()=>xhr});const progress=[];
 const result=await service.submit(PLAYER,file,{category:'pitching',key:VIDEO},{onProgress:n=>progress.push(n)});
 assert.equal(xhr.url,`https://sdl-r2-staging-gate.sampson-ho.workers.dev/v2/submissions?player_id=${PLAYER}&category=pitching`);
 assert.equal(xhr.headers['Idempotency-Key'],VIDEO);assert.equal(result.id,VIDEO);assert.deepEqual(progress,[50,100]);assert.equal(result.share_with_team,undefined);
});
test('v2 transport rejects attempts to attach per-video consent before a network request',async t=>{
 let requests=0;const {service}=await serviceHarness(t,{xhrFactory:()=>{requests++;}});
 assert.throws(()=>service.submit(PLAYER,file,{category:'pitching',key:VIDEO,share:true,teamIds:[OTHER]}),/Invalid submission/);assert.equal(requests,0);
});

test('v2 JSON transport accepts percent-encoded administrator search only in query parameters',async t=>{
 const {service,requests}=await serviceHarness(t);const route=`/v2/admin/enrollments?organization_id=${PLAYER}&q=%E5%B0%8F%E6%98%8E%20O%27Neil%20%25`;
 await service.requestJson(route);assert.equal(requests[0].url,'https://sdl-r2-staging-gate.sampson-ho.workers.dev'+route);assert.equal(requests[0].init.headers.Authorization,'Bearer synthetic-token');
});
test('v2 JSON query support does not permit absolute URLs, encoded path traversal or malformed escapes',async t=>{
 const {service,requests}=await serviceHarness(t);
 for(const route of['https://example.invalid','//example.invalid','/v2/%2e%2e/v1/media','/v2/admin/organizations#fragment','/v2/admin/enrollments?q=%ZZ'])assert.throws(()=>service.requestJson(route),/Invalid submission route/);
 assert.equal(requests.length,0);
});

test('visible private clips generate real in-memory thumbnails once and reauthorize playback',async t=>{
  let downloads=0,frames=0;
  const {c}=await controllerHarness(t,{
    playback:async()=>{downloads++;return new Blob(['mp4-synthetic'],{type:'video/mp4'});}
  },{
    thumbnailExtractor:async(blob)=>{frames++;assert.equal(blob.type,'video/mp4');return 'data:image/jpeg;base64,QQ==';}
  });
  await c.selectMediaPlayer(PLAYER);
  c.ensureMediaThumbnail(row);
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(c.mediaThumbnails.value[VIDEO],'data:image/jpeg;base64,QQ==');
  assert.equal(downloads,1);assert.equal(frames,1);
  c.ensureMediaThumbnail(row);
  await c.playPrivateMedia(row);
  assert.equal(downloads,2,'playback must reauthorize after thumbnail retrieval');
  c.resetMedia();
  assert.deepEqual(Object.keys(c.mediaThumbnails.value),[]);
  assert.deepEqual(Object.keys(c.mediaThumbnailBusy.value),[]);
});
test('unauthorized clip thumbnails never fetch bytes or expose stale frames after player switch',async t=>{
  let downloads=0;
  const pending=deferred();
  const {c}=await controllerHarness(t,{
    playback:async()=>{downloads++;return pending.promise;}
  },{
    thumbnailExtractor:async()=> 'data:image/jpeg;base64,QQ=='
  });
  await c.selectMediaPlayer(PLAYER);
  c.ensureMediaThumbnail({...row,id:OTHER});
  assert.equal(downloads,0);
  c.ensureMediaThumbnail(row);
  await new Promise(resolve=>setTimeout(resolve,3));
  assert.equal(downloads,1);
  c.resetMedia();
  pending.resolve(new Blob(['old'],{type:'video/mp4'}));
  await new Promise(resolve=>setTimeout(resolve,6));
  assert.equal(c.mediaPlayerId.value,'');
  assert.deepEqual(Object.keys(c.mediaThumbnails.value),[]);
});
test('private thumbnails render real images, not decorative fake video artwork',()=>{
 const markup=fs.readFileSync(new URL('../components/PrivateMediaPanel.js',import.meta.url),'utf8');
 assert.ok(markup.includes('v-media-visible="item"'));
 assert.ok(markup.includes('v-if="mediaThumbnails[item.id]"'));
 assert.ok(markup.includes(':src="mediaThumbnails[item.id]"'));
 assert.ok(markup.includes('Preview unavailable'));
 assert.ok(!markup.includes('image/pseudo'));
});

test('private analysis screen asks for recording metadata, never labels every clip batting at 60 FPS',()=>{
 const panel=fs.readFileSync(new URL('../components/PrivateMediaPanel.js',import.meta.url),'utf8');
 assert.ok(panel.includes('v-model="analysisCategory"'));
 assert.ok(panel.includes('v-model="analysisFps"'));
 assert.ok(panel.includes('automatic motion checkpoints remain experimental'));
 assert.ok(!panel.includes('default batting / 60 FPS'));
});

test('all visible authorized clips get a turn and a failed preview can be retried', async t => {
  const items = Array.from({length: 9}, (_, index) => ({...row, id: String(index)}));
  let fail = true;
  const {c} = await controllerHarness(t, {list: async () => items}, {
    thumbnailExtractor: async () => {
      if (fail) {
        fail = false;
        throw Error('temporary decode failure');
      }
      return 'data:image/jpeg;base64,QQ==';
    }
  });
  await c.selectMediaPlayer(PLAYER);
  items.forEach(c.ensureMediaThumbnail);
  await until(() => c.mediaThumbnails.value['8']);
  assert.equal(c.mediaThumbnailFailed.value['0'], true);
  c.retryMediaThumbnail(items[0]);
  await until(() => c.mediaThumbnails.value['0']);
  assert.equal(Object.keys(c.mediaThumbnails.value).length, items.length);
});

test('media transport distinguishes disabled delivery, outage, denied scope and an empty library',async t=>{
  let next=Response.json({items:[]});
  const {service}=await serviceHarness(t,{fetchImpl:async()=>next});
  assert.equal((await service.list(PLAYER)).length,0);
  next=Response.json({code:'media_disabled'},{status:503});
  await assert.rejects(service.list(PLAYER),error=>error.status===503&&error.code==='media_disabled');
  next=Response.json({error:'Provider unavailable'},{status:503});
  await assert.rejects(service.list(PLAYER),error=>error.status===503&&!error.code);
  next=Response.json({error:'Denied'},{status:403});
  await assert.rejects(service.list(PLAYER),error=>error.status===403);
});

test('deterministic PostgreSQL player UUIDs reach the authorized media APIs', async t => {
  const demo = 'abcdef12-3456-d789-0123-abcdef123456';
  const {service,requests,xhr}=await serviceHarness(t);
  assert.equal(await service.authorize(demo,'upload'),true);
  assert.ok(requests[0].url.endsWith(demo));
  await assert.rejects(service.authorize('../bad','upload'),/Invalid media or player ID/);
  assert.equal(requests.length,1);
  const listing=await serviceHarness(t,{fetchImpl:async(url)=>{assert.ok(url.endsWith(demo));return Response.json({items:[]});}});
  assert.deepEqual(await listing.service.list(demo),[]);
  const uploaded=await serviceHarness(t,{xhrFactory:()=>xhrMock(201,{...row,player_id:demo})});
  assert.equal((await uploaded.service.upload(demo,file,{submission:{category:'pitching',key:VIDEO}})).player_id,demo);
  assert.throws(()=>uploaded.service.upload(demo,file,{submission:{category:'pitching',key:demo}}),/Invalid media or player ID/);
});

test('iOS Files MP4s with generic or QuickTime metadata are accepted without changing the wire contract', async t => {
  const {service,xhr}=await serviceHarness(t);
  for(const type of ['', 'application/octet-stream', 'video/quicktime', 'VIDEO/MP4']){
    const picked={...file,type};
    assert.equal((await service.upload(PLAYER,picked,{submission:{category:'pitching',key:VIDEO}})).id,VIDEO);
    assert.equal(xhr.headers['Content-Type'],'video/mp4');
    assert.equal(xhr.body,picked);
  }
  const mov={...file,name:'IMG_0001.MOV',type:'video/quicktime'};
  assert.equal((await service.upload(PLAYER,mov,{submission:{category:'pitching',key:VIDEO}})).id,VIDEO);
  assert.equal(xhr.headers['Content-Type'],'video/quicktime');
  await assert.rejects(service.upload(PLAYER,{...file,name:'image.jpg',type:'application/octet-stream'},{submission:{category:'pitching',key:VIDEO}}),/Choose an MP4 or MOV video/);
});

test('MOV from Photos and a 40 MiB staging maximum retain the private media contract',async t=>{
 const {service,xhr}=await serviceHarness(t);
 const picked={name:'IMG_1234.MOV',type:'',size:41943040};
 assert.equal((await service.upload(PLAYER,picked,{submission:{category:'pitching',key:VIDEO}})).id,VIDEO);
 assert.equal(xhr.headers['Content-Type'],'video/quicktime');
 await assert.rejects(service.upload(PLAYER,{...picked,size:41943041},{submission:{category:'pitching',key:VIDEO}}),e=>e.status===413);
 const read=await serviceHarness(t,{fetchImpl:async()=>new Response('012345678901',{headers:{'Content-Type':'video/quicktime','Content-Length':'12'}})});
 const blob=await read.service.playback(VIDEO);
 assert.equal(blob.type,'video/quicktime');assert.equal(blob.size,12);
});

test('video delete receipts distinguish confirmed physical deletion from queued cleanup',async t=>{
 let payload={archived:true,deleted:true};let status=200;
 const {service}=await serviceHarness(t,{fetchImpl:async()=>Response.json(payload,{status})});
 assert.equal((await service.archive(VIDEO)).deleted,true);
 payload={archived:true,deleted:false};status=202;
 assert.equal((await service.archive(VIDEO)).deleted,false);
 payload={archived:true};status=200;
 await assert.rejects(service.archive(VIDEO),/Removal status unknown/);
});

test('private media review only sends decision, note and explicit subject attestation',async t=>{
 let body;
 const {service}=await serviceHarness(t,{fetchImpl:async(url,init)=>{assert.match(url,/\/review-private$/);body=JSON.parse(init.body);return Response.json({updated:true});}});
 assert.equal(await service.review(VIDEO,'approved','',true),true);
 assert.deepEqual(body,{decision:'approved',note:'',single_subject:true});
 await assert.rejects(service.review(VIDEO,'rejected','',false),/Invalid independent review/);
});

test('inbox opens only exact freshly authorized pending media, even if outside recent gallery',async t=>{const pending={id:VIDEO,playerId:PLAYER,category:'pitching',status:'pending',can_review:true,createdAt:'2026-11-17'};let rows=[pending],plays=0;const {h,c}=await controllerHarness(t,{reviewInbox:async(_scope,filter)=>{assert.equal(filter.mediaId,VIDEO);assert.equal(filter.playerId,PLAYER);return {items:rows};},playback:async()=>{plays++;return new Blob(['synthetic'],{type:'video/mp4'});}});assert.equal(await c.openInboxReview({role:'coach'},pending),false);assert.equal(plays,0);h.setFixtureRoles(['coach']);assert.equal(await c.openInboxReview({role:'coach'},pending),true);assert.equal(plays,1);assert.equal(c.reviewItem.value.id,VIDEO);assert.equal(c.mediaUploadAllowed.value,false);rows=[{...pending,playerId:OTHER}];assert.equal(await c.openInboxReview({role:'coach'},pending),false);assert.equal(plays,1);assert.equal(c.mediaPlaybackUrl.value,'');});
