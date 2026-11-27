import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../docs/design/SDL-UX-003/action-center-prototype.html', import.meta.url),'utf8');
const source=html.match(/<script id="ux003-model">([\s\S]*?)<\/script>/)?.[1];
assert.ok(source,'prototype model found');
const cases=vm.runInNewContext(source+'\nrunChecks();');
for(const entry of cases)test(entry.name,()=>assert.equal(entry.pass,true,entry.error));
test('No external scripts or live media endpoints in offline prototype',()=>{
  assert.doesNotMatch(html,/<script[^>]+src=|https?:\/\/|\/v2\/submissions|localStorage|sessionStorage|fetch\s*\(/i);
});
