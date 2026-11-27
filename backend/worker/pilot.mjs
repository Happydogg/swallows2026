const STAGING_URL = 'https://wvurolqbjhuckkkjiiiv.supabase.co';
const ORIGINS = new Set(['http://127.0.0.1:5500', 'http://localhost:5500', 'https://sdl-staging.pages.dev', 'https://sdl-ux-live.pages.dev']);
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
  if ([401,403].includes(res.status)) return {error:'Invalid or expired session',status:401};
  if (res.status !== 200) return {error:'Identity provider unavailable',status:503};
  const user = await res.json().catch(()=>null);
  if (!validId(user?.id)) return {error:'Invalid identity response',status:401};
  return { bearer, userId: user.id };
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
      if(total>n){await reader.cancel();return {error:'Upload length mismatch',status:400};}
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
export {verifyIdentity,adminQuery,limitedBytes,configOk,validId,json,ORIGINS};
