import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rbacV5} from './helpers/rbacV5.mjs';
import {uuid,parent,coach,team,org,otherTeam,outsider,player} from './helpers/submissionDatabase.mjs';
import {adminUser} from './helpers/clubWorkflow.mjs';

test('authenticated delegation and registration use current scope and preserve revoked assignments',async t=>{
 const {as,owner}=await rbacV5(t);
 const set=(scope,target,role,grant)=>`SELECT public.sdl_v5_set_staff('${scope}','${target}','${role}',${grant},'synthetic staff change')`;
 await assert.rejects(as(parent,set(org,outsider,'club_admin',true)),{code:'42501'});
 await owner(`SELECT sdl_rbac_v5.set_platform_grant('${parent}',true,'fixture')`);
 await assert.rejects(as(parent,set(org,outsider,'club_admin',true)),{code:'42501'});
 await owner("SELECT set_config('test.aal','aal2',false)");
 await as(parent,set(org,outsider,'club_admin',true));
 await as(parent,set(org,outsider,'club_admin',false));
 await as(adminUser,set(team,coach,'manager',true));
 await assert.rejects(as(coach,set(otherTeam,parent,'coach',true)),{code:'42501'});
 await assert.rejects(as(coach,set(team,parent,'manager',true)),{code:'42501'});
 await as(coach,set(team,parent,'coach',true));
 await as(coach,set(team,parent,'coach',false));
 const [prereq]=await owner(`SELECT status FROM public.organization_memberships WHERE user_id='${parent}' AND role='staff'`);
 assert.equal(prereq.status,'revoked');
 await assert.rejects(as(coach,set(team,parent,'coach',true)),{code:'PT409'});
 const register=`SELECT public.sdl_v5_register_player('${team}','Synthetic player','14','${uuid(980)}','new roster') AS id`;
 await assert.rejects(as(outsider,register),{code:'42501'});
 const [registered]=await as(coach,register);
 assert.deepEqual(await as(coach,register),[registered]);
 assert.notEqual(registered.id,player);
 await assert.rejects(as(coach,register.replace("'14'","'15'")),{code:'PT409'});
 await as(adminUser,set(team,coach,'manager',false));
 await assert.rejects(as(coach,register),{code:'42501'});
});

test('manager invitations recheck issuing scope and verified identity at redemption',async t=>{
 const {as,owner}=await rbacV5(t);
 const hash='b'.repeat(64);
 const issue=`SELECT public.sdl_004_pilot_issue_invitation('${player}','${outsider}@example.test','${hash}')`;
 await assert.rejects(as(coach,issue),{code:'42501'});
 await as(adminUser,`SELECT public.sdl_v5_set_staff('${team}','${coach}','manager',true,'manager')`);
 await as(coach,issue);
 const redeem=`SELECT public.sdl_004_pilot_redeem_invitation('${hash}')`;
 await assert.rejects(as(parent,redeem),{code:'42501'});
 await owner(`UPDATE public.player_team_memberships SET status='inactive',end_date=CURRENT_DATE WHERE player_id='${player}'`);
 await assert.rejects(as(outsider,redeem),{code:'PT410'});
 const another=issue.replace(player,'00000000-0000-4000-8000-000000000012').replace(hash,'c'.repeat(64));
 await as(coach,another);
 await as(outsider,redeem.replace(hash,'c'.repeat(64)));
 await assert.rejects(as(outsider,redeem.replace(hash,'c'.repeat(64))),{code:'PT409'});
});

test('official entry, correction and independent parent review have separate scopes',async t=>{
 const {as,owner}=await rbacV5(t);
 const submit=(key,official,prior=null)=>`SELECT public.sdl_004_pilot_submit_performance('${player}','exit-radar-v1',77,CURRENT_DATE,'synthetic radar evidence','${uuid(key)}',${official},null,${prior?"'"+prior+"'":"null"}) AS receipt`;
 const [pending]=await as(parent,submit(700,false));
 const review=`SELECT public.sdl_004_pilot_review_performance('${pending.receipt.id}','approved','checked',1)`;
 await assert.rejects(as(adminUser,review),{code:'42501'});
 await assert.rejects(as(adminUser,submit(701,true,pending.receipt.id)),{code:'22023'});
 await assert.rejects(as(outsider,submit(701,true)),{code:'42501'});
 await as(coach,review);
 const [official]=await as(adminUser,submit(701,true,pending.receipt.id));
 assert.equal(official.receipt.status,'approved');
 assert.deepEqual(await as(adminUser,submit(701,true,pending.receipt.id)),[official]);
 const [result]=await owner(`SELECT s.source_kind,old.superseded_by=s.id AS corrected,a.invalidated_at IS NOT NULL AS invalidated
 FROM public.sdl_performance_submissions s JOIN public.sdl_performance_submissions old ON old.id=s.supersedes
 JOIN public.sdl_official_statistics a ON a.session_id=old.session_id WHERE s.id='${official.receipt.id}'`);
 assert.deepEqual(result,{source_kind:'club_admin',corrected:true,invalidated:true});
 await assert.rejects(as(parent,submit(702,true)),{code:'42501'});
});

test('download authorization checks subject, recording, retention and current role on every request',async t=>{
 const {owner,as,upload}=await rbacV5(t);
 await assert.rejects(upload(),{code:'42501'});
 await owner(`UPDATE public.sdl_club_enrollments SET recording_storage_authorized=true,recording_permission_ref='synthetic approval' WHERE organization_id='${org}'`);
 const adminUpload=await upload(adminUser);
 assert.equal((await owner(`SELECT status FROM public.sdl_video_submissions WHERE id='${adminUpload}'`))[0].status,'pending');
 const id=await upload();
 const download=`SELECT public.sdl_v5_authorize_download('${id}') AS allowed`;
 const allowed=async who=>(await as(who,download))[0].allowed;
 assert.equal(await allowed(parent),false);

 assert.equal(await allowed(parent),false);
 await owner(`UPDATE public.sdl_video_submissions SET subject_scope='single_athlete',subject_confirmed_by='${coach}' WHERE id='${id}'`);
 assert.equal(await allowed(parent),true);
 assert.equal(await allowed(adminUser),true);
 assert.equal(await allowed(outsider),false);
 await owner(`UPDATE public.sdl_video_submissions SET status='rejected' WHERE id='${id}'`);
 assert.equal(await allowed(parent),false);
 await owner(`UPDATE public.sdl_video_submissions SET rejected_access_until=now()+interval '1 minute' WHERE id='${id}'`);
 assert.equal(await allowed(parent),true);
 await owner(`UPDATE public.profiles SET status='suspended' WHERE id='${parent}'`);
 assert.equal(await allowed(parent),false);
 assert.equal((await as(coach,`SELECT public.sdl_004_media_can_access('${player}','read') AS allowed`))[0].allowed,false);
 assert.equal((await owner("SELECT count(*)::int AS n FROM sdl_rbac_v5.events WHERE action='download_authorized'"))[0].n,3);
});
