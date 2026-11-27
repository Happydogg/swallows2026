// Optional full Vue compiler + custom-renderer smoke test (no DOM/network).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { harness, user, until } from './helpers/appHarness.mjs';
const runtime = process.env.SDL004_VUE_RUNTIME;
test('Vue 3 compiler and renderer preserve shell, private media, player and analyzer bindings', { skip: !runtime }, async t => {
  const Vue = await import(pathToFileURL(runtime).href);
  const { compile } = createRequire(runtime)('@vue/compiler-dom');
  const h = await harness(t, user('parent'));
  const makeRender = template => {
    const render = new Function('Vue', compile(template, { hoistStatic: false }).code)(Vue);
    render._rc = true; // Match Vue's runtime compiler handling of with(_ctx).
    return render;
  };
  // Compile nested components too: the shared PlayerHeroCard is imported by
  // both ParentHome and PlayerProfile, and the test renderer has no DOM compiler.
  const compiled = new Set();
  const compileRecursive = component => {
    if (!component || compiled.has(component)) return;
    compiled.add(component);
    for (const child of Object.values(component.components || {})) compileRecursive(child);
    if (component.template) component.render = makeRender(component.template);
  };
  for (const component of Object.values(h.options.components)) compileRecursive(component);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const template = html.slice(html.indexOf('  <div id="app"'), html.indexOf('  <!-- Root Application Entry Module -->'));
  const node = (type, text = '') => ({ type, text, children: [], props: {}, parent: null, tagName: type.toUpperCase(), addEventListener() {}, removeEventListener() {},
    get options() { return this.children; },
    ...(type === 'video' ? { pause() {}, load() {}, removeAttribute() {} } : {}),
    ...(type === 'canvas' ? { getContext: () => ({ clearRect() {} }) } : {})
  });
  const renderer = Vue.createRenderer({
    createElement: type => node(type), createText: text => node('text', text), createComment: text => node('comment', text),
    setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; n.children = []; },
    parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
    patchProp: (n, key, _old, value) => { n.props[key] = value; },
    insert(n, parent, anchor = null) {
      if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1);
      const i = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(i < 0 ? parent.children.length : i, 0, n); n.parent = parent;
    },
    remove(n) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null; }
  });
  const warnings = [], errors = [];
  const app = renderer.createApp({ components: h.options.components, setup: () => h.app, render: makeRender(template) });
  app.config.warnHandler = message => warnings.push(message);
  app.config.errorHandler = error => errors.push(error);
  const host = node('root'); app.mount(host); t.after(() => app.unmount());
  const flatten = n => `${n.text} ${n.children.map(flatten).join(' ')}`;
  // Video Room now mounts only when the Videos tab is visible, and private
  // media remains hidden behind the approved-origin gate.
  h.app.activeTab.value='videos';
  await Vue.nextTick();
  assert.match(flatten(host),/Video Room|Open the authorized video viewer/);
  h.app.activeTab.value='home';
  await Vue.nextTick();
  // The private player selector must exist in the scoped component, but
  // must not be rendered on an origin that fails the Worker allowlist.
  assert.match(h.options.components.PrivateMediaPanel.template,/Choose a player/);
  const submissions=h.app.submissionController;
  submissions.changeTab('submissions');await Vue.nextTick();assert.match(flatten(host),/Submit for coach review/);
  submissions.clubEnrollments.value=[{id:'test-enrollment',generation:'gen',organization_name:'Test club',status:'active',consent_active:false,history:[]}];
  await Vue.nextTick();
  const elements=n=>[n,...n.children.flatMap(elements)];
  const label=elements(host).find(n=>n.type==='label'&&flatten(n).includes('consent to authorized coaches'));
  assert.ok(label,'Standing club consent policy renders');
  const checkbox=label.children.find(n=>n.type==='input');assert.equal(checkbox.props['onUpdate:modelValue'] instanceof Function,true);
  checkbox.props['onUpdate:modelValue'](true);await Vue.nextTick();assert.equal(submissions.consentAccepted.value['test-enrollment'],true);
  assert.match(flatten(host),/no annual or per-video renewal/);
  submissions.statisticsEnrollments.value=[{id:'stat-enrollment',generation:'stat-generation',organization_name:'Synthetic club',status:'active'}];
  submissions.statisticsChoices.value={'stat-enrollment':{roster:false,metrics:[]}};
  await Vue.nextTick();assert.match(flatten(host),/Video consent does not authorize these fields/);
  const statLabel=elements(host).find(n=>n.type==='label'&&flatten(n).includes("I consent to sharing my child's preferred name"));
  assert.ok(statLabel);statLabel.children.find(n=>n.type==='input').props['onUpdate:modelValue'](true);
  await Vue.nextTick();assert.equal(submissions.statisticsChoices.value['stat-enrollment'].roster,true);
  submissions.items.value=[{id:'s',category:'throwing',status:'rejected',history:[{at:'now',action:'rejected',note:'Try again'}],can_consent:true}];
  await Vue.nextTick();assert.match(flatten(host),/Submission history/);
  submissions.changeTab('review');submissions.queue.value=[{id:'s',preferred_name:'Test player',team_name:'Team',category:'pitching',status:'pending',history:[],can_review:true}];
  await Vue.nextTick();assert.match(flatten(host),/Approve/);
  submissions.changeTab('clubhouse');submissions.shared.value=[{id:'s',preferred_name:'Test teammate',category:'batting'}];
  await Vue.nextTick();
  assert.match(flatten(host),/1\. Team Roster/);
  assert.match(flatten(host),/2\. Leaderboard/);
  assert.match(flatten(host),/3\. Player Statistics/);
  assert.match(flatten(host),/4\. Approved Videos/);
  assert.match(flatten(host),/Parent-safe Team Roster service coming soon/);
  submissions.changeClubhouseSection('videos');await Vue.nextTick();assert.match(flatten(host),/Play approved video/);
  // Populate Clubhouse roster and leaderboard with authorized fixtures containing extra private fields to verify PII is stripped
  submissions.changeClubhouseSection('roster');
  submissions.teamId.value='55555555-5555-4555-8555-555555555555';
  submissions.clubhouseRosterReady.value=true;
  submissions.clubhouseRoster.value=[{
    id:'11111111-1111-4111-8111-111111111111',
    team_id:'55555555-5555-4555-8555-555555555555',
    team_name:'Swallows U12',
    preferred_name:'Safe Roster Kid',
    jersey:'24',
    position:'CF',
    throws:'L',
    bats:'L',
    dob:'2014-01-01',
    hkll_reg_no:'HKLL-SECRET-99',
    parent_phone:'+85299998888',
    last_name:'PrivateSurname'
  }];
  await Vue.nextTick();
  assert.match(flatten(host),/Safe Roster Kid/);
  assert.doesNotMatch(flatten(host),/2014-01-01|HKLL-SECRET-99|\+85299998888|PrivateSurname/);

  submissions.changeClubhouseSection('leaderboard');
  submissions.clubhouseLeaderboardReady.value=true;
  submissions.clubhouseLeaderboard.value=[{
    id:'lb-1',
    player_id:'11111111-1111-4111-8111-111111111111',
    team_id:'55555555-5555-4555-8555-555555555555',
    metric:'exit_velo',
    preferred_name:'Safe Leaderboard Kid',
    jersey:'24',
    value:66.2,
    unit:'km/h',
    dob:'2014-01-01',
    hkll_reg_no:'HKLL-SECRET-99'
  }];
  await Vue.nextTick();
  assert.match(flatten(host),/Safe Leaderboard Kid/);
  assert.match(flatten(host),/66\.2 km\/h/);
  assert.doesNotMatch(flatten(host),/2014-01-01|HKLL-SECRET-99/);

  submissions.changeClubhouseSection('stats');
  await Vue.nextTick();
  assert.match(flatten(host),/Privacy & Authorization Policy/);

  // Verify parent landing does not render legacy Coach Overview (Active Roster / Arm Safety Flags)
  submissions.changeTab('players');
  h.app.guardianLinks.value=[{athlete_id:'athlete-1',status:'verified'}];
  h.setFixtureRoles(['guardian']);
  h.app.players.value=[{
    id:'11111111-1111-4111-8111-111111111111',
    athlete_id:'athlete-1',
    preferred_name:'Linked Child',
    jersey:'07',
    position:'P, SS',
    throws:'R',
    bats:'R',
    dob:'2015-06-15',
    hkll_reg_no:'HKLL-PRIVATE-007',
    parent_phone:'+85291234567',
    last_name:'HiddenLast',
    given_names:'HiddenGiven'
  }];
  await Vue.nextTick();
  assert.match(flatten(host),/Linked Child/);
  assert.match(flatten(host),/Verified Guardian Access/);
  assert.doesNotMatch(flatten(host),/Active Roster|Arm Safety Flags|2015-06-15|HKLL-PRIVATE-007|\+85291234567|HiddenLast/);

  h.app.navigateTab('me');await Vue.nextTick();
  const meArea=()=>elements(host).find(n=>n.props['aria-label']==='Account and settings');
  const meTools=()=>elements(host).find(n=>n.props['aria-label']==='Additional family and staff tools');
  const enrollmentTools=()=>elements(host).find(n=>n.props['aria-label']==='Enrollment tools');
  assert.doesNotMatch(String(meArea().props.class),/hidden/);
  assert.match(flatten(meArea()),/Family · Active/);
  assert.match(flatten(meArea()),/Preferences.*Language.*Sign out/s);
  assert.match(flatten(meTools()),/currently unavailable/);
  assert.equal(meTools().props.open,undefined);
  assert.match(String(enrollmentTools().props.class),/hidden/);
  const language=elements(meArea()).find(n=>n.type==='select');
  const priorLang=h.app.currentLang.value;
  language.props.onChange({target:{value:'ja'}});await Vue.nextTick();
  assert.equal(h.app.currentLang.value,'ja');
  language.props.onChange({target:{value:priorLang}});await Vue.nextTick();
  h.app.navigateTab('home');await Vue.nextTick();
  assert.match(String(meArea().props.class),/hidden/);
  assert.match(String(meTools().props.class),/hidden/);

  const linkedChild=h.app.players.value[0];
  h.rows.sdl_004_pilot_workspace={protocols:[{id:'throw-radar-v1',metric:'throwing_velo',label:'Radar throwing',unit:'km/h'}]};
  h.rows.sdl_004_pilot_performance=[{id:'22222222-2222-4222-8222-222222222222',player_id:linkedChild.id,
    status:'pending',revision:1,protocol_id:'throw-radar-v1',protocol_label:'Radar throwing',unit:'km/h',value:79,
    measurement_date:'2026-01-01',history:[]}];
  h.rows.sdl_004_player_statistics=[{id:'profile-current',player_id:linkedChild.id,session_date:'2026-01-01',exit_velo:54}];
  h.app.navigateTab('stats');
  await until(()=>/Radar throwing.*Pending review/s.test(flatten(host)) && /One recorded result · no comparison yet/.test(flatten(host)));
  const statsSections=()=>elements(host).find(n=>n.type==='nav' && n.props['aria-label']==='Statistics sections');
  const statsArea=()=>elements(host).find(n=>n.type==='section' && n.props['aria-label']==='Performance measurements');
  const sectionButton=name=>elements(statsSections()).find(n=>n.type==='button' && flatten(n).trim()===name);
  assert.ok(sectionButton('Overview'));assert.ok(sectionButton('Record'));assert.equal(sectionButton('Review'),undefined);
  assert.match(flatten(statsArea()),/Measurement history/);
  assert.match(flatten(statsArea()),/54\.0 km\/h/);
  assert.equal(elements(statsArea()).filter(n=>n.type==='svg' && String(n.props['aria-label']||'').includes('trend for')).length,0);
  assert.doesNotMatch(flatten(statsArea()),/Measurement evidence|Save official result/);
  assert.equal(elements(statsArea()).filter(n=>n.type==='label' && flatten(n).trim().startsWith('Choose player')).length,1);
  sectionButton('Record').props.onClick();await Vue.nextTick();
  assert.match(flatten(statsArea()),/Submit for coach review.*Measurement evidence/s);
  assert.doesNotMatch(flatten(statsArea()),/Save official result|Measurement history/);
  assert.equal(h.app.statsBoardController.selectedId.value,linkedChild.id);
  sectionButton('Overview').props.onClick();await Vue.nextTick();
  assert.match(flatten(statsArea()),/Radar throwing.*Pending review/s);
  h.rows.sdl_004_player_statistics=[{id:'profile-current',player_id:linkedChild.id,session_date:'2026-01-01',exit_velo:54}];
  await h.app.openFamilyPlayerProfile(linkedChild);
  await until(()=>!h.app.profileHistoryLoading.value && /Radar throwing.*Pending review/s.test(flatten(host)));
  assert.equal(h.app.profileHistoryError.value,'');
  await Vue.nextTick();
  assert.match(flatten(host),/Linked Child.*Performance measurements/s);
  const profileArea=()=>elements(host).find(n=>n.props['aria-label']==='Player profile');
  const profileNav=()=>elements(profileArea()).find(n=>n.props['aria-label']==='Player profile sections');
  const profileButton=name=>elements(profileNav()).find(n=>n.type==='button' && flatten(n).trim()===name);
  const profilePart=name=>elements(profileArea()).find(n=>n.props['aria-label']===name);
  assert.equal(profileButton('Overview').props['aria-pressed'],true);
  assert.ok(profilePart('Latest recorded results'));
  assert.match(flatten(profilePart('Latest recorded results')),/54 km\/h/);
  assert.match(String(profilePart('Profile performance actions').props.class),/hidden/);
  assert.equal(profilePart('Profile videos'),undefined);
  assert.match(String(profilePart('Profile session history').props.class),/hidden/);
  profileButton('Stats').props.onClick();await Vue.nextTick();
  assert.equal(h.app.chartMode.value,'velocity');
  assert.doesNotMatch(String(profilePart('Profile performance actions').props.class),/hidden/);
  assert.match(flatten(profilePart('Profile performance actions')),/Submit for coach review/);
  assert.doesNotMatch(flatten(profilePart('Profile performance actions')),/Save official result|Correct official result/);
  profileButton('Growth').props.onClick();await Vue.nextTick();
  assert.equal(h.app.chartMode.value,'growth');
  assert.match(String(profilePart('Profile performance actions').props.class),/hidden/);
  profileButton('Videos').props.onClick();await Vue.nextTick();
  assert.ok(profilePart('Profile videos'));
  profileButton('History').props.onClick();await Vue.nextTick();
  assert.equal(profilePart('Profile videos'),undefined);
  assert.doesNotMatch(String(profilePart('Profile session history').props.class),/hidden/);
  assert.match(flatten(profilePart('Profile session history')),/Official performance history/);
  h.app.leavePlayerProfile();
  h.app.navigateTab('home');
  await Vue.nextTick();

  const admin=h.app.enrollmentAdminController;
  h.app.orgMemberships.value=[{role:'admin',status:'active'}];
  admin.organizations.value=[{id:'club',name:'Admin club'}];admin.organizationId.value='club';
  admin.athletes.value=[{athlete_id:'test-athlete',organization_id:'club',preferred_name:'Admin athlete',enrollment_id:'enrollment',generation:'g',status:'active',recording_storage_authorized:true,recording_active:true,recording_permission_ref:'case-123',consent_active:false}];
  await Vue.nextTick();assert.match(flatten(host),/Club enrollment administration/);assert.match(flatten(host),/case-123/);assert.match(flatten(host),/Optional parental Clubhouse-sharing consent/);assert.match(flatten(host),/All v2 operations remain disabled/);
  admin.pendingChange.value={kind:'enrollment',row:admin.athletes.value[0],nextStatus:'ended',organizationName:'Admin club'};
  await Vue.nextTick();assert.match(flatten(host),/Do not use this for an internal team transfer/);admin.pendingChange.value=null;
  h.app.privateMediaController.mediaReadAllowed.value = true;
  h.app.privateMediaController.mediaPlayerId.value = '11111111-1111-4111-8111-111111111111';
  h.app.privateMediaController.mediaItems.value = [{ id: '33333333-3333-4333-8333-333333333333', byte_size: 12 }];
  await Vue.nextTick();
  assert.match(h.options.components.PrivateMediaPanel.template,/Play privately/);
  // A hidden/unapproved origin must never reveal even the selected clip title.
  assert.doesNotMatch(flatten(host),/Practice clip 1 ·/);
  h.app.selectedPlayer.value = { id: 'player', preferred_name: 'Synthetic Player', jersey: '07', dob: '2015-01-01', hkll_reg_no: 'HKLL-777', last_name: 'Secret', given_names: 'Name' };
  h.app.currentView.value = 'player'; await Vue.nextTick();
  assert.match(flatten(host), /Synthetic Player/);
  assert.doesNotMatch(flatten(host), /2015-01-01|HKLL-777|Secret, Name/);
  const pilot=h.app.pilotController;
  pilot.ready.value=true;
  pilot.workspace.value={players:[{id:'pilot-child',is_guardian:true,is_coach:true,preferred_name:'Pilot child'}],protocols:[{id:'throw-radar-v1',label:'Radar throwing',unit:'km/h'}],invitation_organizations:[{id:'pilot-org',name:'Pilot club'}],staff_scopes:[{team_id:'pilot-team',team_name:'Pilot team',permission:'family_contacts'}]};
  pilot.playerId.value='pilot-child';pilot.baseballProfile.value={player_id:'pilot-child',preferred_name:'Pilot child',approved:false};pilot.growth.value=[{id:'growth',measurement_date:'2026-01-01',height_cm:140,weight_kg:40,revision:1,history:[{revision:1,reason:'scale',recorded_by:'actor'}]}];
  pilot.performance.value=[{id:'performance',status:'correction_requested',protocol_label:'Radar throwing',value:90,unit:'km/h',history:[]}];
  pilot.family.value={given_names:'Own family visible marker'};pilot.administration.value={members:[{id:'member-id',name:'Scoped staff'}],teams:[{id:'pilot-team',name:'Pilot team'}],permissions:[]};
  await Vue.nextTick();assert.match(flatten(host),/Private growth measurements|Own family visible marker|Approve All Clubhouse Sharing/);
  assert.match(flatten(host),/Approve baseball profile/);assert.match(flatten(host),/Correct submission/);assert.match(flatten(host),/Scoped staff/);
  h.app.openAnalyzer({ id: 'local', video_url: 'blob:synthetic', category: 'pitching', fps_mode: 60 });
  await Vue.nextTick(); assert.match(flatten(host), /Back to Profile/);
  await h.app.signOutAndClear(); await Vue.nextTick();
  assert.doesNotMatch(flatten(host), /Synthetic Player|Play privately|Back to Profile|case-123|Admin athlete|Own family visible marker|Scoped staff/);
  // Verify the redesigned login preserves all staging authentication methods.
  assert.match(flatten(host), /Welcome to the team/);
  assert.match(flatten(host), /Invitation/);
  h.app.setAuthMethod('phone'); await Vue.nextTick();
  assert.match(flatten(host), /SMS\/WhatsApp OTP is not yet configured/);
  h.app.setAuthMethod('otp'); await Vue.nextTick();
  assert.match(flatten(host), /One-time code verification awaits backend integration/);
  h.app.setAuthMethod('invite'); await Vue.nextTick();
  assert.match(flatten(host), /Received a WhatsApp invitation/);
  h.app.setAuthMethod('email'); await Vue.nextTick();
  assert.match(flatten(host), /Sign in securely/);
  // Render the new role-aware workspace using a versioned synthetic response,
  // including an effective team with no direct CA membership or roster row.
  h.loginUser=user('admin-fixture');
  h.rows.sdl_v5_account_context={version:1,user_id:'admin-fixture',roles:['club_admin'],
    direct_memberships:{organizations:[],teams:[],guardian_links:0},
    organizations:[{id:'club-a',name:'Synthetic Club A',roles:['club_admin']}],
    teams:[{id:'team-a1',organization_id:'club-a',name:'Synthetic Team A1',roles:['club_admin']},
      {id:'empty',organization_id:'club-a',name:'Empty Team',roles:['club_admin']}],
    platform:{view:false,export:false,sensitive_write:false}};
  h.rows.sdl_v5_authorized_roster={version:1,role:'club_admin',rows:[{id:'fixture-player',organization_id:'club-a',team_ids:['team-a1'],preferred_name:'Synthetic Roster Player',jersey:'10',position:'P',throws:'R',bats:'L'}],next_after:null};
  await h.app.signInAndLoad();await Vue.nextTick();
  assert.match(flatten(host),/Club Admin Dashboard/);assert.match(flatten(host),/Players loaded/);
  assert.doesNotMatch(flatten(host),/Synthetic Roster Player|Register player|Change team assignment/);
  assert.match(flatten(host),/Empty Team/);
  h.app.navigateTab('team');await Vue.nextTick();assert.match(flatten(host),/Club Admin Roster/);
  assert.match(flatten(host),/Synthetic Roster Player/);assert.match(flatten(host),/Register player/);
  h.rows.sdl_v5_authorized_roster={version:1,role:'club_admin',rows:[],next_after:null};
  await h.app.changeManagedTeam('empty');await Vue.nextTick();
  assert.match(flatten(host),/No players in this authorized scope/);
  assert.doesNotMatch(flatten(host),/Synthetic Roster Player/);
  await h.app.signOutAndClear();await Vue.nextTick();
  assert.equal(errors.length, 0, errors.map(String).join('\n'));
  assert.equal(warnings.length, 0, warnings.join('\n'));
});
