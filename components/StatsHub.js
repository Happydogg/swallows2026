// SDL-UX-005: Stats presentation from the existing guardian-safe projection.
// No database queries, calculations, medical thresholds, or permission changes.
import { DemoGrowthLab } from './DemoGrowthLab.js';

export const StatsHub = {
  name: 'StatsHub',
  components: { DemoGrowthLab },
  props: {
    mode: { type: String, required: true },
    familyCards: { type: Array, default: () => [] },
    coachRoster: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    enabled: { type: Boolean, default: false }
  },
  emits: ['navigate', 'open-player'],
  setup(props) {
    const profiles = Vue.computed(() => props.familyCards.flatMap(card =>
      (card.profiles || []).map(profile => ({ ...profile, familyLabel: card.name || '' }))
    ));
    const available = Vue.computed(() => profiles.value.filter(profile => profile.statsAvailable === true));
    return { profiles, available };
  },
  template: `
    <section class="space-y-5" aria-label="Stats and player development">
      <div class="relative isolate overflow-hidden rounded-3xl border border-sky-400/25 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950 p-5 sm:p-7">
        <div class="pointer-events-none absolute -top-16 right-0 h-56 w-56 rounded-full bg-sky-400/15 blur-3xl" aria-hidden="true"></div>
        <div class="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-xs font-bold uppercase tracking-widest text-cyan-300">Development Lab</p>
            <h1 class="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Progress, not guesses.</h1>
            <p class="mt-3 max-w-xl text-sm leading-relaxed text-slate-300">Measurements and performance belong to specific athletes, dates, and authorized records. Unavailable values are left blank rather than estimated.</p>
          </div>
          <button type="button" @click="$emit('navigate','team')" class="self-start rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500">View players</button>
        </div>
      </div>

      <p v-if="loading" role="status" class="rounded-xl border border-slate-700 bg-slate-900 p-5 text-sm text-slate-300">Loading your permitted player records…</p>

      <template v-if="mode === 'family'">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div class="rounded-2xl border border-slate-700 bg-slate-900/90 p-4">
            <p class="text-xs font-semibold uppercase tracking-wider text-slate-400">Linked profiles</p>
            <p class="mt-2 text-3xl font-black text-white">{{ profiles.length }}</p>
          </div>
          <div class="rounded-2xl border border-slate-700 bg-slate-900/90 p-4">
            <p class="text-xs font-semibold uppercase tracking-wider text-slate-400">Stats available</p>
            <p class="mt-2 text-3xl font-black text-cyan-300">{{ available.length }}</p>
          </div>
          <div class="col-span-2 rounded-2xl border border-slate-700 bg-slate-900/90 p-4 sm:col-span-1">
            <p class="text-xs font-semibold uppercase tracking-wider text-slate-400">Historical comparisons</p>
            <p class="mt-3 text-sm font-medium text-slate-200">By player and approved test method</p>
          </div>
        </div>
        <p v-if="!enabled" role="status" class="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-200">
          Parent-safe statistics services are currently disabled in staging. The live dashboard does not infer values from unapproved raw sessions.
        </p>
        <div v-if="!profiles.length" class="rounded-2xl border border-dashed border-slate-600 bg-slate-900 p-6">
          <h2 class="text-lg font-bold text-white">No accessible statistics profiles</h2>
          <p class="mt-2 text-sm text-slate-400">A verified guardian link and an authorized baseball profile are required before statistics can appear here.</p>
        </div>
        <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <article v-for="profile in profiles" :key="profile.id" class="rounded-2xl border border-slate-700 bg-slate-900/90 p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-bold uppercase tracking-wider text-sky-300">{{ profile.clubLabel || 'Baseball profile' }}</p>
                <h2 class="mt-2 text-xl font-black text-white">{{ profile.familyLabel }}</h2>
                <p class="mt-1 text-sm text-slate-400">#{{ profile.jersey || '–' }} · {{ profile.position || 'Position pending' }}</p>
              </div>
              <span class="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-xs text-white">#{{ profile.jersey || '–' }}</span>
            </div>
            <p v-if="!profile.statsAvailable" role="status" class="mt-4 rounded-xl border border-dashed border-slate-600 p-4 text-sm text-slate-400">
              No verified, permitted statistics are currently available for this profile.
            </p>
            <div v-else class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div class="rounded-xl bg-slate-950 p-3"><p class="text-xs text-slate-400">Exit velo</p><p class="mt-2 text-sm font-black text-cyan-300">{{ profile.latestExitVelo != null ? profile.latestExitVelo + ' km/h' : 'Not recorded' }}</p></div>
              <div class="rounded-xl bg-slate-950 p-3"><p class="text-xs text-slate-400">Throw velo</p><p class="mt-2 text-sm font-black text-emerald-300">{{ profile.latestThrowingVelo != null ? profile.latestThrowingVelo + ' km/h' : 'Not recorded' }}</p></div>
              <div class="rounded-xl bg-slate-950 p-3"><p class="text-xs text-slate-400">18.29m sprint</p><p class="mt-2 text-sm font-black text-amber-300">{{ profile.latestSprintTime != null ? profile.latestSprintTime + ' s' : 'Not recorded' }}</p></div>
              <div class="rounded-xl bg-slate-950 p-3"><p class="text-xs text-slate-400">Sessions</p><p class="mt-2 text-sm font-black text-white">{{ profile.sessionCount ?? '—' }}</p></div>
            </div>
            <button type="button" @click="$emit('open-player',profile.id)"
              class="mt-4 w-full rounded-xl border border-blue-500/40 bg-blue-900/30 px-4 py-3 text-sm font-bold text-sky-200 hover:bg-blue-800/50">View permitted player history</button>
          </article>
        </div>
      </template>

      <template v-else-if="mode === 'coach'">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div class="rounded-2xl border border-slate-700 bg-slate-900/90 p-5">
            <p class="text-xs font-semibold uppercase tracking-wider text-slate-400">Authorized roster</p>
            <p class="mt-2 text-3xl font-black text-cyan-300">{{ coachRoster.length }}</p>
          </div>
          <div class="rounded-2xl border border-slate-700 bg-slate-900/90 p-5 sm:col-span-2">
            <p class="text-xs font-bold text-white">Official results stay under coach review</p>
            <p class="mt-2 text-sm text-slate-400">The verified statistics service must authorize official measurements. Roster membership alone does not provide a performance score.</p>
          </div>
        </div>
        <div class="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <h2 class="text-lg font-bold text-white">Coaching workflow</h2>
          <p class="mt-2 text-sm text-slate-400">Review submissions and approved statistics through the existing role-controlled workspace. No team averages have been inferred here.</p>
          <button type="button" @click="$emit('navigate','team')" class="mt-4 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">Open team roster</button>
        </div>
      </template>
      <p v-else class="rounded-xl border border-slate-700 bg-slate-900 p-5 text-sm text-slate-400">Your account needs verified team or family access to view athlete statistics.</p>
      <demo-growth-lab></demo-growth-lab>
    </section>
  `
};
