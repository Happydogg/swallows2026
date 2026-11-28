import {createPrivateMediaService} from '../js/privateMediaService.js';
import {scopeKey,uniqueReviewRows,reviewCategories} from '../js/mediaReviewModel.js';
const {ref,computed,watch}=Vue;
const emptyFilters=()=>({teamId:'',playerId:'',category:''});
export function useMediaReviewInbox({auth,scope,activeTab,section,privateMedia,service=createPrivateMediaService({auth})}){
 const summaryStatus=ref('idle'),summaryItems=ref([]),status=ref('idle'),rows=ref([]),teams=ref([]),players=ref([]),filters=ref(emptyFilters()),total=ref(null),filteredTotal=ref(null),next=ref(null),opening=ref(false),notice=ref(''),selected=ref(null);
 let epoch=0,summaryRequest=null,inboxRequest=null,blocked=false;
 const available=computed(()=>!!scope.value);
 const inReview=()=>activeTab.value==='videos'&&section.value==='review';
 function clearSummary(){summaryRequest?.abort();summaryRequest=null;summaryStatus.value='idle';summaryItems.value=[];}
 function clearInbox(){inboxRequest?.abort();inboxRequest=null;status.value='idle';rows.value=[];teams.value=[];players.value=[];total.value=null;filteredTotal.value=null;next.value=null;opening.value=false;notice.value='';selected.value=null;}
 function reset(){epoch++;blocked=false;clearSummary();clearInbox();filters.value=emptyFilters();}
 function denied(){epoch++;blocked=true;clearSummary();clearInbox();filters.value=emptyFilters();summaryStatus.value='unavailable';status.value='unavailable';notice.value='Review access is unavailable. Refresh account permissions or sign in again.';privateMedia.resetMedia();}
 function op(kind){
  const currentScope=scope.value;if(!currentScope)return null;
  const identity=auth.captureIdentity();if(!auth.isCurrentIdentity(identity))return null;
  const key=scopeKey(currentScope),e=epoch,controller=new AbortController();
  if(kind==='summary'){summaryRequest?.abort();summaryRequest=controller;}else{inboxRequest?.abort();inboxRequest=controller;}
  const owns=()=>epoch===e&&auth.isCurrentIdentity(identity)&&key===scopeKey(scope.value)&&(kind==='summary'?summaryRequest===controller:inboxRequest===controller&&inReview());
  let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},30000);
  const current=()=>owns()&&!controller.signal.aborted;
  return {scope:currentScope,signal:controller.signal,current,failed:()=>owns()&&(!controller.signal.aborted||timedOut),finish(){clearTimeout(timer);if(kind==='summary'&&summaryRequest===controller)summaryRequest=null;if(kind==='inbox'&&inboxRequest===controller)inboxRequest=null;}};
 }
 async function refreshSummary(){
  if(!available.value||blocked)return;
  const request=op('summary');if(!request)return;
  summaryStatus.value='loading';summaryItems.value=[];
  try{const response=await service.mediaActionSummary(request.scope,{signal:request.signal});
   if(request.current()){summaryItems.value=[{kind:'video_review',available:true,count:response.items[0].count,required:false}];summaryStatus.value='ready';}else if(request.failed())summaryStatus.value='unavailable';
  }catch(e){if(request.failed()){if(e.status===401||e.status===403)denied();else summaryStatus.value='unavailable';}}
  finally{request.finish();}
 }
 async function refreshInbox(append=false){
  if(!available.value||!inReview()||blocked||opening.value||privateMedia.mediaReviewing.value||(append&&!next.value))return;
  const cursor=append?next.value:null,prior=append?rows.value:[],priorTotal=total.value,priorFiltered=filteredTotal.value,f={...filters.value};
  const request=op('inbox');if(!request)return;
  status.value='loading';rows.value=[];teams.value=[];players.value=[];total.value=null;filteredTotal.value=null;next.value=null;
  try{
   const response=await service.reviewInbox(request.scope,{...f,...(cursor?{cursor}:{})},{signal:request.signal});
   if(!request.current()){if(request.failed())status.value='unavailable';return;}
   if(append&&(response.pendingTotal!==priorTotal||response.filteredTotal!==priorFiltered)){await refreshInbox(false);return;}
   const validated=uniqueReviewRows(response.items,request.scope,f);
   if(validated.length!==response.items.length)throw Error('Invalid review inbox rows.');
   rows.value=uniqueReviewRows([...prior,...validated],request.scope,f);
   teams.value=response.teams.filter(t=>t&&typeof t.id==='string'&&typeof t.label==='string');
   players.value=response.players.filter(p=>p&&typeof p.id==='string'&&typeof p.label==='string'&&Array.isArray(p.teamIds));
   total.value=response.pendingTotal;filteredTotal.value=response.filteredTotal;next.value=response.nextCursor;status.value='ready';
  }catch(e){if(request.failed()){if(e.status===401||e.status===403)denied();else status.value='unavailable';}}
  finally{request.finish();}
 }
 function filter({key,value}){
  if(status.value!=='ready'||opening.value||privateMedia.mediaReviewing.value||!Object.hasOwn(filters.value,key)||typeof value!=='string')return;
  if(value&&!(key==='teamId'?teams.value.some(t=>t.id===value):key==='playerId'?players.value.some(p=>p.id===value&&(!filters.value.teamId||p.teamIds.includes(filters.value.teamId))):reviewCategories.includes(value)))return;
  filters.value={...filters.value,[key]:value,...(key==='teamId'?{playerId:''}:{})};
  privateMedia.resetMedia();notice.value='';void refreshInbox();
 }
 async function open(row){
  if(!inReview()||!available.value||blocked||status.value!=='ready'||opening.value||privateMedia.mediaReviewing.value)return;
  const current=rows.value.find(x=>x.id===row?.id&&x.playerId===row?.playerId);
  if(!current)return;
  const e=epoch,key=scopeKey(scope.value),identity=auth.captureIdentity();
  opening.value=true;notice.value='';
  selected.value=null;
  const result=await privateMedia.openInboxReview(current,filters.value.teamId||'');
  if(epoch!==e||!inReview()||key!==scopeKey(scope.value)||!auth.isCurrentIdentity(identity))return;
  opening.value=false;
  if(result?.status===401||result?.status===403){denied();return;}
  if(result?.opened){selected.value=current;return;}
  notice.value='This video could not be opened. The queue has been refreshed.';
  await Promise.all([refreshInbox(),refreshSummary()]);
 }
 function close(){
  if(opening.value||privateMedia.mediaReviewing.value)return;
  privateMedia.resetMedia();selected.value=null;
 }
 async function nextVideo(){
  if(!selected.value||opening.value||status.value!=='ready'||privateMedia.mediaReviewing.value)return;
  const selectedId=selected.value.id;
  const index=rows.value.findIndex(row=>row.id===selectedId);
  const nextRow=index>=0?rows.value[index+1]:null;
  if(nextRow){await open(nextRow);return;}
  const currentEpoch=epoch,previous=new Set(rows.value.map(row=>row.id));
  if(next.value){
   await refreshInbox(true);
   if(currentEpoch!==epoch||selected.value?.id!==selectedId||status.value!=='ready')return;
   const newRow=rows.value.find(row=>!previous.has(row.id));
   if(newRow){await open(newRow);return;}
  }
  close();notice.value='End of loaded queue. Skipped videos remain pending.';
 }
 function retry(){if(opening.value||privateMedia.mediaReviewing.value)return;blocked=false;if(inReview())close();void refreshSummary();if(inReview())void refreshInbox();}
 // Synchronous invalidation, deferred fetch. A change of account context invalidates even an identical scope key.
 watch([()=>auth.accountContext.value,()=>scopeKey(scope.value)],()=>{reset();if(inReview()||privateMedia.inboxReviewMode.value)privateMedia.resetMedia();},{flush:'sync'});
 watch([activeTab,section],()=>{epoch++;clearSummary();clearInbox();filters.value=emptyFilters();if(blocked){summaryStatus.value='unavailable';status.value='unavailable';notice.value='Review access is unavailable. Refresh account permissions or sign in again.';}if(!inReview()&&privateMedia.inboxReviewMode.value)privateMedia.resetMedia();},{flush:'sync'});
 watch([()=>auth.accountContext.value,()=>scopeKey(scope.value),activeTab,section],()=>{if(!available.value||blocked)return;if(activeTab.value==='home')void refreshSummary();else if(inReview()){void refreshInbox();void refreshSummary();}},{immediate:true,flush:'post'});
 watch(privateMedia.mediaReviewEvent,event=>{
  if(!event||!available.value)return;
  if(event.type==='denied'){denied();return;}
  opening.value=false;
  const advance=event.type==='changed'&&!!selected.value;
  selected.value=null;
  void refreshSummary();
  if(inReview()){
   const currentEpoch=epoch;
   void refreshInbox().then(()=>{
    if(advance&&currentEpoch===epoch&&inReview()&&status.value==='ready'&&rows.value.length)void open(rows.value[0]);
   });
  }
 },{flush:'sync'});
 return {available,summaryStatus,summaryItems,status,rows,teams,players,filters,total,filteredTotal,next,opening,notice,reset,refreshSummary,refreshInbox,filter,open,retry,selected,close,nextVideo};
}
