// Static allowlisted export only. Never deploys, reads environment secrets or includes backend artifacts.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
export const frontendFiles=['index.html','logo.png','components','composables','js','utils'];
const repo=fileURLToPath(new URL('../../',import.meta.url));
export function buildStagingFrontend(root=repo){
 root=path.resolve(root);
 const config=fs.readFileSync(path.join(root,'js/config.js'),'utf8');
 if(!config.includes("SUPABASE_URL = 'https://wvurolqbjhuckkkjiiiv.supabase.co'")||!config.includes("PRIVATE_MEDIA_WORKER_URL = 'https://sdl-r2-staging-gate.sampson-ho.workers.dev'")||!/SUBMISSION_FEATURES_ENABLED\s*=\s*false/.test(config))throw Error('Staging identity and disabled frontend gate required.');
 const out=path.join(root,'dist-staging');fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out);
 const files=[];
 const copy=(relative)=>{const source=path.join(root,relative),stat=fs.lstatSync(source);if(stat.isSymbolicLink())throw Error('Symlinks are not allowed in frontend export');
  if(stat.isDirectory()){for(const entry of fs.readdirSync(source))copy(path.join(relative,entry));return;}
  if(!/\.(js|html|png)$/.test(relative))throw Error('Unexpected frontend asset type: '+relative);
  if(/\.(js|html)$/.test(relative)){
   const text=fs.readFileSync(source,'utf8');if(/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text))throw Error('Privileged credential pattern in frontend source');
   for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){const dependency=path.resolve(path.dirname(source),match[1]);if(!dependency.startsWith(root+path.sep)||!fs.existsSync(dependency))throw Error('Missing or external local ES module');}
  }
  fs.mkdirSync(path.dirname(path.join(out,relative)),{recursive:true});fs.copyFileSync(source,path.join(out,relative));files.push(relative.replaceAll(path.sep,'/'));
 };
 for(const file of frontendFiles)copy(file);
 for(const relative of files.filter(f=>f.endsWith('.js'))){
  const target=path.join(out,relative),text=fs.readFileSync(target,'utf8');
  for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
   const dependency=path.resolve(path.dirname(target),match[1]);
   if(!dependency.startsWith(out+path.sep)||!fs.existsSync(dependency))throw Error('ES module was not included in the static export');
  }
 }

 fs.writeFileSync(path.join(out,'_headers'),'/*\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  X-Robots-Tag: noindex, nofollow\n');
 // An explicit 404 avoids serving index.html for arbitrary invite/path guesses. Invitations use fragments.
 fs.writeFileSync(path.join(out,'404.html'),'<!doctype html><title>SDL staging</title><p>Page not found. Open the staging root URL.</p>');
 return {directory:out,files};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){const r=buildStagingFrontend();console.log(`Prepared ${r.files.length} static frontend files. No deployment performed; v2 remains disabled.`);}
