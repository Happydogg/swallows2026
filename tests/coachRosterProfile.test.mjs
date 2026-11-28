// SDL-UX-006: static regressions for coach-scoped roster-to-profile navigation and synthetic images.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('all fifteen fictional portraits exist, use SVG and have an explicit DEMO mark',()=>{
 for(let n=21;n<=35;n++){const s=read('assets/demo-players/'+n+'.svg');
  assert.match(s,/<svg /);assert.match(s,/>DEMO<\/text>/);assert.match(s,new RegExp('#'+n+'<\\/text>'));
 }
});
test('coach roster opens only authorized profiles, not raw player lists',()=>{
 const roster=read('components/CoachTeamRoster.js'),app=read('js/app.js'),index=read('index.html');
 assert.match(roster,/open-profile/);assert.match(index,/@open-profile="selectCoachRosterPlayer"/);
 assert.match(app,/coachRoster\.value\.find\(row => row\.id === player\?\.id && row\.team_id === player\?\.team_id\)/);
 assert.match(app,/if \(!auth\.isTeamCoach\.value/);
 assert.match(index,/workspaceMode === 'family'"/);
});
test('synthetic growth is marked nonofficial and private videos keep their original controller',()=>{
 const profile=read('components/PlayerProfile.js'),growth=read('components/DemoGrowthLab.js'),index=read('index.html');
 assert.match(profile,/:embedded="true"/);assert.match(growth,/Not live or official athlete statistics/);
 assert.match(index,/:controller="privateMediaController"/);
 assert.match(index,/mediaOriginAllowed &&/);
});

test('Coach Home has a bounded preview; Team retains the entire authorized roster and direct profile navigation',()=>{
 const home=read('components/CoachHome.js'),detail=read('components/CoachTeamRoster.js');
 const index=read('index.html'),app=read('js/app.js');
 assert.match(home,/const preview = Vue.computed\(\(\) => props.roster\.slice\(0, 3\)\)/);
 assert.doesNotMatch(detail,/roster\.slice\(/);
 assert.match(detail,/return props.roster.filter/);
 assert.match(home,/<button type="button" @click="\$emit\('open-profile',player\)"/);
 // The image now belongs to the shared hero component, not CoachHome.
 const hero=read('components/PlayerHeroCard.js');
 assert.match(home,/import \{ PlayerHeroCard \} from '\.\/PlayerHeroCard\.js'/);
 assert.match(home,/<player-hero-card v-for="player in preview" :key="player\.team_id\+':'\+player\.id" :player="\{\.\.\.player,photo_url:avatarFor\(player\)\}"/);
 assert.match(home,/<template #actions>[\s\S]*?@click="\$emit\('open-profile',player\)"[\s\S]*?@click="\$emit\('open-video',player\)"/);
 assert.match(hero,/<img v-if="player\.photo_url && !player\.photo_url\.startsWith\('sdl-private-avatar:'\) && !photoFailed && !failedImgs\[player\.id\]" :src="formatImgUrl\(player\.photo_url\)"/);
 assert.match(hero,/<slot name="actions"><\/slot>/);
 assert.match(index,/<coach-home[\s\S]*?@open-profile="selectCoachRosterPlayer"/);
 assert.match(detail,/<article v-for="player in displayedRoster"/);
 assert.match(detail, /@click="\$emit\('open-profile',player\)"/);
 assert.match(app,/playerFeature\.selectPlayer\(projected\)/);
 assert.match(app,/privateMedia\.selectMediaPlayer\(authorized\.id\)/);
});

test('both Cloudflare preview packages contain all fifteen mock portraits',()=>{
 const staging=read('backend/release/build-staging-frontend.mjs');
 const preview=read('scripts/build-ux-preview.mjs');
 assert.ok(staging.includes("'assets/demo-players'"));
 for(let jersey=21;jersey<=35;jersey++)assert.ok(preview.includes("'assets/demo-players/"+jersey+".svg'"));
});
