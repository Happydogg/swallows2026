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
 ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
 CREATE POLICY fixture_roster ON public.players FOR SELECT TO authenticated USING (true);
 GRANT SELECT ON public.players TO authenticated;
 SELECT sdl_rbac_v5.set_platform_grant('${outsider}',true,'synthetic HTTP assurance fixture');
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
 function token(user,aal){
   const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
   const claims=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'authenticated',sub:user,session_id:user,aal,exp:Math.floor(Date.now()/1000)+60});
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
   const read=(path,user)=>fetch(base+path,{headers:{Authorization:'Bearer '+token(user,'aal1')}});
   const rpc=(user,name='private_statistics',aal='aal1',accept='application/json')=>fetch(base+'/rpc/sdl_v5_'+name,{method:'POST',
     headers:{Authorization:'Bearer '+token(user,aal),'Content-Type':'application/json',Accept:accept},body:JSON.stringify({p_player:player})});
   assert.equal((await rpc(parent)).status,200);
   assert.equal((await rpc(outsider)).status,200);
   assert.equal((await rpc(outsider,'private_statistics','aal1','text/csv')).status,403);
   assert.equal((await rpc(outsider,'export_private_history')).status,403);
   assert.equal((await rpc(outsider,'export_private_history','aal2','text/csv')).status,200);
   assert.equal((await read('/players?select=id',parent)).status,200);
   await db.query("UPDATE public.profiles SET status='suspended' WHERE id=$1",[outsider]);
   assert.equal((await rpc(outsider)).status,403);
   const raw=await read('/sessions?select=id',parent);
   assert.ok([403,404].includes(raw.status),'direct session rows denied');
   assert.ok([403,404].includes((await read('/platform_admin_grants?select=user_id',parent)).status));
   await db.query('UPDATE auth.sessions SET not_after=now() WHERE user_id=$1',[parent]);
   assert.equal((await rpc(parent)).status,403);
   const roster=await read('/players?select=id',parent);
   assert.equal(roster.status,200);
   assert.deepEqual(await roster.json(),[]);
   console.log('PostgREST direct table, RPC scope and session revocation checks passed.');
 }finally{
   if(api.exitCode===null && api.signalCode===null)api.kill();
   await exit;
 }
}
