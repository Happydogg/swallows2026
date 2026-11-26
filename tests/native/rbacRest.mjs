// Synthetic identities, ephemeral signing key, local Unix database and loopback HTTP only.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHmac,randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {player,parent,outsider} from '../helpers/submissionDatabase.mjs';

export async function checkRest(db){
 const socket=process.env.SDL_TEST_SOCKET;
 const secret=randomBytes(32).toString('hex');
 await db.exec(`RESET ROLE;
 CREATE ROLE sdl_fixture_api LOGIN NOINHERIT;
 GRANT authenticated,anon TO sdl_fixture_api;
 CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
 $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;`);
 const listener=createServer().listen(0,'127.0.0.1');
 await once(listener,'listening');
 const port=listener.address().port;
 await new Promise(resolve=>listener.close(resolve));
 const api=spawn(process.env.SDL_TEST_POSTGREST,[],{stdio:'ignore',env:{
   PATH:process.env.PATH,PGRST_DB_URI:'postgresql://sdl_fixture_api@/'+db.name+'?host='+encodeURIComponent(socket)+'&port=54918',
   PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(port),PGRST_JWT_SECRET:secret
 }});
 const exit=once(api,'exit');
 const base='http://127.0.0.1:'+port;
 function token(user){
   const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
   const claims=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'authenticated',sub:user,session_id:user,aal:'aal1',exp:Math.floor(Date.now()/1000)+60});
   return claims+'.'+createHmac('sha256',secret).update(claims).digest('base64url');
 }
 try {
   let ready=false;
   for(let n=0;n<100 && api.exitCode===null;n++){
     try{ready=(await fetch(base+'/')).ok;}catch{}
     if(ready)break;
     await delay(50);
   }
   assert.ok(ready,'local PostgREST startup');
   const read=(path,user)=>fetch(base+path,{headers:{Authorization:'Bearer '+token(user)}});
   const rpc=user=>fetch(base+'/rpc/sdl_v5_private_statistics',{method:'POST',
     headers:{Authorization:'Bearer '+token(user),'Content-Type':'application/json'},body:JSON.stringify({p_player:player})});
   assert.equal((await rpc(parent)).status,200);
   assert.equal((await rpc(outsider)).status,403);
   const raw=await read('/sessions?select=id',parent);
   assert.ok([403,404].includes(raw.status),'direct session rows denied');
   assert.ok([403,404].includes((await read('/platform_admin_grants?select=user_id',parent)).status));
   await db.query('UPDATE auth.sessions SET not_after=now() WHERE user_id=$1',[parent]);
   assert.equal((await rpc(parent)).status,403);
   console.log('PostgREST direct table, RPC scope and session revocation checks passed.');
 }finally{
   if(api.exitCode===null && api.signalCode===null)api.kill();
   await exit;
 }
}
