// SDL-UX-005: Phone-first video hub. The original private-media controller
// keeps sole ownership of authorization, playback blobs, uploads and cleanup.
export function filterPrivateLibrary(rows,category='',status='') {
  return Array.isArray(rows) ? rows.filter(row=>row && (!category || row.category===category) && (!status || row.status===status)) : [];
}
export const PrivateMediaPanel = {
  name: 'PrivateMediaPanel',
  props: { controller: { type: Object, required: true }, profilePlayerId: { type: String, default: '' }, reviewOnly: {type:Boolean,default:false} },
  emits:['close-review'],
  directives: {
    // Demand-driven previews: only visible cards fetch their authorized MP4.
    'media-visible': {
      mounted(el,binding) {
        const run=()=>binding.instance?.ensureMediaThumbnail?.(binding.value);
        if(typeof IntersectionObserver==='undefined'){run();return;}
        const observer=new IntersectionObserver(entries=>{
          if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();run();}
        },{rootMargin:'120px'});
        el.__sdlObserver=observer;
        observer.observe(el);
      },
      unmounted(el){el.__sdlObserver?.disconnect();delete el.__sdlObserver;}
    }
  },
  setup(props) {
    const categoryFilter=Vue.ref(''),statusFilter=Vue.ref(''),playbackSection=Vue.ref(null);
    const clearFilters=()=>{categoryFilter.value='';statusFilter.value='';};
    const visibleMedia=Vue.computed(()=>filterPrivateLibrary(props.controller.mediaItems.value,categoryFilter.value,statusFilter.value));
    Vue.watch([props.controller.mediaPlayerId,props.controller.mediaReadAllowed],clearFilters,{flush:'sync'});
    Vue.watch(props.controller.mediaPlaybackId,id=>{
      if(id && props.controller.mediaPlaybackUrl.value && playbackSection.value) {
        playbackSection.value.focus({preventScroll:true});
        playbackSection.value.scrollIntoView?.({block:'start',behavior:'auto'});
      }
    },{flush:'post'});
    return { ...props.controller,categoryFilter,statusFilter,clearFilters,visibleMedia,playbackSection };
  },
  template: `
<section class="mb-4 space-y-4 no-print" aria-label="Private player videos">
  <header v-if="!reviewOnly" class="flex flex-wrap items-center justify-between gap-2">
    <div><p class="text-xs font-semibold text-slate-400">Video Room</p><h2 class="text-2xl font-bold text-white">Private videos</h2></div>
    <span class="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300">Private staging media</span>
  </header>

  <div v-if="!reviewOnly && !profilePlayerId" class="rounded-2xl border border-slate-700 bg-slate-900/90 p-4 sm:p-5">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="text-lg font-bold text-white">Choose a player</h3>
        <p class="text-xs text-slate-400">Only authorized family or coached players appear.</p>
      </div>
      <span class="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-300">{{ mediaPlayers.length }} available</span>
    </div>
    <label class="block text-sm font-semibold text-slate-300" for="sdl-video-player-picker">
      Player library
      <select id="sdl-video-player-picker" :value="mediaPlayerId" @change="selectMediaPlayer($event.target.value)"
        class="mt-2 block w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-cyan-400">
        <option value="">Select a player</option>
        <option v-for="player in mediaPlayers" :key="player.id" :value="player.id">{{ player.label }}</option>
      </select>
    </label>
    <p v-if="!mediaPlayers.length" class="mt-4 rounded-xl border border-dashed border-slate-600 p-5 text-sm text-slate-400">No linked or coached players are available. Check your club membership or verified guardian link.</p>
  </div>

  <div v-if="reviewOnly && inboxReviewMode" class="flex flex-wrap items-center justify-between gap-2"><h3 class="text-lg font-bold text-white">{{inboxReviewPlayerLabel || 'Opening review…'}}</h3><button type="button" :disabled="mediaReviewing" @click="$emit('close-review')" class="sdl-secondary min-h-11 px-3 text-sm">Close review</button></div>
  <p v-if="mediaError" role="alert" class="rounded-xl border border-rose-700/70 bg-rose-950/30 p-4 text-sm text-rose-200">{{ mediaError }}</p>
  <p v-if="mediaNotice" role="status" class="rounded-xl border border-emerald-700/50 bg-emerald-950/30 p-4 text-sm text-emerald-200">{{ mediaNotice }}</p>
  <div v-if="mediaLoading" class="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-sm text-slate-300" role="status">
    <span class="h-4 w-4 animate-pulse rounded-full bg-cyan-400" aria-hidden="true"></span>
    Checking access and loading videos…
  </div>

  <template v-if="mediaPlayerId && !mediaLoading && (!profilePlayerId || profilePlayerId === mediaPlayerId)">
    <div v-if="mediaReadAllowed" class="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/90 p-4 sm:p-5">
      <template v-if="!reviewOnly">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-lg font-bold text-white">Private clips</h3>
          <p class="mt-1 text-xs text-slate-400">Up to 30 recent private clips · Approval never publishes a video</p>
        </div>
        <button type="button" @click="refreshMedia" :disabled="mediaUploading || mediaPlaybackLoading"
          class="rounded-xl border border-blue-500/50 bg-blue-900/40 px-4 py-3 text-sm font-bold text-sky-200 hover:bg-blue-800/60 disabled:cursor-not-allowed disabled:opacity-50">Refresh videos</button>
      </div>
      <div v-if="mediaItems.length" class="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Private video filters">
        <label class="min-w-0 text-xs font-semibold text-slate-300">Category
          <select v-model="categoryFilter" class="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white">
            <option value="">All categories</option><option value="pitching">Pitching</option><option value="batting">Batting</option><option value="throwing">Throwing</option>
          </select>
        </label>
        <label class="min-w-0 text-xs font-semibold text-slate-300">Review status
          <select v-model="statusFilter" class="mt-1 min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-white">
            <option value="">All statuses</option><option value="pending">Pending review</option><option value="approved">Approved privately</option><option value="rejected">Rejected</option>
          </select>
        </label>
        <p role="status" class="text-xs text-slate-400">{{visibleMedia.length}} of {{mediaItems.length}} loaded clips</p>
        <button v-if="categoryFilter || statusFilter" type="button" @click="clearFilters" class="min-h-11 rounded-lg border border-slate-600 px-3 text-sm text-slate-200">Clear filters</button>
      </div>
      <div v-if="!mediaItems.length" class="rounded-xl border border-dashed border-slate-600 bg-slate-950/60 p-6 text-center">
        <p class="text-2xl" aria-hidden="true">🎞️</p>
        <p class="mt-2 text-sm font-bold text-white">No private clips found</p>
        <p class="mt-1 text-xs text-slate-400">Select another player or check again after a private video has been uploaded.</p>
      </div>
      <p v-else-if="!visibleMedia.length" role="status" class="rounded-xl border border-slate-700 p-4 text-sm text-slate-300">No loaded clips match these filters.</p>
      <ul v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Authorized private video library">
        <li v-for="(item, index) in visibleMedia" :key="item.id" v-media-visible="item"
          class="flex min-w-0 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/80 sm:block">
          <button type="button" @click="playPrivateMedia(item)" :disabled="mediaPlaybackLoading || mediaReviewing || item.status==='rejected'"
            :aria-label="'Play private practice clip '+(index+1)"
            class="relative flex h-24 w-24 shrink-0 self-start items-center justify-center overflow-hidden rounded-br-lg bg-slate-900 sm:aspect-video sm:h-auto sm:w-full disabled:opacity-60">
            <img v-if="mediaThumbnails[item.id]" :src="mediaThumbnails[item.id]"
              :alt="'Frame preview of private practice clip '+(index+1)" loading="lazy"
              class="h-full w-full object-cover">
            <div v-else class="flex flex-col items-center gap-2 px-2 text-center text-xs text-slate-400">
              <span class="text-2xl text-cyan-300" aria-hidden="true">▣</span>
              <span>{{ mediaThumbnailBusy[item.id] ? 'Loading preview…' :
                mediaThumbnailFailed[item.id] ? 'Preview unavailable' : 'Preparing preview…' }}</span>
            </div>
            <span class="absolute inset-0 flex items-center justify-center bg-black/20 transition hover:bg-black/40" aria-hidden="true">
              <span class="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-200/70 bg-slate-950/70 text-xl text-cyan-200 shadow-lg">▶</span>
            </span>
          </button>
          <div class="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3 sm:p-4">
            <div>
              <p class="break-words text-sm font-bold capitalize text-white">{{item.category || 'Practice'}} clip</p>
              <p class="mt-1 text-xs font-semibold" :class="item.status==='pending'?'text-amber-200':item.status==='approved'?'text-emerald-200':'text-slate-300'">{{ {pending:'Awaiting independent review',approved:'Approved privately',rejected:'Rejected · playback blocked'}[item.status] }}</p>
              <p class="mt-1 text-xs leading-relaxed text-slate-400">
                {{ item.created_at ? new Date(item.created_at).toLocaleDateString() : 'New private clip' }}
                <span v-if="item.category">· {{ item.category }}</span>
              </p>
            </div>
            <button v-if="mediaThumbnailFailed[item.id]" type="button" @click="retryMediaThumbnail(item)" class="rounded-lg border border-slate-600 px-3 py-2 text-sm text-white">Retry preview</button>
            <button type="button" @click="playPrivateMedia(item)" :disabled="mediaPlaybackLoading || mediaReviewing || item.status==='rejected'"
              class="min-h-10 w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50">
              ▶ Play privately
            </button>
            <p v-if="item.can_review===true" class="text-xs text-cyan-200">Play the clip to review it.</p>
            <button v-if="item.can_archive === true" type="button" @click="archivePrivateMedia(item)" :disabled="mediaArchiving || mediaReviewing || mediaUploading || mediaPlaybackLoading"
              class="min-h-10 w-full rounded-xl border border-rose-700 px-3 py-2 text-sm font-semibold text-rose-200 disabled:opacity-50">
              {{ mediaArchiving ? 'Deleting…' : 'Delete video' }}
            </button>
          </div>
        </li>
      </ul>
      </template>
      <p v-if="mediaPlaybackLoading" role="status" class="rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-300">Loading private playback…</p>
      <section v-if="mediaPlaybackUrl" ref="playbackSection" tabindex="-1" class="scroll-mt-4 space-y-3 rounded-2xl border border-cyan-400/30 bg-slate-950 p-3 sm:p-4" aria-label="Selected private video player">
        <div class="flex flex-wrap items-center justify-between gap-2 px-1">
          <h4 class="text-sm font-bold text-white">Now watching</h4>
          <span class="text-xs font-semibold text-emerald-300">Authorized playback</span>
        </div>
        <video :key="mediaPlaybackUrl" :src="mediaPlaybackUrl" controls playsinline preload="metadata"
          @error="reportPlaybackError" class="aspect-video w-full rounded-xl bg-black object-contain"></video>
        <section v-if="reviewItem" class="space-y-3 rounded-xl border border-cyan-700 p-3" aria-label="Independent video review">
          <h4 class="text-sm font-bold text-white">Independent video review</h4>
          <p class="text-xs text-slate-300">Watch the entire clip before deciding. Approval stays private. Subject confirmation is optional for private approval, but required for future team sharing.</p>
          <label class="flex items-start gap-2 text-sm text-slate-200"><input type="checkbox" v-model="reviewSingleSubject" :disabled="mediaReviewing">I confirm only this selected athlete is identifiable in the entire clip.</label>
          <label class="block text-sm text-slate-300">Review note (required for rejection)<textarea v-model="reviewVideoNote" maxlength="1000" :disabled="mediaReviewing" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 p-2"></textarea></label>
          <div class="flex flex-wrap gap-2">
            <button type="button" @click="reviewPrivateMedia('approved')" :disabled="mediaReviewing || mediaArchiving || mediaUploading" class="flex-1 rounded-xl bg-emerald-700 p-3 text-sm font-bold text-white disabled:opacity-50">Approve privately</button>
            <button type="button" @click="reviewPrivateMedia('rejected')" :disabled="mediaReviewing || mediaArchiving || mediaUploading || !reviewVideoNote.trim()" class="flex-1 rounded-xl border border-rose-700 p-3 text-sm font-bold text-rose-200 disabled:opacity-50">Reject</button>
          </div>
        </section>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Video recording metadata for analysis">
          <label class="block text-sm font-semibold text-slate-300">
            Movement in this clip
            <select v-model="analysisCategory" class="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-base text-white">
              <option value="">Choose movement</option>
              <option value="pitching">Pitching</option>
              <option value="batting">Batting</option>
            </select>
          </label>
          <label class="block text-sm font-semibold text-slate-300">
            Original recording FPS
            <select v-model="analysisFps" class="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-3 text-base text-white">
              <option value="">Choose recording FPS</option>
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
              <option value="120">120 FPS</option>
              <option value="240">240 FPS</option>
            </select>
          </label>
        </div>
        <button type="button" @click="analyzePrivateMedia" :disabled="!analysisCategory || !analysisFps"
          class="w-full rounded-xl bg-amber-500 px-4 py-3.5 text-sm font-black text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
          Analyze privately (AR HUD)
        </button>
        <p class="text-xs leading-relaxed text-slate-400">The original recording FPS and movement type are not stored with older private clips. Choose accurately; automatic motion checkpoints remain experimental pose estimates, not verified ball release or contact measurements.</p>
      </section>
    </div>

    <div v-else-if="!mediaError" class="rounded-2xl border border-amber-600/30 bg-amber-950/20 p-5 text-sm text-amber-200">
      You do not have permission to view private clips for this player.
    </div>

    <template v-if="!reviewOnly">
    <div v-if="mediaUploadAllowed" class="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/90 p-4 sm:p-5">
      <div>
        <h3 class="text-lg font-bold text-white">Add a practice clip</h3>
        <p class="mt-1 text-xs text-slate-400">Synthetic staging footage only. Do not upload recordings of real children. Private MP4 or MOV, maximum 40 MiB. HEVC playback depends on the device.</p>
      </div>
      <label class="block text-sm font-semibold text-slate-300">
        Video category
        <select v-model="uploadCategory" :disabled="mediaUploading" class="mt-2 block min-h-11 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-base text-white">
          <option value="" disabled>Choose a category</option>
          <option value="pitching">Pitching</option>
          <option value="batting">Batting</option>
          <option value="throwing">Throwing</option>
        </select>
      </label>
      <label class="block text-sm font-semibold text-slate-300" for="sdl-private-upload">
        Choose from Photo Library or Files (MP4/MOV, up to 40 MiB)
        <input id="sdl-private-upload" type="file" accept="video/*,.mp4,.mov"
          :disabled="mediaUploading" @change="selectMediaFile"
          class="mt-2 block w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-slate-200"/>
      </label>
      <p v-if="mediaFile" class="text-xs text-slate-400">{{ mediaFile.name }}</p>
      <button type="button" @click="uploadPrivateMedia" :disabled="!mediaFile || !uploadCategory || mediaUploading"
        class="w-full rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white hover:bg-purple-500 disabled:opacity-50 sm:w-auto">
        {{ mediaUploading ? 'Uploading…' : 'Upload private clip' }}
      </button>
      <div v-if="mediaUploading" role="status" class="space-y-2">
        <progress :value="mediaProgress" max="100" aria-label="Private video upload progress" class="h-3 w-full accent-cyan-400"></progress>
        <p class="text-xs text-slate-300">{{ mediaProgress }}% · {{ mediaProgress >= 99 ? 'Saving securely…' : 'Sending video…' }}</p>
      </div>
    </div>
    <p v-else-if="mediaUploadError" role="status" class="rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs text-slate-400">{{ mediaUploadError }}</p>
    <p v-else class="rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs text-slate-400">You do not have upload permission for this player.</p>
    </template>
  </template>

  <details v-if="!reviewOnly" class="rounded-2xl border border-slate-700 bg-slate-900/75 p-4 text-sm">
    <summary class="cursor-pointer py-2 font-bold text-white">Parent submissions and Team Clubhouse</summary>
    <p class="pt-2 text-sm leading-relaxed text-slate-400">The separate submissions and coach-review workspace remains available through the existing controls. Private clips are never automatically approved or shared.</p>
  </details>
</section>
  `
};