// SDL-GOV: comparison baseline extracted from GitHub main on 2026-11-20.
// This enforces source preservation, not proof every legacy workflow is operational.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const files=[
  "components/AppHeader.js",
  "components/ArAnalyzerModal.js",
  "components/PlayerFormModal.js",
  "components/PlayerProfile.js",
  "components/SessionFormModal.js",
  "components/TeamOverview.js",
  "components/UploadVideoModal.js",
  "composables/useAnalytics.js",
  "composables/useCoachMode.js",
  "composables/usePlayers.js",
  "composables/useRosterCsv.js",
  "composables/useSessions.js",
  "composables/useVideos.js",
  "js/app.js",
  "js/arAnalyzer.js",
  "js/chartManager.js",
  "js/config.js",
  "js/csvManager.js",
  "js/mediaStorage.js",
  "js/pitchAnchorDetector.js",
  "js/pitchBiometrics.js",
  "js/pitchOverlayRenderer.js",
  "js/statsEngine.js",
  "js/supabaseService.js",
  "js/translations.js",
  "utils/jerseyUtils.js",
  "utils/playerUtils.js",
  "utils/sessionUtils.js"
];
const symbols={
  "components/PlayerProfile.js": [
    "PlayerProfile"
  ],
  "composables/useCoachMode.js": [
    "useCoachMode"
  ],
  "js/arAnalyzer.js": [
    "createArAnalyzerController"
  ],
  "js/chartManager.js": [
    "renderPlayerChartCanvas"
  ],
  "js/config.js": [
    "R2_PUBLIC_BASE_URL",
    "R2_WORKER_SIGNER_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_URL",
    "supabaseClient"
  ],
  "js/mediaStorage.js": [
    "compressImage",
    "deleteFileFromR2",
    "formatImgUrl",
    "generateAnnotatedSnapshot",
    "uploadAvatarToSupabase",
    "uploadFileToR2"
  ],
  "js/supabaseService.js": [
    "deleteDrillVideoRecord",
    "deletePlayerRecord",
    "deleteSessionRecord",
    "fetchAllCloudData",
    "insertPlayerRecord",
    "insertSessionRecord",
    "updatePlayerRecord",
    "updateSessionRecord",
    "uploadDrillVideoWithQuota"
  ],
  "js/translations.js": [
    "translations"
  ]
};
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('all 28 original production-branch core JS modules are still present',()=>{
  assert.equal(files.length,28);
  for(const path of files){assert.ok(fs.existsSync(new URL('../'+path,import.meta.url)),path);}
});
test('all original named exports in modified production core modules are still declared',()=>{
  for(const [path,names] of Object.entries(symbols)){
    const source=read(path);
    const declared=[...source.matchAll(new RegExp('export'+'\\s+'+'(?:(?:async|default)\\s+)?'+'(?:const|let|var|function|class)\\s+'+'([A-Za-z_$][\\w$]*)','g'))].map(m=>m[1]);
    for(const name of names)assert.ok(declared.includes(name),path+' must still export '+name);
  }
});
test('legacy production feature components remain mounted and staging safety flags remain off',()=>{
  const html=read('index.html'),app=read('js/app.js'),media=read('js/mediaStorage.js'),config=read('js/config.js');
  for(const tag of ['app-header','player-form-modal','player-profile','team-overview','session-form-modal',
   'upload-video-modal','ar-analyzer-modal','private-media-panel','submission-workspace','club-enrollment-admin'])
    assert.ok(html.includes('<'+tag),tag);
  for(const item of ['usePlayers','useSessions','useVideos','useRosterCsv','useAnalytics','createArAnalyzerController'])
    assert.ok(app.includes(item),item);
  assert.ok(media.includes("avatar uploads are disabled until storage is isolated"));
  assert.ok(config.includes('SUBMISSION_FEATURES_ENABLED = false'));
  assert.ok(html.includes('<avatar-manager'));
});
