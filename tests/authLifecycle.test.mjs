// Run: node --experimental-vm-modules --test tests/authLifecycle.test.mjs
// Real application modules, synthetic data, minimal Vue ref/lifecycle adapter.
// No browser, credentials, network requests, database writes, or GPU required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, deferred, until, user, ok } from './helpers/appHarness.mjs';

function assertCleared(a) {
  for (const key of ['players', 'sessions', 'drillVideos', 'coachRoster', 'orgMemberships', 'teamMemberships', 'guardianLinks']) {
    assert.equal(a[key].value.length, 0, key);
  }
  assert.equal(a.authUser.value, null);
  assert.equal(a.selectedPlayer.value, null);
  assert.equal(a.activeAnalyzerVideo.value, null);
  assert.equal(a.isTeamCoach.value, false);
}

test('password login verifies user, loads data and starts pose tracking', async t => {
  const h = await harness(t);
  h.rows.athlete_guardians = [{ athlete_id: 'a1', status: 'verified' }];
  h.rows.players = [{ id: 'child', athlete_id: 'a1', jersey: '07' }];
  h.app.loginEmail.value = ' parent@example.invalid ';
  h.app.loginPassword.value = 'synthetic-only';
  await h.app.signInAndLoad();
  assert.equal(h.credentials.email, 'parent@example.invalid');
  assert.equal(h.credentials.password, 'synthetic-only');
  assert.equal(h.app.loginPassword.value, '');
  assert.equal(h.app.authUser.value.id, 'parent');
  assert.equal(h.app.players.value[0].id, 'child');
  assert.equal(h.poseCalls, 1);
});

test('login with Supabase SIGNED_IN event loads once outside auth lock', async t => {
  const h = await harness(t); h.emitLogin = true;
  h.rows.athlete_guardians = [{ athlete_id: 'a1', status: 'verified' }];
  await h.app.signInAndLoad();
  await until(() => h.app.authUser.value && !h.app.loading.value);
  assert.equal(h.calls.filter(c => c.table === 'players').length, 1);
  assert.equal(h.poseCalls, 1);
});

test('restored session loads data and initializes tracker', async t => {
  const h = await harness(t, user('restored'));
  assert.equal(h.app.authUser.value.id, 'restored');
  assert.equal(h.poseCalls, 1);
});

test('initial external session loads once; same-user focus, token refresh and metadata events preserve workspace', async t => {
  const h = await harness(t);
  h.rows.athlete_guardians = [{ athlete_id: 'a1', status: 'verified' }];
  h.rows.players = [{ id: 'original', athlete_id: 'a1', jersey: '1' }];
  h.emit('INITIAL_SESSION', user('external'));
  await until(() => h.app.players.value[0]?.id === 'original' && h.app.authReady.value);
  const requests = h.calls.length, pose = h.poseCalls;
  h.app.currentView.value = 'player';
  h.app.selectedPlayer.value = {id:'original'};
  h.app.activeTab.value = 'team';
  for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'INITIAL_SESSION']) {
    h.emit(event,user('external'));
    await new Promise(resolve => setTimeout(resolve, 2));
    assert.equal(h.app.authUser.value?.id, 'external');
    assert.equal(h.app.authReady.value, true);
    assert.equal(h.app.selectedPlayer.value?.id, 'original');
    assert.equal(h.app.currentView.value, 'player');
    assert.equal(h.app.activeTab.value, 'team');
    assert.equal(h.calls.length,requests,'no re-fetch on '+event);
    assert.equal(h.poseCalls,pose,'no GPU reinitialization on '+event);
  }
});

test('external logout synchronously clears memberships and all primary data', async t => {
  const h = await harness(t, user('coach'));
  for (const key of ['players', 'sessions', 'drillVideos', 'coachRoster', 'orgMemberships', 'teamMemberships', 'guardianLinks']) {
    h.app[key].value = [{ id: 'private', role: 'coach', status: 'active' }];
  }
  h.app.selectedPlayer.value = { id: 'private' };
  h.emit('SIGNED_OUT', null);
  assertCleared(h.app);
});

test('late getUser cannot restore identity after logout', async t => {
  const h = await harness(t); const pending = deferred(); h.queue('getUser', pending.promise);
  h.emit('SIGNED_IN', user('old'));
  await new Promise(resolve => setTimeout(resolve, 5));
  await h.app.signOutAndClear();
  pending.resolve({ data: { user: user('old') }, error: null });
  await new Promise(resolve => setTimeout(resolve, 5));
  assertCleared(h.app);
});

