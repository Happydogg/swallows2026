// SDL-UX-002: Personal-first family home. Scoped guardian players only.
// Deliberately excludes private identity, contact, photo and unverified metrics.
import { PlayerHeroCard } from './PlayerHeroCard.js';

export const ParentHome = {
  name: 'ParentHome',
  components: { PlayerHeroCard },
  props: {
    players: { type: Array, required: true },
    loading: { type: Boolean, default: false }
  },
  emits: ['navigate', 'edit-photo'],
  template: `
  <section class="space-y-5" aria-label="Parent home">
    <div class="relative overflow-hidden rounded-3xl border border-blue-400/25 bg-gradient-to-br from-blue-900 via-slate-900 to-slate-950 p-5 sm:p-7">
      <div class="pointer-events-none absolute -right-8 -top-14 h-52 w-52 rounded-full bg-sky-400/20 blur-3xl" aria-hidden="true"></div>
      <div class="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-widest text-cyan-300">My Baseball Family</p>
          <h1 class="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Their story starts here.</h1>
          <p class="mt-3 max-w-lg text-sm leading-relaxed text-slate-300">A home for every practice, milestone and memory. Only the players linked to your verified family account appear here.</p>
        </div>
        <button type="button" @click="$emit('navigate','team')" class="self-start rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold hover:bg-blue-500">My players</button>
      </div>
    </div>
    <div class="flex items-center justify-between gap-3">
      <div><h2 class="text-lg font-bold">My players</h2><p class="text-xs text-slate-400">Your linked athletes</p></div>
      <span class="rounded-full border border-emerald-400/30 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-300">Verified family access</span>
    </div>
    <p v-if="loading" class="rounded-2xl border border-slate-700 bg-slate-800 p-5 text-sm text-slate-400" role="status">Loading authorized family profiles…</p>
    <div v-else-if="!players.length" class="rounded-2xl border border-dashed border-slate-600 bg-slate-900 p-7">
      <h3 class="text-lg font-bold">Your player will appear here</h3>
      <p class="mt-2 max-w-lg text-sm text-slate-400">Your club must verify the guardian link before any player details can be displayed. Ask your coach or club administrator about your invitation.</p>
      <button type="button" @click="$emit('navigate','me')" class="mt-4 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold">Family and account details</button>
    </div>
    <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <article v-for="player in players" :key="player.id" class="overflow-hidden rounded-2xl border border-blue-400/25 bg-slate-900 shadow-xl">
        <player-hero-card :player="player" variant="compact"></player-hero-card>
        <div class="p-5">
          <p class="text-sm font-semibold">Growth and development</p>
          <p class="mt-1 text-xs leading-relaxed text-slate-400">Verified measurements and progress will appear in the family workspace when available. No estimated values are shown.</p>
          <div class="mt-4 flex flex-col gap-2">
            <button type="button" @click="$emit('edit-photo',player.id)"
              class="w-full rounded-xl border border-cyan-500/50 bg-sky-900/30 px-4 py-3 text-sm font-bold text-cyan-200 hover:bg-sky-800/40">📷 Change profile picture</button>
            <button type="button" @click="$emit('navigate','team')"
              class="w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-500">Open player workspace</button>
          </div>
        </div>
      </article>
    </div>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <button type="button" @click="$emit('navigate','stats')" class="rounded-2xl border border-slate-700 bg-slate-800/70 p-5 text-left hover:border-blue-400/50">
        <span class="text-xl" aria-hidden="true">📈</span><h3 class="mt-3 text-base font-bold">Progress and stats</h3>
        <p class="mt-2 text-sm text-slate-400">View available, family-authorized performance and historical records.</p>
        <span class="mt-3 inline-block text-sm font-semibold text-cyan-300">Explore progress ›</span>
      </button>
      <button type="button" @click="$emit('navigate','videos')" class="rounded-2xl border border-slate-700 bg-slate-800/70 p-5 text-left hover:border-blue-400/50">
        <span class="text-xl" aria-hidden="true">▶</span><h3 class="mt-3 text-base font-bold">Practice videos</h3>
        <p class="mt-2 text-sm text-slate-400">Revisit clips you have permission to view and upload private practice video.</p>
        <span class="mt-3 inline-block text-sm font-semibold text-cyan-300">Open videos ›</span>
      </button>
    </div>
  </section>
  `
};