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

test('session projections require a fresh standing receipt and respect a second guardian’s objection',async t=>{
 const {as,owner,generation}=await rbacV5(t);
 const enrollment=uuid(51);
 const gen=await generation();
 await owner(`INSERT INTO public.athlete_guardians(athlete_id,user_id,status) VALUES('${uuid(41)}','${outsider}','verified')`);
 await as(coach,`SELECT public.sdl_004_pilot_submit_performance('${player}','exit-radar-v1',77,CURRENT_DATE,'radar fixture','${uuid(800)}',true)`);
 const consent=policy=>`SELECT public.sdl_004_set_statistic_consent('${enrollment}','${gen}',true,ARRAY['broad_jump','throwing_velo','exit_velo','sprint_time'],'${policy}')`;
 const sessions=`SELECT * FROM public.sdl_v5_clubhouse_sessions('${team}',null,10)`;
 await as(parent,consent('sdl004-baseball-statistics-v1'));
 assert.deepEqual(await as(adminUser,sessions),[]);
 await as(parent,consent('baseball-sessions-v5'));
 const rows=await as(adminUser,sessions);
 assert.equal(rows.length,1);
 assert.equal(Number(rows[0].value),77);
 assert.deepEqual(await as(adminUser,sessions.replace('null',"'"+rows[0].id+"'")),[]);
 await as(outsider,`SELECT public.sdl_004_set_statistic_consent('${enrollment}','${gen}',false,'{}',null)`);
 await as(parent,consent('baseball-sessions-v5'));
 assert.deepEqual(await as(coach,sessions),[]);
 await assert.rejects(as(coach,sessions.replace(team,otherTeam)),{code:'42501'});
 await as(outsider,consent('baseball-sessions-v5'));
 assert.equal((await as(coach,sessions)).length,1);
});

test('exports and audit views enforce explicit scope and current enrollment',async t=>{
 const {as,owner}=await rbacV5(t);
 await as(coach,`SELECT public.sdl_004_pilot_submit_performance('${player}','exit-radar-v1',77,CURRENT_DATE,'radar reading','${uuid(900)}',true)`);
 const report=(scope,id)=>`SELECT * FROM public.sdl_v5_export_statistics('${scope}','${id}')`;
 assert.equal((await as(parent,report('player',player))).length,1);
 await assert.rejects(as(parent,report('team',team)),{code:'42501'});
 await assert.rejects(as(coach,report('team',otherTeam)),{code:'42501'});
 assert.equal((await as(adminUser,report('club',org))).length,1);
 const history=(scope,id)=>`SELECT * FROM public.sdl_v5_audit_history('${scope}','${id}')`;
 assert.deepEqual(await as(parent,history('downloads',player)),[]);
 const events=await as(adminUser,history('club',org));
 assert.equal(events.filter(event=>event.action==='export_authorized').length,2);
 assert.ok(events.some(event=>event.action==='pilot_coach_official_entry'));
 await assert.rejects(as(parent,history('club',org)),{code:'42501'});
 await assert.rejects(as(parent,'SELECT * FROM sdl_rbac_v5.events'),{code:'42501'});
 await owner(`UPDATE public.sdl_club_enrollments SET status='ended',ended_at=now() WHERE organization_id='${org}'`);
 assert.deepEqual(await as(adminUser,report('club',org)),[]);
 assert.equal((await as(parent,report('player',player))).length,1);
});

test('cross-club transfer preserves identity and separates history until both clubs and family approve',async t=>{
 const {as,owner}=await rbacV5(t);
 const child=uuid(12),guardian=uuid(3),dst=uuid(32);
 await owner(`INSERT INTO public.organization_memberships(organization_id,user_id,role,status) VALUES('${dst}','${outsider}','admin','active')`);
 const [r]=await as(adminUser,`SELECT public.sdl_v5_request_transfer('${child}','${team}','${otherTeam}','relocation') AS id`);
 const approve=role=>`SELECT public.sdl_v5_approve_transfer('${r.id}','${role}','28','confirmed') AS done`;
 await assert.rejects(as(parent,approve('guardian')),{code:'42501'});
 assert.equal((await as(outsider,approve('destination')))[0].done,false);
 assert.equal((await as(guardian,approve('guardian')))[0].done,false);
 assert.equal((await as(outsider,approve('destination')))[0].done,true);
 const [after]=await owner(`SELECT id,athlete_id FROM public.players WHERE organization_id='${dst}' AND jersey='28'`);
 assert.notEqual(after.id,child);
 assert.equal(after.athlete_id,uuid(42));
 assert.equal((await owner(`SELECT status FROM public.player_team_memberships WHERE player_id='${child}'`))[0].status,'inactive');
 await assert.rejects(as(outsider,approve('destination')),{code:'PT409'});
});