test('late memberships cannot overwrite another account or restore guardian links', async t => {
  const h = await harness(t); const pending = deferred(); h.queue('team_memberships', pending.promise);
  h.rows.athlete_guardians = [{ athlete_id: 'old-child', status: 'verified' }];
  h.emit('SIGNED_IN', user('old'));
  await until(() => h.calls.some(c => c.table === 'team_memberships'));
  h.rows.athlete_guardians = [];
  h.emit('SIGNED_IN', user('new'));
  await until(() => h.app.authUser.value?.id === 'new' && !h.app.loading.value);
  pending.resolve(ok([{ team_id: 'old-team', role: 'coach', status: 'active' }]));
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(h.app.authUser.value.id, 'new');
  assert.equal(h.app.teamMemberships.value.length, 0);
  assert.equal(h.app.guardianLinks.value.length, 0);
});

for (const transition of ['logout', 'account switch', 'same-account relogin']) {
  test(`late players, sessions and videos are ignored after ${transition}`, async t => {
    const h = await harness(t); const pending = deferred(); h.queue('players', pending.promise);
    h.rows.athlete_guardians = [{ athlete_id: 'a1', status: 'verified' }];
    h.rows.sessions = [{ id: 'old-session' }]; h.rows.drill_videos = [{ id: 'old-video' }];
    const login = h.app.signInAndLoad();
    await until(() => h.calls.some(c => c.table === 'players'));
    if (transition === 'logout') await h.app.signOutAndClear();
    else {
      h.rows.players = [{ id: 'new-child', athlete_id: 'a1', preferred_name: 'Child', jersey: '2' }];
      h.rows.sessions = []; h.rows.drill_videos = [];
      if (transition === 'same-account relogin') h.emit('SIGNED_OUT', null);
      h.emit('SIGNED_IN', user(transition === 'account switch' ? 'new' : 'parent'));
      await until(() => h.app.players.value[0]?.id === 'new-child');
    }
    pending.resolve(ok([{ id: 'old-child', jersey: '1' }])); await login;
    if (transition === 'logout') assertCleared(h.app);
    else {
      assert.equal(h.app.players.value[0].id, 'new-child');
      assert.equal(h.app.sessions.value.length, 0);
      assert.equal(h.app.drillVideos.value.length, 0);
    }
    assert.equal(h.app.loading.value, false);
  });
}

for (const reject of [false, true]) {
  test(`late coach RPC ${reject ? 'error' : 'response'} is ignored after account switch`, async t => {
    const h = await harness(t); const pending = deferred(); h.queue('roster', pending.promise);
    h.rows.team_memberships = [{ team_id: 't', role: 'coach', status: 'active' }];
    const login = h.app.signInAndLoad(); await until(() => h.app.coachRosterLoading.value);
    h.rows.team_memberships = [];
    h.emit('SIGNED_IN', user('unrelated'));
    await until(() => h.app.authUser.value?.id === 'unrelated' && !h.app.loading.value);
    pending.resolve(reject ? { data: null, error: { message: 'old denial' } } : ok([{ id: 'old-player' }]));
    await login;
    assert.equal(h.app.coachRoster.value.length, 0);
    assert.equal(h.app.coachRosterError.value, '');
    assert.equal(h.app.coachRosterLoading.value, false);
  });
}

test('failed remote logout still clears local identity and private state', async t => {
  const h = await harness(t, user('parent'));
  h.app.players.value = [{ id: 'private' }]; h.logoutError = { message: 'offline' };
  await h.app.signOutAndClear(); assertCleared(h.app);
  assert.equal(h.app.authError.value, 'offline');
  assert.equal(h.app.authBusy.value, false);
});

test('rejected identity verification never loads private data', async t => {
  const h = await harness(t);
  h.queue('getUser', { data: { user: null }, error: { message: 'invalid JWT' } });
  h.emit('SIGNED_IN', user('unverified'));
  await until(() => h.app.authReady.value);
  assertCleared(h.app);
  assert.equal(h.calls.length, 0);
});

