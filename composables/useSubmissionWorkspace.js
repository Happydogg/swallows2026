import { createSubmissionService,CLUB_CONSENT_POLICY_VERSION } from '../js/submissionService.js';
import { validateMediaFile } from '../js/privateMediaService.js';
import { groupMyPlayers,coachTeams,projectClubhouseRoster,projectClubhouseLeaderboard } from '../utils/dashboardUtils.js';
const {ref,computed}=Vue;
export function useSubmissionWorkspace({auth,players,coachRoster,sessions=ref([]),onProfile=()=>{},onPrivateVideos=()=>{},service=createSubmissionService({auth}),
  urls=URL,newKey=()=>crypto.randomUUID(),pollMs=5000,timeoutMs=65000}) {
  const tab=ref('players'),clubhouseSection=ref('roster'),workspace=ref([]),playerId=ref(''),teamId=ref('');
  const clubEnrollments=ref([]),consentAccepted=ref({}),subjectConfirmed=ref({});
  const category=ref('pitching'),share=ref(false),file=ref(null),previewUrl=ref(''),playbackUrl=ref('');
  const items=ref([]),queue=ref([]),shared=ref([]),clubhouseRoster=ref([]),clubhouseLeaderboard=ref([]);
  const clubhouseRosterReady=ref(false),clubhouseLeaderboardReady=ref(false),clubhouseRosterNotice=ref(''),clubhouseLeaderboardNotice=ref('');
  const filter=ref('all'),reviewFilter=ref('pending'),notes=ref({});
  const busy=ref(false),progress=ref(0),error=ref(''),errorStatus=ref(0),notice=ref(''),ready=ref(false);
  const enabled=service.enabled===true;
  const isTeamCoach=computed(()=>Boolean(auth.isTeamCoach?.value));
  const isVerifiedGuardian=computed(()=>Boolean(auth.isVerifiedGuardian?.value));
  // Parent-only accounts have no parent-safe statistics API; raw sessions are never loaded
  // for them, so statistics are reported as unavailable rather than derived client-side.
  const statsAvailable=computed(()=>!auth.isParentOnly?.value&&Array.isArray(sessions?.value)&&sessions.value.length>0);
  const statsUnavailableNotice='Permitted statistics await the parent-safe statistics service. Raw session records are not requested for family accounts.';
  const cards=computed(()=>{
    const raw=groupMyPlayers(players.value,auth.guardianLinks.value,workspace.value);
    const available=statsAvailable.value;
    const sessionList=available?sessions.value:[];
    return raw.map(card=>({
      ...card,
      profiles:card.profiles.map(prof=>{
        if(!available)return {...prof,statsAvailable:false,sessionCount:null,latestExitVelo:null,latestThrowingVelo:null,latestSprintTime:null,latestBroadJump:null};
        const pSessions=sessionList.filter(s=>s&&s.player_id===prof.id);
        const latest=key=>{const found=pSessions.find(s=>s[key]!==null&&s[key]!==undefined&&s[key]!=='');return found?found[key]:null;};
        return {
          ...prof,
          statsAvailable:true,
          sessionCount:pSessions.length,
          latestExitVelo:latest('exit_velo'),
          latestThrowingVelo:latest('throwing_velo'),
          latestSprintTime:latest('sprint_time'),
          latestBroadJump:latest('broad_jump')
        };
      })
    }));
  });
  const teams=computed(()=>{
    const result=new Map(coachTeams(coachRoster.value,workspace.value).map(t=>[t.id,t]));
    if(tab.value==='clubhouse'){
      for(const row of workspace.value)if(row.can_clubhouse&&row.team_id)result.set(row.team_id,{id:row.team_id,name:row.team_name||'Team'});
    }
    return [...result.values()];
  });
  const choices=computed(()=>{
    const map=new Map();for(const card of cards.value)for(const p of card.profiles)map.set(p.id,{id:p.id,name:p.name+' · '+p.clubLabel+' #'+p.jersey});
    for(const p of coachRoster.value)if(!map.has(p.id))map.set(p.id,{id:p.id,name:(p.preferred_name||'Player')+' · '+(p.team_name||'Team')});
    return [...map.values()];
  });
  const clubhouseLeaderboardByMetric=computed(()=>{
    const projected=projectClubhouseLeaderboard(clubhouseLeaderboard.value,teamId.value);
    const group=(metric,asc=false)=>projected.filter(r=>r.metric===metric).sort((a,b)=>asc?a.value-b.value:b.value-a.value).slice(0,3);
    return {
      exit_velo:group('exit_velo',false),
      throwing_velo:group('throwing_velo',false),
      broad_jump_ratio:group('broad_jump_ratio',false),
      sprint_time:group('sprint_time',true)
    };
  });
  const clubhouseRosterSafe=computed(()=>projectClubhouseRoster(clubhouseRoster.value,teamId.value));
  function clearSharing(){share.value=false;consentAccepted.value={};subjectConfirmed.value={};}
  function clearClubhouseData(){
    clubhouseRoster.value=[];clubhouseLeaderboard.value=[];
    clubhouseRosterReady.value=false;clubhouseLeaderboardReady.value=false;
    clubhouseRosterNotice.value='';clubhouseLeaderboardNotice.value='';
  }
  const consentPolicyVersion=CLUB_CONSENT_POLICY_VERSION;
  const shownItems=computed(()=>items.value.filter(row=>filter.value==='all'||row.status===filter.value));
  const pendingCount=computed(()=>queue.value.filter(row=>row.status==='pending').length);
  let epoch=0,poll=null,key='',descriptor='',playbackEpoch=0,playingId='',playingScope='',clubhouseRefreshing=false;
  const pending=new Set();
  function clearPlayback(){playbackEpoch++;playingId='';playingScope='';if(playbackUrl.value)urls.revokeObjectURL(playbackUrl.value);playbackUrl.value='';}
  function clearFile(){clearSharing();if(previewUrl.value)urls.revokeObjectURL(previewUrl.value);previewUrl.value='';file.value=null;key='';descriptor='';progress.value=0;}
  function clearAuthProtectedState(){
    invalidate();clearFile();clearClubhouseData();
    consentAccepted.value={};subjectConfirmed.value={};
    workspace.value=[];clubEnrollments.value=[];items.value=[];queue.value=[];shared.value=[];
    ready.value=false;
  }
  function invalidate(){epoch++;for(const request of pending)request.abort();pending.clear();clearPlayback();clearInterval(poll);poll=null;busy.value=false;clubhouseRefreshing=false;}
  function reset(){invalidate();clearFile();clearClubhouseData();workspace.value=[];clubEnrollments.value=[];consentAccepted.value={};subjectConfirmed.value={};items.value=[];queue.value=[];shared.value=[];playerId.value='';teamId.value='';notes.value={};category.value='pitching';share.value=false;error.value='';notice.value='';ready.value=false;tab.value='players';clubhouseSection.value='roster';filter.value='all';reviewFilter.value='pending';}
  async function run(work,apply=()=>{}) {
    if(!enabled){error.value='This feature awaits verified staging backend deployment.';return;}
    const currentEpoch=epoch,identity=auth.captureIdentity(),controller=new AbortController();
    if(!auth.isCurrentIdentity(identity))return;
    pending.add(controller);busy.value=true;error.value='';errorStatus.value=0;
    const current=()=>currentEpoch===epoch&&auth.isCurrentIdentity(identity);
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{const result=await work(controller.signal);if(current()&&!controller.signal.aborted){apply(result);return result;}}
    catch(e){if(current()){
      if(e.status===401||e.status===403)clearAuthProtectedState();
      errorStatus.value=e.status||0;
      error.value=e.name==='AbortError'?'Request interrupted. Refresh or retry safely.':e.message||'Request failed.';
    }}finally{clearTimeout(timeout);pending.delete(controller);if(current())busy.value=false;}
  }
  async function runClubhouseSection(targetTeam,work,apply,onUnavailable){
    if(!enabled||!ready.value||teamId.value!==targetTeam)return false;
    const currentEpoch=epoch,identity=auth.captureIdentity(),controller=new AbortController();
    if(!auth.isCurrentIdentity(identity))return false;
    pending.add(controller);
    const current=()=>currentEpoch===epoch&&auth.isCurrentIdentity(identity)&&teamId.value===targetTeam;
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const result=await work(controller.signal);
      if(current()&&!controller.signal.aborted){apply(result);return true;}
    }catch(e){
      if(!current())return false;
      if(e.status===401||e.status===403){
        clearAuthProtectedState();
        errorStatus.value=e.status;
        error.value=e.message||'Request failed.';
        return false;
      }
      if(e.name!=='AbortError')onUnavailable(e);
    }finally{
      clearTimeout(timeout);pending.delete(controller);
    }
    return false;
  }
  async function load(){if(!enabled)return;await run(signal=>service.workspace({signal}),rows=>{clearSharing();consentAccepted.value={};subjectConfirmed.value={};workspace.value=rows;ready.value=true;});}
  async function selectPlayer(id){invalidate();clearFile();clubEnrollments.value=[];consentAccepted.value={};subjectConfirmed.value={};items.value=[];notice.value='';error.value='';
    playerId.value=choices.value.some(p=>p.id===id)?id:'';
    if(playerId.value){await refreshItems();await refreshClubs();}
  }
  async function refreshItems(){if(!playerId.value)return;clearPlayback();consentAccepted.value={};subjectConfirmed.value={};items.value=[];
    await run(signal=>service.list(playerId.value,{signal}),rows=>{items.value=rows;});}
  function pickFile(event){if(busy.value)return;clearFile();error.value='';const candidate=event.target.files?.[0];event.target.value='';if(!candidate)return;
    try{validateMediaFile(candidate);file.value=candidate;previewUrl.value=urls.createObjectURL(candidate);}catch(e){error.value=e.message;}}
  async function submit(){if(!file.value||!playerId.value||busy.value)return;
    const desc=[playerId.value,category.value,file.value.name,file.value.size,file.value.lastModified].join('|');
    if(desc!==descriptor){descriptor=desc;key=newKey();}
    notice.value='';
    const currentEpoch=epoch,identity=auth.captureIdentity();
    const receipt=await run(signal=>service.submit(playerId.value,file.value,{category:category.value,key},{signal,
      onProgress:n=>{if(currentEpoch===epoch&&auth.isCurrentIdentity(identity)&&!signal.aborted)progress.value=n;}}));
    if(receipt){clearFile();notice.value=receipt.status==='pending'?'Submitted for coach review.':'Submission already saved ('+receipt.status+').';await refreshItems();}
  }
  async function selectTeam(id,view=tab.value){invalidate();clearFile();clearClubhouseData();queue.value=[];shared.value=[];notes.value={};error.value='';tab.value=view;
    teamId.value=teams.value.some(t=>t.id===id)?id:'';if(!teamId.value)return;
    if(view==='review')await refreshQueue();else if(view==='clubhouse'){await refreshClubhouse(false);if(enabled&&teamId.value)poll=setInterval(()=>{
      if(tab.value==='clubhouse'&&!busy.value&&!clubhouseRefreshing&&globalThis.document?.visibilityState!=='hidden')void refreshClubhouse(true);
    },pollMs);}
  }
  async function enterReview(id){await selectTeam(id,'review');}
  async function refreshQueue(){if(!teamId.value)return;clearPlayback();subjectConfirmed.value={};queue.value=[];
    await run(signal=>service.queue(teamId.value,reviewFilter.value,{signal}),rows=>{queue.value=rows;});}
  async function refreshShared(silent=false){if(!teamId.value)return;
    if(!silent){clearPlayback();shared.value=[];}
    const rows=await run(signal=>service.clubhouse(teamId.value,{signal}),rows=>{
      if(playingScope==='clubhouse'&&!rows.some(row=>row.id===playingId))clearPlayback();
      shared.value=rows;
    });
    if(!rows&&silent){if(playingScope==='clubhouse')clearPlayback();shared.value=[];}
  }
  async function refreshClubhouseSections(silent=false){
    const targetTeam=teamId.value;
    if(!targetTeam||!enabled||!ready.value)return;
    if(!silent)clearClubhouseData();
    const currentEpoch=epoch,identity=auth.captureIdentity();
    const stillActive=()=>currentEpoch===epoch&&auth.isCurrentIdentity(identity)&&teamId.value===targetTeam&&ready.value;
    if(typeof service.clubhouseRoster==='function'&&(service.hasClubhouseRoster?service.hasClubhouseRoster():true)){
      await runClubhouseSection(targetTeam,
        signal=>service.clubhouseRoster(targetTeam,{signal}),
        rows=>{clubhouseRoster.value=projectClubhouseRoster(rows,targetTeam);clubhouseRosterReady.value=true;clubhouseRosterNotice.value='';},
        e=>{clubhouseRoster.value=[];clubhouseRosterReady.value=false;clubhouseRosterNotice.value=e.message||'Parent-safe Clubhouse team roster endpoint awaits backend implementation.';}
      );
    }else if(stillActive()){
      clubhouseRoster.value=[];clubhouseRosterReady.value=false;
      clubhouseRosterNotice.value='Parent-safe Clubhouse team roster endpoint (/v2/clubhouse/roster) awaits backend implementation.';
    }
    if(!stillActive())return;
    if(typeof service.clubhouseLeaderboard==='function'&&(service.hasClubhouseLeaderboard?service.hasClubhouseLeaderboard():true)){
      await runClubhouseSection(targetTeam,
        signal=>service.clubhouseLeaderboard(targetTeam,{signal}),
        rows=>{clubhouseLeaderboard.value=projectClubhouseLeaderboard(rows,targetTeam);clubhouseLeaderboardReady.value=true;clubhouseLeaderboardNotice.value='';},
        e=>{clubhouseLeaderboard.value=[];clubhouseLeaderboardReady.value=false;clubhouseLeaderboardNotice.value=e.message||'Parent-safe Clubhouse leaderboard endpoint awaits backend implementation.';}
      );
    }else if(stillActive()){
      clubhouseLeaderboard.value=[];clubhouseLeaderboardReady.value=false;
      clubhouseLeaderboardNotice.value='Parent-safe Clubhouse leaderboard endpoint (/v2/clubhouse/leaderboard) awaits backend implementation.';
    }
  }
  async function refreshClubhouse(silent=false){
    if(!teamId.value||clubhouseRefreshing)return;
    clubhouseRefreshing=true;
    try{
      await refreshShared(silent);
      if(teamId.value&&ready.value)await refreshClubhouseSections(silent);
    }finally{
      clubhouseRefreshing=false;
    }
  }
  function changeClubhouseSection(section){
    if(['roster','leaderboard','stats','videos'].includes(section))clubhouseSection.value=section;
  }
  async function review(row,decision){if(busy.value||row.status!=='pending'||row.can_review!==true||!queue.value.some(item=>item.id===row.id))return;
    notice.value='';
    const result=await run(signal=>service.review(row.id,decision,notes.value[row.id]||'',{signal}));
    if(result){notice.value='Review saved.';await refreshQueue();}
    else if(errorStatus.value===409){const message=error.value;await refreshQueue();error.value=message;}
  }
  async function refreshClubs(){
    clubEnrollments.value=[];consentAccepted.value={};
    if(!enabled||!ready.value)return;
    const athlete=players.value.find(p=>p.id===playerId.value)?.athlete_id||workspace.value.find(p=>p.id===playerId.value)?.athlete_id;
    if(!athlete||!auth.guardianLinks.value.some(g=>g.athlete_id===athlete&&g.status==='verified'))return;
    await run(signal=>service.enrollments(athlete,{signal}),rows=>{clubEnrollments.value=rows;});
  }
  async function clubConsent(row,accept){
    if(busy.value||!enabled||!ready.value||!clubEnrollments.value.some(e=>e.id===row.id&&e.generation===row.generation))return;
    if(accept&&(row.status!=='active'||consentAccepted.value[row.id]!==true)){error.value='Explicitly accept the club consent policy first.';return;}
    clearPlayback();shared.value=[];clearClubhouseData();notice.value='';
    const result=await run(signal=>service.clubConsent(row,accept,{signal}));
    if(result){notice.value=accept?'Standing consent saved for this continuous club enrollment.':'Clubhouse consent withdrawn. Private videos are preserved.';await refreshClubs();await refreshItems();}
    else if(errorStatus.value===409){const message=error.value;await refreshClubs();error.value=message;}
  }
  async function publish(row,value=true){
    if(busy.value||!queue.value.some(item=>item.id===row.id)||!teamId.value)return;
    if(value&&(row.can_publish!==true||subjectConfirmed.value[row.id]!==true||!row.athlete_id)){error.value='Current club consent, approval and single-athlete safety confirmation are required.';return;}
    const result=await run(signal=>service.publish(row.id,value?[teamId.value]:[],value?[row.athlete_id]:[],{signal}));
    if(result){notice.value=value?'Published to the selected Team Clubhouse.':'Clubhouse publication removed. Private video preserved.';await refreshQueue();}
  }
  async function play(row,scope='submissions'){
    const list=scope==='clubhouse'?shared.value:scope==='review'?queue.value:items.value;
    if(!list.some(item=>item.id===row.id)||busy.value)return;
    clearPlayback();const version=playbackEpoch;
    await run(signal=>service.playback(row.id,{signal}),blob=>{if(version===playbackEpoch){playbackUrl.value=urls.createObjectURL(blob);playingId=row.id;playingScope=scope;}});
  }
  function previewError(){clearFile();error.value='The browser could not decode this MP4. Try H.264 MP4.';}
  function playbackError(){clearPlayback();error.value='Video playback failed. Refresh and try again.';}
  function showProfile(id){const p=players.value.find(p=>p.id===id&&auth.guardianLinks.value.some(g=>g.athlete_id===p.athlete_id&&g.status==='verified'));if(p)onProfile(p);}
  function openPrivateVideos(id){const p=players.value.find(p=>p.id===id&&auth.guardianLinks.value.some(g=>g.athlete_id===p.athlete_id&&g.status==='verified'));if(p)onPrivateVideos(p.id);}
  function changeTab(value){invalidate();clearClubhouseData();error.value='';notice.value='';notes.value={};consentAccepted.value={};subjectConfirmed.value={};tab.value=value;clubEnrollments.value=[];items.value=[];queue.value=[];shared.value=[];playerId.value='';teamId.value='';clearFile();}
  const focus=()=>{if(enabled&&tab.value==='clubhouse'&&teamId.value&&!busy.value&&!clubhouseRefreshing)void refreshClubhouse(true);};
  globalThis.window?.addEventListener?.('focus',focus);
  function dispose(){reset();globalThis.window?.removeEventListener?.('focus',focus);}
  return{enabled,ready,tab,clubhouseSection,workspace,cards,teams,choices,clubEnrollments,consentAccepted,subjectConfirmed,consentPolicyVersion,playerId,teamId,category,share,file,previewUrl,playbackUrl,
    items,queue,shared,clubhouseRoster,clubhouseRosterSafe,clubhouseLeaderboard,clubhouseLeaderboardByMetric,clubhouseRosterReady,clubhouseLeaderboardReady,clubhouseRosterNotice,clubhouseLeaderboardNotice,
    filter,reviewFilter,notes,shownItems,pendingCount,busy,progress,error,notice,isTeamCoach,isVerifiedGuardian,statsAvailable,statsUnavailableNotice,
    refreshClubs,clubConsent,publish,previewError,playbackError,load,selectPlayer,selectTeam,enterReview,refreshItems,refreshQueue,refreshShared,refreshClubhouseSections,refreshClubhouse,changeClubhouseSection,
    pickFile,submit,review,play,showProfile,openPrivateVideos,changeTab,reset,dispose};
}
