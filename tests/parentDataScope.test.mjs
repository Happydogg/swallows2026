// SDL-004 parent data-scope regression tests.
// Proves parent-only accounts never trigger the legacy unrestricted loader
// (fetchAllCloudData: players.select('*') + sessions.select('*')).
// Client-side projection is defence in depth only; authorization remains server-side RLS.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, deferred, until, user, ok } from './helpers/appHarness.mjs';

const GUARDIAN_COLUMNS = 'id, athlete_id, preferred_name, jersey, position, throws, bats';
const PRIVATE_FIELDS = ['dob', 'hkll_reg_no', 'parent_phone', 'last_name', 'given_names', 'photo_url'];
const playerCalls = h => h.calls.filter(c => c.table === 'players');
const sessionCalls = h => h.calls.filter(c => c.table === 'sessions');

function assertNoLegacyLoad(h) {
  assert.equal(sessionCalls(h).length, 0, 'sessions must never be queried for parent-only accounts');
  assert.equal(playerCalls(h).some(c => c.columns === '*' || c.columns == null), false, 'players.select(*) must never run');
}

async function parentLogin(t, links, players = []) {
  const h = await harness(t);
  h.rows.athlete_guardians = links;
  h.rows.players = players;
  h.rows.sessions = [{ id: 'raw-session', player_id: 'p-1', exit_velo: 99 }];
  h.app.loginEmail.value = 'parent@example.invalid';
  h.app.loginPassword.value = 'synthetic';
  await h.app.signInAndLoad();
  await until(() => !h.app.loading.value);
  return h;
}

test('verified parent sign-in never calls the legacy loader and requests only scoped baseball columns', async t => {
  const h = await parentLogin(t, [{ athlete_id: 'child-1', relationship: 'guardian', status: 'verified' }],
    [{ id: 'p-1', athlete_id: 'child-1', preferred_name: 'Maya', jersey: '11', position: 'P', throws: 'R', bats: 'L' }]);
  assert.equal(h.app.isParentOnly.value, true);
  assertNoLegacyLoad(h);
  const calls = playerCalls(h);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].columns, GUARDIAN_COLUMNS);
  assert.equal(JSON.stringify(calls[0].filters), JSON.stringify([{ op: 'in', col: 'athlete_id', vals: ['child-1'] }]));
  assert.equal(h.app.players.value.length, 1);
  assert.equal(h.app.players.value[0].preferred_name, 'Maya');
  assert.equal(h.app.sessions.value.length, 0);
  assert.equal(h.calls.some(c => c.rpc === 'sdl_004_coach_roster'), false);
});

test('unexpected private fields or unlinked rows in a response are not retained (defence in depth)', async t => {
  const h = await parentLogin(t, [{ athlete_id: 'child-1', status: 'verified' }], [
    { id: 'p-1', athlete_id: 'child-1', preferred_name: 'Maya', jersey: '11', dob: '2015-01-01', hkll_reg_no: 'X', parent_phone: '+852', last_name: 'L', given_names: 'G', photo_url: 'u' },
    { id: 'p-2', athlete_id: 'stranger', preferred_name: 'Other', jersey: '2' }
  ]);
  assert.equal(JSON.stringify(h.app.players.value.map(p => p.id)), '["p-1"]');
  for (const field of PRIVATE_FIELDS) assert.equal(h.app.players.value[0][field], undefined, field);
});

test('restored parent session loads once; same-user refresh preserves scoped guardian view', async t => {
  const h = await harness(t);
  h.rows.athlete_guardians = [{ athlete_id: 'child-1', status: 'verified' }];
  h.rows.players = [{ id: 'p-1', athlete_id: 'child-1', preferred_name: 'Maya', jersey: '11' }];
  h.emit('INITIAL_SESSION', user('parent'));
  await until(() => h.app.players.value[0]?.id === 'p-1' && !h.app.loading.value);
  const initialCalls=playerCalls(h).length;
  for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED']) {
    h.emit(event, user('parent'));
    await new Promise(resolve=>setTimeout(resolve, 2));
    assert.equal(playerCalls(h).length, initialCalls);
    assert.equal(h.app.players.value[0]?.id, 'p-1');
    assert.equal(h.app.authReady.value, true);
  }
  assertNoLegacyLoad(h);
});

for (const status of ['pending', 'revoked']) {
  test(`${status}-only guardian accounts make no players or sessions requests`, async t => {
    const h = await parentLogin(t, [{ athlete_id: 'child-1', status }],
      [{ id: 'p-1', athlete_id: 'child-1', preferred_name: 'Maya', jersey: '11' }]);
    assert.equal(h.app.isVerifiedGuardian.value, false);
    assert.equal(playerCalls(h).length, 0);
    assert.equal(sessionCalls(h).length, 0);
    assert.equal(h.app.players.value.length, 0);
    assert.equal(h.app.submissionController.cards.value.length, 0);
  });
}

