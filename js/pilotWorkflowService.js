import {SUBMISSION_FEATURES_ENABLED} from './config.js';
import {createPrivateMediaService,MediaError} from './privateMediaService.js';
export const PILOT_REVISION='sdl004-final-pilot-v1';
export function createPilotWorkflowService({auth,enabled=SUBMISSION_FEATURES_ENABLED,transport=createPrivateMediaService({auth})}){
 async function request(path,options={}){
  if(!enabled)throw new MediaError('Final pilot features await approved staging deployment and authorization tests.');
  const identity=auth.captureIdentity(),caps=await transport.requestJson('/v2/capabilities',{signal:options.signal});
  if(!auth.isCurrentIdentity(identity))throw new MediaError('Session changed.',401);
  if(caps.pilotWorkflow!==PILOT_REVISION)throw new MediaError('Final pilot backend contract unavailable.');
  const result=await transport.requestJson(path,options);
  if(!auth.isCurrentIdentity(identity))throw new MediaError('Session changed.',401);return result;
 }
 const id=value=>{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value??''))throw new MediaError('Invalid identifier.');return value;};
 const items=async(path,options)=>{const result=await request(path,options);if(!Array.isArray(result.items))throw new MediaError('Invalid response.');return result.items;};
 const post=(path,body,options)=>request(path,{...options,method:'POST',body});
 return{enabled,baseballProfile:(player,options)=>request(`/v2/players/${id(player)}/baseball-profile`,options),approveProfile:(player,approved,options)=>post(`/v2/players/${id(player)}/baseball-profile/approval`,{approved},options),administration:(org,options)=>request(`/v2/pilot/administration?organization_id=${id(org)}`,options),workspace:options=>request('/v2/pilot/workspace',options),
  growth:(player,options)=>items(`/v2/players/${id(player)}/growth`,options),
  saveGrowth:(player,body,options)=>post(`/v2/players/${id(player)}/growth`,body,options),
  performance:(player,options)=>items(`/v2/players/${id(player)}/performance`,options),
  submitPerformance:(player,body,options)=>post(`/v2/players/${id(player)}/performance`,body,options),
  correctPerformance:(row,body,options)=>post(`/v2/performance/${id(row.id)}/correction`,{...body,revision:row.revision},options),
  review:(row,decision,note,options)=>post(`/v2/performance/${id(row.id)}/review`,{decision,note,revision:row.revision},options),
  queue:(team,options)=>items(`/v2/performance/review?team_id=${id(team)}&status=all`,options),
  family:(player,options)=>request(`/v2/players/${id(player)}/family`,options),
  coachStatistics:(player,options)=>items(`/v2/players/${id(player)}/coach-statistics`,options),
  contacts:(scope,options)=>items(`/v2/staff/contacts?team_id=${id(scope.team_id)}&purpose=${encodeURIComponent(scope.permission)}`,options),
  invitations:(org,options)=>items(`/v2/onboarding/invitations?organization_id=${id(org)}`,options),
  invitationPlayers:(org,options)=>items(`/v2/onboarding/players?organization_id=${id(org)}`,options),
  issue:(player,email,options)=>post('/v2/onboarding/invitations',{player_id:id(player),email},options),
  revoke:(row,options)=>post('/v2/onboarding/invitations/revoke',{id:id(row.id)},options),
  redeem:(token,options)=>post('/v2/onboarding/invitations/redeem',{token},options),
  sharing:(row,choices,options)=>post(`/v2/club-enrollments/${id(row.id)}/sharing`,{generation:id(row.generation),...choices},options),
  permission:(body,options)=>post('/v2/staff/permissions',body,options)
 };
}
