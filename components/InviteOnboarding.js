// SDL-UX-002: Post-auth invitation handoff.
// The WhatsApp link is transport only; the existing Worker must verify the
// invited email, identity, membership and one-time invitation before linking.
export const InviteOnboarding = {
  name: 'InviteOnboarding',
  props: {
    controller: { type: Object, required: true },
    accountEmail: { type: String, required: true }
  },
  emits: ['dismiss'],
  setup(props) {
    const reveal = Vue.ref(false);
    return { ...props.controller, reveal };
  },
  template: `
    <section class="mb-6 overflow-hidden rounded-2xl border border-cyan-400/40 bg-gradient-to-r from-blue-950 to-slate-900 p-5 shadow-xl sm:p-6"
      aria-label="Private club invitation">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-bold uppercase tracking-widest text-cyan-300">Your invitation</p>
          <h2 class="mt-2 text-xl font-black text-white sm:text-2xl">You're almost on the team.</h2>
          <p class="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">Your WhatsApp link has been received. Only the club's verified invitation service can connect your account with a child.</p>
        </div>
        <button type="button" @click="$emit('dismiss')" class="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white">Not now</button>
      </div>
      <ol class="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <li class="rounded-xl border border-blue-400/20 bg-slate-950/60 p-3"><strong class="text-cyan-300">1. Sign in</strong><p class="mt-1 text-xs text-slate-300">Your account is authenticated.</p></li>
        <li class="rounded-xl border border-blue-400/20 bg-slate-950/60 p-3"><strong class="text-cyan-300">2. Verify invite</strong><p class="mt-1 text-xs text-slate-300">The server checks your invited email and link.</p></li>
        <li class="rounded-xl border border-blue-400/20 bg-slate-950/60 p-3"><strong class="text-cyan-300">3. View your family</strong><p class="mt-1 text-xs text-slate-300">Only verified linked players become visible.</p></li>
      </ol>
      <p class="mt-4 text-sm text-slate-300">Signed in as <strong class="font-semibold text-white">{{ accountEmail }}</strong>. If this isn't your invited email, sign out and use the correct account.</p>
      <div v-if="!enabled" class="mt-4 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-200" role="status">
        Guardian invitation linking is not enabled in the current staging configuration. Your account has not been linked by this screen.
      </div>
      <form v-else @submit.prevent="redeem" class="mt-4 space-y-3">
        <label for="sdl-guardian-invite" class="block text-sm font-semibold text-white">Private invitation token</label>
        <div class="flex flex-col gap-2 sm:flex-row">
          <input id="sdl-guardian-invite" v-model="redemptionToken" :type="reveal ? 'text' : 'password'"
            autocomplete="off" maxlength="64" minlength="64" required :disabled="busy"
            class="min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 font-mono text-sm text-white outline-none focus:border-cyan-400"/>
          <button type="button" @click="reveal = !reveal" class="rounded-xl border border-slate-600 px-4 py-3 text-sm text-slate-300">{{ reveal ? 'Hide token' : 'Show token' }}</button>
        </div>
        <button type="submit" :disabled="busy || !redemptionToken || redemptionToken.length !== 64"
          class="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
          {{ busy ? 'Verifying with club…' : 'Verify and connect my child' }}
        </button>
      </form>
      <p v-if="error" role="alert" class="mt-3 rounded-lg border border-rose-700 bg-rose-950/40 p-3 text-sm text-rose-200">{{ error }}</p>
      <p v-if="notice" role="status" class="mt-3 rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">{{ notice }}</p>
    </section>
  `
};