test('guardian data-request failure surfaces an error without falling back to the legacy loader', async t => {
  const h = await harness(t);
  h.rows.athlete_guardians = [{ athlete_id: 'child-1', status: 'verified' }];
  h.queue('players', { data: null, error: { message: 'permission denied for table players' } });
  h.app.loginEmail.value = 'parent@example.invalid'; h.app.loginPassword.value = 'synthetic';
  await h.app.signInAndLoad();
  await until(() => !h.app.loading.value);
  assert.match(h.app.authError.value, /permission denied/);
  assert.equal(h.app.players.value.length, 0);
  assertNoLegacyLoad(h);
  assert.equal(playerCalls(h).length, 1);
});

test('late guardian response is discarded after logout', async t => {
  const h = await harness(t); const pending = deferred();
  h.rows.athlete_guardians = [{ athlete_id: 'child-1', status: 'verified' }];
  h.queue('players', pending.promise);
  h.app.loginEmail.value = 'parent@example.invalid'; h.app.loginPassword.value = 'synthetic';
  const login = h.app.signInAndLoad();
  await until(() => playerCalls(h).length === 1);
  await h.app.signOutAndClear();
  pending.resolve(ok([{ id: 'p-1', athlete_id: 'child-1', preferred_name: 'Maya', jersey: '11' }]));
  await login;
  assert.equal(h.app.players.value.length, 0);
  assert.equal(h.app.loading.value, false);
});

test('parent private-video picker still lists the verified linked child from the scoped load', async t => {
  const h = await parentLogin(t, [{ athlete_id: 'child-1', status: 'verified' }],
    [{ id: 'p-1', athlete_id: 'child-1', preferred_name: 'Maya', jersey: '11' }]);
  const media = h.app.privateMediaController;
  assert.equal(JSON.stringify(media.mediaPlayers.value.map(p => p.id)), '["p-1"]');
  assertNoLegacyLoad(h);
});

test('parent My Players and Clubhouse statistics show the unavailable state, never raw session values', async t => {
  const h = await parentLogin(t, [{ athlete_id: 'child-1', status: 'verified' }],
    [{ id: 'p-1', athlete_id: 'child-1', preferred_name: 'Maya', jersey: '11' }]);
  // Even if raw session rows were injected client-side, parent-only cards must not derive stats.
  h.app.sessions.value = [{ id: 's', player_id: 'p-1', exit_velo: 99 }];
  const c = h.app.submissionController;
  assert.equal(c.statsAvailable.value, false);
  const profile = c.cards.value[0].profiles[0];
  assert.equal(profile.statsAvailable, false);
  assert.equal(profile.latestExitVelo, null);
  assert.match(c.statsUnavailableNotice, /parent-safe statistics service/);
});

test('coach accounts use only membership-scoped roster RPC and no forbidden sessions request', async t => {
  const h = await harness(t);
  h.rows.team_memberships = [{ team_id: 't', role: 'coach', status: 'active' }];
  h.rows.athlete_guardians = [{ athlete_id: 'child-1', status: 'verified' }];
  h.rows.players = [{ id: 'p-1', athlete_id: 'child-1', jersey: '1' }];
  h.rows.roster = [{ id: 'p-1', team_id: 't', preferred_name: 'Maya', jersey: '1' }];
  h.rows.sessions = [{ id: 's', player_id: 'p-1', exit_velo: 60 }];
  h.app.loginEmail.value = 'coach@example.invalid'; h.app.loginPassword.value = 'synthetic';
  await h.app.signInAndLoad();
  await until(() => !h.app.loading.value);
  assert.equal(h.app.isTeamCoach.value, true);
  assert.equal(sessionCalls(h).length, 0);
  assert.equal(h.calls.some(c => c.rpc === 'sdl_004_coach_roster'), true);
  assert.equal(h.app.sessions.value.length, 0);
  assert.equal(h.app.coachRoster.value[0].id,'p-1');
  assert.equal(h.app.submissionController.statsAvailable.value, false, 'Coach rows are not a family statistics source');
});

test('templates render explicit statistics-unavailable states and keep existing bindings', () => {
  const workspace = fs.readFileSync(new URL('../components/SubmissionWorkspace.js', import.meta.url), 'utf8');
  const profile = fs.readFileSync(new URL('../components/PlayerProfile.js', import.meta.url), 'utf8');
  assert.equal((workspace.match(/data-stats-unavailable/g) || []).length, 2);
  assert.match(workspace, /v-if="!profile\.statsAvailable"/);
  assert.match(profile, /data-stats-unavailable/);
  for (const binding of ['showProfile(profile.id)', 'openPrivateVideos(profile.id)', 'changeClubhouseSection(sec.id)']) {
    assert.ok(workspace.includes(binding), binding);
  }
});