test('an older identity request failure cannot replace current errors', async t => {
  const h = await harness(t); const pending = deferred(); h.queue('getUser', pending.promise);
  h.emit('SIGNED_IN', user('old')); await new Promise(resolve => setTimeout(resolve, 5));
  h.emit('SIGNED_IN', user('new')); await until(() => h.app.authUser.value?.id === 'new');
  pending.reject(new Error('old network failure')); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(h.app.authError.value, '');
});

test('logout releases video/blob/canvas/tracker and resets analyzer and form state', async t => {
  const h = await harness(t, user('parent')); const a = h.app;
  let paused = 0, detached = 0, loaded = 0, erased = 0;
  a.openLocalAnalyzer({ type: 'video/mp4', name: 'synthetic.mp4' });
  a.analyzerVideoRef.value = { pause() { paused++; }, removeAttribute(name) { assert.equal(name, 'src'); detached++; }, load() { loaded++; } };
  a.analyzerCanvasRef.value = { width: 100, height: 100, getContext: () => ({ clearRect() { erased++; } }) };
  a.currentCalculatedSpeed.value = 88; a.isTrackerLocked.value = true; a.videoDuration.value = 5;
  a.editingPlayer.value = { id: 'private' }; a.editingSession.value = { id: 'private' };
  a.newPlayer.value.parent_phone = 'private'; a.newDrillVideo.value.coach_feedback = 'private';
  a.selectedVideoFile.value = {}; a.expandedSessionIds.add('private');
  await a.signOutAndClear();
  assertCleared(a);
  assert.deepEqual(h.revoked, ['blob:synthetic']);
  assert.equal(paused, 1); assert.equal(detached, 1); assert.equal(loaded, 1); assert.equal(erased, 1);
  assert.equal(h.closedTrackers, 1);
  assert.equal(a.analyzerVideoRef.value, null); assert.equal(a.analyzerCanvasRef.value, null);
  assert.equal(a.currentCalculatedSpeed.value, 19.9); assert.equal(a.videoDuration.value, 0);
  assert.equal(a.bauerPhases.value.length, 0); assert.equal(a.isTrackerLocked.value, false);
  assert.equal(a.editingPlayer.value, null); assert.equal(a.editingSession.value, null);
  assert.equal(a.newPlayer.value.parent_phone, ''); assert.equal(a.newDrillVideo.value.coach_feedback, '');
  assert.equal(a.selectedVideoFile.value, null); assert.equal(a.expandedSessionIds.size, 0);
});

test('pending MediaPipe initialization closes stale tracker without replacing new tracker', async t => {
  const h = await harness(t); const old = deferred(); let oldClosed = 0;
  h.queue('tracker', old.promise);
  await h.app.signInAndLoad(); assert.equal(h.poseCalls, 1);
  await h.app.signOutAndClear();
  await h.app.signInAndLoad(); assert.equal(h.poseCalls, 2);
  old.resolve({ close() { oldClosed++; } });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(oldClosed, 1);
  await h.app.initPoseTracker(); assert.equal(h.poseCalls, 2);
  await h.app.signOutAndClear(); assert.equal(h.closedTrackers, 1);
});

test('pose initialization is shared across concurrent requests', async t => {
  const h = await harness(t); const pending = deferred(); h.queue('tracker', pending.promise);
  const a = h.app.initPoseTracker(), b = h.app.initPoseTracker();
  assert.equal(h.poseCalls, 1);
  pending.resolve({ close() {} }); await Promise.all([a, b]);
  await h.app.initPoseTracker(); assert.equal(h.poseCalls, 1);
});

test('unmount cancels queued refresh and unsubscribes auth listener', async t => {
  const h = await harness(t); h.emit('SIGNED_IN', user('external')); h.unmount();
  await new Promise(resolve => setTimeout(resolve, 5));
  assertCleared(h.app); assert.equal(h.unsubscribed, 1); assert.equal(h.calls.length, 0);
});

test('database editing and all media locks remain disabled', async t => {
  const h = await harness(t); assert.equal(h.app.isCoach.value, false);
  const media = h.module('js/mediaStorage.js');
  await assert.rejects(media.uploadAvatarToSupabase('id', {}), /safety lock/);
  await assert.rejects(media.uploadFileToR2('key', {}, 'video/mp4'), /safety lock/);
  await assert.rejects(media.deleteFileFromR2('key'), /safety lock/);
});


