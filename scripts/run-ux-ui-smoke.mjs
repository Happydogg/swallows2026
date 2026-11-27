// SDL-UX-004: Run real Vue compiler/renderer tests on any OS.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cwd = fileURLToPath(new URL('../',import.meta.url));
const runtime = require.resolve('vue');
const r=spawnSync(process.execPath,
  ['--experimental-vm-modules','--test','tests/vueBindings.test.mjs','tests/performanceWorkspace.test.mjs'],
  { cwd, env: { ...process.env, SDL004_VUE_RUNTIME: runtime }, stdio:'inherit' }
);
if (r.error) throw r.error;
process.exit(r.status ?? 1);
