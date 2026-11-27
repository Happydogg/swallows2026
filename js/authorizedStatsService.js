// SDL-004-LIVE-STATS-001: Read only the authorized athlete's measurement history.
// Uses the two pre-existing, independently role-checked staging RPCs.
// Never performs direct SELECT on public.sessions or widens table RLS.
import { supabaseClient } from './config.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS=['exit_velo','throwing_velo','sprint_time','broad_jump',
  'control_exit_velo','attack_angle','height_cm','weight_kg'];
const acceptedDate=s=>typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export async function fetchAuthorizedPlayerHistory(playerId,role,{client=supabaseClient,signal}={}){
  if(!UUID.test(String(playerId||'')))throw new Error('Invalid athlete identifier');
  if(!['coach','guardian'].includes(role))throw new Error('Unsupported statistics access role');
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const fn=role==='coach'?'sdl_004_pilot_coach_statistics':'sdl_004_player_statistics';
  const args=role==='coach'?{p_player:playerId}:{p_player_id:playerId};
  let request=client.rpc(fn,args);
  if(signal && typeof request.abortSignal==='function')request=request.abortSignal(signal);
  const {data,error}=await request;
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(error){
    const denied=String(error.code||'')==='42501'||/not authorized|permission denied|jwt|authentication/i.test(error.message||'');
    throw Object.assign(new Error(denied
      ? 'Your account cannot view this player history. Refresh membership or contact your club.'
      : 'Player history is temporarily unavailable. Please retry.'),{status:denied?403:503});
  }
  if(!Array.isArray(data)||data.length>200)throw new Error('Unexpected statistics response');
  const rows=data.map(row=>{
    if(row?.player_id!==playerId || !acceptedDate(row.session_date))
      throw new Error('Statistics response did not match the selected player');
    const result={id:row.id,player_id:playerId,session_date:row.session_date};
    for(const key of COLUMNS){
      if(row[key]==null || row[key]===''){result[key]=null;continue;}
      const n=Number(row[key]);
      if(!Number.isFinite(n))throw new Error('Invalid player measurement in response');
      result[key]=n;
    }
    return result;
  });
  rows.sort((a,b)=>a.session_date.localeCompare(b.session_date));
  return rows;
}
