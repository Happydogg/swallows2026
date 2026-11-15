// SDL-003: video upload metadata form.
export const UploadVideoModal = {
  name: "UploadVideoModal",
  props: {
    t: { type: Function, required: true },
    activePlayerForVideo: { type: Object, required: true },
    getPlayerDisplayName: { type: Function, required: true },
    newDrillVideo: { type: Object, required: true },
    isUploadingVideo: { type: Boolean, required: true },
    selectedVideoFile: { type: Object, required: true }
  },
  emits: ["close", "submit", "pick-file"],
  template: `
<div class="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 no-print">
  <div class="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
    <h3 class="text-lg font-bold flex items-center gap-2">
      <span>📹</span> {{ t('uploadDrillVideoTitle') }}: {{ getPlayerDisplayName(activePlayerForVideo) }}
    </h3>

    <div class="space-y-3 text-sm">
      <div>
        <label class="block text-slate-400 text-xs mb-1">{{ t('sessionDate') }}</label>
        <input v-model="newDrillVideo.session_date" type="date" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-slate-400 text-xs mb-1 font-semibold">{{ t('videoCategory') }}</label>
          <select v-model="newDrillVideo.category" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
            <option value="batting">Batting</option>
            <option value="pitching">Pitching</option>
          </select>
        </div>
        <div>
          <label class="block text-slate-400 text-xs mb-1 font-semibold">{{ t('cameraAngle') }}</label>
          <select v-model="newDrillVideo.camera_angle" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
            <option value="side_open">Side View (Open)</option>
            <option value="behind_catcher">Behind Catcher</option>
            <option value="front">Front View</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-slate-400 text-xs mb-1">Recorded FPS</label>
          <select v-model.number="newDrillVideo.fps_mode" class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white outline-none">
            <option :value="30">30 FPS (Standard)</option>
            <option :value="60">60 FPS (Smooth)</option>
            <option :value="120">120 FPS (Slo-Mo)</option>
            <option :value="240">240 FPS (High Speed)</option>
          </select>
        </div>
        <div>
          <label class="block text-slate-400 text-xs mb-1">{{ t('selectVideoFile') }}</label>
          <input type="file" accept="video/mp4,video/quicktime,video/webm" @change="$emit('pick-file', $event)" class="text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-2.5 file:rounded file:border-0 file:text-xs file:bg-purple-600/30 file:text-purple-300">
        </div>
      </div>

      <div>
        <label class="block text-slate-400 text-xs mb-1">{{ t('coachNotesOptional') }}</label>
        <textarea v-model="newDrillVideo.coach_feedback" rows="2" placeholder="e.g. Lead leg firming up, slightly dropping rear elbow..." class="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs outline-none focus:border-blue-500"></textarea>
      </div>
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <button @click="$emit('close')" :disabled="isUploadingVideo" class="px-3 py-1.5 rounded text-sm text-slate-400 hover:text-white">{{ t('cancel') }}</button>
      <button @click="$emit('submit')" :disabled="isUploadingVideo || !selectedVideoFile" class="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-1.5 rounded text-sm font-medium text-white transition">
        <span v-if="isUploadingVideo">⏳ {{ t('uploading') }}</span>
        <span v-else>{{ t('saveVideo') }}</span>
      </button>
    </div>
  </div>
</div>
  `
};
