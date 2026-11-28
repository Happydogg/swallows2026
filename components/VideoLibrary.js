// SDL-UX-005: Phone-first video hub. The original private-media controller
// keeps sole ownership of authorization, playback blobs, uploads and cleanup.
import { VideoPlayerHero } from './VideoPlayerHero.js';
export const VideoLibrary = {
  components:{VideoPlayerHero},
  name: 'VideoLibrary',
  props: { controller: { type: Object, required: true }, restrictModeration: Boolean, roster:{type:Array,default:()=>[]}, destination:{type:String,default:'team'} },
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
 const c=props.controller,{ref,computed,watch,nextTick}=Vue;
 const search=ref(''),team=ref(''),category=ref('All'),mode=ref('Watch'),uploadOpen=ref(false),failed=ref({});
 const scoped=computed(()=>{const byId=new Map(props.roster.map(p=>[p.id,p]));return c.mediaPlayers.value.map(p=>{const r=byId.get(p.id);return r?{id:p.id,preferred_name:r.preferred_name||p.label,jersey:r.jersey,team_id:r.team_id,team_name:r.team_name,position:r.position,bats:r.bats,throws:r.throws,photo_url:typeof r.photo_url==='string'&&!r.photo_url.startsWith('sdl-private-avatar:')?r.photo_url:''}:{id:p.id,preferred_name:p.label};});});
 const teams=computed(()=>[...new Map(scoped.value.filter(p=>p.team_id).map(p=>[p.team_id,p.team_name||'Team'])).entries()]);
 const selected=computed(()=>scoped.value.find(p=>p.id===c.mediaPlayerId.value)||null);
 const visible=computed(()=>{const q=search.value.trim().replace(/^#/,'').toLowerCase();return scoped.value.filter(p=>(!team.value||p.team_id===team.value)&&(!q||String(p.preferred_name).toLowerCase().includes(q)||String(p.jersey??'').toLowerCase().includes(q))).slice().sort((a,b)=>{const x=parseInt(a.jersey,10),y=parseInt(b.jersey,10);return (Number.isFinite(x)?x:Infinity)-(Number.isFinite(y)?y:Infinity)||String(a.preferred_name).localeCompare(String(b.preferred_name));});});
 const gallery=computed(()=>c.mediaItems.value.filter(x=>category.value==='All'||x.category===category.value.toLowerCase()).slice().sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))));
 const busy=computed(()=>c.mediaUploading.value||c.mediaReviewing.value||c.mediaArchiving.value);
 const uploadSection=ref(null),videoElement=ref(null);
 function resetView(){category.value='All';mode.value='Watch';uploadOpen.value=false;}
 function pick(id){if(busy.value||!scoped.value.some(p=>p.id===id))return;resetView();void c.selectMediaPlayer(id);}
 function switchPlayer(){if(busy.value)return;c.resetMedia();resetView();}
 function openUpload(){if(!c.mediaUploadAllowed.value||busy.value)return;uploadOpen.value=true;void nextTick(()=>uploadSection.value?.scrollIntoView?.({behavior:'smooth',block:'start'}));}
 function openClip(item){if(busy.value)return;mode.value='Watch';void c.playPrivateMedia(item);}
 function backGallery(){if(busy.value)return;c.closePrivatePlayback();mode.value='Watch';}
 function fullscreen(){const v=videoElement.value;if(!v)return;try{if(v.requestFullscreen)void Promise.resolve(v.requestFullscreen()).catch(()=>{v.webkitEnterFullscreen?.();});else v.webkitEnterFullscreen?.();}catch{}}
 watch(()=>c.mediaPlaybackUrl.value,url=>{if(url)void nextTick(()=>{try{videoElement.value?.play?.()?.catch?.(()=>{});}catch{}});});
 watch(()=>scoped.value.map(p=>p.id).join('|'),()=>{if(c.mediaPlayerId.value&&!selected.value)c.resetMedia();if(!teams.value.some(([id])=>id===team.value))team.value=teams.value.length===1?teams.value[0][0]:'';if(props.destination==='mine'&&scoped.value.length===1&&!c.mediaPlayerId.value)pick(scoped.value[0].id);},{immediate:true});
 watch(()=>c.mediaPlayerId.value,resetView);
 return {...c,search,team,teams,selected,visible,category,gallery,mode,uploadOpen,failed,busy,pick,switchPlayer,openUpload,openClip,backGallery,fullscreen,uploadSection,videoElement};
},
  template: `
<section class="mb-4 space-y-4 no-print" aria-label="Private player videos">
  <header class="flex flex-wrap items-center justify-between gap-2">
    <div><p class="text-xs font-semibold text-slate-400">Video Room</p><h2 class="text-2xl font-bold text-white">{{destination==='mine'?'My Videos':'My Team Videos'}}</h2></div>
    <span class="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300">Private staging media</span>
  </header>

<template v-if="!selected">
 <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="text-xl font-bold text-white">Choose a player</h3><label v-if="teams.length>1 && destination!=='mine'" class="text-sm">Team <select v-model="team" class="rounded-lg border border-slate-700 bg-slate-900 p-2"><option value="">All assigned teams</option><option v-for="([id,label]) in teams" :key="id" :value="id">{{label}}</option></select></label></div>
 <input v-model="search" placeholder="Search name or jersey number" aria-label="Search name or jersey number" class="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-base">
 <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label="Authorized video roster"><button v-for="p in visible" :key="p.id" @click="pick(p.id)" class="min-w-0 rounded-2xl border border-slate-700 bg-slate-900 px-2 py-3 text-center hover:border-cyan-400"><img v-if="p.photo_url&&!failed[p.id]" :src="p.photo_url" @error="failed[p.id]=true" alt="" referrerpolicy="no-referrer" loading="lazy" class="aspect-square w-full rounded-xl object-cover"><div v-else class="grid aspect-square place-content-center rounded-xl bg-blue-950 text-2xl font-bold text-sky-300">#{{p.jersey||'–'}}</div><p class="mt-2 text-lg font-black text-cyan-300">#{{p.jersey||'–'}}</p><p class="break-words text-xs font-semibold text-white">{{p.preferred_name}}</p></button></div>
 <p v-if="!visible.length" class="text-sm text-slate-400">No matching authorized players.</p>
</template>
<template v-if="selected && !mediaPlaybackUrl && !mediaPlaybackLoading"><button @click="switchPlayer" :disabled="busy" class="min-h-11 text-sm font-bold text-cyan-300 disabled:opacity-50">‹ Switch Player</button><video-player-hero :player="selected"><template v-if="mediaUploadAllowed && !mediaLoading" #actions><button @click="openUpload" :disabled="busy" class="min-h-12 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">+ Upload Video</button></template></video-player-hero></template>
  <p v-if="mediaError" role="alert" class="rounded-xl border border-rose-700/70 bg-rose-950/30 p-4 text-sm text-rose-200">{{ mediaError }}</p>
  <p v-if="mediaNotice" role="status" class="rounded-xl border border-emerald-700/50 bg-emerald-950/30 p-4 text-sm text-emerald-200">{{ mediaNotice }}</p>
  <div v-if="mediaLoading" class="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-sm text-slate-300" role="status">
    <span class="h-4 w-4 animate-pulse rounded-full bg-cyan-400" aria-hidden="true"></span>
    Checking access and loading videos…
  </div>

  <template v-if="mediaPlayerId && !mediaLoading">
    <div v-if="mediaReadAllowed" class="space-y-4 rounded-2xl border border-slate-700 bg-slate-900/90 p-4 sm:p-5">
      <div v-if="!mediaPlaybackUrl && !mediaPlaybackLoading" class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-lg font-bold text-white">Private clips</h3>
          <p class="mt-1 text-xs text-slate-400">Up to 30 recent private clips · Approval never publishes a video</p>
        </div>
        <button type="button" @click="refreshMedia" :disabled="mediaUploading || mediaPlaybackLoading"
          class="rounded-xl border border-blue-500/50 bg-blue-900/40 px-4 py-3 text-sm font-bold text-sky-200 hover:bg-blue-800/60 disabled:cursor-not-allowed disabled:opacity-50">Refresh videos</button>
      </div>
      <div v-if="!mediaPlaybackUrl && !mediaPlaybackLoading" class="flex flex-wrap gap-2" aria-label="Activity filters"><button v-for="kind in ['All','Batting','Pitching','Throwing']" :key="kind" @click="category=kind" :aria-pressed="category===kind" :class="category===kind?'bg-blue-600':'bg-slate-800'" class="rounded-xl px-3 py-2 text-sm font-bold">{{kind}}</button></div>
      <div v-if="!mediaPlaybackUrl && !mediaPlaybackLoading && !gallery.length" class="rounded-xl border border-dashed border-slate-600 bg-slate-950/60 p-6 text-center">
        <p class="text-2xl" aria-hidden="true">🎞️</p>
        <p class="mt-2 text-sm font-bold text-white">{{mediaItems.length?'No matching clips':'No private clips found'}}</p>
        <p class="mt-1 text-xs text-slate-400">{{mediaItems.length?'Choose another activity filter.':'Select another player or upload an authorized private video.'}}</p>
      </div>
      <ul v-else-if="!mediaPlaybackUrl && !mediaPlaybackLoading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Authorized private video library">
        <li v-for="(item, index) in gallery" :key="item.id" v-media-visible="item"
          class="min-w-0 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/80" :class="index===0?'col-span-2 sm:col-span-3 lg:col-span-2 lg:row-span-2':''">
          <button type="button" @click="openClip(item)" :disabled="mediaPlaybackLoading || mediaReviewing || item.status==='rejected'"
            :aria-label="'Play private practice clip '+(index+1)"
            class="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-slate-900 disabled:opacity-60">
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
              <p class="text-xs font-bold text-cyan-300" v-if="index===0">Latest video</p><p class="text-sm font-bold text-white">{{item.category||'Practice clip'}}</p>
              <p class="mt-1 text-xs font-semibold text-slate-300">{{ {pending:'Awaiting independent review',approved:'Approved privately',rejected:'Rejected · playback blocked'}[item.status] }}</p>
              <p class="mt-1 text-xs leading-relaxed text-slate-400">
                {{ item.created_at ? new Date(item.created_at).toLocaleDateString() : 'New private clip' }}
                <span v-if="item.category">· {{ item.category }}</span>
              </p>
            </div>
            <button v-if="mediaThumbnailFailed[item.id]" type="button" @click="retryMediaThumbnail(item)" class="rounded-lg border border-slate-600 px-3 py-2 text-sm text-white">Retry preview</button>
            <button type="button" @click="openClip(item)" :disabled="mediaPlaybackLoading || mediaReviewing || item.status==='rejected'"
              class="min-h-10 w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50">
              ▶ Play privately
            </button>
            <p v-if="!restrictModeration && item.can_review===true" class="text-xs text-cyan-200">Play the clip to review it.</p>
            <button v-if="!restrictModeration && item.can_archive === true" type="button" @click="archivePrivateMedia(item)" :disabled="mediaArchiving || mediaReviewing || mediaUploading || mediaPlaybackLoading"
              class="min-h-10 w-full rounded-xl border border-rose-700 px-3 py-2 text-sm font-semibold text-rose-200 disabled:opacity-50">
              {{ mediaArchiving ? 'Deleting…' : 'Delete video' }}
            </button>
          </div>
        </li>
      </ul>
      <p v-if="mediaPlaybackLoading" role="status" class="rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-300">Loading private playback…</p>
      <section v-if="mediaPlaybackUrl" class="space-y-3 rounded-2xl border border-cyan-400/30 bg-slate-950 p-3 sm:p-4" aria-label="Selected private video player">
        <button @click="backGallery" :disabled="busy" class="min-h-11 text-sm font-bold text-cyan-300">‹ Back to gallery</button>
        <div class="flex flex-wrap items-center justify-between gap-2 px-1">
          <h4 class="text-sm font-bold text-white">Now watching</h4>
          <span class="text-xs font-semibold text-emerald-300">Authorized playback</span>
        </div>
        <video :key="mediaPlaybackUrl" :src="mediaPlaybackUrl" controls playsinline preload="metadata" ref="videoElement"
          @error="reportPlaybackError" class="aspect-video w-full rounded-xl bg-black object-contain"></video>
        <section v-if="!restrictModeration && reviewItem" class="space-y-3 rounded-xl border border-cyan-700 p-3" aria-label="Independent video review">
          <h4 class="text-sm font-bold text-white">Independent video review</h4>
          <p class="text-xs text-slate-300">Watch the entire clip before deciding. Approval stays private. Subject confirmation is optional for private approval, but required for future team sharing.</p>
          <label class="flex items-start gap-2 text-sm text-slate-200"><input type="checkbox" v-model="reviewSingleSubject" :disabled="mediaReviewing">I confirm only this selected athlete is identifiable in the entire clip.</label>
          <label class="block text-sm text-slate-300">Review note (required for rejection)<textarea v-model="reviewVideoNote" maxlength="1000" :disabled="mediaReviewing" class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 p-2"></textarea></label>
          <div class="flex flex-wrap gap-2">
            <button type="button" @click="reviewPrivateMedia('approved')" :disabled="mediaReviewing || mediaArchiving || mediaUploading" class="flex-1 rounded-xl bg-emerald-700 p-3 text-sm font-bold text-white disabled:opacity-50">Approve privately</button>
            <button type="button" @click="reviewPrivateMedia('rejected')" :disabled="mediaReviewing || mediaArchiving || mediaUploading || !reviewVideoNote.trim()" class="flex-1 rounded-xl border border-rose-700 p-3 text-sm font-bold text-rose-200 disabled:opacity-50">Reject</button>
          </div>
        </section>
        <div class="grid grid-cols-3 gap-2"><button @click="mode='Watch'" :aria-pressed="mode==='Watch'" class="min-h-11 rounded-xl bg-slate-800 font-bold">Watch</button><button @click="mode='Analyze'" :aria-pressed="mode==='Analyze'" class="min-h-11 rounded-xl bg-slate-800 font-bold">Analyze</button><button @click="fullscreen" class="min-h-11 rounded-xl bg-slate-800 font-bold">Fullscreen</button></div>
        <template v-if="mode==='Analyze'"><div class="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Video recording metadata for analysis">
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
        <p class="text-xs leading-relaxed text-slate-400">The original recording FPS and movement type are not stored with older private clips. Choose accurately; automatic motion checkpoints remain experimental pose estimates, not verified ball release or contact measurements.</p></template>
      </section>
    </div>

    <div v-else-if="!mediaError" class="rounded-2xl border border-amber-600/30 bg-amber-950/20 p-5 text-sm text-amber-200">
      You do not have permission to view private clips for this player.
    </div>

    <div v-if="mediaUploadAllowed" v-show="!mediaPlaybackUrl && !mediaPlaybackLoading && (uploadOpen || !selected)" ref="uploadSection" class="space-y-3 rounded-2xl border border-slate-700 bg-slate-900/90 p-4 sm:p-5">
      <div>
        <h3 class="text-lg font-bold text-white">Add a practice clip</h3>
        <p class="mt-1 text-xs text-slate-400">Synthetic staging footage only. Do not upload recordings of real children. Private MP4 or MOV, maximum 40 MiB. HEVC playback depends on the device.</p>
      </div>
      <label class="block text-sm font-semibold text-slate-300">
        Video category
        <select v-model="uploadCategory" :disabled="mediaUploading" class="block rounded bg-slate-950 p-2">
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
        <progress :value="mediaProgress" max="100" class="h-2 w-full"></progress>
        <p class="text-xs text-slate-300">{{ mediaProgress }}% · {{ mediaProgress >= 99 ? 'Saving securely…' : 'Sending video…' }}</p>
      </div>
    </div>
    <p v-else-if="mediaUploadError" role="status" class="rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs text-slate-400">{{ mediaUploadError }}</p>
    <p v-else class="rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs text-slate-400">You do not have upload permission for this player.</p>
  </template>

  <details class="rounded-2xl border border-slate-700 bg-slate-900/75 p-4 text-sm">
    <summary class="cursor-pointer py-2 font-bold text-white">Parent submissions and Team Clubhouse</summary>
    <p class="pt-2 text-sm leading-relaxed text-slate-400">The separate submissions and coach-review workspace remains available through the existing controls. Private clips are never automatically approved or shared.</p>
  </details>
</section>
  `
};
