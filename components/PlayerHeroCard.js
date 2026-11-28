// SDL-UX-005: Shared athlete identity card. Presentation only.
// Existing player-projection and caller's permissions determine displayed fields.
export const PlayerHeroCard = {
  name: 'PlayerHeroCard',
  props: {
    player: { type: Object, required: true },
    teamLabel: { type: String, default: '' },
    variant: { type: String, default: 'compact' },
    isCoach: { type: Boolean, default: false },
    canEditPhoto: { type: Boolean, default: false },
    t: { type: Function, default: null },
    failedImgs: { type: Object, default: () => ({}) },
    formatImgUrl: { type: Function, default: null },
    markImgFailed: { type: Function, default: null },
    getPlayerDisplayName: { type: Function, default: null },
    formatLegalName: { type: Function, default: null },
    calculateAge: { type: Function, default: null },
    splitPositions: { type: Function, default: null },
    getLatestMetric: { type: Function, default: null },
    formatHeightWeight: { type: Function, default: null },
    calculateJumpRatio: { type: Function, default: null },
    getJumpRatioColor: { type: Function, default: null }
  },
  emits: ['edit-photo'],
  setup(props) {
    // Never pass function-valued default factories as Vue prop defaults.
    // Render-safe wrappers preserve legacy helpers when supplied and keep
    // compact/mock cards functional without exposing additional player data.
    const call = (name, fallback) => (...args) => (
      typeof props[name] === 'function' ? props[name](...args) : fallback(...args)
    );
    const photoFailed=Vue.ref(false);
    Vue.watch(()=>[props.player.id,props.player.photo_url],()=>{photoFailed.value=false;});
    return {
      photoFailed,
      t: call('t', key => key),
      formatImgUrl: call('formatImgUrl', value => value),
      markImgFailed: call('markImgFailed', () => {}),
      getPlayerDisplayName: call('getPlayerDisplayName', player => player?.preferred_name || 'Player'),
      formatLegalName: call('formatLegalName', () => ''),
      calculateAge: call('calculateAge', () => null),
      splitPositions: call('splitPositions', value => value ? String(value).split(/[,/]/).map(x => x.trim()).filter(Boolean) : []),
      getLatestMetric: call('getLatestMetric', () => null),
      formatHeightWeight: call('formatHeightWeight', () => 'Not recorded'),
      calculateJumpRatio: call('calculateJumpRatio', () => null),
      getJumpRatioColor: call('getJumpRatioColor', () => '')
    };
  },
  template: `
<article class="overflow-hidden rounded-2xl border border-sky-500/30 bg-slate-950 shadow-lg" aria-label="Athlete hero card">
  <div class="relative isolate overflow-hidden bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950" :class="variant==='compact'?'min-h-[190px] sm:min-h-[220px]':'min-h-[240px] sm:min-h-[280px] lg:min-h-[320px]'">
    <img v-if="player.photo_url && !player.photo_url.startsWith('sdl-private-avatar:') && !photoFailed && !failedImgs[player.id]" :src="formatImgUrl(player.photo_url)" :alt="getPlayerDisplayName(player)" @error="photoFailed=true;markImgFailed(player.id)" referrerpolicy="no-referrer" class="absolute inset-y-0 right-0 h-full w-[58%] object-cover object-center">
    <div v-else class="absolute inset-y-0 right-0 flex w-[58%] items-center justify-center bg-blue-950 text-5xl font-black text-sky-400/50" aria-hidden="true">#{{player.jersey||'–'}}</div>
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950 via-blue-950/90 via-40% to-transparent" aria-hidden="true"></div>
    <div class="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-slate-950/90 to-transparent" aria-hidden="true"></div>
    <div class="relative flex min-h-[inherit] w-[55%] flex-col justify-center gap-2 px-4 py-5 sm:px-6">
      <p class="text-[10px] font-black uppercase tracking-widest text-cyan-200">Swallows DataLab</p><p class="text-4xl font-black leading-none text-white sm:text-5xl">#{{player.jersey||'–'}}</p>
      <h2 class="break-words text-xl font-black leading-tight text-white sm:text-3xl">{{getPlayerDisplayName(player)}}</h2>
      <p v-if="teamLabel||player.team_name" class="text-xs font-semibold text-slate-200 sm:text-sm">{{teamLabel||player.team_name}}</p>
      <div v-if="player.position" class="flex flex-wrap gap-1"><span v-for="pos in splitPositions(player.position)" :key="pos" class="rounded-full border border-cyan-400/50 bg-blue-950/70 px-2 py-1 text-xs font-bold text-cyan-100">{{pos}}</span></div>
      <p v-if="player.throws||player.bats" class="text-xs text-slate-300">{{t('throws')}} {{player.throws||'–'}} · {{t('bats')}} {{player.bats||'–'}}</p>
    </div>
  </div>
  <div v-if="$slots.actions" class="border-t border-sky-500/20 bg-slate-950 p-3"><slot name="actions"></slot></div>
  <div v-if="variant==='profile'" class="grid gap-2 border-t border-sky-500/20 bg-slate-900 p-4 sm:grid-cols-2">
    <div><p class="text-xs font-bold uppercase tracking-wide text-cyan-300">Growth &amp; equipment</p><p class="mt-1 text-sm font-semibold">{{formatHeightWeight(player.id)}}</p><p v-if="calculateJumpRatio(player.id)" class="text-sm" :class="getJumpRatioColor(calculateJumpRatio(player.id))">{{t('jumpRatioLabel')}}: {{calculateJumpRatio(player.id)}}x</p><p class="mt-2 text-sm">{{t('batSpec')}}: {{player.bat_spec||t('notSpecified')}}</p></div>
    <div v-if="isCoach" class="text-xs text-slate-400"><p>{{t('officialName')}}: <span class="text-slate-200">{{formatLegalName(player)}}</span></p><p v-if="player.hkll_reg_no">HKLL: {{player.hkll_reg_no}}</p><p v-if="player.dob">{{t('dob')}}: {{player.dob}} ({{calculateAge(player.dob)}})</p></div><p v-if="Number(getLatestMetric(player.id,'exit_velo'))>=60" class="text-xs font-bold text-amber-300">🏅 60+ km/h Club</p>
  </div>
</article>
`
};
