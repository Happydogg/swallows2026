import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {filterPrivateLibrary,PrivateMediaPanel} from '../components/PrivateMediaPanel.js';
import {harness,user} from './helpers/appHarness.mjs';
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const consent=fs.readFileSync(new URL('../components/MediaConsentPanel.js',import.meta.url),'utf8');
const shared=fs.readFileSync(new URL('../components/MediaSharingPanels.js',import.meta.url),'utf8');
const rows=[{id:'a',category:'pitching',status:'pending'},{id:'b',category:'batting',status:'approved'},{id:'c',category:'pitching',status:'rejected'}];
test('private filters narrow only loaded records without mutating controller state',()=>{
 assert.deepEqual(filterPrivateLibrary(rows).map(r=>r.id),['a','b','c']);
 assert.deepEqual(filterPrivateLibrary(rows,'pitching').map(r=>r.id),['a','c']);
 assert.deepEqual(filterPrivateLibrary(rows,'pitching','rejected').map(r=>r.id),['c']);
 assert.deepEqual(filterPrivateLibrary(rows,'throwing'),[]);
 assert.deepEqual(filterPrivateLibrary(null),[]);
 assert.equal(rows.length,3);
});
test('private library retains original protected actions and demand-driven previews',()=>{
 const source=PrivateMediaPanel.template;
 for(const marker of ['v-media-visible="item"','playPrivateMedia(item)','reviewPrivateMedia','archivePrivateMedia(item)','uploadPrivateMedia','analyzePrivateMedia','v-model="analysisFps"','v-model="analysisCategory"','v-if="mediaReadAllowed"','v-if="mediaUploadAllowed"','item.can_archive === true']) assert.ok(source.includes(marker),marker);
 assert.match(source,/ref="playbackSection" tabindex="-1"/);
});
test('Option C consent stays one explicit opt-in and download remains disabled',()=>{
 assert.equal((consent.match(/type="checkbox"/g)||[]).length,1);
 assert.match(consent,/sdl004-clubhouse-view-download-v2/);
 assert.match(consent,/setMediaConsent\(id,generation,action/);
 assert.match(consent,/copies already delivered cannot be remotely deleted/);
 assert.match(consent,/Download execution remains disabled/);
 assert.match(consent,/unresolved guardian objections/);
});
test('Clubhouse preserves minimal neutral DTO and no download control',()=>{
 assert.match(shared,/x\.display_name!=='Player'/);
 assert.match(shared,/display_name:'Player'/);
 assert.match(shared,/service\.sharedPlayback\(item.id,team/);
 assert.match(shared,/controlslist="nodownload"/);
 assert.doesNotMatch(shared,/@click="[^"]*download/i);
 assert.match(shared,/URL\.revokeObjectURL/);
 assert.match(shared,/visibilitychange/);
});
test('Library and Clubhouse are mutually exclusive and gated by original origin',()=>{
 assert.match(index,/<private-media-panel v-if="activeTab === 'videos' && mediaOriginAllowed && videoSection==='library'"/);
 assert.match(index,/<clubhouse-media-panel v-if="activeTab === 'videos' && mediaOriginAllowed && !authError && videoSection==='clubhouse' && clubhouseMediaTeams.length"/);
 assert.match(index,/ref="publicationPanel"/);
 assert.match(index,/central review inbox is not yet available/);
 assert.doesNotMatch(index,/<video-review-inbox/);
});
function coachContext(h){
 h.app.accountContext.value={...h.app.accountContext.value,roles:['coach'],organizations:[{id:'org',name:'Club',roles:['coach']}],teams:[{id:'team',name:'Team',organization_id:'org',roles:['coach']}]};
}
test('authorized subnavigation resets private state and blocks concurrent mutations',async t=>{
 const h=await harness(t,user('media-demo'),{origin:'https://sdl-ux-live.pages.dev'});
 coachContext(h);
 assert.equal(h.app.mediaOriginAllowed.value,true);
 assert.equal(h.app.clubhouseMediaTeams.value.length,1);
 assert.equal(h.app.changeVideoSection('clubhouse'),false);
 h.app.navigateTab('videos');
 const m=h.app.privateMediaController;
 m.mediaPlayerId.value='demo-player';m.mediaItems.value=rows;m.mediaPlaybackUrl.value='blob:ux003-private';m.mediaReadAllowed.value=true;
 m.mediaUploading.value=true;assert.equal(h.app.changeVideoSection('clubhouse'),false);m.mediaUploading.value=false;
 m.mediaReviewing.value=true;assert.equal(h.app.changeVideoSection('clubhouse'),false);m.mediaReviewing.value=false;
 m.mediaArchiving.value=true;assert.equal(h.app.changeVideoSection('clubhouse'),false);m.mediaArchiving.value=false;
 h.app.publicationPanel.value={busy:true};assert.equal(h.app.changeVideoSection('clubhouse'),false);h.app.publicationPanel.value=null;
 const before=h.calls.length;
 assert.equal(h.app.changeVideoSection('clubhouse'),true);
 assert.equal(h.app.videoSection.value,'clubhouse');assert.equal(m.mediaPlayerId.value,'');assert.equal(m.mediaItems.value.length,0);assert.equal(m.mediaPlaybackUrl.value,'');assert.ok(h.revoked.includes('blob:ux003-private'));assert.equal(h.calls.length,before);
 assert.equal(h.app.changeVideoSection('review'),false);
 assert.equal(h.app.changeVideoSection('library'),true);assert.equal(h.app.videoSection.value,'library');
});
test('unapproved origin and absent team cannot open Clubhouse section',async t=>{
 const h=await harness(t,user('outside-origin'));coachContext(h);h.app.navigateTab('videos');
 assert.equal(h.app.changeVideoSection('clubhouse'),false);
 assert.equal(h.app.videoSection.value,'library');
});
test('loss of scoped team and logout return to Library',async t=>{
 const h=await harness(t,user('media-scope'),{origin:'https://sdl-ux-live.pages.dev'});
 coachContext(h);h.app.navigateTab('videos');assert.equal(h.app.changeVideoSection('clubhouse'),true);
 h.app.accountContext.value={...h.app.accountContext.value,teams:[]};
 assert.equal(h.app.videoSection.value,'library');assert.equal(h.app.changeVideoSection('clubhouse'),false);
 await h.app.signOutAndClear();assert.equal(h.app.activeTab.value,'home');assert.equal(h.app.videoSection.value,'library');
});
