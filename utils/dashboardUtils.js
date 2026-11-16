// Explicit projections only: no legal names, family contact, DOB or registrations.
export function groupMyPlayers(players, guardianLinks, workspace=[]) {
  const linked=new Set(guardianLinks.filter(g=>g.status==='verified').map(g=>g.athlete_id));
  const groups=new Map();
  for(const p of players) {
    if(!p.athlete_id||!linked.has(p.athlete_id))continue;
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
  for(const p of [...roster,...workspace.filter(p=>p.is_coach)])if(p.team_id)teams.set(p.team_id,{id:p.team_id,name:p.team_name||'Team'});
  return [...teams.values()];
}