test('supabaseService guardian loader makes zero requests without verified links', async t => {
  const h = await harness(t);
  const svc = h.module('js/supabaseService.js');
  assert.equal(svc.GUARDIAN_PLAYER_COLUMNS, GUARDIAN_COLUMNS);
  assert.equal(svc.GUARDIAN_PLAYER_COLUMNS.includes('*'), false);
  for (const field of PRIVATE_FIELDS) assert.equal(svc.GUARDIAN_PLAYER_COLUMNS.includes(field), false, field);
  const before = h.calls.length;
  assert.equal((await svc.fetchVerifiedGuardianPlayers([{ athlete_id: 'x', status: 'pending' }])).length, 0);
  assert.equal((await svc.fetchVerifiedGuardianPlayers([])).length, 0);
  assert.equal(h.calls.length, before);
});

test('Fix 4: newly registered unlinked user makes zero players, sessions, or coach roster requests', async t => {
  const h = await harness(t);
  h.rows.players = [{ id: 'p-1', athlete_id: 'child-1', jersey: '11' }];
  h.rows.sessions = [{ id: 's-1', player_id: 'p-1', exit_velo: 65 }];
  h.app.loginEmail.value = 'newuser@example.invalid';
  h.app.loginPassword.value = 'synthetic';
  await h.app.signInAndLoad();
  await until(() => !h.app.loading.value);
  assert.equal(playerCalls(h).length, 0);
  assert.equal(sessionCalls(h).length, 0);
  assert.equal(h.calls.some(c => c.rpc === 'sdl_004_coach_roster'), false);
  assert.equal(h.app.players.value.length, 0);
  assert.equal(h.app.sessions.value.length, 0);
});

test('Fix 4: failed membership lookup fails closed with zero player or session queries', async t => {
  const h = await harness(t);
  h.rows.players = [{ id: 'p-1', athlete_id: 'child-1', jersey: '11' }];
  h.queue('team_memberships', { data: null, error: { message: 'membership lookup failed' } });
  h.app.loginEmail.value = 'user@example.invalid';
  h.app.loginPassword.value = 'synthetic';
  await h.app.signInAndLoad();
  await until(() => !h.app.loading.value);
  assert.match(h.app.authError.value, /membership lookup failed/);
  assert.equal(playerCalls(h).length, 0);
  assert.equal(sessionCalls(h).length, 0);
  assert.equal(h.calls.some(c => c.rpc === 'sdl_004_coach_roster'), false);
  assert.equal(h.app.players.value.length, 0);
});

test('Fix 4: administrator-only account retains admin role without receiving unrestricted player or session data', async t => {
  const h = await harness(t);
  h.rows.organization_memberships = [{ organization_id: 'org-1', role: 'admin', status: 'active' }];
  h.rows.players = [{ id: 'p-1', athlete_id: 'child-1', jersey: '11' }];
  h.rows.sessions = [{ id: 's-1', player_id: 'p-1', exit_velo: 65 }];
  h.app.loginEmail.value = 'admin@example.invalid';
  h.app.loginPassword.value = 'synthetic';
  await h.app.signInAndLoad();
  await until(() => !h.app.loading.value);
  assert.equal(h.app.isOrgAdmin.value, true);
  assert.equal(h.app.isTeamCoach.value, false);
  assert.equal(playerCalls(h).length, 0);
  assert.equal(sessionCalls(h).length, 0);
  assert.equal(h.app.players.value.length, 0);
  assert.equal(h.app.sessions.value.length, 0);
});

test('Fix 4: admin + verified guardian account loads only narrow guardian projection and never sessions', async t => {
  const h = await harness(t);
  h.rows.organization_memberships = [{ organization_id: 'org-1', role: 'admin', status: 'active' }];
  h.rows.athlete_guardians = [{ athlete_id: 'child-1', status: 'verified' }];
  h.rows.players = [{ id: 'p-1', athlete_id: 'child-1', preferred_name: 'Maya', jersey: '11', dob: '2015-01-01' }];
  h.rows.sessions = [{ id: 's-1', player_id: 'p-1', exit_velo: 65 }];
  h.app.loginEmail.value = 'adminguardian@example.invalid';
  h.app.loginPassword.value = 'synthetic';
  await h.app.signInAndLoad();
  await until(() => !h.app.loading.value);
  assert.equal(h.app.isOrgAdmin.value, true);
  assert.equal(h.app.isVerifiedGuardian.value, true);
  assertNoLegacyLoad(h);
  assert.equal(h.app.players.value.length, 1);
  assert.equal(h.app.players.value[0].dob, undefined);
});
