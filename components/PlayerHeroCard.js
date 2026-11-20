// SDL-UX-005: Shared athlete identity card. Presentation only.
// Existing player-projection and caller's permissions determine displayed fields.
export const PlayerHeroCard = {
  name: 'PlayerHeroCard',
  props: {
    player: { type: Object, required: true },
    variant: { type: String, default: 'compact' },
    isCoach: { type: Boolean, default: false },
    t: { type: Function, default: key => key },
    failedImgs: { type: Object, default: () => ({}) },
    formatImgUrl: { type: Function, default: value => value },
    markImgFailed: { type: Function, default: () => {} },
    getPlayerDisplayName: { type: Function, default: player => player?.preferred_name || 'Player' },
    formatLegalName: { type: Function, default: () => '' },
    calculateAge: { type: Function, default: () => null },
    splitPositions: { type: Function, default: value => value ? String(value).split(/[,/]/).map(s => s.trim()).filter(Boolean) : [] },
    getLatestMetric: { type: Function, default: () => null },
    formatHeightWeight: { type: Function, default: () => 'Not recorded' },
    calculateJumpRatio: { type: Function, default: () => null },
    getJumpRatioColor: { type: Function, default: () => '' }
  },
  template: `
    <div v-if="variant === 'profile'"
      class="print-card relative isolate overflow-hidden rounded-3xl border border-blue-400/30 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 p-5 shadow-xl sm:p-7"
      aria-label="Player identity and measurements">
      <div class="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-500/15 blur-3xl no-print" aria-hidden="true"></div>
      <div class="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div class="flex min-w-0 items-start gap-4 sm:gap-5">
          <div class="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-blue-400/40 bg-blue-950 text-2xl font-black text-cyan-200 sm:h-28 sm:w-28">
            <img v-if="player.photo_url && !failedImgs[player.id]" :src="formatImgUrl(player.photo_url)"
              :alt="getPlayerDisplayName(player)" class="h-full w-full object-cover" referrerpolicy="no-referrer"
              @error="markImgFailed(player.id)">
            <span v-else>#{{ player.jersey ?? '–' }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold uppercase tracking-widest text-cyan-300">Athlete profile</p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <span class="rounded-lg border border-slate-500/50 bg-slate-800/60 px-2 py-1 font-mono text-xs font-semibold text-white">#{{ player.jersey ?? '–' }}</span>
              <span v-for="pos in splitPositions(player.position)" :key="pos"
                class="rounded-lg border border-sky-500/30 bg-blue-900/60 px-2 py-1 text-xs font-semibold text-sky-200">{{ pos }}</span>
              <span v-if="Number(getLatestMetric(player.id, 'exit_velo')) >= 60"
                class="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-300">🏅 60+ km/h Club</span>
            </div>
            <h2 class="mt-2 break-words text-2xl font-black tracking-tight text-white sm:text-3xl">{{ getPlayerDisplayName(player) }}</h2>
            <p class="mt-2 text-sm font-medium text-slate-300">{{ t('throws') }}: {{ player.throws || '–' }} <span class="text-slate-600">|</span> {{ t('bats') }}: {{ player.bats || '–' }}</p>
            <p v-if="isCoach" class="mt-2 break-words text-xs text-slate-400">
              {{ t('officialName') }}: <span class="text-slate-200">{{ formatLegalName(player) }}</span>
              <span v-if="player.hkll_reg_no"> · HKLL: <span class="text-blue-300">{{ player.hkll_reg_no }}</span></span>
              <span v-if="player.dob"> · {{ t('dob') }}: {{ player.dob }} ({{ calculateAge(player.dob) }})</span>
            </p>
          </div>
        </div>
        <div class="w-full shrink-0 space-y-3 rounded-2xl border border-slate-600/50 bg-slate-950/65 p-4 md:w-64">
          <p class="text-xs font-bold uppercase tracking-wider text-sky-300">Latest recorded measurements</p>
          <p class="break-words text-sm font-semibold text-white">{{ formatHeightWeight(player.id) }}</p>
          <p v-if="calculateJumpRatio(player.id)" class="text-sm font-semibold" :class="getJumpRatioColor(calculateJumpRatio(player.id))">
            {{ t('jumpRatioLabel') }}: {{ calculateJumpRatio(player.id) }}x
          </p>
          <div class="border-t border-slate-700/70 pt-2 text-sm text-slate-300">
            <span class="text-slate-400">{{ t('batSpec') }}:</span> {{ player.bat_spec || t('notSpecified') }}
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex min-w-0 items-center gap-4 rounded-t-2xl bg-gradient-to-r from-blue-900/80 to-slate-900 p-5" aria-label="Player card">
      <div class="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-950 text-2xl font-black text-cyan-200" aria-hidden="true">#{{ player.jersey || '–' }}</div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-bold uppercase tracking-widest text-sky-300">Player profile</p>
        <h3 class="mt-1 truncate text-xl font-black text-white">{{ player.preferred_name || 'Player' }}</h3>
        <p class="mt-1 text-sm text-slate-300">{{ player.position || 'Position pending' }}</p>
        <p class="mt-1 text-xs text-slate-400">Bats {{ player.bats || '–' }} · Throws {{ player.throws || '–' }}</p>
      </div>
    </div>
  `
};
