// Standalone deterministic source tests; app-harness/browser tests remain separate.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const strip=s=>s.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
const model=new Function(strip(source('js/mediaReviewModel.js'))+'\nreturn {resolveReviewScope,scopeKey,validReviewRow,uniqueReviewRows,reviewCategories};')();
const {resolveReviewScope,scopeKey,validReviewRow,uniqueReviewRows}=model;
const userId='demo-account';
const coach={role:'coach'},admin={role:'club_admin'},scoped={role:'coach',organizationId:'org',scopeTeamId:'team-b'};
const row={id:'media-old',playerId:'not-in-loaded-roster',playerLabel:'Demo player',teamId:'team-a',teamLabel:'Team A',teamIds:['team-a','team-b'],category:'pitching',status:'pending',can_review:true,createdAt:'2026-11-27T00:00:00Z'};
const unassigned={...row,teamId:null,teamLabel:'Unassigned',teamIds:[]};
const context={user_id:userId,roles:['coach','club_admin','guardian'],organizations:[{id:'org',roles:['coach','club_admin']}],teams:[{id:'team-a',organization_id:'org',roles:['club_admin']},{id:'team-b',organization_id:'org',roles:['coach','club_admin']}]};
const opts={context,userId,ready:true,denied:false,origin:true,mode:'coach',organizationId:'org',teamId:'team-b'};
const empty=()=>({revision:'review-inbox-v1',status:'ready',complete:true,pendingTotal:0,filteredTotal:0,items:[],teams:[],players:[],nextCursor:null});
const response=(items=[row],pendingTotal=items.length,filteredTotal=items.length,nextCursor=null)=>({...empty(),items,pendingTotal,filteredTotal,nextCursor,teams:[{id:'team-a',label:'A'},{id:'team-b',label:'B'}],players:[{id:row.playerId,label:row.playerLabel,teamId:row.teamId,teamIds:row.teamIds}]});
const summary=count=>({revision:'review-inbox-v1',status:'ready',complete:true,items:[{kind:'video_review',available:true,count,required:false}]});
const later=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const err=status=>Object.assign(Error('Media request failed'),{status});
const noWatch=()=>{};
const Vue={ref:value=>({value}),computed:fn=>({get value(){return fn()}}),watch:noWatch};
const loadAdapter=new Function('Vue','createPrivateMediaService','validateMediaFile','extractVideoThumbnail','scopeKey','validReviewRow','globalThis',strip(source('composables/usePrivateMedia.js'))+'\nreturn usePrivateMedia;');
const loadQueue=new Function('Vue','createPrivateMediaService','scopeKey','uniqueReviewRows','reviewCategories',strip(source('composables/useMediaReviewInbox.js'))+'\nreturn useMediaReviewInbox;');
function adapter(overrides={},initialScope=coach){
 let scope=initialScope,identity=1;
 const calls=[],revoked=[];
 const auth={captureIdentity:()=>identity,isCurrentIdentity:x=>x===identity,guardianLinks:Vue.ref([]),isTeamCoach:Vue.ref(false)};
 const api={reviewInbox:async(s,f)=>{calls.push(['lookup',s,f]);return response([row]);},playback:async id=>{calls.push(['play',id]);return {};},review:async(...args)=>{calls.push(['review',...args.slice(0,4)]);return true;},list:async()=>{calls.push(['list']);return [];},authorize:async()=>{calls.push(['authorize']);return false;},...overrides};
 const use=loadAdapter(Vue,()=>api,()=>{},()=>{},scopeKey,validReviewRow,{confirm:()=>true});
 const c=use({auth,players:Vue.ref([]),coachRoster:Vue.ref([]),analyzer:{resetAnalyzer(){},initPoseTracker(){},openAnalyzer(){}},service:api,urls:{createObjectURL:()=> 'blob:review-only',revokeObjectURL:x=>revoked.push(x)},getReviewScope:()=>scope});
 return {c,calls,revoked,setScope:s=>{scope=s;},invalidate:()=>{identity++;c.resetMedia();}};
}
function queue(overrides={},initialScope=coach,tab='videos',initialSection='review'){
 const calls=[],scope=Vue.ref(initialScope),activeTab=Vue.ref(tab),section=Vue.ref(initialSection);
 let identity=1;
 const watchers=[];
 const vue={...Vue,watch:(source,fn,options)=>{watchers.push({source,fn,options});}};
 const auth={accountContext:Vue.ref(context),captureIdentity:()=>identity,isCurrentIdentity:x=>x===identity};
 const privateMedia={mediaReviewing:Vue.ref(false),inboxReviewMode:Vue.ref(false),mediaReviewEvent:Vue.ref(null),resetMedia:()=>{calls.push(['reset-media']);},openInboxReview:async(...args)=>{calls.push(['open',...args]);return {opened:true};}};
 const api={reviewInbox:async(s,f)=>{calls.push(['inbox',s,f]);return response();},mediaActionSummary:async s=>{calls.push(['summary',s]);return summary(1);},...overrides};
 const q=loadQueue(vue,()=>api,scopeKey,uniqueReviewRows,model.reviewCategories)({auth,scope,activeTab,section,privateMedia,service:api});
 return {q,calls,scope,activeTab,section,privateMedia,watchers,scopeChanged(s){scope.value=s;watchers[0].fn();},routeChanged(t,s){activeTab.value=t;section.value=s;watchers[1].fn();},receipt(type){watchers[3].fn({type});},invalidate(){identity++;q.reset();}};
}
test('scope requires verified identity, readiness, approved origin and role in account context',()=>{
 assert.deepEqual(resolveReviewScope(opts),scoped);
 for(const change of [{ready:false},{origin:false},{denied:true},{userId:'other'},{mode:'family'},{mode:'manager'},{mode:'member'},{context:{...context,roles:['guardian']}},{organizationId:'other'},{teamId:'team-a'}])assert.equal(resolveReviewScope({...opts,...change}),null);
});
test('dual role does not expand coach scope; admin allows unassigned club scope',()=>{
 assert.equal(resolveReviewScope({...opts,teamId:'team-a'}),null);
 assert.deepEqual(resolveReviewScope({...opts,mode:'admin',teamId:''}),{role:'club_admin',organizationId:'org'});
 assert.equal(resolveReviewScope({...opts,mode:'coach',context:{...context,teams:[]},teamId:''}),null);
});
test('multi-team row filtering and deduplication uses teamIds',()=>{
 assert.equal(validReviewRow(row,coach,{teamId:'team-b'}),true);
 assert.equal(validReviewRow(row,coach,{teamId:'team-c'}),false);
 assert.deepEqual(uniqueReviewRows([row,row],coach),[row]);
 assert.equal(validReviewRow({...row,teamId:'team-c'},coach),false);
});
test('unassigned row only valid for unfiltered club admin',()=>{
 assert.equal(validReviewRow(unassigned,admin),true);assert.equal(validReviewRow(unassigned,coach),false);
 assert.equal(validReviewRow(unassigned,{...admin,scopeTeamId:'team-a'}),false);
 assert.equal(validReviewRow(unassigned,admin,{teamId:'team-a'}),false);
});
test('older inbox row exact lookup does not query or widen normal player library; no archive or upload',async()=>{
 const {c,calls}=adapter();
 assert.equal(c.mediaPlayers.value.length,0);
 assert.equal((await c.openInboxReview(row,'team-b')).opened,true);
 assert.deepEqual(calls,[['lookup',coach,{mediaId:row.id,playerId:row.playerId,teamId:'team-b'}],['play',row.id]]);
 assert.equal(c.reviewItem.value.id,row.id);assert.equal(c.mediaUploadAllowed.value,false);assert.equal(c.mediaItems.value[0].can_archive,undefined);
 c.ensureMediaThumbnail(c.mediaItems.value[0]);assert.equal(calls.length,2);
 await c.refreshMedia();assert.equal(calls.length,2);c.resetMedia();
});
test('unassigned admin opens through exact lookup while coach cannot',async()=>{
 const a=adapter({reviewInbox:async()=>response([unassigned])},admin);
 assert.equal((await a.c.openInboxReview(unassigned)).opened,true);a.c.resetMedia();
 const b=adapter({},coach);assert.equal((await b.c.openInboxReview(unassigned)).opened,false);assert.equal(b.calls.length,0);
});
test('stale or mismatched exact lookup never plays media',async()=>{
 for(const payload of [empty(),response([{...row,id:'different'}]),response([{...row,can_review:false}]),response([{...row,teamIds:['team-a']}])]){
  const {c,calls}=adapter({reviewInbox:async()=>payload});assert.equal((await c.openInboxReview(row,'team-b')).opened,false);assert.equal(calls.length,0);assert.equal(c.mediaItems.value.length,0);assert.equal(c.mediaPlaybackUrl.value,'');
 }
});
test('account and scope change discard late lookup response',async()=>{
 const pending=later(),a=adapter({reviewInbox:()=>pending.promise});const request=a.c.openInboxReview(row);
 a.invalidate();pending.resolve(response());assert.equal((await request).opened,false);assert.equal(a.calls.length,0);assert.equal(a.c.mediaItems.value.length,0);
 const p=later(),b=adapter({reviewInbox:()=>p.promise});const req=b.c.openInboxReview(row);b.setScope(admin);p.resolve(response());assert.equal((await req).opened,false);assert.equal(b.c.mediaPlayerId.value,'');
});
test('playback denial clears transient context',async()=>{
 const {c}=adapter({playback:async()=>{throw err(403);}});
 const result=await c.openInboxReview(row);assert.equal(result.opened,false);assert.equal(result.status,403);assert.equal(c.mediaItems.value.length,0);assert.equal(c.inboxReviewMode.value,false);
});
test('successful independent review uses original mutation and clears transient context',async()=>{
 const {c,calls,revoked}=adapter();
 await c.openInboxReview(row);c.reviewSingleSubject.value=true;await c.reviewPrivateMedia('approved');
 assert.deepEqual(calls.at(-1),['review',row.id,'approved','',true]);assert.equal(c.mediaReviewEvent.value.type,'changed');assert.equal(c.mediaItems.value.length,0);assert.equal(c.mediaPlaybackUrl.value,'');assert.ok(revoked.includes('blob:review-only'));assert.ok(c.mediaNotice.value.includes('Not published'));
});
test('409 conflict clears old review and emits refresh without retrying mutation',async()=>{
 let count=0;const {c}=adapter({review:async()=>{count++;throw err(409);}});
 await c.openInboxReview(row);await c.reviewPrivateMedia('approved');await c.reviewPrivateMedia('approved');
 assert.equal(count,1);assert.equal(c.mediaReviewEvent.value.type,'conflict');assert.equal(c.mediaPlaybackUrl.value,'');assert.equal(c.inboxReviewMode.value,false);
});
test('rejection requires note, and scope change blocks mutation',async()=>{
 const a=adapter();await a.c.openInboxReview(row);await a.c.reviewPrivateMedia('rejected');assert.equal(a.calls.length,2);
 a.setScope(admin);await a.c.reviewPrivateMedia('approved');assert.equal(a.calls.length,2);assert.equal(a.c.mediaItems.value.length,0);
});
test('Home summary and inbox share identical scope; server counts are not page length',async()=>{
 const {q,calls}=queue({reviewInbox:async()=>response([row],8,3),mediaActionSummary:async()=>summary(8)},scoped);
 await q.refreshSummary();await q.refreshInbox();assert.equal(q.summaryItems.value[0].count,8);assert.equal(q.total.value,8);assert.equal(q.filteredTotal.value,3);assert.equal(q.rows.value.length,1);
 const k=queue({},scoped);await k.q.refreshSummary();await k.q.refreshInbox();assert.deepEqual(k.calls[0][1],k.calls[1][1]);assert.deepEqual(k.calls[0][1],scoped);
});
test('unavailable summary is unknown; zero is only a successful receipt',async()=>{
 const a=queue({mediaActionSummary:async()=>{throw err(503);}});await a.q.refreshSummary();assert.equal(a.q.summaryStatus.value,'unavailable');assert.equal(a.q.summaryItems.value.length,0);
 const b=queue({mediaActionSummary:async()=>summary(0)});await b.q.refreshSummary();assert.equal(b.q.summaryItems.value[0].count,0);
});
test('nonreview scope never calls either endpoint; inbox does not fetch on Home',async()=>{
 const a=queue({},null);await a.q.refreshSummary();await a.q.refreshInbox();assert.equal(a.calls.length,0);
 const b=queue({},coach,'home','library');await b.q.refreshInbox();assert.equal(b.calls.length,0);
});
test('403 clears counts, options, rows and transient playback',async()=>{
 const a=queue({mediaActionSummary:async()=>{throw err(403);}});await a.q.refreshInbox();await a.q.refreshSummary();assert.equal(a.q.total.value,null);assert.equal(a.q.rows.value.length,0);assert.equal(a.q.players.value.length,0);assert.equal(a.q.summaryItems.value.length,0);assert.equal(a.q.status.value,'unavailable');assert.ok(a.calls.some(x=>x[0]==='reset-media'));
});
test('late responses cannot repopulate inbox or summary after scope change',async()=>{
 const pending=later(),count=later(),a=queue({reviewInbox:()=>pending.promise,mediaActionSummary:()=>count.promise});const p=a.q.refreshInbox(),s=a.q.refreshSummary();a.scopeChanged(admin);pending.resolve(response());count.resolve(summary(9));await Promise.all([p,s]);assert.equal(a.q.rows.value.length,0);assert.equal(a.q.total.value,null);assert.equal(a.q.summaryItems.value.length,0);
});
test('load-more uses opaque cursor, deduplicates and restarts on changed totals',async()=>{
 let calls=0;const a=queue({reviewInbox:async(s,f)=>{calls++;if(calls===1)return response([row],2,2,'opaque|cursor');if(calls===2){assert.equal(f.cursor,'opaque|cursor');return response([{...row,id:'second'}],1,1);}assert.equal(f.cursor,undefined);return response([{...row,id:'second'}],1,1);}});
 await a.q.refreshInbox();await a.q.refreshInbox(true);assert.equal(calls,3);assert.equal(a.q.total.value,1);assert.equal(a.q.rows.value[0].id,'second');assert.equal(a.q.rows.value.length,1);
});
test('opening uses current server row and team filter, no arbitrary row supplied by UI',async()=>{
 const a=queue();await a.q.refreshInbox();a.q.filters.value={teamId:'team-b',playerId:'',category:''};await a.q.open({...row,id:'other'});assert.equal(a.calls.filter(x=>x[0]==='open').length,0);await a.q.open(row);assert.deepEqual(a.calls.find(x=>x[0]==='open'),['open',row,'team-b']);
});
test('review receipt refreshes both endpoints independently',async()=>{
 const a=queue();await a.q.refreshInbox();await a.q.refreshSummary();a.receipt('changed');await Promise.resolve();await Promise.resolve();assert.equal(a.calls.filter(x=>x[0]==='summary').length,2);assert.equal(a.calls.filter(x=>x[0]==='inbox').length,2);
});

