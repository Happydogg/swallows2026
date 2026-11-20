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

test('invitation fragment survives sign-in for server verification but never links a guardian by itself', async t => {
  const token='a'.repeat(64);
  const h=await harness(t,null,{invitationHash:'#guardian-invite='+token});
  assert.equal(h.replacedUrl,'/');
  assert.equal(h.app.pendingInvitation.value,false);
  h.app.loginEmail.value='invited@example.invalid';
  h.app.loginPassword.value='synthetic';
  await h.app.signInAndLoad();
  assert.equal(h.app.pendingInvitation.value,true);
  assert.equal(h.app.pilotController.redemptionToken.value,token);
  assert.equal(h.app.isVerifiedGuardian.value,false);
  h.app.dismissInvitePrompt();
  assert.equal(h.app.pendingInvitation.value,false);
  await h.app.signOutAndClear();
  assert.equal(h.app.pilotController.redemptionToken.value,'');
  assert.equal(h.app.pendingInvitation.value,false);
});

test('new home components contain no private identifiers, predicted metrics or unrestricted fetches', () => {
  for (const [name,source] of [['ParentHome',familyHome],['CoachHome',coachHome]]) {
    assert.doesNotMatch(source, /(?:parent_phone|hkll_reg_no|given_names|last_name|dob|date_of_birth)/i, name);
    assert.doesNotMatch(source, /(?:\bfetch\s*\(|\.from\s*\(|\.rpc\s*\()/i, name);
  }
  assert.match(familyHome, /No estimated values are shown/);
  assert.match(coachHome, /does not invent team averages/);
});

test('authenticated player browser uses scoped coach or verified-guardian data only', async t => {
  const h=await harness(t,user('staging-review'));
  const coach={id:'coach-child',team_id:'authorized-team',preferred_name:'Coach Athlete'};
  const linked={id:'linked-child',athlete_id:'guardian-athlete',preferred_name:'Family Athlete'};
  const other={id:'unrelated',athlete_id:'unrelated-athlete',preferred_name:'Unlinked Athlete'};
  h.app.players.value=[linked,other];
  h.app.coachRoster.value=[coach];
  h.app.guardianLinks.value=[{athlete_id:'guardian-athlete',status:'verified'}];
  assert.deepEqual([...h.app.visibleStagingPlayers.value.map(row=>row.id)],['linked-child']);
  h.app.teamMemberships.value=[{team_id:'authorized-team',role:'coach',status:'active'}];
  assert.deepEqual([...h.app.visibleStagingPlayers.value.map(row=>row.id)],['coach-child']);
  h.app.changeWorkspace('family');
  assert.deepEqual([...h.app.visibleStagingPlayers.value.map(row=>row.id)],['linked-child']);
  h.app.authError.value='Membership service denied';
  assert.deepEqual([...h.app.visibleStagingPlayers.value],[]);
});

test('new preview host does not claim private Worker CORS eligibility', async t => {
  const h=await harness(t,user('staging-review'));
  assert.equal(h.app.mediaOriginAllowed.value,false);
  h.app.guardianLinks.value=[{athlete_id:'guardian-athlete',status:'verified'}];
  h.app.submissionController.changeTab('clubhouse');
  h.app.navigateTab('team');
  assert.equal(h.app.submissionController.tab.value,'players');
  h.app.navigateTab('videos');
  assert.equal(h.app.activeTab.value,'videos');
  assert.equal(h.app.mediaOriginAllowed.value,false);
});

test('live media navigation links only to the previously authorized staging host',()=>{
  assert.match(index,/href="https:\/\/sdl-staging\.pages\.dev\/"/);
  assert.match(index,/v-if="activeTab === 'videos' && !mediaOriginAllowed"/);
  assert.match(index,/:class="activeTab === 'videos' && mediaOriginAllowed/);
});
