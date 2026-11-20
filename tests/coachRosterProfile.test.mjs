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
