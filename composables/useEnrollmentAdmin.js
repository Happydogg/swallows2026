import {createSubmissionService} from '../js/submissionService.js';
const {ref,computed}=Vue;
export function useEnrollmentAdmin({auth,service=createSubmissionService({auth}),timeoutMs=30000}){
  const enabled=service.enabled===true;
  const organizations=ref([]),organizationId=ref(''),athletes=ref([]),query=ref('');
  const busy=ref(false),ready=ref(false),listReady=ref(false),error=ref(''),notice=ref(''),pendingChange=ref(null);
  const evidence=ref({}),evidenceReviewed=ref({});
  // Memberships are only a navigation hint. All reads/writes require server authorization.
  const visible=computed(()=>organizations.value.length>0||auth.orgMemberships.value.some(m=>m.role==='admin'&&m.status==='active'));
  const organization=computed(()=>organizations.value.find(o=>o.id===organizationId.value));
  let epoch=0;const requests=new Set();
  function invalidate(){epoch++;for(const r of requests)r.abort();requests.clear();busy.value=false;}
  function clearRows(){athletes.value=[];listReady.value=false;evidence.value={};evidenceReviewed.value={};pendingChange.value=null;}
  function reset(){invalidate();organizations.value=[];organizationId.value='';query.value='';clearRows();ready.value=false;error.value='';notice.value='';}
  async function run(work,apply=()=>{}){
    if(!enabled)return;
    const version=epoch,identity=auth.captureIdentity(),controller=new AbortController();
    const current=()=>version===epoch&&auth.isCurrentIdentity(identity);
    if(!current())return;
    requests.add(controller);busy.value=true;error.value='';
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{const value=await work(controller.signal);if(current()&&!controller.signal.aborted){apply(value);return value;}}
    catch(e){if(current()){
      if(e.status===401||e.status===403){invalidate();organizations.value=[];organizationId.value='';clearRows();ready.value=false;}
      error.value=e.name==='AbortError'?'Request interrupted. Refresh before making another change.':e.message||'Administration request failed. Refresh before retrying.';
    }}finally{clearTimeout(timer);requests.delete(controller);if(current())busy.value=false;}
  }
  async function load(){
    reset();if(!enabled)return;
    await run(signal=>service.adminOrganizations({signal}),rows=>{organizations.value=rows;ready.value=true;});
  }
  async function selectOrganization(id){
    invalidate();clearRows();query.value='';notice.value='';error.value='';
    organizationId.value=organizations.value.some(o=>o.id===id)?id:'';
    if(organizationId.value)await refresh();
  }
  async function refresh(){
    if(!organization.value||busy.value)return;
    const id=organizationId.value,search=query.value;
    invalidate();clearRows();
    await run(signal=>service.adminEnrollments(id,search,{signal}),rows=>{
      if(rows.some(r=>r.organization_id!==id))throw Error('Organization enrollment mismatch.');
      athletes.value=rows;listReady.value=true;
    });
  }
  function currentRow(row){return listReady.value&&row.organization_id===organizationId.value&&athletes.value.some(r=>
    r.athlete_id===row.athlete_id&&r.enrollment_id===row.enrollment_id&&r.generation===row.generation&&r.status===row.status);}
  function prepareEnrollment(row,nextStatus){
    if(!enabled||busy.value||!currentRow(row)||!['active','inactive','ended'].includes(nextStatus)||row.status===nextStatus||(!row.enrollment_id&&nextStatus!=='active'))return;
    error.value='';notice.value='';pendingChange.value={kind:'enrollment',row:{...row},nextStatus,organizationName:organization.value.name};
  }
  function prepareRecording(row,allowed){
    if(!enabled||busy.value||!currentRow(row)||!row.enrollment_id||typeof allowed!=='boolean'||(allowed&&row.status!=='active'))return;
    const reference=(evidence.value[row.athlete_id]||'').trim();
    if(!reference||reference.length>500||evidenceReviewed.value[row.athlete_id]!==true){error.value='Review the evidence and enter a reference for this decision (up to 500 characters).';return;}
    error.value='';notice.value='';pendingChange.value={kind:'recording',row:{...row},allowed,evidence:reference,organizationName:organization.value.name};
  }
  function cancelChange(){if(!busy.value)pendingChange.value=null;}
  async function confirmChange(){
    const change=pendingChange.value;if(!change||busy.value||!enabled||!currentRow(change.row))return;
    const version=epoch,identity=auth.captureIdentity();
    // On an uncertain result, remove actions and require fresh server state. No automatic retries.
    clearRows();
    const result=await run(signal=>change.kind==='enrollment'
      ?service.setEnrollment(change.row,change.nextStatus,{signal})
      :service.setRecordingPermission(change.row,change.allowed,change.evidence,{signal}));
    if(result&&epoch===version&&auth.isCurrentIdentity(identity)){
      notice.value='Change saved.';
      await refresh();
    }else if(epoch===version&&auth.isCurrentIdentity(identity)&&!error.value){error.value='Result uncertain. Refresh the club before making another change.';}
  }
  return{enabled,visible,organizations,organizationId,organization,athletes,query,busy,ready,listReady,error,notice,pendingChange,evidence,evidenceReviewed,
    load,selectOrganization,refresh,prepareEnrollment,prepareRecording,cancelChange,confirmChange,reset,dispose:reset};
}
