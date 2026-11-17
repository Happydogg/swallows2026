// Cross-platform, local build ONLY. No shell assignments, deployment or provider calls.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const run=spawnSync(process.execPath,[fileURLToPath(new URL('./node_modules/cf/bin/cf',import.meta.url)),'build'],{
 cwd:fileURLToPath(new URL('./',import.meta.url)),env:{...process.env,SDL004_LOCAL_BUILD_ONLY:'1'},stdio:'inherit',shell:false
});
process.exit(run.status??1);
