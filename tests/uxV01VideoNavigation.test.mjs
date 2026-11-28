import test from 'node:test';
import assert from 'node:assert/strict';
import {nextTick} from 'vue';
import {harness,user,ok,deferred,until} from './helpers/appHarness.mjs';

const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [club,otherClub,staffTeam,staffTeam2,guardianTeam,child,athlete,staffPlayer,staffPlayer2,clip]=[1,2,11,12,13,21,22,23,24,31].map(uuid);
const staffRoles=['coach','manager','club_admin'];
function context(id,roles,multiple=false) {
 const staff=roles.filter(role=>staffRoles.includes(role));
 const guardian=roles.includes('guardian');
 return {version:1,user_id:id,roles,organizations:[
  ...(staff.length?[{id:club,name:'Staff club',roles:staff}]:[]),
  ...(guardian?[{id:otherClub,name:'Family club',roles:['guardian']}]:[])
 ],teams:[
  ...(staff.length?[{id:staffTeam,organization_id:club,name:'Staff A',roles:staff}]:[]),
  ...(staff.length&&multiple?[{id:staffTeam2,organization_id:club,name:'Staff B',roles:staff}]:[]),
  ...(guardian?[{id:guardianTeam,organization_id:otherClub,name:'Family team',roles:['guardian']}]:[])
 ],direct_memberships:{organizations:[],teams:[],guardian_links:guardian?1:0}};
}
async function fixture(t,roles,multiple=false) {
 const id='synthetic-user';
 const h=await harness(t,user(id),{origin:'https://sdl-ux-live.pages.dev'});
 const requests=[];
 let listResponse=()=>Response.json({items:[]});
 h.fetchImpl=async(url,init)=>{
  const parsed=new URL(url);requests.push({url:parsed,signal:init.signal,method:init.method});
  if(parsed.pathname==='/v2/submissions')return listResponse();
  if(parsed.pathname.endsWith('/upload-eligibility'))return Response.json({allowed:false});
  if(parsed.pathname.endsWith('/action-summary'))return Response.json({revision:'review-inbox-v1',status:'ready',complete:true,
   items:[{kind:'video_review',available:true,count:0,required:false}]});
  if(parsed.pathname.endsWith('/review-inbox'))return Response.json({revision:'review-inbox-v1',status:'ready',complete:true,
   pendingTotal:0,filteredTotal:0,items:[],teams:[],players:[],nextCursor:null});
  assert.fail('Unexpected request '+parsed.pathname);
 };
 h.rows.players=[{id:child,athlete_id:athlete,preferred_name:'Linked child'},{id:staffPlayer,athlete_id:uuid(99)}];
 h.rows.roster=[{id:staffPlayer,team_id:staffTeam},{id:staffPlayer2,team_id:staffTeam2},{id:uuid(100),team_id:guardianTeam}];
 h.app.guardianLinks.value=roles.includes('guardian')?[{athlete_id:athlete,status:'verified',relationship:'parent'}]:[];
 h.app.accountContext.value=context(id,roles,multiple);
 h.app.authReady.value=true;
 h.app.navigateTab('videos');
 await nextTick();
 return {h,requests,setListResponse(fn){listResponse=fn;}};
}
const cases=[
 [ ['guardian'],['mine','shared'] ],
 [ ['coach'],['staff','review'] ],
 [ ['manager'],['staff'] ],
 [ ['club_admin'],['staff','review'] ],
 [ ['platform_admin'],[] ],
 [ ['guardian','coach'],['mine','staff','review'] ],
 [ ['manager','coach'],['staff','review'] ],
 [ ['guardian','manager'],['mine','shared','staff'] ]
];
for(const [roles,expected] of cases)test('Videos destinations for '+roles.join('+'),async t=>{
 const {h,requests}=await fixture(t,roles);
 assert.deepEqual(Array.from(h.app.videos.primaryDestinations.value),expected);
 assert.equal(h.app.videoSection.value,'landing');
 assert.equal(h.app.videoDestinations.value.some(card=>card.id==='batch'),roles.includes('coach'));
 assert.equal(h.app.changeVideoSection('batch'),roles.includes('coach'));
 if(roles.includes('coach')){
  assert.equal(h.app.videoSection.value,'batch');
  assert.equal(h.app.changeVideoSection('landing'),true);
 }
 if(!expected.includes('review')){
  assert.equal(h.app.changeVideoSection('review'),false);
  await h.app.reviewQueue.refreshInbox();
  assert.ok(!requests.some(entry=>entry.url.pathname.endsWith('/review-inbox')));
 }
 if(roles.includes('coach')&&roles.includes('guardian')){
  assert.equal(h.app.videos.secondaryShared.value,true);
  assert.equal(h.app.changeVideoSection('mine'),true);
  assert.equal(h.app.changeVideoSection('shared'),true);
  assert.deepEqual(Array.from(h.app.clubhouseMediaTeams.value,team=>team.id),[guardianTeam]);
 }
});

