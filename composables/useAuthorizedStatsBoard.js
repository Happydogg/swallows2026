// SDL-004-LIVE-STATS-002: Active-identity, roster-scoped read-only chart state.
import { fetchAuthorizedPlayerHistory } from '../js/authorizedStatsService.js';
export function useAuthorizedStatsBoard({auth,coachRoster,familyPlayers,workspaceMode,load=fetchAuthorizedPlayerHistory}){
  const selectedId=Vue.ref('');
  const sessions=Vue.ref([]);
  const busy=Vue.ref(false);
  const error=Vue.ref('');
  let generation=0;
  const players=Vue.computed(()=>{
    if(auth.authError.value || !auth.authUser.value)return [];
    if(workspaceMode.value==='coach' && auth.isTeamCoach.value)return coachRoster.value;
    if(workspaceMode.value==='family' && auth.isVerifiedGuardian.value)return familyPlayers.value;
    return [];
  });
  const selected=Vue.computed(()=>players.value.find(x=>x.id===selectedId.value)||null);
  function reset(){
    generation++;selectedId.value='';sessions.value=[];busy.value=false;error.value='';
  }
  async function select(id){
    const permitted=players.value.find(x=>x.id===id);
    if(!permitted)return;
    const role=workspaceMode.value==='coach'?'coach':'guardian';
    const identity=auth.captureIdentity();
    if(!auth.isCurrentIdentity(identity))return;
    const version=++generation;
    selectedId.value=id;
    sessions.value=[];busy.value=true;error.value='';
    try{
      const rows=await load(id,role);
      if(version===generation && auth.isCurrentIdentity(identity) && players.value.some(x=>x.id===id))
        sessions.value=rows;
    }catch(e){
      if(version===generation && auth.isCurrentIdentity(identity))
        error.value=e.message||'Authorized history unavailable';
    }finally{
      if(version===generation && auth.isCurrentIdentity(identity))busy.value=false;
    }
  }
  const digest=Vue.computed(()=>workspaceMode.value+'|'+players.value.map(x=>x.id).sort().join('|'));
  Vue.watch(digest,(a,b)=>{
    if(a===b)return;
    const prior=selectedId.value;
    reset();
    const candidate=players.value.some(x=>x.id===prior)?prior:players.value[0]?.id;
    if(candidate)void select(candidate);
  },{immediate:true});
  return {players,selectedId,selected,sessions,busy,error,select,reset};
}