// RBAC-05 additional race and fail-closed regression checks.
test('scope changes during playback cannot create a stale blob',async()=>{
 const p=later(),a=adapter({playback:()=>p.promise});const req=a.c.openInboxReview(row);await Promise.resolve();await Promise.resolve();a.setScope(admin);p.resolve({});assert.equal((await req).opened,false);assert.equal(a.c.mediaPlaybackUrl.value,'');assert.equal(a.c.mediaItems.value.length,0);
});
test('uncertain review outcome clears transient bytes and requires refresh',async()=>{
 const a=adapter({review:async()=>{throw err(503)}});await a.c.openInboxReview(row);await a.c.reviewPrivateMedia('approved');assert.equal(a.c.inboxReviewMode.value,false);assert.equal(a.c.mediaPlaybackUrl.value,'');assert.equal(a.c.mediaReviewEvent.value.type,'conflict');
});
test('exact lookup requires complete current contract receipt',async()=>{
 const a=adapter({reviewInbox:async()=>({...response(),complete:false})});assert.equal((await a.c.openInboxReview(row)).opened,false);assert.equal(a.calls.length,0);
});
test('transient review cannot upload archive analyze or expand library',async()=>{
 const a=adapter();await a.c.openInboxReview(row);a.c.mediaUploadAllowed.value=true;a.c.mediaFile.value={};a.c.uploadCategory.value='pitching';a.c.mediaItems.value[0].can_archive=true;await a.c.uploadPrivateMedia();await a.c.archivePrivateMedia(a.c.mediaItems.value[0]);a.c.analysisCategory.value='pitching';a.c.analysisFps.value='120';a.c.analyzePrivateMedia();await a.c.refreshMedia();assert.equal(a.calls.length,2);a.c.resetMedia();
});

