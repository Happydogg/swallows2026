// Staging-only irreversible deletion of previously authorized queue entries.
// No public cleanup endpoint, no browser-supplied object key, no bucket listing.
import {adminQuery,configOk,validId} from './pilot.mjs';
export const PURGE_CRON='*/5 * * * *';
const canonical=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function rpc(env,name,body) {
  const response=await adminQuery(env,'rpc/'+name,{method:'POST',body:JSON.stringify(body)});
  if(!response.ok)throw Error('Deletion ledger unavailable');
  return response.json();
}
async function processJob(env,job) {
  if(!job||!validId(job.id)||typeof job.player_id!=='string'||!canonical.test(job.player_id)||
    job.object_key!=='pilot/'+job.player_id+'/'+job.id+'.mp4'||typeof job.confirmed!=='boolean'||typeof job.due!=='boolean')
    throw Error('Invalid deletion ledger entry');
  if(!job.due)return job.confirmed;
  let absent=false;
  try {
    await env.MEDIA_BUCKET.delete(job.object_key);
    absent=(await env.MEDIA_BUCKET.head(job.object_key))===null;
  } catch { /* Record a durable retry below. */ }
  const acknowledged=await rpc(env,'sdl_v5_record_media_purge',{p_id:job.id,p_absent:absent});
  return absent&&acknowledged===true;
}
export async function purgeArchivedMedia(env,id=null) {
  if(!configOk(env)||env.MEDIA_ARCHIVE_ENABLED!=='true'||(id!==null&&!validId(id)))return false;
  const jobs=await rpc(env,'sdl_v5_media_purge_jobs',{p_id:id});
  if(!Array.isArray(jobs)||jobs.length>(id===null?10:1))throw Error('Invalid deletion queue');
  if(id!==null){
    if(jobs.length!==1||jobs[0].id!==id)return false;
    return processJob(env,jobs[0]);
  }
  let success=true;
  for(const job of jobs) {
    try { if(!await processJob(env,job))success=false; }
    catch { success=false; }
  }
  return success;
}
