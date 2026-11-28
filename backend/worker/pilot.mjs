// Existing verified pilot; helpers exported for the additive v2 router.
/**
 * SDL-004 R2 Phase 2 STAGING-ONLY PRIVATE MEDIA PILOT
 * Requires staging SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
 * SUPABASE_SECRET_KEY (Cloudflare SECRET ONLY), and MEDIA_BUCKET binding.
 * 20 MiB MP4 uploads; no DELETE, no public media URLs, no client chosen R2 keys.
 * Replace only sdl-r2-staging-gate after staging SQL migration passes.
 */
const STAGING_URL = 'https://wvurolqbjhuckkkjiiiv.supabase.co';
const ORIGINS = new Set(['http://127.0.0.1:5500', 'http://localhost:5500']);
const LIMIT = 20 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(value, status, origin) {
  const h = new Headers({ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  if (ORIGINS.has(origin)) { h.set('Access-Control-Allow-Origin', origin); h.set('Vary','Origin'); }
  return new Response(JSON.stringify(value), {status, headers:h});
}
const validId = s => typeof s === 'string' && UUID.test(s);
function configOk(env) {
  return env.SUPABASE_URL === STAGING_URL &&
    typeof env.SUPABASE_PUBLISHABLE_KEY === 'string' && env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_') &&
    typeof env.SUPABASE_SECRET_KEY === 'string' && env.SUPABASE_SECRET_KEY.startsWith('sb_secret_') &&
    !!env.MEDIA_BUCKET;
}
async function verifyIdentity(request, env) {
  const bearer = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+[^\s]+$/i.test(bearer)) return { error:'Authentication required', status:401 };
  let res;
  try {
    res = await fetch(`${STAGING_URL}/auth/v1/user`, {
      headers:{apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization:bearer}, redirect:'manual'
    });
  } catch { return {error:'Identity provider unavailable', status:503}; }
  if (res.status !== 200) return {error:'Invalid or expired session',status:401};
  const user = await res.json().catch(()=>null);
  if (!validId(user?.id)) return {error:'Invalid identity response',status:401};
  return { bearer, userId: user.id };
}
async function canAccess(env, bearer, playerId, action) {
  try {
    const res = await fetch(`${STAGING_URL}/rest/v1/rpc/sdl_004_media_can_access`, {
      method:'POST',redirect:'manual',
      headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY, Authorization:bearer,'Content-Type':'application/json'},
      body:JSON.stringify({p_player_id:playerId,p_action:action})
    });
    if (!res.ok) return null;
    return (await res.json()) === true;
  } catch { return null; }
}
async function adminQuery(env, path, options={}) {
  // No browser token is forwarded. Secret key stays only in Cloudflare.
  return fetch(`${STAGING_URL}/rest/v1/${path}`, {
    ...options,redirect:'manual',
    headers:{apikey:env.SUPABASE_SECRET_KEY, 'Content-Type':'application/json',
      ...(options.headers||{})}
  });
}
async function limitedBytes(request) {
  const len = request.headers.get('Content-Length');
  if (!len || !/^\d+$/.test(len)) return {error:'Content-Length required', status:411};
  const n = Number(len);
  if (!Number.isSafeInteger(n) || n <= 0 || n > LIMIT) return {error:'File must be 1 to 20 MiB',status:413};
  if (!request.body) return {error:'Empty upload',status:400};
  const reader = request.body.getReader();
  const parts=[]; let total=0;
  try {
    while (true) {
      const {done,value}=await reader.read();
      if(done) break;
      total+=value.byteLength;
      if(total>LIMIT){await reader.cancel();return {error:'Upload exceeds 20 MiB',status:413};}
      parts.push(value);
    }
  } catch {return {error:'Upload stream failed',status:400};}
  if (total!==n) return {error:'Upload length mismatch',status:400};
  const bytes = new Uint8Array(total); let pos=0;
  for (const p of parts) {bytes.set(p,pos); pos+=p.byteLength;}
  // MP4/QuickTime ISO BMFF ftyp signature. Container signature is not a full decoder/AV scan.
  if(total<12 || String.fromCharCode(...bytes.slice(4,8))!=='ftyp')
    return {error:'Expected MP4 container (ftyp)',status:415};
  return {bytes};
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin');
    const url=new URL(request.url); const path=url.pathname.replace(/\/+$/,'')||'/';
    if(origin && !ORIGINS.has(origin)) return json({error:'Origin not allowed'},403);
    if(request.method==='OPTIONS') {
      if (!ORIGINS.has(origin)) return json({error:'Origin required'},403);
      return new Response(null,{status:204,headers:{
        'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers':'Authorization,Content-Type,Range',
        'Access-Control-Max-Age':'600','Vary':'Origin'}});
    }
    if(path==='/health' && request.method==='GET')
      return json({service:'sdl-r2-staging',status:'phase2-pilot',media_enabled:true},200,origin);
    if(request.method==='PUT'||request.method==='DELETE')
      return json({error:'Legacy PUT/DELETE disabled'},405,origin);
    if (!configOk(env)) return json({error:'Staging configuration incomplete'},503,origin);
    const validRoute = path==='/v1/authorize'||path==='/v1/media'||/^\/v1\/media\/[0-9a-f-]{36}$/i.test(path);
    if (!validRoute) return json({error:'Not found'},404,origin);
    const identity=await verifyIdentity(request,env);
    if(identity.error) return json({error:identity.error},identity.status,origin);
    const playerId=url.searchParams.get('player_id');
    if (path==='/v1/authorize' && request.method==='POST') {
      let p;try{ p=await request.json();}catch{return json({error:'Invalid JSON'},400,origin);}
      if(!validId(p?.player_id)||!['read','upload'].includes(p?.action))return json({error:'Invalid request'},400,origin);
      const allowed=await canAccess(env,identity.bearer,p.player_id,p.action);
      return allowed===null?json({error:'Authorization unavailable'},503,origin)
        :json({allowed,media_enabled:true},allowed?200:403,origin);
    }
    if(path==='/v1/media' && request.method==='POST') {
      if(!validId(playerId))return json({error:'Invalid player_id'},400,origin);
      const allowed=await canAccess(env,identity.bearer,playerId,'upload');
      if(allowed===null)return json({error:'Authorization unavailable'},503,origin);
      if(!allowed)return json({error:'Forbidden'},403,origin);
      if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='video/mp4')
        return json({error:'Only video/mp4 accepted'},415,origin);
      const upload=await limitedBytes(request);
      if(upload.error)return json({error:upload.error},upload.status,origin);
      const id=crypto.randomUUID(); const key=`pilot/${playerId}/${id}.mp4`;
      try {await env.MEDIA_BUCKET.put(key,upload.bytes,{httpMetadata:{contentType:'video/mp4',cacheControl:'private, no-store'}});}
      catch {return json({error:'Object write failed'},503,origin);}
      let saved=false;
      try {
        const result=await adminQuery(env,'sdl_media_objects',{
          method:'POST',headers:{Prefer:'return=minimal'},
          body:JSON.stringify({id,player_id:playerId,uploaded_by:identity.userId,
            object_key:key,byte_size:upload.bytes.byteLength,content_type:'video/mp4'})
        });
        saved=result.status===201;
      } catch {}
      if(!saved){try{await env.MEDIA_BUCKET.delete(key);}catch{}
        return json({error:'Metadata save failed; upload not committed'},503,origin);}
      return json({id,player_id:playerId,byte_size:upload.bytes.byteLength,content_type:'video/mp4'},201,origin);
    }
    if(path==='/v1/media' && request.method==='GET') {
      if(!validId(playerId))return json({error:'Invalid player_id'},400,origin);
      const allowed=await canAccess(env,identity.bearer,playerId,'read');
      if(allowed===null)return json({error:'Authorization unavailable'},503,origin);
      if(!allowed)return json({error:'Forbidden'},403,origin);
      let res;try{
        res=await adminQuery(env,`sdl_media_objects?select=id,player_id,byte_size,content_type,created_at&player_id=eq.${playerId}&order=created_at.desc&limit=30`);
      }catch{return json({error:'Metadata service unavailable'},503,origin);}
      if(!res.ok)return json({error:'Metadata service unavailable'},503,origin);
      return json({items:await res.json()},200,origin);
    }
    if(/^\/v1\/media\/[0-9a-f-]{36}$/i.test(path) && request.method==='GET') {
      const id=path.split('/').pop(); if(!validId(id))return json({error:'Invalid id'},400,origin);
      let res;try{
        res=await adminQuery(env,`sdl_media_objects?select=id,player_id,object_key,byte_size,content_type&id=eq.${id}&limit=1`);
      }catch{return json({error:'Metadata service unavailable'},503,origin);}
      if(!res.ok)return json({error:'Metadata service unavailable'},503,origin);
      const items=await res.json().catch(()=>[]); const item=items?.[0];
      if(!item)return json({error:'Not found'},404,origin);
      const allowed=await canAccess(env,identity.bearer,item.player_id,'read');
      if(allowed===null)return json({error:'Authorization unavailable'},503,origin);
      if(!allowed)return json({error:'Forbidden'},403,origin);
      const rangeHeader=request.headers.get('Range');
      if(rangeHeader && !/^bytes=\d+-\d*$/i.test(rangeHeader))return json({error:'Unsupported range'},416,origin);
      let obj;
      try{obj=await env.MEDIA_BUCKET.get(item.object_key,rangeHeader?{range:new Headers({Range:rangeHeader})}:undefined);}
      catch{return json({error:'Object unavailable'},503,origin);}
      if(!obj||!obj.body)return json({error:'Not found'},404,origin);
      const h=new Headers({'Content-Type':'video/mp4','Cache-Control':'private, no-store',
        'X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Disposition':'inline'});
      if(ORIGINS.has(origin)){h.set('Access-Control-Allow-Origin',origin);h.set('Vary','Origin');}
      if(obj.range){
        h.set('Content-Range',`bytes ${obj.range.offset}-${obj.range.offset+obj.range.length-1}/${obj.size}`);
        h.set('Content-Length',String(obj.range.length));
        return new Response(obj.body,{status:206,headers:h});
      }
      h.set('Content-Length',String(obj.size));
      return new Response(obj.body,{status:200,headers:h});
    }
    return json({error:'Method not allowed'},405,origin);
  }
};

export {verifyIdentity,adminQuery,limitedBytes,configOk,validId,json,ORIGINS};
