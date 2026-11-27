// MEDIA-03B-06: verified account projection is a UI/request guard, never authorization.
const roles=['coach','club_admin'];
const validId=v=>typeof v==='string'&&v.length>0;
export const reviewCategories=['pitching','batting','throwing'];
export const scopeKey=s=>s?JSON.stringify([s.role,s.organizationId||'',s.scopeTeamId||'']):'';
export function resolveReviewScope({context,userId,ready,denied,origin,mode,organizationId='',teamId=''}){
 const role=mode==='coach'?'coach':mode==='admin'?'club_admin':'';
 if(!ready||denied||!origin||!validId(userId)||context?.user_id!==userId||!roles.includes(role)||!context.roles?.includes(role))return null;
 const orgs=(context.organizations||[]).filter(o=>o.roles?.includes(role));
 const teams=(context.teams||[]).filter(t=>t.roles?.includes(role)&&(!organizationId||t.organization_id===organizationId));
 if(organizationId&&!orgs.some(o=>o.id===organizationId))return null;
 if(teamId&&!teams.some(t=>t.id===teamId))return null;
 if(role==='coach'&&!teams.length)return null;
 if(role==='club_admin'&&!orgs.length)return null;
 return {role,...(organizationId?{organizationId}:{}),...(teamId?{scopeTeamId:teamId}:{})};
}
export function validReviewRow(row,scope,filters={}){
 if(!row||!scope||!roles.includes(scope.role)||!validId(row.id)||!validId(row.playerId)||typeof row.playerLabel!=='string'||typeof row.teamLabel!=='string'||!Array.isArray(row.teamIds)||row.teamIds.some(x=>!validId(x))||new Set(row.teamIds).size!==row.teamIds.length||row.status!=='pending'||row.can_review!==true||!reviewCategories.includes(row.category))return false;
 if(row.teamId===null){if(row.teamIds.length||scope.role!=='club_admin'||scope.scopeTeamId)return false;}
 else if(!validId(row.teamId)||!row.teamIds.includes(row.teamId))return false;
 return (!scope.scopeTeamId||row.teamIds.includes(scope.scopeTeamId))&&(!filters.teamId||row.teamIds.includes(filters.teamId))&&(!filters.playerId||row.playerId===filters.playerId)&&(!filters.category||row.category===filters.category)&&(!filters.mediaId||row.id===filters.mediaId);
}
export function uniqueReviewRows(rows,scope,filters={}){
 const seen=new Set();return (Array.isArray(rows)?rows:[]).filter(row=>{if(!validReviewRow(row,scope,filters)||seen.has(row.id))return false;seen.add(row.id);return true;});
}
