// SDL-UX-007: profile-photo editor for verified guardians, coaches and club admins.
// Pure UI over useAvatarManager; all writes use private storage and RPC checks.
export const AvatarManager = {
  name: 'AvatarManager',
  emits: ['open-profile'],
  props: {
    controller: { type: Object, required: true },
    showList: { type: Boolean, default: false }
  },
  setup(props) { return { ...props.controller }; },
  template: `
  <div class="no-print">
    <section v-if="showList" class="my-5 space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-6"
      aria-label="Authorized player directory">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-sky-300">Player identity</p>
          <h2 class="mt-1 text-xl font-black text-white">Manage players</h2>
          <p class="mt-2 text-sm leading-relaxed text-slate-400">Open a permitted player profile to edit its picture. The official statistics remain protected.</p>
        </div>
        <button type="button" :disabled="loading || busy" @click="load"
          class="self-start rounded-lg border border-blue-500/40 bg-blue-900/30 px-4 py-3 text-sm font-bold text-cyan-200 disabled:opacity-50">
          Refresh players
        </button>
      </div>
      <p v-if="loading" role="status" class="rounded-lg bg-slate-800 p-3 text-sm text-slate-300">Checking player-photo permissions…</p>
      <p v-if="error && !open" role="alert" class="rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-200">{{ error }}</p>
      <p v-if="notice && !open" role="status" class="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-200">{{ notice }}</p>
      <p v-if="!loading && !rows.length" class="rounded-lg border border-dashed border-slate-600 p-4 text-sm text-slate-400">
        No player photos are available for this account. A verified guardian link, active coach membership or club administrator role is required.
      </p>
      <ul v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="player in rows" :key="player.id" class="flex min-w-0 items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
          <img v-if="player.display_photo_url" :src="player.display_photo_url" alt=""
            class="h-14 w-14 shrink-0 rounded-xl bg-blue-950 object-cover" referrerpolicy="no-referrer">
          <span v-else class="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-950 font-black text-sky-300">#{{ player.jersey || '–' }}</span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold text-white">{{ player.preferred_name }}</p>
            <p class="text-xs text-slate-400">#{{ player.jersey || '–' }} · {{ player.position || 'Player' }}</p>
            <button type="button" @click="$emit('open-profile',player)"
              class="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500">
              View profile
            </button>
          </div>
        </li>
      </ul>
    </section>

    <div v-if="open && selectedPlayer"
      class="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4"
      role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="sdl-avatar-edit-title"
        class="my-auto w-full max-w-md space-y-4 rounded-2xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 id="sdl-avatar-edit-title" class="text-xl font-black text-white">Edit Player</h2>
            <p class="mt-1 text-sm text-slate-300">{{ selectedPlayer.preferred_name }} · #{{ selectedPlayer.jersey }}</p>
          </div>
          <button type="button" :disabled="busy" @click="close" aria-label="Close player editor"
            class="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 disabled:opacity-50">✕</button>
        </div>
        <div class="flex items-center gap-4 rounded-xl bg-slate-950 p-3">
          <img v-if="selectedPlayer.display_photo_url" :src="selectedPlayer.display_photo_url" alt="Current player profile photo"
            class="h-20 w-20 shrink-0 rounded-xl object-cover" referrerpolicy="no-referrer">
          <span v-else class="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-blue-950 font-black text-white">#{{ selectedPlayer.jersey }}</span>
          <div>
            <p class="text-sm font-bold text-white">Profile picture</p>
            <p class="mt-1 text-xs leading-relaxed text-slate-400">JPEG, PNG, WebP or supported iPhone photo. Stored privately after compression.</p>
          </div>
        </div>
        <label class="block text-sm font-bold text-slate-300" for="sdl-player-avatar-upload">
          Select new picture
          <input id="sdl-player-avatar-upload" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            :disabled="busy" @change="selectFile"
            class="mt-2 block w-full rounded-xl border border-slate-600 bg-slate-950 p-3 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-blue-700 file:px-3 file:py-2 file:text-white">
        </label>
        <p v-if="selectedFile" class="break-words text-xs text-sky-300">{{ selectedFile.name }}</p>
        <p v-if="error" role="alert" class="rounded-lg border border-red-700 bg-red-950/30 p-3 text-sm text-red-300">{{ error }}</p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <button type="button" @click="save" :disabled="busy || !selectedFile"
            class="min-h-12 flex-1 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">
            {{ busy ? 'Saving securely…' : 'Save profile picture' }}
          </button>
          <button type="button" :disabled="busy" @click="close"
            class="min-h-12 rounded-xl border border-slate-600 px-4 py-3 text-sm text-white disabled:opacity-50">Cancel</button>
        </div>
        <p class="text-xs text-slate-400">Other player details remain read-only during the staging pilot. Authorized photo updates do not change official performance records or videos.</p>
      </section>
    </div>
  </div>
  `
};
