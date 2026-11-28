// UX-V01. Independent presentation scopes for Videos. Services still authorize
// each operation with the authenticated caller.
import {fetchVerifiedGuardianPlayers} from '../js/supabaseService.js';
import {fetchCoachRoster} from '../js/coachRosterService.js';
import {fetchManagedRoster} from '../js/accountContextService.js';
import {resolveReviewScope,scopeKey} from '../js/mediaReviewModel.js';

const staffRoles=['coach','manager','club_admin'];
const reviewModes=['coach','admin'];
const roleKey=mode=>mode==='admin'?'club_admin':mode;

export function useVideoDestinations({auth,origin,activeTab,workspaceMode,homeReviewScope,batchAllowed}){
 const {ref,computed,watch}=Vue;
 const requested=ref('landing'),staffChoice=ref(''),teamView=ref('library'),selectedReviewMode=ref('');
 const retainHomeScope=ref(false),guardianRows=ref([]),staffRows=ref([]),next=ref(null);
 const busy=ref(false),error=ref(''),revision=ref(0);
 const context=computed(()=>{
  const verified=auth.accountContext.value;
  return origin.value&&!auth.authError.value&&auth.authReady.value&&verified?.user_id===auth.authUser.value?.id ? verified : null;
 });
 const links=computed(()=>context.value?.roles.includes('guardian')?
  auth.guardianLinks.value.filter(link=>link.status==='verified'):[]);
 const guardianTeams=computed(()=>links.value.length?
  context.value.teams.filter(team=>team.roles.includes('guardian')):[]);
 const staffScopes=computed(()=>{
  if(!context.value)return [];
  const {roles,organizations,teams}=context.value;
  return staffRoles.filter(role=>roles.includes(role)).flatMap(role=>organizations.filter(org=>org.roles.includes(role)).flatMap(org=>{
   const scopedTeams=teams.filter(team=>team.organization_id===org.id&&team.roles.includes(role));
   const scopes=scopedTeams.map(team=>({teamId:team.id,teamName:team.name}));
   // Keep the already-authorized Club Admin club roster, including unassigned players.
   if(role==='club_admin')scopes.push({teamId:'',teamName:''});
   return scopes.map(scope=>({...scope,role,organizationId:org.id,club:org.name,
    key:JSON.stringify([role,org.id,scope.teamId])}));
  }));
 });
 const staffScope=computed(()=>{
  const chosen=staffScopes.value.find(scope=>scope.key===staffChoice.value);
  if(chosen)return chosen;
  const teams=staffScopes.value.filter(scope=>scope.teamId);
  if(staffScopes.value.length===1)return staffScopes.value[0];
  return teams.length===1&&staffScopes.value.every(scope=>scope.role===teams[0].role&&
   scope.organizationId===teams[0].organizationId)?teams[0]:null;
 });
 const staffTeams=computed(()=>{
  const scope=staffScope.value;
  return scope?context.value.teams.filter(team=>team.roles.includes(scope.role)&&team.organization_id===scope.organizationId&&
   (!scope.teamId||scope.teamId===team.id)):[];
 });
 const scopes=computed(()=>reviewModes.flatMap(mode=>{
  const scope=resolveReviewScope({context:context.value,userId:auth.authUser.value?.id,ready:auth.authReady.value,
   denied:!!auth.authError.value,origin:origin.value,mode});
  return scope?[{mode,scope}]:[];
 }));
 const reviewMode=computed(()=>scopes.value.some(x=>x.mode===selectedReviewMode.value)?selectedReviewMode.value:
  scopes.value.find(x=>x.mode===workspaceMode.value)?.mode||scopes.value[0]?.mode||'');
 const reviewScope=computed(()=>{
  if(retainHomeScope.value&&homeReviewScope.value?.role===roleKey(reviewMode.value))return homeReviewScope.value;
  return scopes.value.find(x=>x.mode===reviewMode.value)?.scope||null;
 });
 const homeScoped=computed(()=>retainHomeScope.value&&!!(reviewScope.value?.organizationId||reviewScope.value?.scopeTeamId));
 const destinations=computed(()=>[
  ...(links.value.length?['mine']:[]),...(guardianTeams.value.length?['shared']:[]),
  ...(staffScopes.value.length?['staff']:[]),...(reviewScope.value?['review']:[])
 ]);
 const section=computed(()=>{
  const id=requested.value;
  if(destinations.value.includes(id))return id;
  return id==='batch'&&context.value&&batchAllowed.value?'batch':'landing';
 });
 // The frozen three primary Coach–Guardian controls stay intact. This same
 // guardian-scoped destination remains reachable as a secondary control.
 const secondaryShared=computed(()=>guardianTeams.value.length>0&&links.value.length>0&&
  scopes.value.some(x=>x.mode==='coach'));
 const primaryDestinations=computed(()=>destinations.value.filter(id=>id!=='shared'||!secondaryShared.value));
 const scopeSignature=computed(()=>activeTab.value==='videos'?JSON.stringify([
  section.value,section.value==='staff'?staffScope.value?.key:'',
  section.value==='staff'?teamView.value:'',section.value==='review'?scopeKey(reviewScope.value):''
 ]):'');
 const linkIds=computed(()=>JSON.stringify(links.value.map(link=>[link.athlete_id,link.relationship]).sort()));
 let pending=null,inFlight;
 function clearRows(){
  pending?.abort();pending=null;guardianRows.value=[];staffRows.value=[];next.value=null;
  error.value='';busy.value=false;
 }
 async function readRoster(append){
  const target=section.value,staff=staffScope.value,verified=context.value;
  const byGuardian=target==='mine',byStaff=target==='staff'&&teamView.value==='library'&&!!staff;
  if(!verified||!scopeSignature.value||(!byGuardian&&!byStaff)||(append&&!next.value))return;
  const identity=auth.captureIdentity(),signature=scopeSignature.value;
  const after=append?next.value:null;
  if(!append)clearRows();
  pending?.abort();
  const request=new AbortController();pending=request;busy.value=true;error.value='';
  const current=()=>pending===request&&!request.signal.aborted&&context.value===verified&&
   auth.isCurrentIdentity(identity)&&scopeSignature.value===signature;
  try{
   if(byGuardian){
    const children=await fetchVerifiedGuardianPlayers(links.value,{signal:request.signal});
    if(current())guardianRows.value=children;
   }else if(staff.role==='coach'){
    const roster=await fetchCoachRoster({signal:request.signal});
    if(current())staffRows.value=roster.filter(row=>row.team_id===staff.teamId);
   }else{
    const page=await fetchManagedRoster(verified,{role:staff.role,organizationId:staff.organizationId,
     teamId:staff.teamId||null,after},{signal:request.signal});
    if(current()){
     if(append&&page.rows.some(row=>staffRows.value.some(old=>old.id===row.id)))throw Error('Roster changed. Refresh players.');
     staffRows.value=append?[...staffRows.value,...page.rows]:page.rows;
     next.value=page.nextAfter;
    }
   }
  }catch{
   if(current()){clearRows();error.value='Could not load the authorized video roster. Refresh to try again.';}
  }finally{
   if(current()){busy.value=false;pending=null;}
  }
 }
 function load(append=false){
  if(pending)return inFlight;
  inFlight=readRoster(append);return inFlight;
 }
 function reset(){
  clearRows();requested.value='landing';staffChoice.value='';teamView.value='library';
  retainHomeScope.value=false;selectedReviewMode.value='';revision.value++;
 }
 watch([context,linkIds],reset,{flush:'sync'});
 watch(scopeSignature,clearRows,{flush:'sync'});
 watch([scopeSignature,revision],()=>{if(scopeSignature.value)void load();},{flush:'post'});
 function select(id){
  if(id!=='landing'&&!destinations.value.includes(id)&&!(id==='batch'&&context.value&&batchAllowed.value))return false;
  requested.value=id;return true;
 }
 function selectStaff(key){
  if(!staffScopes.value.some(scope=>scope.key===key))return false;
  staffChoice.value=key;teamView.value='library';return true;
 }
 function selectReview(mode,fromHome=false){
  if(!scopes.value.some(entry=>entry.mode===mode))return false;
  selectedReviewMode.value=mode;retainHomeScope.value=fromHome;return true;
 }
 return {section,primaryDestinations,secondaryShared,select,selectStaff,staffScope,staffScopes,staffTeams,teamView,
  guardianTeams,guardianRows,staffRows,revision,scopeSignature,reviewScope,reviewMode,homeScoped,scopes,selectReview,reset,load,busy,error,next};
}
