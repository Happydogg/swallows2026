// SDL-004-AVATAR-001: upload behavior with isolated API mocks.
// Run with node --experimental-vm-modules --test tests/avatarService.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const SOURCE=fs.readFileSync(new URL('../js/avatarService.js',import.meta.url),'utf8');
const SQL=fs.readFileSync(new URL('./fixtures/ux-staging-avatars.sql',import.meta.url),'utf8');
const PLAYER='a1111111-1111-4111-8111-111111111111';
const OBJECT='b2222222-2222-4222-8222-222222222222';
async function loadService(client,compress=async()=>({size:42000})){
  const context=vm.createContext({crypto:webcrypto,console});
  const config=new vm.SyntheticModule(['supabaseClient'],function(){this.setExport('supabaseClient',client)},{context});
  const storage=new vm.SyntheticModule(['compressImage'],function(){this.setExport('compressImage',compress)},{context});
  const mod=new vm.SourceTextModule(SOURCE,{context,identifier:'avatarService.js'});
  await mod.link(spec => spec==='./config.js'?config:spec==='./mediaStorage.js'?storage:Promise.reject(Error('Unknown import')));
  await mod.evaluate();
  return mod.namespace;
}
function mockClient({deny=false}={}){
  const calls=[];
  const client={
    storage:{from(bucket){
      calls.push({bucket});
      return {
        async upload(path,blob,options){calls.push({upload:path,blob,options});return {error:deny?new Error('Denied'):null};},
        async createSignedUrl(path,seconds){calls.push({signed:path,seconds});return {data:{signedUrl:'https://example.invalid/signed/avatar'},error:null};}
      };
    }},
    async rpc(name,args){calls.push({rpc:name,args});return name==='sdl_ux_avatar_save'
      ?{data:'sdl-private-avatar:'+args.p_object_path,error:null}
      :{data:[{id:PLAYER,preferred_name:'DEMO Athlete',jersey:'21',photo_url:'sdl-private-avatar:'+PLAYER+'/'+OBJECT+'.jpg'}],error:null};}
  };
  return {client,calls};
}
test('private avatar service calls only the narrow bucket and role-scoped RPCs',async()=>{
  const x=mockClient();
  const api=await loadService(x.client);
  const manager=api.createAvatarService({client:x.client,compress:async()=>({size:42000}),makeId:()=>OBJECT});
  const list=await manager.listManagedPlayers();
  assert.equal(list.length,1);
  assert.equal(list[0].display_photo_url,'https://example.invalid/signed/avatar');
  const saved=await manager.uploadPlayerPhoto(PLAYER,{size:50000,type:'image/png',name:'selfie.png'});
  assert.equal(saved.photo_url,'sdl-private-avatar:'+PLAYER+'/'+OBJECT+'.jpg');
  const upload=x.calls.find(x=>x.upload);
  assert.equal(upload.upload,PLAYER+'/'+OBJECT+'.jpg');
  assert.equal(upload.options.upsert,false);
  assert.equal(upload.options.contentType,'image/jpeg');
  assert.ok(x.calls.filter(x=>x.bucket).every(x=>x.bucket==='sdl-avatars-staging'));
  assert.deepEqual(x.calls.filter(x=>x.rpc).map(x=>x.rpc),['sdl_ux_avatar_managed_players','sdl_ux_avatar_save']);
  assert.equal(SOURCE.includes(".from('players')"),false);
});
test('invalid player, oversized input, unsupported type and denied storage fail closed',async()=>{
  const x=mockClient();
  const api=await loadService(x.client);
  const service=api.createAvatarService({client:x.client,compress:async()=>({size:50000}),makeId:()=>OBJECT});
  await assert.rejects(()=>service.uploadPlayerPhoto('../escape',{size:300,type:'image/jpeg'}),/Invalid player/);
  await assert.rejects(()=>service.uploadPlayerPhoto(PLAYER,{size:9*1024*1024,type:'image/jpeg'}),/smaller than/);
  await assert.rejects(()=>service.uploadPlayerPhoto(PLAYER,{size:42,type:'text/html'}),/Choose a JPEG/);
  assert.equal(x.calls.length,0);
  const y=mockClient({deny:true});
  const locked=api.createAvatarService({client:y.client,compress:async()=>({size:50000}),makeId:()=>OBJECT});
  await assert.rejects(()=>locked.uploadPlayerPhoto(PLAYER,{size:500,type:'image/jpeg'}),/Denied/);
  assert.equal(y.calls.some(x=>x.rpc==='sdl_ux_avatar_save'),false);
});
test('private path parser refuses cross-player and arbitrary URLs',async()=>{
  const api=await loadService(mockClient().client);
  assert.equal(api.isPrivateAvatarRef('sdl-private-avatar:'+PLAYER+'/'+OBJECT+'.jpg'),true);
  assert.equal(api.isPrivateAvatarRef('sdl-private-avatar:../escape.jpg'),false);
  assert.equal(api.publicAvatarOrFallback('javascript:alert(1)',{jersey:'4'}),'');
  assert.equal(api.publicAvatarOrFallback('/assets/demo-players/21.svg',{jersey:'21'}),'/assets/demo-players/21.svg');
});
test('staging migration keeps avatars private and validates all user roles server-side',()=>{
  for(const x of ['sdl_004_session_active','sdl_004_guardian_for','sdl_004_coach_for','sdl_004_club_admin',
    'FOR SELECT TO authenticated','FOR INSERT TO authenticated','sdl_ux_avatar_audit','SECURITY DEFINER']){
    assert.ok(SQL.includes(x),x);
  }
  assert.ok(SQL.includes("'sdl-avatars-staging',false,1048576"));
  assert.equal(/FOR\s+(UPDATE|DELETE)\s+TO\s+authenticated/i.test(SQL),false);
  assert.equal(SQL.includes('GRANT ALL ON public.players'),false);
  assert.equal(SQL.includes('CREATE POLICY')&&SQL.includes('storage.objects'),true);
});
test('desktop sidebar and legacy production modules remain visible in source',()=>{
  const shell=fs.readFileSync(new URL('../components/AppShell.js',import.meta.url),'utf8');
  const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
  assert.ok(shell.includes('md:sticky md:top-4'));
  assert.ok(shell.includes('md:max-h-[calc(100dvh-2rem)]'));
  for(const tag of ['player-profile','team-overview','coach-team-roster','submission-workspace','pilot-workspace',
    'club-enrollment-admin','private-media-panel','avatar-manager','player-form-modal','session-form-modal',
    'upload-video-modal','ar-analyzer-modal'])assert.ok(index.includes('<'+tag),tag);
  assert.ok(app.includes('avatarManager.reset()'));
  assert.ok(app.includes('auth.isCurrentIdentity(identity)'));
  assert.ok(index.includes(':can-edit-photo="canEditPlayerPhoto(selectedPlayer.id)"'));
});
