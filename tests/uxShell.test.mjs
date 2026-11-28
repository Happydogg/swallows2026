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
  h.setFixtureRoles(['guardian']);
  h.app.players.value=[good,bad];
  assert.equal(h.app.workspaceMode.value,'family');
  assert.deepEqual([...h.app.familyPlayers.value.map(p=>p.id)],['good']);
  h.app.teamMemberships.value=[{team_id:'team',role:'coach',status:'active'}];
  h.setFixtureRoles(['coach','guardian']);
  assert.equal(h.app.workspaceMode.value,'coach');
  h.rows.athlete_guardians=h.app.guardianLinks.value; h.rows.players=[good,bad];
  await h.app.changeWorkspace('family');
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
  h.setFixtureRoles(['guardian']);
  assert.deepEqual([...h.app.visibleStagingPlayers.value.map(row=>row.id)],['linked-child']);
  h.app.teamMemberships.value=[{team_id:'authorized-team',role:'coach',status:'active'}];
  h.setFixtureRoles(['coach','guardian']);
  assert.deepEqual([...h.app.visibleStagingPlayers.value.map(row=>row.id)],['coach-child']);
  h.rows.athlete_guardians=h.app.guardianLinks.value; h.rows.players=[linked,other];
  await h.app.changeWorkspace('family');
  assert.deepEqual([...h.app.visibleStagingPlayers.value.map(row=>row.id)],['linked-child']);
  h.app.authError.value='Membership service denied';
  assert.deepEqual([...h.app.visibleStagingPlayers.value],[]);
});

test('new preview host does not claim private Worker CORS eligibility', async t => {
  const h=await harness(t,user('staging-review'));
  assert.equal(h.app.mediaOriginAllowed.value,false);
  h.app.guardianLinks.value=[{athlete_id:'guardian-athlete',status:'verified'}];
  h.setFixtureRoles(['guardian']);
  h.app.submissionController.changeTab('clubhouse');
  h.app.navigateTab('team');
  assert.equal(h.app.submissionController.tab.value,'players');
  h.app.navigateTab('videos');
  assert.equal(h.app.activeTab.value,'videos');
  assert.equal(h.app.mediaOriginAllowed.value,false);
});

test('media fallback links to original staging host for unapproved origins',()=>{
  assert.match(index,/href="https:\/\/sdl-staging\.pages\.dev\/"/);
  assert.match(index,/v-if="activeTab === 'videos' && !mediaOriginAllowed"/);
  assert.ok(index.includes("v-if=\"activeTab === 'videos' && mediaOriginAllowed && ['team','mine'].includes(videoPage)\""));
  assert.ok(index.includes("activeTab === 'team' && mediaOriginAllowed && privateMediaController.mediaPlayers.value.some"));
});

test('approved live UX hostname enables the existing private-media panel without changing Worker calls', () => {
  assert.ok(appSource.includes('https://sdl-ux-live.pages.dev'));
  assert.match(appSource,/mediaOriginAllowed = computed/);
  assert.ok(index.includes("v-if=\"activeTab === 'videos' && mediaOriginAllowed && ['team','mine'].includes(videoPage)\""));
  assert.ok(index.includes("activeTab === 'team' && mediaOriginAllowed && privateMediaController.mediaPlayers.value.some"));
  assert.match(index,/<private-media-panel/);
  assert.match(index,/v-if="activeTab === 'videos' && !mediaOriginAllowed"/);
});


