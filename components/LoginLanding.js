// SDL-UX-002: Visual-only auth landing. No client-side grants or fake invitations.
// All authentication and authorization remain with the existing staging services.
import { SUBMISSION_FEATURES_ENABLED } from '../js/config.js';

export const LoginLanding = {
  name: 'LoginLanding',
  props: { controller: { type: Object, required: true } },
  setup(props) {
    const revealPassword = Vue.ref(false);
    const showAlternativeMethods = Vue.ref(false);
    const registering = Vue.ref(false);

    function selectMethod(method) {
      props.controller.setAuthMethod(method);
      registering.value = false;
      if (method === 'phone' || method === 'otp') showAlternativeMethods.value = true;
    }
    function showRegistration() {
      if (!SUBMISSION_FEATURES_ENABLED) return;
      props.controller.setAuthMethod('email');
      registering.value = true;
    }

    return {
      ...props.controller,
      revealPassword, showAlternativeMethods, registering,
      selectMethod, showRegistration,
      registrationEnabled: SUBMISSION_FEATURES_ENABLED
    };
  },
  template: `
    <section aria-label="Swallows DataLab invitation-only sign in"
      class="relative isolate overflow-hidden rounded-3xl border border-blue-400/30 bg-slate-950 text-white shadow-2xl no-print">
      <div class="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-blue-600/20 blur-3xl" aria-hidden="true"></div>
      <div class="pointer-events-none absolute -bottom-32 right-10 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden="true"></div>
      <div class="relative grid grid-cols-1 lg:grid-cols-12">
        <!-- The sign-in form comes first on a phone; the story panel leads on tablet/desktop. -->
        <div class="order-2 border-t border-slate-700/70 px-5 py-6 sm:px-8 lg:order-1 lg:col-span-7 lg:border-r lg:border-t-0 lg:p-10">
          <div class="hidden items-center justify-between lg:flex">
            <div class="flex items-center gap-3">
              <img src="./logo.png" class="h-12 w-12 object-contain" alt="" />
              <div class="text-lg font-black leading-5">SWALLOWS<br><span class="text-cyan-400">DATALAB</span></div>
            </div>
            <span class="rounded-full border border-emerald-400/60 px-3 py-1 text-xs font-bold text-emerald-300">INVITE ONLY</span>
          </div>
          <div class="lg:mt-20">
            <p class="mb-2 text-xs font-bold uppercase tracking-widest text-cyan-300">Your baseball journey</p>
            <h1 class="max-w-xl text-2xl font-black leading-tight tracking-tight sm:text-3xl lg:text-5xl">
              Every practice is part of <span class="text-cyan-400">their story.</span>
            </h1>
            <p class="mt-4 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">
              Watch your player grow, follow their baseball development and revisit the swings, throws and moments that matter.
            </p>
          </div>
          <div class="mt-6 grid grid-cols-3 gap-2 sm:gap-3 lg:mt-9" aria-label="Platform features">
            <div class="rounded-xl border border-blue-400/20 bg-slate-800/70 p-3">
              <span class="text-xl" aria-hidden="true">📈</span><p class="mt-2 text-xs font-bold sm:text-sm">Growth</p>
              <p class="mt-1 hidden text-xs text-slate-400 sm:block">Height and development</p>
            </div>
            <div class="rounded-xl border border-blue-400/20 bg-slate-800/70 p-3">
              <span class="text-xl" aria-hidden="true">⚾</span><p class="mt-2 text-xs font-bold sm:text-sm">Stats</p>
              <p class="mt-1 hidden text-xs text-slate-400 sm:block">Performance over time</p>
            </div>
            <div class="rounded-xl border border-blue-400/20 bg-slate-800/70 p-3">
              <span class="text-xl" aria-hidden="true">▶</span><p class="mt-2 text-xs font-bold sm:text-sm">Videos</p>
              <p class="mt-1 hidden text-xs text-slate-400 sm:block">Practice and highlights</p>
            </div>
          </div>
          <div class="mt-7 hidden rounded-2xl border border-blue-400/20 bg-blue-950/30 p-4 lg:block" aria-hidden="true">
            <div class="flex justify-between text-xs text-slate-300"><span>DEVELOPMENT OVER TIME</span><span class="text-emerald-300">Keep moving forward</span></div>
            <svg class="mt-3 h-20 w-full" viewBox="0 0 420 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 63H420M0 32H420" stroke="#334155" />
              <path d="M5 68L70 60L137 63L207 44L270 49L334 29L415 13" stroke="#34d399" stroke-width="3" stroke-linecap="round"/>
              <circle cx="415" cy="13" r="5" fill="#34d399"/>
            </svg>
          </div>
          <p class="mt-6 text-xs text-slate-400">Private team access. Your available information depends on verified membership and permissions.</p>
        </div>

        <div class="order-1 px-5 py-6 sm:px-8 lg:order-2 lg:col-span-5 lg:flex lg:flex-col lg:justify-center lg:p-9">
          <div class="mb-5 flex items-center justify-between lg:hidden">
            <div class="flex items-center gap-2">
              <img src="./logo.png" alt="" class="h-10 w-10 object-contain"/>
              <span class="text-sm font-black">SWALLOWS <span class="text-cyan-400">DATALAB</span></span>
            </div>
            <span class="rounded-full border border-emerald-400/60 px-2 py-1 text-xs font-semibold text-emerald-300">Private beta</span>
          </div>
          <div class="rounded-2xl border border-slate-600/70 bg-slate-900/80 p-4 shadow-xl sm:p-6">
            <p class="text-xs font-bold uppercase tracking-widest text-cyan-300">Club access</p>
            <h2 class="mt-1 text-2xl font-bold">{{ registering ? 'Create an account' : 'Welcome to the team' }}</h2>
            <p class="mt-2 text-sm text-slate-400">
              {{ registering ? 'Use the email address your club invited.' : 'Sign in with your verified club account.' }}
            </p>
            <nav class="mb-5 mt-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-1" aria-label="Authentication method">
              <button type="button" @click="selectMethod('email')" :aria-pressed="authMethod === 'email'"
                :class="authMethod === 'email' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'"
                class="rounded-lg px-3 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">Email</button>
              <button type="button" @click="selectMethod('invite')" :aria-pressed="authMethod === 'invite'"
                :class="authMethod === 'invite' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'"
                class="rounded-lg px-3 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">Invitation</button>
            </nav>

            <form v-if="authMethod === 'email'" @submit.prevent="registering ? registerEmail() : signIn()" class="space-y-4">
              <label for="sdl-email" class="block text-sm font-medium text-slate-200">Email
                <input id="sdl-email" v-model="loginEmail" type="email" required autocomplete="username" inputmode="email"
                  :disabled="authBusy" placeholder="you@example.com"
                  class="mt-1 block w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-base text-white outline-none focus:border-cyan-400"/>
              </label>
              <div>
                <label for="sdl-password" class="block text-sm font-medium text-slate-200">Password</label>
                <div class="relative mt-1">
                  <input id="sdl-password" v-model="loginPassword" :type="revealPassword ? 'text' : 'password'"
                    :autocomplete="registering ? 'new-password' : 'current-password'" :minlength="registering ? 12 : undefined"
                    required :disabled="authBusy" class="w-full rounded-xl border border-slate-600 bg-slate-800 py-3 pl-3 pr-16 text-base text-white outline-none focus:border-cyan-400"/>
                  <button type="button" @click="revealPassword = !revealPassword" :disabled="authBusy"
                    :aria-label="revealPassword ? 'Hide password' : 'Show password'"
                    class="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs font-semibold text-cyan-300 hover:bg-slate-700">{{ revealPassword ? 'Hide' : 'Show' }}</button>
                </div>
              </div>
              <button type="submit" :disabled="authBusy"
                class="w-full rounded-xl bg-blue-600 px-4 py-3.5 font-bold text-white hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50">
                {{ authBusy ? 'Working securely…' : registering ? 'Create invited account' : 'Sign in securely' }}
              </button>
              <button v-if="registrationEnabled" type="button" @click="registering ? (registering = false) : showRegistration()"
                class="w-full py-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
                {{ registering ? 'Already registered? Sign in' : 'New member? Create an invited account' }}
              </button>
              <p v-else class="text-center text-xs text-slate-400">New account registration is awaiting pilot security approval.</p>
            </form>

            <form v-else-if="authMethod === 'invite'" @submit.prevent="redeemInvitation" class="space-y-4">
              <p class="rounded-lg border border-slate-600 bg-slate-800/60 p-3 text-sm text-slate-300">
                Received a WhatsApp invitation? Access is linked only after you sign in with your verified invited email.
              </p>
              <label for="sdl-invite-token" class="block text-sm font-medium text-slate-200">Private invitation token
                <input id="sdl-invite-token" v-model="inviteCode" type="text" autocomplete="off" maxlength="64"
                  :disabled="authBusy || !registrationEnabled" placeholder="From your club invitation"
                  class="mt-1 block w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-sm text-white outline-none focus:border-cyan-400 disabled:opacity-50"/>
              </label>
              <label for="sdl-invite-email" class="block text-sm font-medium text-slate-200">Invited email
                <input id="sdl-invite-email" v-model="inviteEmail" type="email" autocomplete="email"
                  :disabled="authBusy || !registrationEnabled" placeholder="you@example.com"
                  class="mt-1 block w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-base text-white outline-none focus:border-cyan-400 disabled:opacity-50"/>
              </label>
              <button type="submit" :disabled="authBusy || !registrationEnabled"
                class="w-full rounded-xl bg-blue-600 px-4 py-3.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Continue with verified email</button>
              <p v-if="!registrationEnabled" class="text-xs text-amber-300">Invitation redemption is disabled in the current staging configuration.</p>
            </form>

            <div v-else>
              <form v-if="authMethod === 'phone'" @submit.prevent="requestPhoneOtp" class="space-y-3">
                <p class="text-xs text-amber-300">SMS/WhatsApp OTP is not yet configured in staging.</p>
                <label for="sdl-phone" class="block text-sm">Phone number
                  <input id="sdl-phone" v-model="loginPhone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+852 9000 0000"
                    class="mt-1 block w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-base text-white"/>
                </label>
                <button type="submit" :disabled="authBusy" class="w-full rounded-xl border border-slate-600 p-3 text-sm">Check phone sign-in</button>
              </form>
              <form v-else-if="authMethod === 'otp'" @submit.prevent="verifyOtpCode" class="space-y-3">
                <p class="text-xs text-amber-300">One-time code verification awaits backend integration.</p>
                <label for="sdl-otp" class="block text-sm">Verification code
                  <input id="sdl-otp" v-model="loginOtpCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"
                    class="mt-1 block w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-base text-white"/>
                </label>
                <button type="submit" :disabled="authBusy" class="w-full rounded-xl border border-slate-600 p-3 text-sm">Check one-time code</button>
              </form>
            </div>

            <div class="mt-5 border-t border-slate-700 pt-3">
              <button type="button" @click="showAlternativeMethods = !showAlternativeMethods" :aria-expanded="showAlternativeMethods"
                class="text-xs font-semibold text-slate-300 underline underline-offset-4 hover:text-white">
                {{ showAlternativeMethods ? 'Hide other sign-in methods' : 'Other sign-in methods' }}
              </button>
              <div v-if="showAlternativeMethods" class="mt-3 flex flex-wrap gap-2">
                <button type="button" @click="selectMethod('phone')" class="rounded-lg border border-slate-600 px-3 py-2 text-xs">Phone</button>
                <button type="button" @click="selectMethod('otp')" class="rounded-lg border border-slate-600 px-3 py-2 text-xs">One-time code</button>
                <button type="button" @click="selectMethod('email')" class="rounded-lg border border-slate-600 px-3 py-2 text-xs">Email</button>
              </div>
            </div>
            <p v-if="authNotice" role="status" class="mt-4 rounded-lg border border-amber-700/60 bg-amber-950/40 p-3 text-sm text-amber-200">{{ authNotice }}</p>
            <p v-if="authError" role="alert" class="mt-4 rounded-lg border border-rose-700/60 bg-rose-950/40 p-3 text-sm text-rose-200">{{ authError }}</p>
          </div>
          <p class="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-950/20 px-4 py-3 text-sm text-slate-300">
            <strong class="text-emerald-300">Need an invitation?</strong> Ask your team's coach or club administrator for a private invite.
          </p>
        </div>
      </div>
    </section>
  `
};
