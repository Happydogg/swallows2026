import { SUBMISSION_FEATURES_ENABLED } from './config.js';
import { createPrivateMediaService, MediaError } from './privateMediaService.js';
export const SUBMISSION_REVISION='sdl004-submissions-v1';
const uuid=value=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value??''))throw new MediaError('Invalid identifier.');return value;};
const categoryValue=value=>{if(!['pitching','batting','throwing'].includes(value))throw new MediaError('Invalid video category.');return value;};
const text=value=>typeof value==='string'?value:'';
const rows=data=>{if(!Array.isArray(data?.items))throw new MediaError('Invalid server response.');return data.items;};
const status=value=>{if(!['pending','approved','rejected'].includes(value))throw new MediaError('Invalid submission status.');return value;};
export function createSubmissionService({auth,enabled=SUBMISSION_FEATURES_ENABLED,transport=createPrivateMediaService({auth})}) {
  let verified=null;
  async function ready(options) {
    if(!enabled)throw new MediaError('Submissions, reviews and Clubhouse await verified backend deployment.');
    if(verified&&auth.isCurrentIdentity(verified))return;
    const identity=auth.captureIdentity();
    const caps=await transport.requestJson('/v2/capabilities',options);
    if(!auth.isCurrentIdentity(identity))throw new MediaError('Session changed.',401);
    if(caps.revision!==SUBMISSION_REVISION||caps.submissions!==true||caps.review!==true||caps.clubhouse!==true)throw new MediaError('The required backend contract is unavailable.');
    verified=identity;
  }
  const project=item=>({id:uuid(item.id),player_id:uuid(item.player_id),category:categoryValue(item.category),status:status(item.status),
    share_with_team:item.share_with_team===true,can_consent:item.can_consent===true,can_review:item.can_review===true,created_at:text(item.created_at),review_note:String(item.review_note??''),
    history:Array.isArray(item.history)?item.history.map(h=>({action:String(h.action??''),at:text(h.at),note:typeof h.note==='string'?h.note:''})):[],
    preferred_name:typeof item.preferred_name==='string'?item.preferred_name:'Player',team_id:item.team_id?uuid(item.team_id):null,team_name:text(item.team_name)});
  return {
    enabled,
    async workspace(options) {await ready(options);return rows(await transport.requestJson('/v2/workspace',options)).map(p=>({
      id:uuid(p.id),athlete_id:p.athlete_id?uuid(p.athlete_id):null,preferred_name:String(p.preferred_name??'Player'),
      organization_id:p.organization_id?uuid(p.organization_id):null,organization_name:text(p.organization_name),team_id:p.team_id?uuid(p.team_id):null,team_name:text(p.team_name),
      is_guardian:p.is_guardian===true,is_coach:p.is_coach===true,can_clubhouse:p.can_clubhouse===true}));},
    async list(player,options) {await ready(options);return rows(await transport.requestJson(`/v2/submissions?player_id=${uuid(player)}`,options)).map(project);},
    async queue(team,filter='pending',options) {await ready(options);if(!['all','pending','approved','rejected'].includes(filter))throw new MediaError('Invalid filter.');return rows(await transport.requestJson(`/v2/review?team_id=${uuid(team)}&status=${filter}`,options)).map(project);},
    async clubhouse(team,options) {await ready(options);return rows(await transport.requestJson(`/v2/clubhouse?team_id=${uuid(team)}`,options)).map(p=>({
      id:uuid(p.id),player_id:uuid(p.player_id),category:categoryValue(p.category),created_at:text(p.created_at),preferred_name:typeof p.preferred_name==='string'?p.preferred_name:'Team player'}));},
    async submit(player,file,metadata,options) {await ready(options);return transport.submit(uuid(player),file,metadata,options);},
    async review(id,decision,note,options) {await ready(options);status(decision);if(decision==='pending'||typeof note!=='string'||note.length>1000)throw new MediaError('Invalid review.');return transport.requestJson(`/v2/submissions/${uuid(id)}/review`,{...options,method:'POST',body:{decision,note}});},
    async consent(id,share,options,teamIds=[]) {await ready(options);if(typeof share!=='boolean')throw new MediaError('Invalid consent.');return transport.requestJson(`/v2/submissions/${uuid(id)}/consent`,{...options,method:'POST',body:{share_with_team:share,team_ids:share?teamIds.map(uuid):[]}});},
    async playback(id,options) {await ready(options);return transport.submissionPlayback(uuid(id),options);}
  };
}
