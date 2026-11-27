import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {filterPrivateLibrary,PrivateMediaPanel} from '../components/PrivateMediaPanel.js';
import {harness,user,until} from './helpers/appHarness.mjs';
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const consent=fs.readFileSync(new URL('../components/MediaConsentPanel.js',import.meta.url),'utf8');
const shared=fs.readFileSync(new URL('../components/MediaSharingPanels.js',import.meta.url),'utf8');
const rows=[{id:'a',category:'pitching',status:'pending'},{id:'b',category:'batting',status:'approved'},{id:'c',category:'pitching',status:'rejected'}];
test('private filters narrow only loaded records without mutating controller state',()=>{
 assert.deepEqual(filterPrivateLibrary(rows).map(r=>r.id),['a','b','c']);
 assert.deepEqual(filterPrivateLibrary(rows,'pitching').map(r=>r.id),['a','c']);
 assert.deepEqual(filterPrivateLibrary(rows,'pitching','rejected').map(r=>r.id),['c']);
 assert.deepEqual(filterPrivateLibrary(rows,'throwing'),[]);
 assert.deepEqual(filterPrivateLibrary(null),[]);
 assert.equal(rows.length,3);
});
test('private library retains original protected actions and demand-driven previews',()=>{
 const source=PrivateMediaPanel.template;
 for(const marker of ['v-media-visible="item"','playPrivateMedia(item)','reviewPrivateMedia','archivePrivateMedia(item)','uploadPrivateMedia','analyzePrivateMedia','v-model="analysisFps"','v-model="analysisCategory"','v-if="mediaReadAllowed"','v-if="mediaUploadAllowed"','item.can_archive === true']) assert.ok(source.includes(marker),marker);
 assert.match(source,/ref="playbackSection" tabindex="-1"/);
});
test('Option C consent stays one explicit opt-in for authorized view and download',()=>{
 assert.equal((consent.match(/type="checkbox"/g)||[]).length,1);
 assert.match(consent,/sdl004-clubhouse-view-download-v2/);
 assert.match(consent,/setMediaConsent\(id,generation,action/);
 assert.match(consent,/copies already delivered cannot be remotely deleted/);
 assert.match(consent,/Consent includes viewing and downloading/);
 assert.doesNotMatch(consent,/Downloads? (?:execution )?(?:are |remains |is |still )?disabled/i);
 assert.match(consent,/unresolved guardian objections/);
});
test('Clubhouse preserves minimal neutral DTO and authorized two-step download control',()=>{
 assert.match(shared,/x\.display_name!=='Player'/);
 assert.match(shared,/display_name:'Player'/);
 assert.match(shared,/service\.sharedPlayback\(item.id,team/);
 assert.match(shared,/controlslist="nodownload"/);
 assert.match(shared,/can_download:x\.can_download===true/);
 assert.match(shared,/v-if="item.can_download"/);
 assert.match(shared,/service\.sharedDownload\(item.id,team/);
 assert.match(shared,/:href="saveUrl" :download="saveName"/);
 assert.match(shared,/setTimeout\(clearSave,60000\)/);
 assert.match(shared,/URL\.revokeObjectURL/);
 assert.match(shared,/visibilitychange/);
});
test('Library and Clubhouse are mutually exclusive and gated by original origin',()=>{
 assert.match(index,/<private-media-panel v-if="activeTab === 'videos' && mediaOriginAllowed && videoSection==='library'"/);
 assert.match(index,/<clubhouse-media-panel v-if="activeTab === 'videos' && mediaOriginAllowed && !authError && videoSection==='clubhouse' && clubhouseMediaTeams.length"/);
 assert.match(index,/ref="publicationPanel"/);
 assert.match(index,/<video-review-inbox/);
 assert.match(index,/<action-center/);
 assert.match(index,/<private-media-panel review-only/);
});
function coachContext(h){
 h.app.accountContext.value={...h.app.accountContext.value,roles:['coach'],organizations:[{id:'org',name:'Club',roles:['coach']}],teams:[{id:'team',name:'Team',organization_id:'org',roles:['coach']}]};
}
test('authorized subnavigation resets private state and blocks concurrent mutations',async t=>{
 const h=await harness(t,user('media-demo'),{origin:'https://sdl-ux-live.pages.dev'});
 coachContext(h);
 assert.equal(h.app.mediaOriginAllowed.value,true);
 assert.equal(h.app.clubhouseMediaTeams.value.length,1);
 assert.equal(h.app.changeVideoSection('clubhouse'),false);
 h.app.navigateTab('videos');
 const m=h.app.privateMediaController;
 m.mediaPlayerId.value='demo-player';m.mediaItems.value=rows;m.mediaPlaybackUrl.value='blob:ux003-private';m.mediaReadAllowed.value=true;
 m.mediaUploading.value=true;assert.equal(h.app.changeVideoSection('clubhouse'),false);m.mediaUploading.value=false;
 m.mediaReviewing.value=true;assert.equal(h.app.changeVideoSection('clubhouse'),false);m.mediaReviewing.value=false;
 m.mediaArchiving.value=true;assert.equal(h.app.changeVideoSection('clubhouse'),false);m.mediaArchiving.value=false;
 h.app.publicationPanel.value={busy:true};assert.equal(h.app.changeVideoSection('clubhouse'),false);h.app.publicationPanel.value=null;
 const before=h.calls.length;
 assert.equal(h.app.changeVideoSection('clubhouse'),true);
 assert.equal(h.app.videoSection.value,'clubhouse');assert.equal(m.mediaPlayerId.value,'');assert.equal(m.mediaItems.value.length,0);assert.equal(m.mediaPlaybackUrl.value,'');assert.ok(h.revoked.includes('blob:ux003-private'));assert.equal(h.calls.length,before);
 assert.equal(h.app.changeVideoSection('review'),true);
 assert.equal(h.app.videoSection.value,'review');
 assert.equal(h.app.changeVideoSection('library'),true);assert.equal(h.app.videoSection.value,'library');
});
test('unapproved origin and absent team cannot open Clubhouse section',async t=>{
 const h=await harness(t,user('outside-origin'));coachContext(h);h.app.navigateTab('videos');
 assert.equal(h.app.changeVideoSection('clubhouse'),false);
 assert.equal(h.app.videoSection.value,'library');
});
test('loss of scoped team and logout return to Library',async t=>{
 const h=await harness(t,user('media-scope'),{origin:'https://sdl-ux-live.pages.dev'});
 coachContext(h);h.app.navigateTab('videos');assert.equal(h.app.changeVideoSection('clubhouse'),true);
 h.app.accountContext.value={...h.app.accountContext.value,teams:[]};
 assert.equal(h.app.videoSection.value,'library');assert.equal(h.app.changeVideoSection('clubhouse'),false);
 await h.app.signOutAndClear();assert.equal(h.app.activeTab.value,'home');assert.equal(h.app.videoSection.value,'library');
});

test('Clubhouse mount key changes even when authorized team list is unchanged',async t=>{
 const h=await harness(t,user('media-scope-key'),{origin:'https://sdl-ux-live.pages.dev'});coachContext(h);
 const before=h.app.clubhouseScopeKey.value;h.app.coachOrganizationId.value='org';assert.equal(h.app.clubhouseMediaTeams.value.length,1);assert.notEqual(h.app.clubhouseScopeKey.value,before);
 const after=h.app.clubhouseScopeKey.value;h.app.coachTeamId.value='team';assert.equal(h.app.clubhouseMediaTeams.value.length,1);assert.notEqual(h.app.clubhouseScopeKey.value,after);
});

test('authenticated app harness connects Home -> scoped Review -> exact lookup -> original review receipt',async t=>{
 const h=await harness(t,user('p0c-reviewer'),{origin:'https://sdl-ux-live.pages.dev',confirm:()=>true});
 const ORG='11111111-1111-4111-8111-111111111111',TEAM='22222222-2222-4222-8222-222222222222',PLAYER='33333333-3333-4333-8333-333333333333',MEDIA='44444444-4444-4444-8444-444444444444';
 const item={id:MEDIA,playerId:PLAYER,playerLabel:'Synthetic player',teamId:TEAM,teamLabel:'Team',teamIds:[TEAM],category:'pitching',status:'pending',can_review:true,createdAt:'2026-11-27T00:00:00Z'};
 let pending=1;const requests=[];
 h.fetchImpl=async(url,init)=>{
  const parsed=new URL(url);requests.push({url:parsed,method:init.method,body:init.body});
  if(parsed.pathname.endsWith('/action-summary'))return Response.json({revision:'review-inbox-v1',status:'ready',complete:true,items:[{kind:'video_review',available:true,count:pending,required:false}]});
  if(parsed.pathname.endsWith('/review-inbox'))return Response.json({revision:'review-inbox-v1',status:'ready',complete:true,pendingTotal:pending,filteredTotal:pending,items:pending?[item]:[],teams:pending?[{id:TEAM,label:'Team'}]:[],players:pending?[{id:PLAYER,label:'Synthetic player',teamId:TEAM,teamIds:[TEAM]}]:[],nextCursor:null});
  if(parsed.pathname.endsWith('/playback'))return new Response('0123456789',{headers:{'Content-Type':'video/mp4','Content-Length':'10'}});
  if(parsed.pathname.endsWith('/review-private')){assert.equal(init.method,'POST');assert.deepEqual(JSON.parse(init.body),{decision:'approved',note:'',single_subject:false});pending=0;return Response.json({updated:true});}
  assert.fail('Unexpected media request '+parsed.pathname);
 };
 h.app.accountContext.value={...h.app.accountContext.value,user_id:h.user.id,roles:['coach','club_admin'],organizations:[{id:ORG,name:'Club',roles:['coach','club_admin']}],teams:[{id:TEAM,name:'Team',organization_id:ORG,roles:['coach','club_admin']}]};
 h.app.coachOrganizationId.value=ORG;h.app.coachTeamId.value=TEAM;
 h.app.navigateTab('home');const q=h.app.reviewQueue;
 // Adapter must refuse even a previously authorized row outside effective Review.
 assert.equal((await h.app.privateMediaController.openInboxReview(item)).opened,false);
 assert.equal(requests.some(x=>x.url.searchParams.get('media_id')===MEDIA),false);
 if(!process.env.SDL004_VUE_RUNTIME)await q.refreshSummary();
 await until(()=>q.summaryStatus.value==='ready');
 assert.equal(h.app.actionCenterItems.value[0].count,1);
 h.app.openActionCenter({kind:'video_review'});assert.equal(h.app.activeTab.value,'videos');assert.equal(h.app.videoSection.value,'review');
 if(!process.env.SDL004_VUE_RUNTIME)await q.refreshInbox();
 await until(()=>q.status.value==='ready');
 assert.equal(q.total.value,1);assert.equal(q.rows.value[0].id,MEDIA);
 await q.open(q.rows.value[0]);assert.equal(h.app.privateMediaController.reviewItem.value.id,MEDIA);
 assert.equal(h.app.privateMediaController.mediaUploadAllowed.value,false);
 assert.equal(h.app.privateMediaController.mediaPlayers.value.some(p=>p.id===PLAYER),false);
 await h.app.privateMediaController.reviewPrivateMedia('approved');
 if(!process.env.SDL004_VUE_RUNTIME){await q.refreshSummary();await q.refreshInbox();}
 await until(()=>q.summaryStatus.value==='ready'&&q.status.value==='ready'&&q.total.value===0);
 assert.equal(q.summaryItems.value[0].count,0);assert.equal(h.app.privateMediaController.mediaPlaybackUrl.value,'');
 for(const request of requests.filter(x=>x.url.pathname.endsWith('/review-inbox')||x.url.pathname.endsWith('/action-summary'))){
  assert.equal(request.url.searchParams.get('role'),'coach');assert.equal(request.url.searchParams.get('organization_id'),ORG);assert.equal(request.url.searchParams.get('scope_team_id'),TEAM);
 }
 assert.ok(requests.some(x=>x.url.searchParams.get('media_id')===MEDIA&&x.url.searchParams.get('player_id')===PLAYER));
 assert.equal(requests.filter(x=>x.url.pathname.endsWith('/review-private')).length,1);
 assert.equal(requests.some(x=>x.url.pathname==='/v2/submissions'),false);
 h.app.navigateTab('home');
 assert.equal((await h.app.privateMediaController.openInboxReview(item)).opened,false);
 assert.equal(h.app.privateMediaController.inboxReviewMode.value,false);
});

test('verified nonreview workspaces never call review APIs',async t=>{
 const h=await harness(t,user('nonreviewer'),{origin:'https://sdl-ux-live.pages.dev'});
 const ORG='11111111-1111-4111-8111-111111111111',TEAM='22222222-2222-4222-8222-222222222222';
 const requests=[];h.fetchImpl=async(url)=>{requests.push(url);throw Error('Unexpected media API call');};
 for(const role of ['manager','guardian','platform_admin']){
  h.app.guardianLinks.value=role==='guardian'?[{athlete_id:'synthetic-athlete',status:'verified'}]:[];
  h.app.accountContext.value={...h.app.accountContext.value,user_id:h.user.id,roles:[role],organizations:[{id:ORG,name:'Club',roles:[role]}],teams:[{id:TEAM,name:'Team',organization_id:ORG,roles:[role]}]};
  h.app.navigateTab('home');
  assert.equal(h.app.reviewScope.value,null);
  assert.equal(h.app.actionCenterItems.value.some(x=>x.kind==='video_review'),false);
  if(role==='guardian')assert.equal(h.app.actionCenterItems.value.find(x=>x.kind==='media_consent')?.count,undefined);
  await h.app.reviewQueue.refreshSummary();
  h.app.navigateTab('videos');assert.equal(h.app.changeVideoSection('review'),false);
  await h.app.reviewQueue.refreshInbox();
 }
 assert.equal(requests.length,0);
});

test('Library → Review → Library requires deliberate, freshly authorized player selection',async t=>{
 const h=await harness(t,user('navigation-qa'),{origin:'https://sdl-ux-live.pages.dev'});
 const TEAM='22222222-2222-4222-8222-222222222222',PLAYER='33333333-3333-4333-8333-333333333333',MEDIA='44444444-4444-4444-8444-444444444444';
 const reads=[];
 let allowList=true;
 h.fetchImpl=async(url)=>{
  const path=new URL(url);
  if(path.pathname.endsWith('/action-summary'))return Response.json({revision:'review-inbox-v1',status:'ready',complete:true,items:[{kind:'video_review',available:true,count:0,required:false}]});
  if(path.pathname.endsWith('/review-inbox'))return Response.json({revision:'review-inbox-v1',status:'ready',complete:true,pendingTotal:0,filteredTotal:0,items:[],teams:[],players:[],nextCursor:null});
  if(path.pathname.endsWith('/upload-eligibility'))return Response.json({allowed:false});
  if(path.pathname==='/v2/submissions'){
   reads.push(path.searchParams.get('player_id'));
   if(!allowList)return Response.json({},{status:403});
   return Response.json({items:[{id:MEDIA,player_id:PLAYER,category:'pitching',status:'approved'}]});
  }
  assert.fail('Unexpected media request '+path.pathname);
 };
 coachContext(h);
 h.app.coachRoster.value=[{id:PLAYER,team_id:TEAM,preferred_name:'Synthetic player'}];
 h.app.navigateTab('videos');
 const media=h.app.privateMediaController;
 await media.selectMediaPlayer(PLAYER);
 assert.equal(media.mediaItems.value.length,1);assert.equal(media.mediaReadAllowed.value,true);
 media.mediaFile.value={name:'synthetic.mov'};media.mediaPlaybackUrl.value='blob:library-private';
 assert.equal(h.app.changeVideoSection('review'),true);
 assert.equal(media.mediaPlayerId.value,'');assert.equal(media.mediaFile.value,null);
 assert.equal(media.mediaPlaybackUrl.value,'');assert.equal(media.mediaItems.value.length,0);
 assert.ok(h.revoked.includes('blob:library-private'));
 assert.equal(h.app.changeVideoSection('library'),true);
 await Promise.resolve();
 assert.deepEqual(reads,[PLAYER]);assert.equal(media.mediaReadAllowed.value,false);
 assert.equal(media.mediaPlayerId.value,'');assert.equal(media.inboxReviewMode.value,false);
 allowList=false;
 await media.selectMediaPlayer(PLAYER);
 assert.deepEqual(reads,[PLAYER,PLAYER]);assert.equal(media.mediaReadAllowed.value,false);
 assert.equal(media.mediaItems.value.length,0);assert.equal(media.mediaPlaybackUrl.value,'');
});