test('staff team changes reset bytes and leave the independently verified family scope intact',async t=>{
 const {h,requests,setListResponse}=await fixture(t,['coach','guardian'],true);
 const {videos,privateMediaController:media}=h.app;
 assert.equal(h.app.changeVideoSection('staff'),true);
 assert.equal(videos.staffScope.value,null,'multiple staff teams need a choice');
 const scopes=videos.staffScopes.value;
 const scopeA=scopes.find(scope=>scope.teamId===staffTeam);
 const scopeB=scopes.find(scope=>scope.teamId===staffTeam2);
 assert.equal(h.app.changeVideoStaff(scopeA.key),true);
 await until(()=>media.mediaPlayers.value.some(p=>p.id===staffPlayer));
 assert.deepEqual(Array.from(media.mediaPlayers.value,p=>p.id),[staffPlayer]);
 const late=deferred();setListResponse(()=>late.promise);
 const opening=media.selectMediaPlayer(staffPlayer);
 await until(()=>requests.some(req=>req.url.pathname==='/v2/submissions'));
 media.mediaPlaybackUrl.value='blob:previous-team';
 assert.equal(h.app.changeVideoStaff(scopeB.key),true);
 assert.ok(h.revoked.includes('blob:previous-team'));
 const oldRequest=requests.find(req=>req.url.pathname==='/v2/submissions');assert.equal(oldRequest.signal.aborted,true);
 late.resolve(Response.json({items:[{id:clip,player_id:staffPlayer,category:'pitching',status:'approved'}]}));
 await opening;
 assert.equal(media.mediaItems.value.length,0);
 await until(()=>media.mediaPlayers.value.some(p=>p.id===staffPlayer2));
 assert.deepEqual(Array.from(media.mediaPlayers.value,p=>p.id),[staffPlayer2]);
 assert.deepEqual(Array.from(videos.guardianTeams.value,p=>p.id),[guardianTeam]);
 h.app.changeVideoSection('mine');
 await until(()=>media.mediaPlayers.value.some(p=>p.id===child));
 assert.deepEqual(Array.from(media.mediaPlayers.value,p=>p.id),[child]);
 assert.equal(h.app.changeVideoStaff(scopeA.key),false);
 assert.ok(!h.calls.some(x=>x.table==='sessions'));
});

test('manager workspace reaches Review only through a verified Coach role',async t=>{
 const {h,requests}=await fixture(t,['manager','coach']);
 await h.app.changeWorkspace('manager');
 // Only the Videos choice changes. The global manager workspace stays selected.
 h.app.navigateTab('videos');
 assert.equal(h.app.workspaceMode.value,'manager');
 assert.equal(h.app.changeVideoSection('batch'),false);
 assert.equal(h.app.changeVideoSection('staff'),true);
 const managerScope=h.app.videos.staffScopes.value.find(scope=>scope.role==='manager');
 assert.equal(h.app.changeVideoStaff(managerScope.key),true);
 await until(()=>h.calls.some(req=>req.rpc==='sdl_v5_authorized_roster'&&req.args.p_role==='manager'));
 const roster=h.calls.find(req=>req.rpc==='sdl_v5_authorized_roster'&&req.args.p_role==='manager');
 assert.equal(roster.args.p_organization,club);assert.equal(roster.args.p_team,staffTeam);
 assert.equal(h.app.videoModeration.value,false);
 assert.equal(h.app.changeVideoSection('review'),true);
 await until(()=>requests.some(req=>req.url.pathname.endsWith('/review-inbox')));
 for(const {url} of requests.filter(req=>req.url.pathname.endsWith('/review-inbox')||req.url.pathname.endsWith('/action-summary')))
  assert.equal(url.searchParams.get('role'),'coach');
 assert.equal(h.app.changeVideoReview('manager'),false);
 assert.equal(h.app.workspaceMode.value,'manager');
});

