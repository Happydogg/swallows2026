import { SUBMISSION_FEATURES_ENABLED } from './config.js';
import { createPrivateMediaService, MediaError } from './privateMediaService.js';
import { projectClubhouseRoster, projectClubhouseLeaderboard } from '../utils/dashboardUtils.js';
export const STATISTICS_CONSENT_POLICY_VERSION='sdl004-baseball-statistics-v1';
export const CLUB_CONSENT_POLICY_VERSION='sdl004-clubhouse-v1';
export const SUBMISSION_REVISION='sdl004-club-enrollment-v2';
const uuid=value=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value??''))throw new MediaError('Invalid identifier.');return value;};
const categoryValue=value=>{if(!['pitching','batting','throwing'].includes(value))throw new MediaError('Invalid video category.');return value;};
const text=value=>typeof value==='string'?value:'';
const rows=data=>{if(!Array.isArray(data?.items))throw new MediaError('Invalid server response.');return data.items;};
const status=value=>{if(!['pending','approved','rejected'].includes(value))throw new MediaError('Invalid submission status.');return value;};
export function createSubmissionService({auth,enabled=SUBMISSION_FEATURES_ENABLED,transport=createPrivateMediaService({auth})}) {
  let verified=null,adminAvailable=false,rosterAvailable=false,leaderboardAvailable=false,parentStatsAvailable=false,statisticsConsentAvailable=false;
  async function ready(options) {
    if(!enabled)throw new MediaError('Submissions, reviews and Clubhouse await verified backend deployment.');
    if(verified&&auth.isCurrentIdentity(verified))return;
    const identity=auth.captureIdentity();
    const caps=await transport.requestJson('/v2/capabilities',options);
    if(!auth.isCurrentIdentity(identity))throw new MediaError('Session changed.',401);
    if(caps.revision!==SUBMISSION_REVISION||caps.submissions!==true||caps.review!==true||caps.clubhouse!==true||caps.clubConsent!==true)throw new MediaError('The required backend contract is unavailable.');
    adminAvailable=caps.enrollmentAdmin===true;
    rosterAvailable=caps.clubhouseRoster===true;
    leaderboardAvailable=caps.clubhouseLeaderboard===true;
    parentStatsAvailable=caps.parentStatistics===true;
    statisticsConsentAvailable=caps.statisticsConsent===true;
    verified=identity;
  }
  async function readyAdmin(options){await ready(options);if(!adminAvailable)throw new MediaError('Enrollment administration backend awaits deployment and verification.');}
  async function readyClubhouseRoster(options){await ready(options);if(!rosterAvailable)throw new MediaError('Parent-safe Clubhouse team roster endpoint awaits backend implementation.');}
  async function readyClubhouseLeaderboard(options){await ready(options);if(!leaderboardAvailable)throw new MediaError('Parent-safe Clubhouse leaderboard endpoint awaits backend implementation.');}
  const project=item=>({id:uuid(item.id),player_id:uuid(item.player_id),category:categoryValue(item.category),status:status(item.status),
    athlete_id:item.athlete_id?uuid(item.athlete_id):null,source_kind:text(item.source_kind),publication_team_ids:Array.isArray(item.publication_team_ids)?item.publication_team_ids.map(uuid):[],can_publish:item.can_publish===true,can_review:item.can_review===true,created_at:text(item.created_at),review_note:String(item.review_note??''),
    history:Array.isArray(item.history)?item.history.map(h=>({action:String(h.action??''),at:text(h.at),note:typeof h.note==='string'?h.note:''})):[],
    preferred_name:typeof item.preferred_name==='string'?item.preferred_name:'Player',team_id:item.team_id?uuid(item.team_id):null,team_name:text(item.team_name)});
  return {
    enabled,
    hasStatisticsConsent:()=>Boolean(verified&&auth.isCurrentIdentity(verified)&&statisticsConsentAvailable),
    async statisticConsents(athlete,options){
      await ready(options);if(!statisticsConsentAvailable)throw new MediaError('Statistics consent contract unavailable.');
      return rows(await transport.requestJson(`/v2/statistic-consents?athlete_id=${uuid(athlete)}`,options)).map(row=>{
        if(!Array.isArray(row.metrics)||row.metrics.some(m=>!['exit_velo','throwing_velo','sprint_time','broad_jump'].includes(m)))throw new MediaError('Invalid statistic consent.');
        return {id:uuid(row.id),generation:uuid(row.generation),organization_id:uuid(row.organization_id),organization_name:text(row.organization_name),status:text(row.status),share_roster:row.share_roster===true,metrics:[...row.metrics],policy_version:text(row.policy_version)};
      });
    },
    async setStatisticConsent(row,roster,metrics,options){
      await ready(options);if(!statisticsConsentAvailable)throw new MediaError('Statistics consent contract unavailable.');
      if(typeof roster!=='boolean'||!Array.isArray(metrics)||metrics.length>4||metrics.some(m=>!['exit_velo','throwing_velo','sprint_time','broad_jump'].includes(m))||new Set(metrics).size!==metrics.length||(!roster&&metrics.length))throw new MediaError('Invalid statistic consent.');
      return transport.requestJson(`/v2/club-enrollments/${uuid(row.id)}/statistics-consent`,{...options,method:'POST',body:{generation:uuid(row.generation),roster,metrics,policy_version:roster?STATISTICS_CONSENT_POLICY_VERSION:null}});
    },
    hasParentStatistics:()=>Boolean(verified&&auth.isCurrentIdentity(verified)&&parentStatsAvailable),
    async playerStatistics(player,options){
      await ready(options);if(!parentStatsAvailable)throw new MediaError('Parent-safe statistics contract unavailable.');
      const pid=uuid(player),data=rows(await transport.requestJson(`/v2/players/${pid}/statistics`,options));
      if(data.length>200)throw new MediaError('Invalid statistics history.');
      return data.map(row=>{
        if(row.player_id!==pid||typeof row.session_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.session_date)||!Number.isFinite(Date.parse(row.session_date)))throw new MediaError('Invalid statistics response.');
        const result={id:uuid(row.id),player_id:pid,session_date:row.session_date};
        for(const key of ['exit_velo','throwing_velo','sprint_time','broad_jump','control_exit_velo','attack_angle','height_cm','weight_kg']){
          const value=row[key];if(value!=null&&((typeof value!=='number'&&typeof value!=='string')||value===''||!Number.isFinite(Number(value))))throw new MediaError('Invalid statistic value.');
          result[key]=value==null?null:Number(value);
        }return result;
      }).sort((a,b)=>b.session_date.localeCompare(a.session_date)||b.id.localeCompare(a.id));
    },
    hasClubhouseRoster:()=>Boolean(verified&&auth.isCurrentIdentity(verified)&&rosterAvailable),
    hasClubhouseLeaderboard:()=>Boolean(verified&&auth.isCurrentIdentity(verified)&&leaderboardAvailable),
    async adminOrganizations(options){await readyAdmin(options);return rows(await transport.requestJson('/v2/admin/organizations',options)).map(o=>({id:uuid(o.id),name:text(o.name)}));},
    async adminEnrollments(organization,query='',options){await readyAdmin(options);uuid(organization);
      if(typeof query!=='string'||query.length>100)throw new MediaError('Search is limited to 100 characters.');
      const encoded=encodeURIComponent(query.trim()).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16));
      return rows(await transport.requestJson(`/v2/admin/enrollments?organization_id=${organization}&q=${encoded}`,options)).map(e=>{
        if(e.organization_id!==organization||!['active','inactive','ended','not_enrolled'].includes(e.status))throw new MediaError('Invalid organization enrollment response.');
        if(e.status==='not_enrolled'?(e.enrollment_id!=null||e.generation!=null):(!e.enrollment_id||!e.generation))throw new MediaError('Invalid enrollment identity.');
        return {athlete_id:uuid(e.athlete_id),preferred_name:text(e.preferred_name),organization_id:uuid(e.organization_id),enrollment_id:e.enrollment_id?uuid(e.enrollment_id):null,
          generation:e.generation?uuid(e.generation):null,status:e.status,started_at:text(e.started_at),ended_at:text(e.ended_at),recording_storage_authorized:e.recording_storage_authorized===true,
          recording_active:e.recording_active===true,recording_permission_ref:text(e.recording_permission_ref),consent_active:e.consent_active===true,consent_policy_version:text(e.consent_policy_version)};
      });},
    async setEnrollment(row,nextStatus,options){await readyAdmin(options);if(!['active','inactive','ended'].includes(nextStatus))throw new MediaError('Invalid enrollment status.');
      return transport.requestJson('/v2/club-enrollments',{...options,method:'POST',body:{athlete_id:uuid(row.athlete_id),organization_id:uuid(row.organization_id),status:nextStatus,enrollment_id:row.enrollment_id?uuid(row.enrollment_id):null}});},
    async setRecordingPermission(row,allowed,evidence,options){await readyAdmin(options);
      if(typeof allowed!=='boolean'||typeof evidence!=='string'||!evidence.trim()||evidence.trim().length>500)throw new MediaError('A reviewed evidence reference is required (up to 500 characters).');
      return transport.requestJson(`/v2/club-enrollments/${uuid(row.enrollment_id)}/recording`,{...options,method:'POST',body:{allowed,permission_ref:evidence.trim()}});},
    async workspace(options) {await ready(options);return rows(await transport.requestJson('/v2/workspace',options)).map(p=>({
      id:uuid(p.id),athlete_id:p.athlete_id?uuid(p.athlete_id):null,preferred_name:String(p.preferred_name??'Player'),
      organization_id:p.organization_id?uuid(p.organization_id):null,organization_name:text(p.organization_name),team_id:p.team_id?uuid(p.team_id):null,team_name:text(p.team_name),
      is_guardian:p.is_guardian===true,is_coach:p.is_coach===true,can_clubhouse:p.can_clubhouse===true}));},
    async list(player,options) {await ready(options);return rows(await transport.requestJson(`/v2/submissions?player_id=${uuid(player)}`,options)).map(project);},
    async queue(team,filter='pending',options) {await ready(options);if(!['all','pending','approved','rejected'].includes(filter))throw new MediaError('Invalid filter.');return rows(await transport.requestJson(`/v2/review?team_id=${uuid(team)}&status=${filter}`,options)).map(project);},
    async clubhouse(team,options) {await ready(options);return rows(await transport.requestJson(`/v2/clubhouse?team_id=${uuid(team)}`,options)).map(p=>({
      id:uuid(p.id),player_id:uuid(p.player_id),category:categoryValue(p.category),created_at:text(p.created_at),preferred_name:typeof p.preferred_name==='string'?p.preferred_name:'Team player'}));},
    async clubhouseRoster(team,options) {
      await readyClubhouseRoster(options);
      const teamUuid=uuid(team);
      const raw=rows(await transport.requestJson(`/v2/clubhouse/roster?team_id=${teamUuid}`,options));
      return projectClubhouseRoster(raw,teamUuid).map(r=>({...r,id:uuid(r.id),team_id:uuid(r.team_id)}));
    },
    async clubhouseLeaderboard(team,options) {
      await readyClubhouseLeaderboard(options);
      const teamUuid=uuid(team);
      const raw=rows(await transport.requestJson(`/v2/clubhouse/leaderboard?team_id=${teamUuid}`,options));
      return projectClubhouseLeaderboard(raw,teamUuid).map(r=>({...r,team_id:uuid(r.team_id),player_id:r.player_id?uuid(r.player_id):''}));
    },
    async submit(player,file,metadata,options) {await ready(options);return transport.submit(uuid(player),file,metadata,options);},
    async review(id,decision,note,options) {await ready(options);status(decision);if(decision==='pending'||typeof note!=='string'||note.length>1000)throw new MediaError('Invalid review.');return transport.requestJson(`/v2/submissions/${uuid(id)}/review`,{...options,method:'POST',body:{decision,note}});},
    async enrollments(athlete,options) {await ready(options);return rows(await transport.requestJson(`/v2/club-consents?athlete_id=${uuid(athlete)}`,options)).map(e=>({
      id:uuid(e.id),generation:uuid(e.generation),athlete_id:uuid(e.athlete_id),organization_id:uuid(e.organization_id),organization_name:text(e.organization_name),status:text(e.status),
      consent_active:e.consent_active===true,policy_version:text(e.policy_version),accepted_at:text(e.accepted_at),withdrawn_at:text(e.withdrawn_at),
      history:Array.isArray(e.history)?e.history.map(h=>({action:text(h.action),at:text(h.at),policy_version:text(h.policy_version)})):[]}));},
    async clubConsent(enrollment,accept,options) {await ready(options);if(typeof accept!=='boolean')throw new MediaError('Explicit consent decision required.');
      return transport.requestJson(`/v2/club-enrollments/${uuid(enrollment.id)}/consent`,{...options,method:'POST',body:{generation:uuid(enrollment.generation),accept,policy_version:accept?CLUB_CONSENT_POLICY_VERSION:null}});},
    async publish(id,teamIds,subjectAthletes,options) {await ready(options);
      if(!Array.isArray(teamIds)||teamIds.length>20||!Array.isArray(subjectAthletes)||(teamIds.length&&subjectAthletes.length!==1))throw new MediaError('Only a confirmed single-athlete clip can be published.');
      return transport.requestJson(`/v2/submissions/${uuid(id)}/publish`,{...options,method:'POST',body:{team_ids:teamIds.map(uuid),subject_athletes:subjectAthletes.map(uuid)}});},
    async playback(id,options) {await ready(options);return transport.submissionPlayback(uuid(id),options);}
  };
}