test('local restrictions preserve own-child history and global unlink requires a verified platform case',async t=>{
 const {as,owner}=await rbacV5(t);
 const restrict=`SELECT public.sdl_v5_restrict_guardian('${parent}','${org}','${team}','verified local request')`;
 await assert.rejects(as(coach,restrict),{code:'42501'});
 await as(adminUser,restrict);
 const submit=`SELECT public.sdl_004_pilot_submit_performance('${player}','exit-radar-v1',77,CURRENT_DATE,'fixture','${uuid(999)}',false)`;
 await assert.rejects(as(parent,submit),{code:'42501'});
 const history=`SELECT * FROM public.sdl_004_player_statistics('${player}')`;
 assert.deepEqual(await as(parent,history),[]);
 const cid=uuid(998);
 const unlink=`SELECT public.sdl_v5_unlink_guardian('${cid}','${uuid(41)}','${parent}','verified case')`;
 await assert.rejects(as(adminUser,unlink),{code:'42501'});
 await owner(`SELECT sdl_rbac_v5.set_platform_grant('${outsider}',true,'fixture')`);
 await owner("SELECT set_config('test.aal','aal2',false)");
 await assert.rejects(as(outsider,unlink),{code:'42501'});
 await owner(`INSERT INTO sdl_rbac_v5.verified_cases(id,action,target_id,scope_id,expires_at) VALUES('${cid}','guardian_unlink','${parent}','${uuid(41)}',now()+interval '1 hour')`);
 await as(outsider,unlink);
 await assert.rejects(as(parent,history),{code:'42501'});
 await assert.rejects(as(outsider,unlink),{code:'42501'});
});

test('baseball edits invalidate sharing approval and family identities require separate permissions',async t=>{
 const {as,owner}=await rbacV5(t);
 const edit=`SELECT public.sdl_v5_edit_profile('${player}','{"preferred_name":"Sample"}','{"preferred_name":"Player"}','fixture correction')`;
 await as(parent,edit);
 await assert.rejects(as(parent,edit),{code:'PT409'});
 assert.equal((await owner(`SELECT public.sdl_004_pilot_profile_approved('${player}') AS ok`))[0].ok,false);
 const legal=edit.replace('{"preferred_name":"Sample"}','{"last_name":"Synthetic"}').replace('{"preferred_name":"Player"}','{"last_name":null}');
 await assert.rejects(as(coach,legal),{code:'42501'});
 await as(adminUser,legal);
 const contacts=`SELECT public.sdl_v5_family_contacts('${player}','family_contacts') AS data`;
 await assert.rejects(as(coach,contacts),{code:'42501'});
 await as(parent,`SELECT public.sdl_v5_set_own_contact('${player}','555-0100')`);
 assert.deepEqual((await as(parent,contacts))[0].data.contacts,['555-0100']);
 assert.equal((await as(adminUser,contacts.replace('family_contacts\')','registration_contacts\')')))[0].data.last_name,'Synthetic');
});

test('manager transfers, audit scope and expired sessions stay independent across four teams',async t=>{
 const {as,owner}=await rbacV5(t);
 const dest=uuid(801),foreign=uuid(802),foreignOrg=uuid(32);
 await owner(`INSERT INTO public.teams(id,organization_id,status) VALUES('${dest}','${org}','active'),('${foreign}','${foreignOrg}','active')`);
 const assign=(tm,u,role)=>`SELECT public.sdl_v5_set_staff('${tm}','${u}','${role}',true,'synthetic delegation')`;
 await as(adminUser,assign(team,coach,'manager'));
 await as(adminUser,assign(dest,parent,'manager'));
 const [request]=await as(coach,`SELECT public.sdl_v5_request_transfer('${player}','${team}','${dest}','new team') AS id`);
 const approve=`SELECT public.sdl_v5_approve_transfer('${request.id}','destination',null,'approved') AS complete`;
 await assert.rejects(as(coach,approve),{code:'42501'});
 assert.equal((await as(parent,approve))[0].complete,true);
 const privateRead=`SELECT * FROM public.sdl_v5_private_statistics('${player}')`;
 await assert.rejects(as(coach,privateRead),{code:'42501'});
 await as(parent,privateRead);
 await assert.rejects(as(parent,`SELECT * FROM public.sdl_v5_audit_history('team','${foreign}')`),{code:'42501'});
 const ownAudit=await as(parent,`SELECT * FROM public.sdl_v5_audit_history('team','${dest}')`);
 assert.ok(ownAudit.some(event=>event.action==='private_history_read'));
 await assert.rejects(as(parent,'SELECT * FROM public.sessions'),{code:'42501'});
 await owner(`UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE user_id='${parent}'`);
 await assert.rejects(as(parent,privateRead),{code:'42501'});
});

test('official corrections keep a distinct reason and private exports retain growth units and access scope',async t=>{
 const {as,owner}=await rbacV5(t);
 const [prior]=await as(adminUser,`SELECT public.sdl_004_pilot_submit_performance('${player}','exit-radar-v1',77,CURRENT_DATE,'synthetic evidence','${uuid(821)}',true) AS r`);
 const correct=`SELECT public.sdl_v5_correct_official('${prior.r.id}','exit-radar-v1',78,CURRENT_DATE,'second reading','${uuid(822)}','unit transcription') AS r`;
 await assert.rejects(as(parent,correct),{code:'42501'});
 const done=await as(adminUser,correct);
 assert.deepEqual(await as(adminUser,correct),done);
 await assert.rejects(as(adminUser,correct.replace('unit transcription','different reason')),{code:'PT409'});
 await as(parent,`SELECT public.sdl_004_pilot_save_growth('${player}',CURRENT_DATE,150,48)`);
 const query=`SELECT * FROM public.sdl_v5_export_private_history('${player}')`;
 const rows=await as(parent,query);
 assert.ok(rows.some(row=>Number(row.height_cm)===150&&Number(row.weight_kg)===48));
 assert.equal(rows.filter(row=>row.exit_velo!==null).length,1);
 await assert.rejects(as(outsider,query),{code:'42501'});
 assert.equal((await owner("SELECT count(*)::int AS n FROM sdl_rbac_v5.events WHERE action='official_correction'"))[0].n,1);
});