test('independent summary and inbox responses retain their own exact server totals in either arrival order',async()=>{
 for(const first of ['summary','inbox']){
  const count=later(),inbox=later();
  const a=queue({mediaActionSummary:()=>count.promise,reviewInbox:()=>inbox.promise},scoped);
  const summaryRead=a.q.refreshSummary(),inboxRead=a.q.refreshInbox();
  if(first==='summary'){
   count.resolve(summary(8));await summaryRead;
   assert.equal(a.q.summaryItems.value[0].count,8);assert.equal(a.q.total.value,null);
   inbox.resolve(response([row],7,5));await inboxRead;
  }else{
   inbox.resolve(response([row],7,5));await inboxRead;
   assert.equal(a.q.total.value,7);assert.deepEqual(a.q.summaryItems.value,[]);
   count.resolve(summary(8));await summaryRead;
  }
  assert.equal(a.q.summaryItems.value[0].count,8);assert.equal(a.q.total.value,7);
  assert.equal(a.q.filteredTotal.value,5);assert.equal(a.q.rows.value.length,1);
 }
});

test('role, club, team and logout changes abort both reads, and late data cannot repopulate scope',async()=>{
 for(const change of ['role','club','team','logout']){
  const count=later(),inbox=later(),signals=[];
  const a=queue({
   mediaActionSummary:(_scope,o)=>{signals.push(o.signal);return count.promise;},
   reviewInbox:(_scope,_filters,o)=>{signals.push(o.signal);return inbox.promise;}
  },scoped);
  const reads=[a.q.refreshSummary(),a.q.refreshInbox()];
  if(change==='logout')a.invalidate();
  else a.scopeChanged(change==='role'?admin:change==='club'?{...scoped,organizationId:'other-club'}:{...scoped,scopeTeamId:'team-a'});
  assert.equal(signals.length,2);assert.ok(signals.every(signal=>signal.aborted));
  count.resolve(summary(9));inbox.resolve(response([row],9));await Promise.all(reads);
  assert.deepEqual(a.q.summaryItems.value,[]);assert.equal(a.q.total.value,null);assert.deepEqual(a.q.rows.value,[]);
 }
});

