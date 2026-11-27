// SDL-UX-002: Personal-first family home. Scoped guardian players only.
// Player cards use the authorized projection. No estimated values are shown.
import { PlayerHeroCard } from './PlayerHeroCard.js';

export const ParentHome = {
  name: 'ParentHome',
  components: { PlayerHeroCard },
  props: {
    players: { type: Array, required: true },
    loading: { type: Boolean, default: false },
    canEditPhoto: { type: Function, default: null }
  },
  emits: ['navigate', 'edit-photo', 'open-video', 'open-profile'],
  template: `
  <section class="space-y-4" aria-label="Parent home">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-black tracking-tight text-white sm:text-3xl">My players</h1>

    </header>
    <p v-if="loading" class="rounded-2xl border border-slate-700 bg-slate-800 p-5 text-sm text-slate-400" role="status">Loading authorized family profiles…</p>
    <div v-else-if="!players.length" class="rounded-2xl border border-dashed border-slate-600 bg-slate-900 p-7">
      <h3 class="text-lg font-bold">Your player will appear here</h3>
      <p class="mt-2 max-w-lg text-sm text-slate-400">Your club must verify the guardian link before any player details can be displayed. Ask your coach or club administrator about your invitation.</p>
      <button type="button" @click="$emit('navigate','me')" class="mt-4 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold">Family and account details</button>
    </div>
    <div v-else class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <article v-for="player in players" :key="player.id" class="sdl-panel overflow-hidden">
        <player-hero-card :player="player" variant="compact"></player-hero-card>
        <div class="p-4">
          <div class="grid gap-2 sm:grid-cols-2">
            <button type="button" @click="$emit('open-profile',player)"
              :aria-label="'Open '+(player.preferred_name || 'player')+' profile'"
              class="sdl-primary w-full px-4 py-3 text-sm font-semibold">Profile and growth</button>
            <button type="button" @click="$emit('open-video',player)"
              :aria-label="'Open private videos for '+(player.preferred_name || 'this player')"
              class="sdl-secondary w-full px-4 py-3 text-sm font-semibold">Player videos</button>
          </div>
        </div>
      </article>
    </div>

  </section>
  `
};