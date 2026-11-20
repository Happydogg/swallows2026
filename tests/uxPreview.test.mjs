// SDL-UX-003: CI checks for public synthetic-only preview export.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildUxPreview } from '../scripts/build-ux-preview.mjs';

const EXPECTED = [
  'index.html','app.js','logo.png','components/AppShell.js',
  'components/CoachHome.js','components/ParentHome.js',
  'assets/demo-players/21.svg',
  'assets/demo-players/22.svg',
  'assets/demo-players/23.svg',
  'assets/demo-players/24.svg',
  'assets/demo-players/25.svg',
  'assets/demo-players/26.svg',
  'assets/demo-players/27.svg',
  'assets/demo-players/28.svg',
  'assets/demo-players/29.svg',
  'assets/demo-players/30.svg',
  'assets/demo-players/31.svg',
  'assets/demo-players/32.svg',
  'assets/demo-players/33.svg',
  'assets/demo-players/34.svg',
  'assets/demo-players/35.svg',
  'components/PlayerHeroCard.js','components/PrivateMediaPanel.js','components/StatsHub.js','components/DemoGrowthLab.js','js/demoGrowthFixture.js',
  'components/LoginLanding.js','components/InviteOnboarding.js',
  'js/config.js','meta.js','_headers','404.html'
];

test('preview build exports exactly 32 allowlisted synthetic files', () => {
  const result = buildUxPreview();
  assert.deepEqual([...result.manifest].sort(), [...EXPECTED].sort());
  const exported = [];
  function walk(dir, relative = '') {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      const name=path.join(relative,entry.name);
      if (entry.isDirectory()) walk(path.join(dir,entry.name),name);
      else exported.push(name.replaceAll(path.sep,'/'));
    }
  }
  walk(result.directory);
  assert.deepEqual(exported.sort(), [...EXPECTED].sort());
});

test('preview excludes staging credentials, APIs, private media and user records', () => {
  const dir=new URL('../dist-ux-preview/',import.meta.url);
  const refs=['app.js','index.html','components/AppShell.js','components/CoachHome.js',
    'components/ParentHome.js','components/PlayerHeroCard.js','components/PrivateMediaPanel.js','components/StatsHub.js','components/DemoGrowthLab.js','js/demoGrowthFixture.js','components/InviteOnboarding.js','components/LoginLanding.js','js/config.js','meta.js'];
  const values=refs.map(file=>fs.readFileSync(new URL(file,dir),'utf8')).join('\n');
  for (const forbidden of ['SUPABASE_URL','PRIVATE_MEDIA_WORKER_URL','SUPABASE_SERVICE_ROLE_KEY',
    '.supabase.co','workers.dev','sb_secret_','signInWithPassword','createClient(']) {
    assert.equal(values.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
  assert.match(values,/Sample Player A/);
  assert.match(values,/backendConnected":false/);
  assert.match(fs.readFileSync(new URL('js/config.js',dir),'utf8'),/SUBMISSION_FEATURES_ENABLED = false/);
});

test('all exported modules pass Node syntax and resolve only allowlisted local imports', () => {
  const dir=new URL('../dist-ux-preview/',import.meta.url);
  for (const item of EXPECTED.filter(p=>p.endsWith('.js'))) {
    const target=new URL(item,dir);
    const check=spawnSync(process.execPath,['--check',target.pathname],{encoding:'utf8'});
    assert.equal(check.status,0,item+' '+check.stderr);
    const content=fs.readFileSync(target,'utf8');
    for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const dependency=match[1];
      assert.ok(dependency.startsWith('.'),item+' imports unexpected external module');
      const resolved=new URL(dependency,target);
      assert.ok(resolved.pathname.startsWith(dir.pathname),item+' escapes preview');
      assert.ok(fs.existsSync(resolved),item+' missing import '+dependency);
    }
  }
});

test('browser policy blocks network API calls and search indexing', () => {
  const headers=fs.readFileSync(new URL('../dist-ux-preview/_headers',import.meta.url),'utf8');
  assert.ok(headers.startsWith('/*' + String.fromCharCode(10) + '  Cache-Control:'), 'Cloudflare must receive real header lines');
  assert.ok(headers.split(String.fromCharCode(10)).length >= 8, 'Header rules must be multiline');
  assert.equal(headers.includes(String.fromCharCode(92) + 'n'), false, 'Literal backslash-n must not appear');
  assert.match(headers,/connect-src 'none'/);
  assert.match(headers,/X-Robots-Tag: noindex, nofollow/);
  assert.match(headers,/Cache-Control: no-store/);
  assert.match(headers,/frame-ancestors 'none'/);
});

test('the synthetic staging snapshot contains exactly 15 players and 120 dated measurements', async () => {
  const { DEMO_GROWTH_SNAPSHOT } = await import('../js/demoGrowthFixture.js');
  assert.equal(DEMO_GROWTH_SNAPSHOT.synthetic,true);
  assert.equal(DEMO_GROWTH_SNAPSHOT.live,false);
  assert.equal(DEMO_GROWTH_SNAPSHOT.players.length,15);
  const names=new Set(), jerseys=new Set();
  for(const player of DEMO_GROWTH_SNAPSHOT.players){
    assert.ok(player.name.startsWith('DEMO '));
    assert.equal(player.sessions.length,8);
    assert.equal(names.has(player.name),false);
    assert.equal(jerseys.has(player.jersey),false);
    names.add(player.name);jerseys.add(player.jersey);
    for(let i=1;i<player.sessions.length;i++)assert.ok(player.sessions[i].date>player.sessions[i-1].date);
    for(const row of player.sessions){
      for(const metric of ['height_cm','weight_kg','exit_velo_kmh','throwing_velo_kmh','sprint_18m_s','broad_jump_cm'])
        assert.ok(Number.isFinite(row[metric])&&row[metric]>0,metric);
    }
  }
  const source=fs.readFileSync(new URL('../components/DemoGrowthLab.js',import.meta.url),'utf8');
  assert.ok(source.includes('Staging fixture snapshot'));
  assert.equal(source.includes('supabaseClient'),false);
  assert.equal(source.includes('fetch('),false);
});
