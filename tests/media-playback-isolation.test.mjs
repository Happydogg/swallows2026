// Disposable synthetic database only. Never connect this fixture to hosted staging.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rbacV5} from './helpers/rbacV5.mjs';
import {uuid,parent,coach,teammate,player,team,athlete} from './helpers/submissionDatabase.mjs';
import {enrollment} from './helpers/clubWorkflow.mjs';

const held=[
 'sdl_004_media_can_access(uuid,text)',
 'sdl_004_reserve_submission(uuid,uuid,uuid,text,bigint,text)',
 'sdl_004_finish_submission(uuid,uuid,uuid)',
 'sdl_004_submission_can_submit(uuid)',
 'sdl_004_submission_can_read(uuid)',
 'sdl_004_submission_can_review(uuid)',
 'sdl_004_submission_can_publish(uuid)',
 'sdl_004_list_submissions(uuid)',
 'sdl_004_review_queue(uuid,text)',
 'sdl_004_review_submission(uuid,text,text)',
 'sdl_004_publish_submission(uuid,uuid[],uuid[])',
 'sdl_004_clubhouse_videos(uuid)',
 'sdl_004_clubhouse_visible(uuid,uuid)',
 'sdl_v5_authorize_playback(uuid)',
 'sdl_v5_authorize_download(uuid)',
 'sdl_v5_confirm_subject(uuid,uuid,text)',
 'sdl_v5_legacy_media(uuid)',
 'sdl_v5_clubhouse_sessions(uuid,uuid,integer)'
];
const allow=new Set(['sdl_004_list_submissions(uuid)','sdl_v5_authorize_playback(uuid)']);
const patch=readFileSync(new URL('../backend/proposals/sdl004-rbac-v5/media-clean-start.sql',import.meta.url),'utf8');

test('private playback-only ACL rehearsal isolates direct calls and preserves evidence on containment',async t=>{
 const f=await rbacV5(t);
 const {db,owner,as}=f;
 await owner("UPDATE public.sdl_club_enrollments SET recording_storage_authorized=true,recording_permission_ref='synthetic fixture' WHERE id='"+enrollment+"'");
 await db.exec(patch);
 // Seed only within the disposable database before containment. No hosted upload or permission change.
 const clip=await f.upload();
 await db.exec('RESET ROLE');
 const count=async()=> (await owner('SELECT count(*) AS n FROM public.sdl_video_submissions'))[0].n;
 const before=await count();
 const hold=async()=>{await db.exec('RESET ROLE;'+held.map(s=>'REVOKE EXECUTE ON FUNCTION public.'+s+' FROM PUBLIC,anon,authenticated,service_role;').join('\n'));};
 const verify=async enabled=>{
   for(const sig of held){
     const rows=await owner("SELECT to_regprocedure('public."+sig+"') IS NOT NULL AS present, "+
       "has_function_privilege('authenticated','public."+sig+"','EXECUTE') AS auth, "+
       "has_function_privilege('anon','public."+sig+"','EXECUTE') AS anon, "+
       "has_function_privilege('service_role','public."+sig+"','EXECUTE') AS service");
     assert.equal(rows[0].present,true,sig);
     assert.equal(rows[0].auth,enabled&&allow.has(sig),sig);
     assert.equal(rows[0].anon,false,sig);
     assert.equal(rows[0].service,false,sig);
   }
 };
 await hold();
 await verify(false);
 await db.exec('RESET ROLE;'+[...allow].map(s=>'GRANT EXECUTE ON FUNCTION public.'+s+' TO authenticated;').join('\n'));
 await verify(true);
 const decision=()=> "SELECT public.sdl_v5_authorize_playback('"+clip+"') AS allowed";
 assert.equal((await as(parent,decision()))[0].allowed,true);
 assert.equal((await as(coach,decision()))[0].allowed,true);
 assert.equal((await as(teammate,decision()))[0].allowed,false);
 assert.ok((await as(parent,"SELECT id FROM public.sdl_004_list_submissions('"+player+"')")).some(x=>x.id===clip));
 assert.equal((await as(parent,"SELECT public.sdl_v5_authorize_playback('"+uuid(999)+"') AS allowed"))[0].allowed,false);
 const forbidden=[
  "SELECT public.sdl_004_reserve_submission('"+player+"','"+uuid(901)+"','"+uuid(902)+"','"+'a'.repeat(64)+"',12,'pitching')",
  "SELECT public.sdl_004_finish_submission('"+uuid(901)+"','"+uuid(902)+"','"+parent+"')",
  "SELECT public.sdl_004_review_submission('"+clip+"','approved','synthetic')",
  "SELECT public.sdl_004_publish_submission('"+clip+"',ARRAY['"+team+"'::uuid],ARRAY['"+athlete+"'::uuid])",
  "SELECT public.sdl_v5_confirm_subject('"+clip+"','"+athlete+"','synthetic')",
  "SELECT public.sdl_v5_authorize_download('"+clip+"')",
  "SELECT public.sdl_004_clubhouse_videos('"+team+"')",
  "SELECT public.sdl_v5_legacy_media('"+player+"')"
 ];
 for(const sql of forbidden){
   await assert.rejects(as(coach,sql),e=>e.code==='42501'&&/permission denied for function/i.test(e.message),sql);
 }
 await assert.rejects(as(coach,'SELECT object_key FROM public.sdl_media_objects'),{code:'42501'});
 await owner("UPDATE public.sdl_club_enrollments SET recording_storage_authorized=false WHERE id='"+enrollment+"'");
 assert.equal((await as(parent,decision()))[0].allowed,false);
 await hold();
 await verify(false);
 await assert.rejects(as(parent,decision()),e=>e.code==='42501'&&/permission denied for function/i.test(e.message));
 assert.equal(await count(),before);
});
