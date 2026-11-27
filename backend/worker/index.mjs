// Complete staging entrypoint. No production target or automatic provisioning.
import pilot, { verifyIdentity,adminQuery,limitedBytes,configOk,validId,json,ORIGINS } from './pilot.mjs';
import { createSubmissionRoutes } from './submissionRoutes.mjs';
const submissions=createSubmissionRoutes({verifyIdentity,adminQuery,limitedBytes,configOk,validId,json,ORIGINS});
export default {
  async fetch(request,env,ctx) {
    const path=new URL(request.url).pathname;
    if(!path.startsWith('/v2/')) return pilot.fetch(request,env,env.SUBMISSIONS_ENABLED==='true' ? submissions : undefined);
    const origin=request.headers.get('Origin');
    if(origin&&!ORIGINS.has(origin)) return json({error:'Origin not allowed'},403);
    if(request.method==='OPTIONS') {
      if(!ORIGINS.has(origin)) return json({error:'Origin required'},403);
      return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,
        'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,Range,Idempotency-Key',
        'Access-Control-Max-Age':'600','Vary':'Origin'}});
    }
    if(env.SUBMISSIONS_ENABLED!=='true') return json({error:'Submission backend is disabled'},503,origin);
    try { return await submissions.fetch(request,env); }
    catch { return json({error:'Submission service unavailable'},503,origin); }
  }
};
