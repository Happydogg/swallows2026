import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {buildStagingFrontend,frontendFiles} from '../backend/release/build-staging-frontend.mjs';
const source=new URL('../',import.meta.url);
test('Pages static export contains only frontend assets, root ES modules, safe headers and disabled staging config',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sdl004-pages-'));try{
  for(const file of frontendFiles)fs.cpSync(new URL(file,source),path.join(tmp,file),{recursive:true});fs.mkdirSync(path.join(tmp,'work'));fs.writeFileSync(path.join(tmp,'work/private.backup'),'NEVER COPY');
  const r=buildStagingFrontend(tmp);assert.equal(fs.existsSync(path.join(r.directory,'backend')),false);assert.equal(fs.existsSync(path.join(r.directory,'work')),false);assert.equal(fs.existsSync(path.join(r.directory,'.env')),false);
  assert.match(fs.readFileSync(path.join(r.directory,'index.html'),'utf8'),/src="\.\/js\/app.js"/);assert.match(fs.readFileSync(path.join(r.directory,'_headers'),'utf8'),/no-store|no-referrer/);assert.match(fs.readFileSync(path.join(r.directory,'js/config.js'),'utf8'),/SUBMISSION_FEATURES_ENABLED = false/);
  for (let n=21;n<=35;n++) {
    const src=path.join(r.directory,'assets','demo-players',n+'.svg');
    assert.equal(fs.existsSync(src),true,'missing demo portrait #'+n);
    assert.match(fs.readFileSync(src,'utf8'),/>DEMO<\/text>/);
    const jpg=fs.readFileSync(path.join(r.directory,'assets','demo-players',n+'.jpg'));assert.equal(jpg[0],255);assert.equal(jpg[1],216);
  }
  const config=path.join(tmp,'js/config.js');fs.writeFileSync(config,fs.readFileSync(config,'utf8').replace('SUBMISSION_FEATURES_ENABLED = false','SUBMISSION_FEATURES_ENABLED = true'));assert.throws(()=>buildStagingFrontend(tmp),/disabled frontend gate/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('Pages export refuses source symlinks and privileged credential patterns',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sdl004-pages-')),outside=fs.mkdtempSync(path.join(os.tmpdir(),'sdl004-pages-target-'));try{for(const file of frontendFiles)fs.cpSync(new URL(file,source),path.join(tmp,file),{recursive:true});fs.writeFileSync(path.join(tmp,'js/accident.js'),'const accidental="sb_secret_synthetic_fixture";');assert.throws(()=>buildStagingFrontend(tmp),/Privileged credential/);fs.rmSync(path.join(tmp,'js/accident.js'));fs.symlinkSync(outside,path.join(tmp,'js/unsafe'),process.platform==='win32'?'junction':'dir');assert.throws(()=>buildStagingFrontend(tmp),/Symlinks/);}finally{fs.rmSync(tmp,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}
});

test('Pages export refuses an import from backend source even when that local file exists',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sdl004-pages-'));try{for(const file of frontendFiles)fs.cpSync(new URL(file,source),path.join(tmp,file),{recursive:true});fs.mkdirSync(path.join(tmp,'backend'));fs.writeFileSync(path.join(tmp,'backend/internal.js'),'export const internal=true;');fs.writeFileSync(path.join(tmp,'js/accidentalImport.js'),"import '../backend/internal.js';");assert.throws(()=>buildStagingFrontend(tmp),/not included in the static export/);}finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
