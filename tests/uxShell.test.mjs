// SDL-UX-002: role-aware navigation and scoped dashboard regression checks.
// Run with: node --experimental-vm-modules --test tests/uxShell.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, user } from './helpers/appHarness.mjs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const shell = fs.readFileSync(new URL('../components/AppShell.js', import.meta.url), 'utf8');
const familyHome = fs.readFileSync(new URL('../components/ParentHome.js', import.meta.url), 'utf8');
const coachHome = fs.readFileSync(new URL('../components/CoachHome.js', import.meta.url), 'utf8');

test('five destinations, original session guard and existing workspaces remain mounted', () => {
  for (const tab of ['home', 'team', 'stats', 'videos', 'me']) {
    assert.match(shell, new RegExp("id: '"+tab+"'"));
  }
  assert.match(index, /v-if="!authReady"/);
  assert.match(index, /v-else-if="!authUser"/);
  for (const name of ['app-shell','coach-home','parent-home','pilot-workspace','submission-workspace',
     'club-enrollment-admin','private-media-panel','coach-team-roster','team-overview','player-profile','ar-analyzer-modal']) {
    assert.ok(index.includes('<'+name), name);
  }
  assert.match(appSource, /const authorized = new Set\(auth\.guardianLinks\.value\.filter/);
  assert.match(index, /:players="familyPlayers"/);
});

test('family dashboard shows only verified linked athletes, even for dual-role users', async t => {
  const h = await harness(t, user('synthetic'));
  const good={id:'good',athlete_id:'linked',preferred_name:'Linked child',jersey:'12'};
  const bad={id:'bad',athlete_id:'other',preferred_name:'Unrelated child',jersey:'99'};
  h.app.guardianLinks.value=[{athlete_id:'linked',status:'verified'},{athlete_id:'other',status:'revoked'}];
  h.app.players.value=[good,bad];
  assert.equal(h.app.workspaceMode.value,'family');
  assert.deepEqual([...h.app.familyPlayers.value.map(p=>p.id)],['good']);
  h.app.teamMemberships.value=[{team_id:'team',role:'coach',status:'active'}];
  assert.equal(h.app.workspaceMode.value,'coach');
  h.app.changeWorkspace('family');
  assert.equal(h.app.workspaceMode.value,'family');
  assert.deepEqual([...h.app.familyPlayers.value.map(p=>p.id)],['good']);
});

test('navigation and role switching do not grant membership or make data requests', async t => {
  const h=await harness(t,user('synthetic'));
  const before=h.calls.length;
  h.app.navigateTab('videos'); assert.equal(h.app.activeTab.value,'videos');
  h.app.navigateTab('unsupported'); assert.equal(h.app.activeTab.value,'videos');
  h.app.changeWorkspace('coach'); assert.equal(h.app.workspaceMode.value,'member');
  h.app.changeWorkspace('family'); assert.equal(h.app.workspaceMode.value,'member');
  assert.equal(h.calls.length,before);
  h.app.navigateTab('home'); assert.equal(h.app.activeTab.value,'home');
});

test('logout resets the navigation and removes scoped family data', async t => {
  const h=await harness(t,user('synthetic'));
  h.app.guardianLinks.value=[{athlete_id:'linked',status:'verified'}];
  h.app.players.value=[{id:'kid',athlete_id:'linked',preferred_name:'Child'}];
  h.app.navigateTab('videos');
  await h.app.signOutAndClear();
  assert.equal(h.app.activeTab.value,'home');
  assert.equal(h.app.workspaceMode.value,'member');
  assert.deepEqual([...h.app.familyPlayers.value],[]);
});

test('new home components contain no private identifiers, predicted metrics or unrestricted fetches', () => {
  for (const [name,source] of [['ParentHome',familyHome],['CoachHome',coachHome]]) {
    assert.doesNotMatch(source, /(?:parent_phone|hkll_reg_no|given_names|last_name|dob|date_of_birth)/i, name);
    assert.doesNotMatch(source, /(?:\bfetch\s*\(|\.from\s*\(|\.rpc\s*\()/i, name);
  }
  assert.match(familyHome, /No estimated values are shown/);
  assert.match(coachHome, /does not invent team averages/);
});
