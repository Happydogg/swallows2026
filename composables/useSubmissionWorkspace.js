import { createSubmissionService } from '../js/submissionService.js';
import { validateMediaFile } from '../js/privateMediaService.js';
import { groupMyPlayers,coachTeams } from '../utils/dashboardUtils.js';
const {ref,computed}=Vue;
export function useSubmissionWorkspace({auth,players,coachRoster,onProfile=()=>{},service=createSubmissionService({auth}),
  urls=URL,newKey=()=>crypto.randomUUID(),pollMs=5000,timeoutMs=65000}) {
  const tab=ref('players'),workspace=ref([]),playerId=ref(''),teamId=ref('');
  const selectedTeamIds=ref([]),consentSelections=ref({});
  const category=ref('pitching'),share=ref(false),file=ref(null),previewUrl=ref(''),playbackUrl=ref('');
  const items=ref([]),queue=ref([]),shared=ref([]),filter=ref('all'),reviewFilter=ref('pending'),notes=ref({});
  const busy=ref(false),progress=ref(0),error=ref(''),errorStatus=ref(0),notice=ref(''),ready=ref(false);
  const enabled=service.enabled===true;
  const cards=computed(()=>groupMyPlayers(players.value,auth.guardianLinks.value,workspace.value));
  const teams=computed(()=>{
    const result=new Map(coachTeams(coachRoster.value,workspace.value).map(t=>[t.id,t]));
    if(tab.value==='clubhouse')for(const row of workspace.value)if(row.can_clubhouse&&row.team_id)result.set(row.team_id,{id:row.team_id,name:row.team_name||'Team'});
    return [...result.values()];
  });
  const choices=computed(()=>{
    const map=new Map();for(const card of cards.value)for(const p of card.profiles)map.set(p.id,{id:p.id,name:p.name+' · '+p.clubLabel+' #'+p.jersey});
    for(const p of coachRoster.value)if(!map.has(p.id))map.set(p.id,{id:p.id,name:(p.preferred_name||'Player')+' · '+(p.team_name||'Team')});
    return [...map.values()];
  });
  const consentTeams=computed(()=>[...new Map(workspace.value.filter(p=>p.id===playerId.value&&p.is_guardian&&p.team_id).map(p=>[p.team_id,{id:p.team_id,name:p.team_name||'Team',organization:p.organization_name||'Organization'}])).values()]);
  function clearSharing(){selectedTeamIds.value=[];share.value=false;}
  function checkedTeams(ids){
    if(!Array.isArray(ids)||ids.some(id=>!consentTeams.value.some(team=>team.id===id)))throw Error('Select only currently authorized teams for this club profile.');
    return [...new Set(ids)].sort();
  }
  function toggleUploadTeam(id,checked){
    if(busy.value||!enabled||!ready.value||!consentTeams.value.some(team=>team.id===id))return;
    selectedTeamIds.value=checked?[...new Set([...selectedTeamIds.value,id])]:selectedTeamIds.value.filter(team=>team!==id);
    share.value=selectedTeamIds.value.length>0;
  }
  function toggleConsentTeam(row,id,checked){
    if(busy.value||!enabled||!ready.value||row.can_consent!==true||!items.value.some(item=>item.id===row.id)||!consentTeams.value.some(team=>team.id===id))return;
    const previous=consentSelections.value[row.id]||[];
    consentSelections.value={...consentSelections.value,[row.id]:checked?[...new Set([...previous,id])]:previous.filter(team=>team!==id)};
  }
  function grantedTeams(row){return (row.consent_team_ids||[]).map(id=>{
    const team=consentTeams.value.find(team=>team.id===id);return team?team.organization+' · '+team.name:'Previously authorized team';
  }).join(', ');}
  const shownItems=computed(()=>items.value.filter(row=>filter.value==='all'||row.status===filter.value));
  const pendingCount=computed(()=>queue.value.filter(row=>row.status==='pending').length);
  let epoch=0,poll=null,key='',descriptor='',playbackEpoch=0,playingId='',playingScope='';
  const pending=new Set();
  function clearPlayback(){playbackEpoch++;playingId='';playingScope='';if(playbackUrl.value)urls.revokeObjectURL(playbackUrl.value);playbackUrl.value='';}
  function clearFile(){clearSharing();if(previewUrl.value)urls.revokeObjectURL(previewUrl.value);previewUrl.value='';file.value=null;key='';descriptor='';progress.value=0;}
  function invalidate(){epoch++;for(const request of pending)request.abort();pending.clear();clearPlayback();clearInterval(poll);poll=null;busy.value=false;}
  function reset(){invalidate();clearFile();workspace.value=[];consentSelections.value={};items.value=[];queue.value=[];shared.value=[];playerId.value='';teamId.value='';notes.value={};category.value='pitching';share.value=false;error.value='';notice.value='';ready.value=false;tab.value='players';filter.value='all';reviewFilter.value='pending';}
  async function run(work,apply=()=>{}) {
    if(!enabled){error.value='This feature awaits verified staging backend deployment.';return;}
    const currentEpoch=epoch,identity=auth.captureIdentity(),controller=new AbortController();
    if(!auth.isCurrentIdentity(identity))return;
    pending.add(controller);busy.value=true;error.value='';errorStatus.value=0;
    const current=()=>currentEpoch===epoch&&auth.isCurrentIdentity(identity);
    const timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{const result=await work(controller.signal);if(current()&&!controller.signal.aborted){apply(result);return result;}}
    catch(e){if(current()){
      if(e.status===401||e.status===403){invalidate();clearFile();consentSelections.value={};workspace.value=[];items.value=[];queue.value=[];shared.value=[];ready.value=false;}
      errorStatus.value=e.status||0;
      error.value=e.name==='AbortError'?'Request interrupted. Refresh or retry safely.':e.message||'Request failed.';
    }}finally{clearTimeout(timeout);pending.delete(controller);if(current())busy.value=false;}
  }
  async function load(){if(!enabled)return;await run(signal=>service.workspace({signal}),rows=>{clearSharing();consentSelections.value={};workspace.value=rows;ready.value=true;});}
  async function selectPlayer(id){invalidate();clearFile();consentSelections.value={};items.value=[];notice.value='';error.value='';
    playerId.value=choices.value.some(p=>p.id===id)?id:'';
    if(playerId.value)await refreshItems();
  }
  async function refreshItems(){if(!playerId.value)return;clearPlayback();consentSelections.value={};items.value=[];
    await run(signal=>service.list(playerId.value,{signal}),rows=>{items.value=rows;});}
  function pickFile(event){if(busy.value)return;clearFile();error.value='';const candidate=event.target.files?.[0];event.target.value='';if(!candidate)return;
    try{validateMediaFile(candidate);file.value=candidate;previewUrl.value=urls.createObjectURL(candidate);}catch(e){error.value=e.message;}}
  async function submit(){if(!file.value||!playerId.value||busy.value)return;
    let teamIds;try{teamIds=checkedTeams(selectedTeamIds.value);}catch(e){error.value=e.message;return;}
    share.value=teamIds.length>0;
    const desc=[playerId.value,category.value,share.value,file.value.name,file.value.size,file.value.lastModified,teamIds.join(',')].join('|');
    if(desc!==descriptor){descriptor=desc;key=newKey();}
    notice.value='';
    const currentEpoch=epoch,identity=auth.captureIdentity();
    const receipt=await run(signal=>service.submit(playerId.value,file.value,{category:category.value,share:share.value,key,teamIds},{signal,
      onProgress:n=>{if(currentEpoch===epoch&&auth.isCurrentIdentity(identity)&&!signal.aborted)progress.value=n;}}));
    if(receipt){clearFile();notice.value=receipt.status==='pending'?'Submitted for coach review.':'Submission already saved ('+receipt.status+').';await refreshItems();}
  }
  async function selectTeam(id,view=tab.value){invalidate();clearFile();queue.value=[];shared.value=[];notes.value={};error.value='';tab.value=view;
    teamId.value=teams.value.some(t=>t.id===id)?id:'';if(!teamId.value)return;
    if(view==='review')await refreshQueue();else if(view==='clubhouse'){await refreshShared();if(enabled)poll=setInterval(()=>{
      if(tab.value==='clubhouse'&&!busy.value&&globalThis.document?.visibilityState!=='hidden')void refreshShared(true);
    },pollMs);}
  }
  async function enterReview(id){await selectTeam(id,'review');}
  async function refreshQueue(){if(!teamId.value)return;clearPlayback();queue.value=[];
    await run(signal=>service.queue(teamId.value,reviewFilter.value,{signal}),rows=>{queue.value=rows;});}
  async function refreshShared(silent=false){if(!teamId.value)return;
    if(!silent){clearPlayback();shared.value=[];}
    const rows=await run(signal=>service.clubhouse(teamId.value,{signal}),rows=>{
      if(playingScope==='clubhouse'&&!rows.some(row=>row.id===playingId))clearPlayback();
      shared.value=rows;
    });
    if(!rows&&silent){if(playingScope==='clubhouse')clearPlayback();shared.value=[];}
  }
  async function review(row,decision){if(busy.value||row.status!=='pending'||row.can_review!==true||!queue.value.some(item=>item.id===row.id))return;
    notice.value='';
    const result=await run(signal=>service.review(row.id,decision,notes.value[row.id]||'',{signal}));
    if(result){notice.value='Review saved.';await refreshQueue();}
    else if(errorStatus.value===409){const message=error.value;await refreshQueue();error.value=message;}
  }
  async function consent(row,value){if(busy.value||row.can_consent!==true||!items.value.some(item=>item.id===row.id))return;
    let teamIds=[];
    try{if(value){teamIds=checkedTeams(consentSelections.value[row.id]||[]);if(!teamIds.length)throw Error('Select at least one team before granting sharing consent.');}}
    catch(e){error.value=e.message;return;}
    clearPlayback();shared.value=[];notice.value='';
    const result=await run(signal=>service.consent(row.id,value,{signal},teamIds));
    if(result){consentSelections.value={...consentSelections.value,[row.id]:[]};notice.value=value?'Team-sharing consent saved. Approval is still required.':'Sharing consent withdrawn.';await refreshItems();}
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
  function changeTab(value){invalidate();error.value='';notice.value='';notes.value={};consentSelections.value={};tab.value=value;items.value=[];queue.value=[];shared.value=[];playerId.value='';teamId.value='';clearFile();}
  const focus=()=>{if(enabled&&tab.value==='clubhouse'&&teamId.value&&!busy.value)void refreshShared(true);};
  globalThis.window?.addEventListener?.('focus',focus);
  function dispose(){reset();globalThis.window?.removeEventListener?.('focus',focus);}
  return{enabled,ready,tab,workspace,cards,teams,choices,consentTeams,selectedTeamIds,consentSelections,playerId,teamId,category,share,file,previewUrl,playbackUrl,
    items,queue,shared,filter,reviewFilter,notes,shownItems,pendingCount,busy,progress,error,notice,
    toggleUploadTeam,toggleConsentTeam,grantedTeams,previewError,playbackError,load,selectPlayer,selectTeam,enterReview,refreshItems,refreshQueue,refreshShared,pickFile,submit,review,consent,play,showProfile,changeTab,reset,dispose};
}
