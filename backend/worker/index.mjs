// Complete staging entrypoint. No production target or automatic provisioning.
import { verifyIdentity,adminQuery,limitedBytes,configOk,validId,json,ORIGINS } from './pilot.mjs';
import { createSubmissionRoutes } from './submissionRoutes.mjs';
import {mediaAction, mediaGates} from './mediaGates.mjs';
import {purgeArchivedMedia,PURGE_CRON} from './mediaPurge.mjs';
const submissions=createSubmissionRoutes({verifyIdentity,adminQuery,limitedBytes,configOk,validId,json,ORIGINS});
export default {
  async scheduled(controller,env) {
    if(controller.cron!==PURGE_CRON||env.MEDIA_ARCHIVE_ENABLED!=='true')return;
    if(!await purgeArchivedMedia(env))throw Error('Staging media purge retry pending');
  },
  async fetch(request,env) {
    const path=new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    const origin=request.headers.get('Origin');
    if(origin&&!ORIGINS.has(origin)) return json({error:'Origin not allowed'},403);
    if(path==='/health' && request.method==='GET')
      return json({service:'sdl-r2-staging',status:'v5.1'},200,origin);
    if(path==='/v1/authorize' || path==='/v1/media' || path.startsWith('/v1/media/'))
      return json({error:'Legacy media route retired',code:'media_retired'},410,origin);
    if(!path.startsWith('/v2/')) return json({error:'Not found'},404,origin);
    if(request.method==='OPTIONS') {
      if(!ORIGINS.has(origin)) return json({error:'Origin required'},403);
      return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,
        'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,Range,Idempotency-Key',
        'Access-Control-Max-Age':'600','Vary':'Origin'}});
    }
    const action=mediaAction(path,request.method);
    if(action && env[mediaGates[action]]!=='true')
      return json({error:'This media action is disabled',code:'media_disabled'},503,origin);
    if(!action && env.SUBMISSIONS_ENABLED!=='true') return json({error:'Submission backend is disabled'},503,origin);
    try { return await submissions.fetch(request,env); }
    catch { return json({error:'Submission service unavailable'},503,origin); }
  }
};