test('Stats Hub uses only permissioned family cards or coach roster, with no raw queries', () => {
  const source=fs.readFileSync(new URL('../components/StatsHub.js', import.meta.url),'utf8');
  assert.match(index, /<stats-hub v-if="activeTab === 'stats'/);
  assert.match(index, /:family-cards="statsFamilyCards"/);
  assert.match(appSource, /statsFamilyCards: submissionWorkspace\.cards/);
  assert.match(source, /profile\.statsAvailable === true/);
  assert.match(source, /No verified, permitted statistics/);
  assert.doesNotMatch(source, /\bfetch\s*\(|supabaseClient|\.from\s*\(|\.rpc\s*\(/);
});

test('athlete hero preserves legacy history and coach-only identity fields', () => {
  const hero=fs.readFileSync(new URL('../components/PlayerHeroCard.js', import.meta.url),'utf8');
  const detailed=fs.readFileSync(new URL('../components/PlayerProfile.js', import.meta.url),'utf8');
  const family=fs.readFileSync(new URL('../components/ParentHome.js', import.meta.url),'utf8');
  assert.match(detailed, /<player-hero-card variant="profile"/);
  assert.match(family, /<player-hero-card :player="player" variant="compact"/);
  assert.match(hero, /v-if="isCoach"/);
  for (const retained of ['playerVelocityChart','getPlayerSessions(selectedPlayer.id)','openAnalyzer(video)','toggleSessionExpand']) {
    assert.ok(detailed.includes(retained),retained);
  }
  for (const sensitive of ['last_name','given_names','parent_phone']) {
    assert.doesNotMatch(family, new RegExp(sensitive));
  }
});

test('redesigned private video controls still use authorized existing controller', () => {
  const source=fs.readFileSync(new URL('../components/PrivateMediaPanel.js', import.meta.url),'utf8');
  for(const action of ['c.selectMediaPlayer(id)','refreshMedia','uploadPrivateMedia','c.playPrivateMedia(item)','analyzePrivateMedia','reportPlaybackError']){
    assert.ok(source.includes(action),action);
  }
  assert.match(source, /<video :key="mediaPlaybackUrl" :src="mediaPlaybackUrl" controls playsinline/);
  assert.match(source, /v-if="mediaReadAllowed"/);
  assert.match(source, /v-if="mediaUploadAllowed"/);
  assert.doesNotMatch(source, /\bfetch\s*\(|supabaseClient|\.from\s*\(/);
});

test('Stats Hub displays static staging fixture without requesting live sessions',()=>{
  const hub=fs.readFileSync(new URL('../components/StatsHub.js',import.meta.url),'utf8');
  const lab=fs.readFileSync(new URL('../components/DemoGrowthLab.js',import.meta.url),'utf8');
  assert.ok(hub.includes('<demo-growth-lab v-if="showSynthetic"'), 'synthetic charts appear only in design preview');
  const live=fs.readFileSync(new URL('../components/AuthorizedStatsBoard.js',import.meta.url),'utf8');
  assert.ok(index.includes('<authorized-stats-board'));
  assert.ok(index.includes(':show-synthetic="false"'));
  assert.ok(live.includes('Live staging measurements'));
  assert.equal(live.includes('supabaseClient'),false);
  assert.equal(live.includes('.from('),false,'presentation component cannot query unscoped tables');
  assert.ok(lab.includes('not a live Supabase query'));
  for(const key of ['sprint_18m_s','height_cm','weight_kg','throwing_velo_kmh'])
    assert.ok(lab.includes(key));
  assert.equal(lab.includes('supabaseClient'),false);
  assert.equal(lab.includes('fetch('),false);
});

test('video shortcuts are wired through one server-scoped player route', () => {
  const cards = fs.readFileSync(new URL('../components/StagingDataBrowser.js', import.meta.url),'utf8');
  assert.match(cards, /emits: \['navigate', 'open-video'\]/);
  assert.match(cards, /\$emit\('open-video', player\)/);
  assert.match(coachHome, /\$emit\('open-video',player\)/);
  assert.match(familyHome, /\$emit\('open-video',player\)/);
  assert.match(index, /@open-video="openAuthorizedPlayerVideos"/);
  assert.match(appSource, /const currentlyScoped = visibleStagingPlayers\.value\.some/);
  assert.match(appSource, /privateMedia\.mediaPlayers\.value\.some/);
  assert.match(appSource, /privateMedia\.selectMediaPlayer\(player\.id\)/);
});

test('a video shortcut cannot navigate for unlinked or revoked players', async t => {
  const h = await harness(t,user('video-shortcut'));
  h.app.guardianLinks.value = [{ athlete_id:'linked',status:'verified' },{ athlete_id:'revoked',status:'revoked' }];
  h.setFixtureRoles(['guardian']);
  h.app.players.value = [
    {id:'authorized-player',athlete_id:'linked',preferred_name:'Linked'},
    {id:'blocked-player',athlete_id:'revoked',preferred_name:'Not linked'}
  ];
  h.app.activeTab.value='home';
  h.app.openAuthorizedPlayerVideos({id:'blocked-player'});
  assert.equal(h.app.activeTab.value,'home');
  h.app.openAuthorizedPlayerVideos({id:'authorized-player'});
  assert.equal(h.app.activeTab.value,'videos');
  assert.equal(h.app.privateMediaController.mediaPlayerId.value,'');
});

test('compact mobile player editing is reached only from the dedicated Player Profile',()=>{
  const profile=fs.readFileSync(new URL('../components/PlayerProfile.js',import.meta.url),'utf8');
  const hero=fs.readFileSync(new URL('../components/PlayerHeroCard.js',import.meta.url),'utf8');
  const parent=fs.readFileSync(new URL('../components/ParentHome.js',import.meta.url),'utf8');
  const editor=fs.readFileSync(new URL('../components/AvatarManager.js',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  assert.equal((profile.match(/t\('editPlayer'\)/g)||[]).length,1);
  assert.ok(profile.includes('v-if="canEditPhoto || isCoach"'));
  assert.ok(profile.includes('@click="editPlayer"'));
  assert.ok(profile.includes("emit('edit-photo',props.selectedPlayer.id)"));
  assert.ok(profile.includes('props.openEditPlayerModal(props.selectedPlayer)'));
  assert.ok(!hero.includes('Change profile picture'));
  assert.ok(!parent.includes('Change profile picture'));
  assert.ok(parent.includes("$emit('open-profile',player)"));
  assert.ok(editor.includes('>Edit Player</h2>'));
  assert.ok(editor.includes('Other player details remain read-only'));
  assert.ok(!editor.includes('>Change photo'));
  assert.ok(app.includes("loadAuthorizedHistory(selected.id,'guardian')"), 'family profile uses pre-existing guardian-protected history RPC');
  assert.ok(app.includes('managedRoster.rows.value.find'));
  assert.ok(index.includes('@open-profile="openFamilyPlayerProfile"'));
  assert.ok(index.includes('@open-profile="openManagedPlayerProfile"'));
  assert.ok(index.includes(':show-list="activeTab === \'me\' && workspaceMode === \'admin\'"'), 'existing admin photo directory remains separate from roster');
});

test('private video room occupies the video section of authorized player profiles',()=>{
  const profile=fs.readFileSync(new URL('../components/PlayerProfile.js',import.meta.url),'utf8');
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(profile.includes('<slot name="private-media">'), 'legacy gallery retained only as fallback');
  assert.ok(index.includes('<template #private-media>'));
  assert.ok(index.includes("activeTab === 'team' && mediaOriginAllowed && privateMediaController.mediaPlayers.value.some"));
  assert.ok(index.includes("activeTab === 'videos' && mediaOriginAllowed"));
  assert.ok(index.includes(':controller="privateMediaController"'));
  assert.ok(index.includes('Private videos require an authorized player and staging session.'));
});

test('UX-IA-01 places primary Team and Videos content before restricted submissions without enabling the gate',()=>{
  const managed=fs.readFileSync(new URL('../components/ManagedRoster.js',import.meta.url),'utf8');
  const coach=fs.readFileSync(new URL('../components/CoachTeamRoster.js',import.meta.url),'utf8');
  const config=fs.readFileSync(new URL('../js/config.js',import.meta.url),'utf8');
  const submission= index.indexOf('<submission-workspace');
  assert.ok(submission>index.indexOf('<coach-team-roster'));
  assert.ok(submission>index.lastIndexOf('<private-media-panel'));
  assert.match(index,/<details :open="submissionController.enabled \? true : undefined"/);
  assert.match(index,/<app-header class="hidden"/);
  assert.match(index,/:show-review="submissionController.enabled"/);
  assert.match(coach,/v-if="showReview"/);
  assert.match(managed,/!home && !scopeOnly && !controller.denied.value/);
  assert.match(managed,/!home && !scopeOnly && controller.pendingChange.value/);
  assert.match(managed,/v-else-if="home"/);
  assert.match(managed,/v-else-if="!scopeOnly"/);
  assert.match(config,/SUBMISSION_FEATURES_ENABLED = false/);
  assert.match(familyHome,/\$emit\('open-profile',player\)/);
  assert.match(familyHome,/\$emit\('open-video',player\)/);
  assert.match(index,/Language\s*<select :value="currentLang" @change="currentLang = \$event.target.value; saveLanguage\(\)"/);
});

test('UX-IA-02 shares one athlete context and keeps review separate from record and overview',()=>{
  const performance=fs.readFileSync(new URL('../components/PerformanceWorkspace.js',import.meta.url),'utf8');
  const board=fs.readFileSync(new URL('../components/AuthorizedStatsBoard.js',import.meta.url),'utf8');
  const submissions=fs.readFileSync(new URL('../components/SubmissionWorkspace.js',import.meta.url),'utf8');
  assert.match(index,/<performance-workspace v-if="activeTab === 'stats'[^"]+"\s+organized/);
  assert.match(index,/:fixed-player-id="isManagedWorkspace \? null : statsBoardController.selectedId.value"/);
  assert.match(index,/<template #player-context>[\s\S]*?context-only :controller="statsBoardController"/);
  assert.match(index,/<template #overview>[\s\S]*?results-only :controller="statsBoardController"/);
  assert.match(board,/<label v-if="!resultsOnly"/);
  assert.match(board,/<template v-if="!contextOnly">/);
  assert.match(performance,/ready && \(!organized \|\| section==='record'\)/);
  assert.match(performance,/ready && \(!organized \|\| section==='overview'\)/);
  assert.match(performance,/mode==='coach' && teams.length && \(!organized \|\| section==='review'\)/);
  assert.match(performance,/if \(props.organized\) section.value='record'/);
  assert.match(performance,/official && row.status==='approved' && !row.superseded_by/);
  assert.match(performance,/organized:\{type:Boolean,default:false\}/);
  assert.match(index,/:show-performance-review="activeTab !== 'stats'"/);
  assert.match(submissions,/v-if="pilot && showPerformanceReview"/);
  assert.match(index,/:show-synthetic="false"/);
});

test('UX-IA-03 separates profile tasks without replacing existing chart, report, video or performance handlers',()=>{
  const profile=fs.readFileSync(new URL('../components/PlayerProfile.js',import.meta.url),'utf8');
  assert.match(profile,/Object.freeze\(\['Overview','Growth','Stats','Videos','History'\]\)/);
  assert.match(profile,/props.setChartMode\(next === 'Growth' \? 'growth' : 'velocity'\)/);
  assert.match(profile,/else clearPlayerChart\(\)/);
  assert.match(profile,/section==='Overview' && !historyLoading && !historyError/);
  assert.equal((profile.match(/id="playerVelocityChart"/g)||[]).length,1);
  assert.match(profile,/section==='Stats' \? '' : 'hidden'/);
  assert.match(profile,/<slot name="performance">/);
  assert.match(profile,/section==='Videos'" class="no-print"/);
  assert.match(profile,/section==='History' \? '' : 'hidden'/);
  assert.match(profile,/session.shoulder_check == null \|\| session.shoulder_check === '' \? 'Not recorded'/);
  assert.match(profile,/@click="triggerPrintReport"/);
  assert.match(index,/\.profile-print-section \{ display: block !important; \}/);
  assert.match(index,/:key="workspaceMode \+ ':' \+ selectedPlayer.id"/);
  assert.match(index,/activeTab === 'team' && mediaOriginAllowed && privateMediaController.mediaPlayers.value.some/);
  assert.match(index,/performancePlayers.some\(row => row.id === selectedPlayer.id\)/);
});

test('UX-IA-04 uses shared screen-only surfaces and keeps print and synthetic preview separate',()=>{
  const preview=fs.readFileSync(new URL('../preview/index.html',import.meta.url),'utf8');
  const css= index.slice(index.indexOf('    /* SDL-UX-IA-04:'),index.indexOf('    @media print {')).trimEnd();
  assert.ok(preview.includes(css),'shared visual tokens stay identical in live and synthetic preview');
  assert.match(index,/name="viewport" content="width=device-width, initial-scale=1.0"/);
  assert.match(shell,/class="sdl-shell min-h-screen/);
  assert.match(shell,/class="sdl-content min-w-0"/);
  assert.match(css,/focus-visible/);
  assert.match(css,/min-height: 44px/);
  assert.match(index,/\.profile-print-section \{ display: block !important; \}/);
  for(const file of ['CoachHome','ParentHome','CoachTeamRoster','ManagedRoster','PlayerHeroCard','PlayerProfile','PerformanceWorkspace']){
    const component=fs.readFileSync(new URL('../components/'+file+'.js',import.meta.url),'utf8');
    assert.ok(component.includes('sdl-panel'),file);
  }
  const stats=fs.readFileSync(new URL('../components/AuthorizedStatsBoard.js',import.meta.url),'utf8');
  assert.match(stats,/<svg v-if="points\(sessions,m\)"/);
  assert.match(stats,/One recorded result · no comparison yet/);
  assert.match(stats,/recordedMetrics.length > 1/);
  assert.match(stats,/recordedMetrics.length > 3/);
  assert.match(stats,/Only current recorded results appear here; superseded measurements remain in revision history/);
  const performance=fs.readFileSync(new URL('../components/PerformanceWorkspace.js',import.meta.url),'utf8');
  assert.match(performance,/row.superseded_by \? 'text-slate-400 line-through'/);
});

test('UX-IA-05 groups account preferences and gated tools without changing role scope',()=>{
  assert.match(index,/<section :class="activeTab === 'me' \? '' : 'hidden'"[^>]+aria-label="Account and settings"/);
  assert.match(index,/workspaceOptions.find\(option=>option.id===workspaceMode\)/);
  assert.match(index,/aria-label="Preferences"/);
  assert.match(index,/Language\s*<select :value="currentLang" @change="currentLang = \$event.target.value; saveLanguage\(\)"/);
  assert.match(index,/aria-label="Account session"[\s\S]*?@click="signOutAndClear" :disabled="authBusy"/);
  assert.match(index,/<details :class="activeTab === 'me' && !isManagedWorkspace \? '[^']+' : 'hidden'" :open="pilotController.enabled \? true : undefined"/);
  assert.match(index,/<details :class="activeTab === 'me' && !isManagedWorkspace && enrollmentAdminController.visible.value \? '[^']+' : 'hidden'" :open="enrollmentAdminController.enabled \? true : undefined"/);
  assert.match(index,/<pilot-workspace :controller="pilotController"/);
  assert.match(index,/<club-enrollment-admin :controller="enrollmentAdminController"/);
  assert.match(index,/:show-list="activeTab === 'me' && workspaceMode === 'admin'"/);
  const pilot=fs.readFileSync(new URL('../components/PilotWorkspace.js',import.meta.url),'utf8');
  assert.match(pilot,/private video availability depends on the media service and access checks/);
  assert.match(pilot,/:disabled="!enabled\|\|busy"/);
});

test('batch upload is a separate coach-only authorized destination',()=>{assert.match(index,/aria-label="Video destinations"/);assert.match(index,/<coach-batch-upload v-if="activeTab==='videos' && mediaOriginAllowed && videoPage==='batch' && isTeamCoach && workspaceMode==='coach' && !authError"/);assert.match(appSource,/coachMode\?\[\{id:'batch'/);});

test('photo-first roster and hero use scoped existing media controller',()=>{const media=fs.readFileSync(new URL('../components/PrivateMediaPanel.js',import.meta.url),'utf8');const hero=fs.readFileSync(new URL('../components/PlayerHeroCard.js',import.meta.url),'utf8');assert.ok(hero.includes('w-[58%]'));assert.match(media,/Search name or jersey number/);assert.match(media,/grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6/);assert.match(media,/c\.mediaPlayers\.value\.map/);assert.match(media,/mediaUploadAllowed && !mediaLoading/);assert.match(media,/Switch Player/);assert.match(media,/Latest video/);assert.match(media,/Back to gallery/);assert.match(index,/:roster="videoRosterDisplay" :destination="videoPage"/);assert.match(index,/<coach-batch-upload/);});

test('review destination uses cross-team inbox with exact reauthorization and no analysis controls',()=>{const review=fs.readFileSync(new URL('../components/VideoReviewInbox.js',import.meta.url),'utf8');assert.match(index,/<video-review-inbox/);assert.match(review,/reviewInbox\(props.scope/);assert.match(review,/openInboxReview/);assert.match(review,/Next Video/);assert.doesNotMatch(review,/analyzePrivateMedia/);});
