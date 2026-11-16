export const PrivateMediaPanel = {
  name: 'PrivateMediaPanel',
  props: { controller: { type: Object, required: true } },
  setup(props) { return { ...props.controller }; },
  template: `
<section class="my-6 rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-4 no-print" aria-label="Private player videos">
  <div>
    <h2 class="text-lg font-bold">Private player videos</h2>
    <p class="text-sm text-slate-400">Private clips for your linked children or coached players. Upload access is checked by the media service.</p>
  </div>
  <label class="block text-sm">Player
    <select :value="mediaPlayerId" @change="selectMediaPlayer($event.target.value)" class="mt-1 block w-full bg-slate-900 rounded p-3">
      <option value="">Select a player</option>
      <option v-for="player in mediaPlayers" :key="player.id" :value="player.id">{{ player.label }}</option>
    </select>
  </label>
  <p v-if="!mediaPlayers.length" class="text-sm text-slate-400">No linked or coached players are available.</p>
  <p v-if="mediaError" role="alert" class="text-rose-300 text-sm">{{ mediaError }}</p>
  <p v-if="mediaNotice" role="status" class="text-emerald-300 text-sm">{{ mediaNotice }}</p>
  <p v-if="mediaLoading" role="status" class="text-slate-400 text-sm">Checking access and loading videos…</p>
  <template v-if="mediaPlayerId && !mediaLoading">
    <div v-if="mediaUploadAllowed" class="space-y-3 border border-slate-700 rounded p-3">
      <label class="block text-sm">Upload a private pilot clip (MP4, up to 20 MiB)
        <input type="file" accept="video/mp4,.mp4" :disabled="mediaUploading" @change="selectMediaFile" class="block w-full mt-2 text-sm" />
      </label>
      <p v-if="mediaFile" class="text-xs text-slate-400">{{ mediaFile.name }}</p>
      <button @click="uploadPrivateMedia" :disabled="!mediaFile || mediaUploading" class="bg-purple-600 rounded p-3 disabled:opacity-50">
        {{ mediaUploading ? 'Uploading…' : 'Upload private clip' }}
      </button>
      <div v-if="mediaUploading" role="status">
        <progress :value="mediaProgress" max="100" class="w-full"></progress>
        <p class="text-xs">{{ mediaProgress }}% — {{ mediaProgress >= 99 ? 'Saving securely…' : 'Sending video…' }}</p>
      </div>
    </div>
    <p v-else class="text-sm text-slate-400">Uploads are unavailable for this player. Verified guardians can view permitted private clips.</p>
    <div v-if="mediaReadAllowed" class="space-y-3">
      <button @click="refreshMedia" :disabled="mediaUploading || mediaPlaybackLoading" class="rounded bg-slate-700 p-3 disabled:opacity-50">Refresh videos</button>
      <p class="text-xs text-slate-400">Showing up to 30 recent private clips. These clips have no approval or sharing status.</p>
      <p v-if="!mediaItems.length" class="text-sm text-slate-400">No private clips found.</p>
      <ul class="space-y-2">
        <li v-for="item in mediaItems" :key="item.id" class="rounded bg-slate-900 p-3 flex flex-wrap justify-between items-center gap-3">
          <span class="text-sm">{{ item.created_at ? new Date(item.created_at).toLocaleString() : 'New private clip' }} · {{ (item.byte_size / 1048576).toFixed(1) }} MiB</span>
          <button @click="playPrivateMedia(item)" :disabled="mediaPlaybackLoading" class="rounded bg-blue-600 p-3 disabled:opacity-50">Play privately</button>
        </li>
      </ul>
      <p v-if="mediaPlaybackLoading" role="status" class="text-sm">Loading private playback…</p>
      <div v-if="mediaPlaybackUrl" class="space-y-2">
        <video :key="mediaPlaybackUrl" :src="mediaPlaybackUrl" controls playsinline preload="metadata" @error="reportPlaybackError" class="w-full max-h-96 bg-black rounded"></video>
        <button @click="analyzePrivateMedia" class="rounded bg-amber-500 text-black p-3">Analyze privately (AR HUD)</button>
        <p class="text-xs text-slate-400">Pilot analysis uses default batting / 60 FPS settings; recording metadata is not yet stored.</p>
      </div>
    </div>
  </template>
  <details class="text-sm border-t border-slate-700 pt-3">
    <summary class="cursor-pointer py-2">Parent submissions and Team Clubhouse</summary>
    <p class="text-slate-400 py-2">Use the workspace above for parent submissions, coach review and team sharing after backend verification. Private pilot clips are never automatically approved or shared with teammates.</p>
  </details>
</section>`
};