test('logout destroys the chart containing private measurement data', async t => {
  const h = await harness(t, user('parent'));
  h.chartCanvas = { getContext: () => ({}) };
  const charts = h.module('js/chartManager.js');
  assert.equal(charts.renderPlayerChartCanvas({
    playerSessions: [{ session_date: '2026-01-01', exit_velo: 55, throwing_velo: 65 }],
    chartMode: 'velocity', t: key => key
  }), true);
  await h.app.signOutAndClear();
  assert.equal(h.chartDestroyed, 1);
  charts.clearPlayerChart();
  assert.equal(h.chartDestroyed, 1, 'destroyed chart is no longer retained');
});

test('old data completion does not stop the new account loading indicator', async t => {
  const h = await harness(t); const old = deferred(), current = deferred();
  h.rows.athlete_guardians = [{ athlete_id: 'a1', status: 'verified' }];
  h.queue('players', old.promise);
  const login = h.app.signInAndLoad();
  await until(() => h.calls.some(c => c.table === 'players'));
  h.queue('players', current.promise);
  h.emit('SIGNED_IN', user('new'));
  await until(() => h.calls.filter(c => c.table === 'players').length === 2);
  old.resolve(ok([{ id: 'old', athlete_id: 'a1', jersey: '1' }])); await login;
  assert.equal(h.app.loading.value, true);
  assert.equal(h.app.players.value.length, 0);
  current.resolve(ok([{ id: 'new', athlete_id: 'a1', jersey: '2' }]));
  await until(() => !h.app.loading.value);
  assert.equal(h.app.players.value[0].id, 'new');
});


test('logout cancels a queued video frame and stale callbacks cannot restart processing', async t => {
  const h = await harness(t, user('parent')); let frame, cancelled;
  h.app.openAnalyzer({ id: 'private', category: 'pitching', fps_mode: 60 });
  h.app.analyzerVideoRef.value = {
    duration: 2, videoWidth: 100, videoHeight: 100, readyState: 2,
    pause() {}, removeAttribute() {}, load() {},
    requestVideoFrameCallback(callback) { frame = callback; return 7; },
    cancelVideoFrameCallback(id) { cancelled = id; }
  };
  h.app.analyzerCanvasRef.value = { getContext: () => ({ clearRect() {} }) };
  h.app.onAnalyzerVideoLoaded(); assert.equal(typeof frame, 'function');
  await h.app.signOutAndClear(); assert.equal(cancelled, 7);
  frame(); assert.equal(h.app.bauerPhases.value.length, 0);
});

test('logout cancels the animation-frame fallback', async t => {
  const h = await harness(t, user('parent'));
  h.app.openAnalyzer({ id: 'private' });
  h.app.analyzerVideoRef.value = { duration: 2, pause() {}, removeAttribute() {}, load() {} };
  h.app.analyzerCanvasRef.value = { getContext: () => ({ clearRect() {} }) };
  h.app.onAnalyzerVideoLoaded(); assert.equal(h.frames.length, 1);
  await h.app.signOutAndClear(); assert.equal(h.cancelledFrame, 1);
  h.frames[0](); assert.equal(h.frames.length, 1);
});

test('verified parent lands on My Players tab and does not trigger coach roster RPC', async t => {
  const h = await harness(t);
  h.rows.athlete_guardians = [{ athlete_id: 'child-1', relationship: 'guardian', status: 'verified' }];
  h.rows.players = [{ id: 'p-1', athlete_id: 'child-1', preferred_name: 'Maya', jersey: '11' }];
  h.app.submissionController.changeTab('clubhouse');
  h.app.loginEmail.value = 'parent@example.invalid';
  h.app.loginPassword.value = 'synthetic';
  await h.app.signInAndLoad();
  assert.equal(h.app.isVerifiedGuardian.value, true);
  assert.equal(h.app.isTeamCoach.value, false);
  assert.equal(h.app.isParentOnly.value, true);
  assert.equal(h.app.currentView.value, 'overview');
  assert.equal(h.app.submissionController.tab.value, 'players');
  assert.equal(h.calls.some(c => c.rpc === 'sdl_004_coach_roster'), false);
});

