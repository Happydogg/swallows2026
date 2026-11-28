export const VideoPlayerHero = {
  props: { player: { type: Object, required: true } },
  setup(props) {
    const photoFailed = Vue.ref(false);
    Vue.watch(() => props.player.photo_url, () => { photoFailed.value = false; });
    const splitPositions = value => String(value).split(/[,/]/).map(position => position.trim()).filter(Boolean);
    return { photoFailed, splitPositions };
  },
  template: `
<article class="sdl-panel overflow-hidden rounded-2xl border border-sky-500/30 bg-slate-950 shadow-lg" aria-label="Athlete hero card">
  <div class="relative isolate overflow-hidden bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 min-h-[240px] sm:min-h-[280px] lg:min-h-[320px]">
    <img v-if="player.photo_url && !player.photo_url.startsWith('sdl-private-avatar:') && !photoFailed" :src="player.photo_url" :alt="player.preferred_name || 'Player'" @error="photoFailed=true" referrerpolicy="no-referrer" class="absolute inset-y-0 right-0 h-full w-[58%] object-cover object-center">
    <div v-else class="absolute inset-y-0 right-0 flex w-[58%] items-center justify-center bg-blue-950 text-5xl font-black text-sky-400/50" aria-hidden="true">#{{player.jersey||'–'}}</div>
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950 via-blue-950/90 via-40% to-transparent" aria-hidden="true"></div>
    <div class="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-950/90 to-transparent" aria-hidden="true"></div>
    <span v-if="player.photo_url && player.photo_url.startsWith('/assets/demo-players/') && !photoFailed" class="absolute bottom-2 right-2 z-10 rounded bg-slate-950/85 px-2 py-1 text-[10px] font-bold text-amber-200">Fictional demo portrait</span>
    <div class="relative flex min-h-[inherit] w-[55%] flex-col justify-center gap-2 px-4 py-5 sm:px-6">
      <p class="text-[10px] font-black uppercase tracking-widest text-cyan-200">Swallows DataLab</p><p class="text-4xl font-black leading-none text-white sm:text-5xl">#{{player.jersey||'–'}}</p>
      <h2 class="break-words text-xl font-black leading-tight text-white sm:text-3xl">{{player.preferred_name || 'Player'}}</h2>
      <p v-if="player.team_name" class="text-xs font-semibold text-slate-200 sm:text-sm">{{player.team_name}}</p>
      <div v-if="player.position" class="flex flex-wrap gap-1"><span v-for="pos in splitPositions(player.position)" :key="pos" class="rounded-full border border-cyan-400/50 bg-blue-950/70 px-2 py-1 text-xs font-bold text-cyan-100">{{pos}}</span></div>
      <p v-if="player.throws||player.bats" class="text-xs text-slate-300">Throws {{player.throws||'–'}} · Bats {{player.bats||'–'}}</p>
    </div>
  </div>
  <div v-if="$slots.actions" class="border-t border-sky-500/20 bg-slate-950 p-3"><slot name="actions"></slot></div>
</article>
`
};
