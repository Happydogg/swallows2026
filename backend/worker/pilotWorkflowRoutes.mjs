// Final pilot RPC facade. All authorization is repeated in PostgreSQL using the caller JWT.
export const PILOT_REVISION='sdl004-final-pilot-v1';
const projection=(row,fields)=>Object.fromEntries(fields.map(k=>[k,row?.[k]??null]));
const performanceFields=['id','player_id','preferred_name','protocol_id','metric','unit','protocol_label','distance_m','value','measurement_date','status','source_kind','revision','evidence','evidence_video_id','review_note','recorded_by','reviewed_by','created_at','supersedes','superseded_by','can_review'];
const growthFields=['id','measurement_date','height_cm','weight_kg','revision','recorded_by','recorded_role'];
const number=(v)=>{if((typeof v!=='number'&&typeof v!=='string')||v===''||!Number.isFinite(Number(v)))throw Error('Invalid number');return Number(v);};
export function canonicalMeasurement(value,unit,kind){
 const n=number(value);const factors=kind==='height'?{cm:1,in:2.54}:kind==='weight'?{kg:1,lb:0.45359237}:kind==='speed'?{'km/h':1,mph:1.609344}:kind==='time'?{s:1,ms:0.001}:{cm:1,m:100,in:2.54};
 if(!Object.hasOwn(factors,unit))throw Error('Invalid unit');return Math.round(n*factors[unit]*10000)/10000;
}
const protocols={'exit-radar-v1':'speed','throw-radar-v1':'speed','standing-broad-jump-v1':'distance','sprint-18.29-hand-v1':'time','sprint-18.29-electronic-v1':'time','sprint-27.43-hand-v1':'time'};
async function bodyJson(request){
 if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw Error('JSON required');
 const reader=request.body?.getReader();if(!reader)throw Error('Body required');let count=0;const parts=[];
 while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>8192){await reader.cancel();throw Error('Body too large');}parts.push(value);}
 const data=new Uint8Array(count);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}const result=JSON.parse(new TextDecoder().decode(data));
 if(!result||Array.isArray(result)||typeof result!=='object')throw Error('Invalid JSON');return result;
}
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function pilotWorkflowRoute({request,url,path,contract,call,validId,json,origin}){
 const routes=path.startsWith('/v2/pilot/')||path.startsWith('/v2/onboarding/')||path.startsWith('/v2/staff/')||/^\/v2\/players\/[^/]+\/(growth|performance|family|coach-statistics|baseball-profile)$/.test(path)||/^\/v2\/performance\/[^/]+\/(review|correction)$/.test(path)||/^\/v2\/club-enrollments\/[^/]+\/sharing$/.test(path)||path==='/v2/performance/review'||/^\/v2\/players\/[^/]+\/baseball-profile\/approval$/.test(path);
 if(!routes)return null;
 if(contract.pilotWorkflow!==PILOT_REVISION)return json({error:'Final pilot backend awaits deployment and verification'},503,origin);
 const send=async(name,args,project=x=>x)=>{const r=await call('sdl_004_pilot_'+name,args);if(r.error)return json({error:r.status===409?'Record changed; refresh before retrying':r.status===410?'Invitation expired or revoked':'Access denied or service unavailable'},r.status,origin);try{return json(project(r.value),200,origin);}catch{return json({error:'Invalid backend response'},503,origin);}};
 const items=(fields,max=100,nested)=>data=>{if(!Array.isArray(data)||data.length>max)throw Error();return {items:data.map(row=>({...projection(row,fields),...(nested?nested(row):{})}))};};
 const id=v=>{if(!validId(v))throw Error('Invalid identifier');return v;};
 const history=row=>({history:Array.isArray(row.history)?row.history.map(h=>projection(h,['action','actor','at','details'])):[]});
 const p=path.match(/^\/v2\/players\/([^/]+)\/(growth|performance|family|coach-statistics|baseball-profile)$/),a=path.match(/^\/v2\/performance\/([^/]+)\/(review|correction)$/),sharing=path.match(/^\/v2\/club-enrollments\/([^/]+)\/sharing$/);
 try{
  if(request.method==='GET'){
   if(path==='/v2/pilot/administration')return send('administration',{p_org:id(url.searchParams.get('organization_id'))},d=>({members:d.members.map(r=>projection(r,['id','name'])),teams:d.teams.map(r=>projection(r,['id','name'])),permissions:d.permissions.map(r=>projection(r,['id','user_id','team_id','permission','active']))}));
   if(path==='/v2/pilot/workspace')return send('workspace',{},data=>({players:Array.isArray(data?.players)?data.players.map(r=>projection(r,['id','athlete_id','preferred_name','organization_id','organization_name','team_id','team_name','is_guardian','is_coach','can_clubhouse'])):[],protocols:data?.protocols?.map(r=>projection(r,['id','metric','label','unit','distance_m']))??[],invitation_organizations:data?.invitation_organizations?.map(r=>projection(r,['id','name']))??[],staff_scopes:data?.staff_scopes?.map(r=>projection(r,['team_id','team_name','organization_id','permission']))??[]}));
   if(path==='/v2/onboarding/invitations')return send('invitations',{p_org:id(url.searchParams.get('organization_id'))},items(['id','player_id','preferred_name','target_email','expires_at','revoked_at','redeemed_at']));
   if(path==='/v2/onboarding/players')return send('invitation_players',{p_org:id(url.searchParams.get('organization_id'))},items(['id','preferred_name']));
   if(path==='/v2/staff/contacts')return send('contacts',{p_team:id(url.searchParams.get('team_id')),p_purpose:url.searchParams.get('purpose')},items(['player_id','preferred_name','parent_phone','given_names','last_name','dob','registration_number']));
   if(path==='/v2/performance/review')return send('performance',{p_team:id(url.searchParams.get('team_id')),p_status:url.searchParams.get('status')||'pending'},items(performanceFields,100,history));
   if(p){id(p[1]);if(p[2]==='baseball-profile')return send('baseball_profile',{p_player:p[1]},r=>projection(r,['player_id','preferred_name','jersey','position','throws','bats','approved']));if(p[2]==='growth')return send('growth',{p_player:p[1]},items(growthFields,200,row=>({history:row.history?.map(h=>projection(h,['revision','previous','height_cm','weight_kg','measurement_date','reason','recorded_by','recorded_role','at']))??[]})));
    if(p[2]==='performance')return send('performance',{p_player:p[1]},items(performanceFields,100,history));
    if(p[2]==='family')return send('family',{p_player:p[1]},r=>projection(r,['player_id','preferred_name','given_names','last_name','dob','parent_phone','registration_number']));
    return send('coach_statistics',{p_player:p[1]},items(['id','player_id','session_date','exit_velo','throwing_velo','sprint_time','broad_jump','control_exit_velo','attack_angle','height_cm','weight_kg'],200));
   }
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405,origin);
  const b=await bodyJson(request);
  if(path==='/v2/onboarding/invitations'){
   const token=hex(crypto.getRandomValues(new Uint8Array(32))),hash=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));
   return send('issue_invitation',{p_player:id(b.player_id),p_email:b.email,p_hash:hash},r=>({...projection(r,['id','expires_at']),token}));
  }
  if(path==='/v2/onboarding/invitations/redeem'){
   if(typeof b.token!=='string'||!/^[0-9a-f]{64}$/.test(b.token))throw Error();
   const hash=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.token))));return send('redeem_invitation',{p_hash:hash},r=>projection(r,['linked','player_id']));
  }
  if(path==='/v2/onboarding/invitations/revoke')return send('revoke_invitation',{p_id:id(b.id)},()=>({updated:true}));
  if(path==='/v2/staff/permissions')return send('set_permission',{p_user:id(b.user_id),p_org:id(b.organization_id),p_team:b.team_id==null?null:id(b.team_id),p_permission:b.permission,p_active:b.active},()=>({updated:true}));
  const profileApproval=path.match(/^\/v2\/players\/([^/]+)\/baseball-profile\/approval$/);
  if(profileApproval)return send('approve_profile',{p_player:id(profileApproval[1]),p_approved:b.approved},()=>({updated:true}));
  if(sharing)return send('sharing',{p_enrollment:id(sharing[1]),p_generation:id(b.generation),p_mode:b.mode,p_roster:b.roster??false,p_metrics:b.metrics??[],p_video:b.video??false,p_confirmed:b.confirmed},()=>({updated:true}));
  if(p?.[2]==='growth')return send('save_growth',{p_player:id(p[1]),p_date:b.date,p_height:b.height==null?null:canonicalMeasurement(b.height,b.height_unit,'height'),p_weight:b.weight==null?null:canonicalMeasurement(b.weight,b.weight_unit,'weight'),p_session:b.session_id==null?null:id(b.session_id),p_revision:b.revision??0,p_reason:b.reason??''},r=>projection(r,['id','revision']));
  if(p?.[2]==='performance'||a?.[2]==='correction'){
   if(!Object.hasOwn(protocols,b.protocol_id))throw Error();const common={p_protocol:b.protocol_id,p_value:canonicalMeasurement(b.value,b.unit,protocols[b.protocol_id]),p_date:b.date,p_evidence:b.evidence};
   if(a)return send('correct_performance',{...common,p_id:id(a[1]),p_revision:b.revision},()=>({updated:true}));
   return send('submit_performance',{...common,p_player:id(p[1]),p_key:id(b.request_key),p_official:b.official??false,p_video:b.video_id==null?null:id(b.video_id),p_supersedes:b.supersedes==null?null:id(b.supersedes)},r=>projection(r,['id','status','revision']));
  }
  if(a?.[2]==='review')return send('review_performance',{p_id:id(a[1]),p_decision:b.decision,p_note:b.note??'',p_revision:b.revision},()=>({updated:true}));
  return json({error:'Not found'},404,origin);
 }catch{return json({error:'Invalid request, units or identifiers'},400,origin);}
}
