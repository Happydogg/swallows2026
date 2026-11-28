import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tests = [
  'authLifecycle', 'coachBatchUpload', 'deploymentHardening', 'privateMedia', 'stagingFrontend',
  'ux003DownloadLifecycle', 'ux003LiveReview', 'uxV01VideoNavigation', 'vueBindings'
].map(name => 'tests/' + name + '.test.mjs');
const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--test', ...tests], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, SDL004_VUE_RUNTIME: require.resolve('vue') },
  stdio: 'inherit'
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