test('verified context replacement and logout clear player scope, permissions and pending data',async t=>{
 const {h,requests,setListResponse}=await fixture(t,['guardian']);
 const media=h.app.privateMediaController,late=deferred();
 assert.equal(h.app.changeVideoSection('mine'),true);
 await until(()=>media.mediaPlayers.value.some(p=>p.id===child));
 setListResponse(()=>late.promise);
 const opening=media.selectMediaPlayer(child);
 await until(()=>requests.some(req=>req.url.pathname==='/v2/submissions'));
 await h.app.signOutAndClear();
 assert.equal(media.mediaPlayerId.value,'');assert.equal(h.app.videos.guardianRows.value.length,0);
 late.resolve(Response.json({items:[{id:clip,player_id:child,category:'pitching',status:'approved'}]}));
 await opening;
 assert.equal(media.mediaItems.value.length,0);
 assert.equal(h.app.videos.primaryDestinations.value.length,0);
 const next='other-synthetic';
 h.rows.sdl_v5_account_context=context(next,['platform_admin']);
 h.emit('SIGNED_IN',user(next));
 await until(()=>h.app.accountContext.value?.user_id===next);
 h.app.navigateTab('videos');
 assert.equal(h.app.changeVideoSection('mine'),false);
 assert.equal(media.mediaReadAllowed.value,false);
 assert.equal(media.mediaPlayerId.value,'');
});

test('an authorized destination does not convert a private read denial into playback or upload',async t=>{
 const {h,setListResponse}=await fixture(t,['coach']);
 const media=h.app.privateMediaController;
 assert.equal(h.app.changeVideoSection('staff'),true);
 await until(()=>media.mediaPlayers.value.some(p=>p.id===staffPlayer));
 setListResponse(()=>Response.json({},{status:403}));
 await media.selectMediaPlayer(staffPlayer);
 assert.equal(media.mediaReadAllowed.value,false);
 assert.equal(media.mediaUploadAllowed.value,false);
 assert.equal(media.mediaPlaybackUrl.value,'');
 assert.equal(media.mediaItems.value.length,0);
});

test('Coach and Club Admin review counts are fetched as separate scopes',async t=>{
 const {h,requests}=await fixture(t,['coach','club_admin']);
 assert.equal(h.app.changeVideoSection('review'),true);
 await until(()=>requests.some(req=>req.url.pathname.endsWith('/review-inbox')));
 assert.equal(h.app.reviewScope.value.role,'coach');
 assert.equal(h.app.reviewQueue.total.value,0);
 assert.equal(h.app.changeVideoReview('admin'),true);
 assert.equal(h.app.reviewQueue.total.value,null);
 await until(()=>requests.some(req=>req.url.pathname.endsWith('/review-inbox')&&req.url.searchParams.get('role')==='club_admin'));
 await until(()=>h.app.reviewQueue.status.value==='ready');
 assert.equal(h.app.reviewQueue.total.value,0);
 assert.equal(h.app.workspaceMode.value,'coach');
 assert.ok(requests.filter(req=>req.url.pathname.endsWith('/review-inbox')).every(req=>
  ['coach','club_admin'].includes(req.url.searchParams.get('role'))&&req.url.searchParams.getAll('role').length===1));
});

test('Home opens its exact Review scope and Videos can then show all teams for the same role',async t=>{
 const {h,requests}=await fixture(t,['coach'],true);
 h.app.coachOrganizationId.value=club;
 h.app.coachTeamId.value=staffTeam;
 h.app.navigateTab('home');
 await until(()=>h.app.reviewQueue.summaryStatus.value==='ready');
 h.app.openActionCenter({kind:'video_review'});
 assert.equal(h.app.videoSection.value,'review');
 assert.equal(h.app.videos.homeScoped.value,true);
 assert.equal(h.app.reviewScope.value.scopeTeamId,staffTeam);
 await until(()=>requests.some(req=>req.url.pathname.endsWith('/review-inbox')&&req.url.searchParams.get('scope_team_id')===staffTeam));
 assert.equal(h.app.changeVideoReview('coach'),true);
 assert.equal(h.app.videos.homeScoped.value,false);
 await until(()=>requests.some(req=>req.url.pathname.endsWith('/review-inbox')&&!req.url.searchParams.has('scope_team_id')));
 assert.equal(h.app.coachTeamId.value,staffTeam);
});