test('latest overlapping refresh wins for both channels even when old data returns last',async()=>{
 const counts=[later(),later()],inboxes=[later(),later()],signals=[];
 let n=0,m=0;
 const a=queue({
  mediaActionSummary:(_scope,o)=>{signals.push(o.signal);return counts[n++].promise;},
  reviewInbox:(_scope,_filters,o)=>{signals.push(o.signal);return inboxes[m++].promise;}
 });
 const stale=[a.q.refreshSummary(),a.q.refreshInbox()];
 const current=[a.q.refreshSummary(),a.q.refreshInbox()];
 assert.ok(signals.slice(0,2).every(signal=>signal.aborted));
 counts[1].resolve(summary(2));inboxes[1].resolve(response([row],3));await Promise.all(current);
 counts[0].resolve(summary(6));inboxes[0].resolve(response([row],7));await Promise.all(stale);
 assert.equal(a.q.summaryItems.value[0].count,2);assert.equal(a.q.total.value,3);
});

test('review success or conflict cancels pre-review reads and rechecks both totals without arithmetic',async()=>{
 for(const outcome of ['changed','conflict']){
  const staleSummary=later(),staleInbox=later(),signals=[];
  let summaries=0,inboxes=0;
  const a=queue({
   mediaActionSummary:(_scope,o)=>{signals.push(o.signal);return ++summaries===1?staleSummary.promise:Promise.resolve(summary(4));},
   reviewInbox:(_scope,_filters,o)=>{signals.push(o.signal);return ++inboxes===1?staleInbox.promise:Promise.resolve(response([row],5));}
  });
  const stale=[a.q.refreshSummary(),a.q.refreshInbox()];
  a.receipt(outcome);await Promise.resolve();
  assert.ok(signals.slice(0,2).every(signal=>signal.aborted));
  staleSummary.resolve(summary(12));staleInbox.resolve(response([row],12));await Promise.all(stale);
  assert.equal(summaries,2);assert.equal(inboxes,2);
  assert.equal(a.q.summaryItems.value[0].count,4);assert.equal(a.q.total.value,5);
 }
});

test('an earlier successful count is cleared on denial or unavailability without inventing zero',async()=>{
 for(const error of [401,403,503]){
  let failing=false;
  const a=queue({
   mediaActionSummary:async()=>{if(failing)throw err(error);return summary(2);},
   reviewInbox:async()=>{if(failing)throw err(error);return response([row],2);}
  });
  await Promise.all([a.q.refreshSummary(),a.q.refreshInbox()]);
  assert.equal(a.q.summaryItems.value[0].count,2);assert.equal(a.q.total.value,2);
  failing=true;
  await Promise.all([a.q.refreshSummary(),a.q.refreshInbox()]);
  assert.deepEqual(a.q.summaryItems.value,[]);assert.equal(a.q.total.value,null);
  assert.equal(a.q.summaryStatus.value,'unavailable');assert.equal(a.q.status.value,'unavailable');
  assert.deepEqual(a.q.rows.value,[]);
 }
});
