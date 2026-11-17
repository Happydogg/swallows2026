// Explicit projections only: no legal names, family contact, DOB or registrations.
export const CLUBHOUSE_ROSTER_FIELDS=Object.freeze(['id','team_id','team_name','preferred_name','jersey','position','throws','bats']);
export const CLUBHOUSE_LEADERBOARD_FIELDS=Object.freeze(['id','player_id','team_id','team_name','metric','preferred_name','jersey','value','unit','rank','recorded_at','protocol_id','protocol_label','distance_m']);

export function filterLinkedPlayers(players, guardianLinks) {
  const linked=new Set((guardianLinks||[]).filter(g=>g?.status==='verified'&&g?.athlete_id).map(g=>g.athlete_id));
  return (players||[]).filter(p=>p?.athlete_id&&linked.has(p.athlete_id));
}

export function groupMyPlayers(players, guardianLinks, workspace=[]) {
  const linked=new Set((guardianLinks||[]).filter(g=>g?.status==='verified'&&g?.athlete_id).map(g=>g.athlete_id));
  const groups=new Map();
  for(const p of (players||[])) {
    if(!p?.athlete_id||!linked.has(p.athlete_id))continue;
    if(!groups.has(p.athlete_id))groups.set(p.athlete_id,{athlete_id:p.athlete_id,name:p.preferred_name||'My player',profiles:[],memberships:[]});
    const card=groups.get(p.athlete_id);
    if(!card.profiles.some(row=>row.id===p.id))card.profiles.push({clubLabel:workspace.find(w=>w.id===p.id&&w.is_guardian)?.organization_name||'Baseball profile',id:p.id,name:p.preferred_name||'My player',jersey:p.jersey??'--',position:p.position||'Not set',throws:p.throws||'--',bats:p.bats||'--'});
    for(const w of workspace.filter(w=>w.id===p.id&&w.is_guardian)) {
      if(!card.memberships.some(m=>m.organization_id===w.organization_id&&m.team_id===w.team_id))card.memberships.push({organization_id:w.organization_id,organization_name:w.organization_name||'Organization',team_id:w.team_id,team_name:w.team_name||'No active team'});
    }
  }
  return [...groups.values()];
}

export function coachTeams(roster,workspace=[]) {
  const teams=new Map();
  for(const p of [...(roster||[]),...(workspace||[]).filter(p=>p.is_coach)])if(p.team_id)teams.set(p.team_id,{id:p.team_id,name:p.team_name||'Team'});
  return [...teams.values()];
}

export function projectClubhouseRoster(items=[], teamId='') {
  if(!Array.isArray(items))return [];
  const result=[];
  for(const row of items) {
    if(!row||typeof row!=='object'||!row.id||!row.team_id)continue;
    if(teamId&&row.team_id!==teamId)continue;
    if(row.clubhouse_visible===false||row.consent_active===false||row.approved===false)continue;
    result.push({
      id:String(row.id),
      team_id:String(row.team_id),
      team_name:typeof row.team_name==='string'&&row.team_name.trim()?row.team_name.trim():'Team',
      preferred_name:typeof row.preferred_name==='string'&&row.preferred_name.trim()?row.preferred_name.trim():'Team player',
      jersey:row.jersey!=null&&String(row.jersey).trim()!==''?String(row.jersey).trim():'--',
      position:typeof row.position==='string'&&row.position.trim()?row.position.trim():'Not set',
      throws:typeof row.throws==='string'&&row.throws.trim()?row.throws.trim():'--',
      bats:typeof row.bats==='string'&&row.bats.trim()?row.bats.trim():'--'
    });
  }
  return result;
}

export function projectClubhouseLeaderboard(items=[], teamId='') {
  if(!Array.isArray(items))return [];
  const allowedMetrics=new Set(['exit_velo','throwing_velo','broad_jump','sprint_time']);
  const result=[];
  for(const row of items) {
    if(!row||typeof row!=='object'||!row.team_id||!allowedMetrics.has(row.metric))continue;
    if(teamId&&row.team_id!==teamId)continue;
    if(row.clubhouse_visible===false||row.consent_active===false||row.approved===false)continue;
    const numericValue=Number(row.value);
    if(!Number.isFinite(numericValue)||numericValue<=0)continue;
    result.push({
      id:String(row.id||`${row.team_id}:${row.metric}:${row.player_id||row.preferred_name||result.length}`),
      player_id:row.player_id?String(row.player_id):'',
      team_id:String(row.team_id),
      team_name:typeof row.team_name==='string'&&row.team_name.trim()?row.team_name.trim():'Team',
      metric:row.metric,
      preferred_name:typeof row.preferred_name==='string'&&row.preferred_name.trim()?row.preferred_name.trim():'Team player',
      jersey:row.jersey!=null&&String(row.jersey).trim()!==''?String(row.jersey).trim():'--',
      value:numericValue,
      unit:typeof row.unit==='string'&&row.unit.trim()?row.unit.trim():(row.metric==='sprint_time'?'s':row.metric==='broad_jump'?'cm':'km/h'),
      rank:Number.isInteger(row.rank)&&row.rank>0?row.rank:null,
      ...(typeof row.protocol_id==='string'?{protocol_id:row.protocol_id,protocol_label:typeof row.protocol_label==='string'?row.protocol_label:'',distance_m:row.distance_m==null?null:Number(row.distance_m)}:{}),
      recorded_at:typeof row.recorded_at==='string'?row.recorded_at:''
    });
  }
  return result;
}