test('prepared phone OTP and invitation onboarding interfaces validate inputs and never forge guardian links', async t => {
  const h = await harness(t);
  assert.equal(h.app.authMethod.value, 'email');
  h.app.setAuthMethod('phone');
  assert.equal(h.app.authMethod.value, 'phone');
  h.app.loginPhone.value = 'bad';
  h.app.requestPhoneOtp();
  assert.match(h.app.authError.value, /valid mobile phone/i);
  h.app.loginPhone.value = '+852 9123 4567';
  h.app.requestPhoneOtp();
  assert.equal(h.app.authError.value, '');
  assert.match(h.app.authNotice.value, /awaits SMS\/WhatsApp provider/i);

  h.app.setAuthMethod('otp');
  h.app.loginOtpCode.value = '123';
  h.app.verifyOtpCode();
  assert.match(h.app.authError.value, /6-digit/i);
  h.app.loginOtpCode.value = '123456';
  h.app.verifyOtpCode();
  assert.equal(h.app.authError.value, '');
  assert.match(h.app.authNotice.value, /awaits backend OTP provider/i);

  h.app.setAuthMethod('invite');
  h.app.inviteCode.value = 'short';
  h.app.redeemInvitation();
  assert.match(h.app.authError.value, /valid club invitation/i);
  h.app.inviteCode.value = 'SWALLOWS-INV-2026';
  h.app.redeemInvitation();
  assert.equal(h.app.authError.value, '');
  assert.match(h.app.authNotice.value, /Client-side parent-to-child linking is disabled/i);
  assert.equal(h.app.guardianLinks.value.length, 0);
  assert.equal(h.calls.length, 0);
});

test('Fix 5: logout and identity invalidation clear phone, OTP, invitation code and invitation email', async t => {
  const h = await harness(t, user('parent'));
  h.app.loginPhone.value = '+852 9123 4567';
  h.app.loginOtpCode.value = '123456';
  h.app.otpSent.value = true;
  h.app.inviteCode.value = 'SWALLOWS-INV-2026';
  h.app.inviteEmail.value = 'parent@example.invalid';
  h.app.loginPassword.value = 'secret';

  await h.app.signOutAndClear();
  assert.equal(h.app.loginPhone.value, '');
  assert.equal(h.app.loginOtpCode.value, '');
  assert.equal(h.app.otpSent.value, false);
  assert.equal(h.app.inviteCode.value, '');
  assert.equal(h.app.inviteEmail.value, '');
  assert.equal(h.app.loginPassword.value, '');

  h.app.loginPhone.value = '+852 9876 5432';
  h.app.loginOtpCode.value = '654321';
  h.app.otpSent.value = true;
  h.app.inviteCode.value = 'SWALLOWS-INV-2027';
  h.app.inviteEmail.value = 'other@example.invalid';
  h.emit('SIGNED_OUT', null);
  assert.equal(h.app.loginPhone.value, '');
  assert.equal(h.app.loginOtpCode.value, '');
  assert.equal(h.app.otpSent.value, false);
  assert.equal(h.app.inviteCode.value, '');
  assert.equal(h.app.inviteEmail.value, '');
});

test('offline tab return does not re-check session or clear loaded data',async t=>{
  const h=await harness(t,user('coach'));
  h.app.activeTab.value='videos';
  h.app.selectedPlayer.value={id:'authorized'};
  h.app.players.value=[{id:'authorized',jersey:'21'}];
  const before=h.calls.length;
  const calls=h.poseCalls;
  h.queue('getUser',{data:{user:null},error:{message:'offline connectivity'}});
  h.emit('SIGNED_IN',user('coach'));
  h.emit('TOKEN_REFRESHED',user('coach'));
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(h.app.authReady.value,true);
  assert.equal(h.app.authUser.value.id,'coach');
  assert.equal(h.app.players.value[0].id,'authorized');
  assert.equal(h.app.activeTab.value,'videos');
  assert.equal(h.calls.length,before);
  assert.equal(h.poseCalls,calls);
});

test('temporary network errors do not turn next same-user focus into a fresh login',async t=>{
  const h=await harness(t,user('coach'));
  h.app.selectedPlayer.value={id:'selected'};
  h.app.authError.value='temporary network error';
  const before=h.calls.length,pose=h.poseCalls;
  h.emit('SIGNED_IN',user('coach'));
  await new Promise(resolve=>setTimeout(resolve,3));
  assert.equal(h.app.authUser.value.id,'coach');
  assert.equal(h.app.selectedPlayer.value?.id,'selected');
  assert.equal(h.app.authReady.value,true);
  assert.equal(h.calls.length,before);
  assert.equal(h.poseCalls,pose);
  h.emit('SIGNED_OUT',null);
  assertCleared(h.app);
});
