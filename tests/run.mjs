// Reproducible full local suite. No provider credentials or remote services.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const workerRequire=createRequire(new URL('../backend/worker/package.json',import.meta.url));
workerRequire.resolve('miniflare');
if(!fs.existsSync(new URL('../backend/worker/.cloudflare/output/v1/workers/default/bundle/index.js',import.meta.url))) {
 throw Error('Run npm run check:worker before the complete test suite.');
}
const env={...process.env,SDL004_VUE_RUNTIME:require.resolve('vue'),SDL004_PGLITE_RUNTIME:require.resolve('@electric-sql/pglite')};
const files=fs.readdirSync(new URL('./',import.meta.url)).filter(name=>name.endsWith('.test.mjs')).map(name=>'tests/'+name);
const run=spawnSync(process.execPath,['--experimental-vm-modules','--test',...files],{cwd:root,env,stdio:'inherit'});
process.exit(run.status??1);
