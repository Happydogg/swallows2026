import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
export const PLAYER = '11111111-1111-4111-8111-111111111111';
export const OTHER = '22222222-2222-4222-8222-222222222222';
export const VIDEO = '33333333-3333-4333-8333-333333333333';
export const USER = '44444444-4444-4444-8444-444444444444';
export const ORIGIN = 'http://localhost:5500';
export const bytes = new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109]);
export async function workerHarness(role = 'coach') {
  const h = { role, records: [], objects: new Map(), calls: [], writes: 0, deletes: 0, expired: false };
  const env = { SUPABASE_URL: 'https://wvurolqbjhuckkkjiiiv.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', SUPABASE_SECRET_KEY: 'sb_secret_synthetic',
    MEDIA_BUCKET: {
      async put(key, value) { if (h.failPut) throw Error('R2 failed'); h.writes++; h.objects.set(key, value); },
      async delete(key) { h.deletes++; h.objects.delete(key); },
      async get(key, options) { const value = h.objects.get(key); if (!value) return null;
        const requested = options?.range?.get('Range');
        if (!requested) return {body:new Blob([value]).stream(),size:value.byteLength};
        const [,start,end] = /^bytes=(\d+)-(\d*)$/.exec(requested);
        const offset=Number(start), limit=end ? Math.min(Number(end)+1,value.byteLength) : value.byteLength;
        if(offset>=limit) return null;
        return {body:new Blob([value.slice(offset,limit)]).stream(),size:value.byteLength,range:{offset,length:limit-offset}}; }
    }
  };
  const fetchMock = async (url, init = {}) => {
    assert.equal(url.startsWith(env.SUPABASE_URL + '/'), true, 'only staging Supabase calls');
    h.calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return h.expired ? new Response(null, { status: 401 }) : Response.json({ id: h.actor??USER });
    const rpc = url.split('/rpc/')[1];
    if (rpc && init.headers.apikey === env.SUPABASE_PUBLISHABLE_KEY) {
      if (h.failRpc) return new Response(null, { status: 503 });
      const body = JSON.parse(init.body);
      if(h.rpcOverride)return h.rpcOverride(rpc,body);
      if (rpc === 'sdl_004_media_can_access') return Response.json(body.p_player_id === PLAYER &&
        (h.role === 'coach' || (h.role === 'parent' && body.p_action === 'read')));
      if (rpc === 'sdl_004_session_active') return Response.json(!h.expired&&!h.revoked);
      if (rpc === 'sdl_004_submission_contract') return Response.json({revision:h.revision??'sdl004-club-enrollment-v2',rbacVersion:5,mediaRevision:'v5.1-clean-start',enrollmentAdmin:h.adminContract!==false,clubhouseRoster:h.statisticsContract!==false,clubhouseLeaderboard:h.statisticsContract!==false,parentStatistics:h.statisticsContract!==false,statisticsConsent:h.statisticsContract!==false,pilotWorkflow:h.finalPilot?'sdl004-final-pilot-v1':null});
      if(rpc.startsWith('sdl_004_pilot_')&&h.pilotRpc)return h.pilotRpc(rpc,body);
      if(['sdl_004_clubhouse_roster','sdl_004_clubhouse_leaderboard','sdl_004_player_statistics'].includes(rpc)){
        if(h.statisticsStatus)return new Response(null,{status:h.statisticsStatus});
        const allowed=rpc==='sdl_004_player_statistics'?h.role==='parent'&&body.p_player_id===PLAYER:['coach','parent','teammate'].includes(h.role)&&body.p_team_id===OTHER;
        return allowed?Response.json(h.statisticsRows??[]):new Response(null,{status:403});
      }
      if(rpc==='sdl_004_set_statistic_consent')return h.role==='parent'?Response.json(null):new Response(null,{status:403});
      if(rpc==='sdl_004_list_statistic_consents')return Response.json([]);
      if (rpc === 'sdl_004_reserve_submission') {
        if(h.conflict)return new Response(null,{status:409});
        if(h.completed)return Response.json({state:'complete',id:VIDEO,player_id:PLAYER,category:'pitching',status:'pending',share_with_team:false});
        h.savedSubmission = {p_user_id:USER,p_category:body.p_category}; return Response.json({state:'reserved',id:VIDEO,object_key:`pilot/${PLAYER}/${VIDEO}.mp4`}); }
      if (rpc === 'sdl_004_submission_can_submit') return Response.json(body.p_player_id === PLAYER && ['coach','parent'].includes(h.role));
      if(rpc==='sdl_004_club_consent')return h.role==='parent'?Response.json(null):new Response(null,{status:403});
      if(rpc==='sdl_004_admin_organizations')return Response.json(h.role==='admin'?(h.adminOrgIds??[OTHER]).map(id=>({id,name:'Authorized club'})):[]);
      if(rpc==='sdl_004_admin_enrollments')return h.role==='admin'&&(h.adminOrgIds??[OTHER]).includes(body.p_organization)?Response.json(h.adminRows??[]):new Response(null,{status:403});
      if(rpc==='sdl_004_set_club_enrollment')return h.role==='admin'&&(h.adminOrgIds??[OTHER]).includes(body.p_organization)?Response.json(VIDEO):new Response(null,{status:403});
      if(rpc==='sdl_004_set_recording_permission')return h.role==='admin'&&(h.adminOrgIds??[OTHER]).includes((h.enrollmentOrganizations??{[VIDEO]:OTHER})[body.p_enrollment])?Response.json(null):new Response(null,{status:403});
      if(rpc==='sdl_004_list_club_consents')return Response.json([]);
      if(rpc==='sdl_004_publish_submission')return h.role==='coach'&&h.approved&&h.consent?Response.json(null):new Response(null,{status:403});
      if (rpc === 'sdl_004_submission_is_guardian') return Response.json(h.role === 'parent');
      if (rpc === 'sdl_004_review_submission') return h.role === 'coach'&&!h.selfReview ? Response.json(null) : new Response(null, { status: 403 });
      if (rpc === 'sdl_004_submission_can_read' || rpc === 'sdl_v5_authorize_playback') return Response.json(h.role === 'parent' || h.role === 'coach' ||
        (h.role === 'teammate' && h.approved && h.consent));
      if (rpc === 'sdl_004_clubhouse_videos') return Response.json(h.approved && h.consent && h.role === 'teammate' ? [{ id: VIDEO, player_id: PLAYER, category: 'pitching' }] : []);
      if (rpc === 'sdl_004_list_submissions') return Response.json(h.role === 'parent' || h.role === 'coach' ? h.records : []);
      return new Response(null, { status: 403 });
    }
    assert.equal(init.headers.apikey, env.SUPABASE_SECRET_KEY);
    assert.equal(init.headers.Authorization, undefined, 'never confuse browser bearer and service key');
    if (h.failMetadata) return new Response(null, { status: 503 });
    if (rpc === 'sdl_004_finish_submission') return Response.json({id:VIDEO,player_id:PLAYER,category:h.savedSubmission.p_category,status:'pending',share_with_team:false});
    if (init.method === 'POST') { h.records.push(JSON.parse(init.body)); return new Response(null, { status: 201 }); }
    return Response.json(h.records);
  };
  const context = vm.createContext({ fetch: fetchMock, Headers, Request, Response, URL, Uint8Array, TextEncoder, TextDecoder, crypto: webcrypto });
  const source = fs.readFileSync(new URL('../../backend/verified/staging-worker.phase2.mjs', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source + '\nexport { verifyIdentity, adminQuery, limitedBytes, configOk, validId, json, ORIGINS };', { context });
  await module.link(() => { throw Error('unexpected dependency'); }); await module.evaluate();
  h.worker = module.namespace.default;
  const cache=new Map();
  function load(file){if(!cache.has(file.href))cache.set(file.href,new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file.href}));return cache.get(file.href);}
  const packaged=load(new URL('../../backend/worker/index.mjs',import.meta.url));
  await packaged.link((specifier,parent)=>load(new URL(specifier,parent.identifier)));await packaged.evaluate();h.packaged=packaged.namespace.default;
  h.proposal = load(new URL('../../backend/worker/submissionRoutes.mjs',import.meta.url)).namespace.createSubmissionRoutes(module.namespace);
  h.env = env;
  h.request = (path, { method = 'GET', body, auth = true, origin = ORIGIN, contentType = 'video/mp4' } = {}) => new Request('https://sdl-r2-staging-gate.sampson-ho.workers.dev' + path,
    { method, headers: { Origin: origin, 'Idempotency-Key': VIDEO, ...(auth ? { Authorization: 'Bearer synthetic' } : {}),
      ...(body ? { 'Content-Type': contentType, 'Content-Length': String(body.byteLength ?? body.length) } : {}) }, ...(body ? { body } : {}) });
  h.seed = () => { const key = `pilot/${PLAYER}/${VIDEO}.mp4`;
    h.records = [{ id: VIDEO, player_id: PLAYER, object_key: key, byte_size: bytes.length, content_type: 'video/mp4' }];
    h.objects.set(key, bytes); };
  return h;
}
