// Scoped Club Admin / Team Manager roster. All writes require a separate server RPC.
export const ManagedRoster = {
  name: 'ManagedRoster',
  props: { controller: { type: Object, required: true }, home: Boolean, scopeOnly: Boolean },
  emits: ['organization', 'team', 'retry', 'more', 'open-profile', 'navigate'],
  setup(props) {
    const search = Vue.ref('');
    const teamTargets = Vue.ref({});
    const visible = Vue.computed(() => props.controller.rows.value.filter(row =>
      `${row.preferred_name} ${row.jersey}`.toLowerCase().includes(search.value.trim().toLowerCase())));
    const changeAllowed = row => {
      const target = teamTargets.value[row.id];
      return !!target && props.controller.teams.value.some(team => team.id === target) &&
        (props.controller.role.value === 'club_admin' || row.team_ids.includes(target));
    };
    const actionLabel = row => row.team_ids.includes(teamTargets.value[row.id]) ? 'End team assignment' : 'Add to team';
    return { search, teamTargets, visible, changeAllowed, actionLabel };
  },
  template: `
    <section class="space-y-4" aria-label="Authorized administrative roster">
      <header v-if="!scopeOnly" class="sdl-panel p-4">
        <p class="text-xs font-bold uppercase tracking-wide text-cyan-300">Verified workspace</p>
        <h1 class="mt-2 text-2xl font-black">{{ controller.role.value === 'club_admin' ? 'Club Admin' : 'Team Manager' }} {{ home ? 'Dashboard' : 'Roster' }}</h1>
        <p class="mt-2 text-sm text-slate-400">Authorized roster for your scope. Registration and team assignments are separate from performance, family and media permissions.</p>
        <button v-if="home" type="button" class="sdl-primary mt-4 px-4 py-2.5 text-sm font-semibold" @click="$emit('navigate','team')">Open team roster</button>
      </header>
      <div class="sdl-panel grid gap-3 p-3 sm:grid-cols-2">
        <label class="text-sm font-semibold">Club
          <select :disabled="controller.denied.value" :value="controller.organizationId.value" @change="$emit('organization',$event.target.value)" class="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 p-3">
            <option value="" disabled>Select a club</option>
            <option v-for="org in controller.organizations.value" :key="org.id" :value="org.id">{{ org.name }}</option>
          </select>
        </label>
        <label class="text-sm font-semibold">Team
          <select :disabled="controller.denied.value" :value="controller.teamId.value" @change="$emit('team',$event.target.value)" class="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 p-3">
            <option v-if="controller.role.value === 'club_admin'" value="">All authorized teams</option>
            <option v-else value="" disabled>Select a team</option>
            <option v-for="team in controller.teams.value" :key="team.id" :value="team.id">{{ team.name }}</option>
          </select>
        </label>
        <p class="text-xs text-slate-400 sm:col-span-2">{{ controller.teams.value.length }} authorized team(s) in this club</p>
      </div>
      <section v-if="!home && !scopeOnly && !controller.denied.value && controller.teams.value.length"
        class="sdl-panel space-y-3 p-4" aria-label="Scoped roster management">
        <button v-if="!controller.registrationOpen.value" type="button"
          :disabled="controller.writeBusy.value || controller.loading.value"
          class="sdl-primary px-4 py-3 text-sm font-semibold disabled:opacity-50"
          @click="controller.openRegistration()">Register player</button>
        <form v-else @submit.prevent="controller.registerPlayer()" class="space-y-3">
          <h2 class="font-bold">Register player in an authorized team</h2>
          <p class="text-xs text-slate-400">Only preferred name and jersey are registered here. Family identity and photo details require their own approved workflows.</p>
          <label class="block text-sm font-semibold">Team
            <select v-model="controller.registration.value.teamId" required
              :disabled="controller.writeBusy.value" class="mt-2 block w-full rounded-lg bg-slate-950 p-3">
              <option value="" disabled>Select an authorized team</option>
              <option v-for="team in controller.teams.value" :key="team.id" :value="team.id">{{ team.name }}</option>
            </select>
          </label>
          <label class="block text-sm font-semibold">Preferred player name
            <input v-model="controller.registration.value.name" required minlength="1" maxlength="120" autocomplete="off"
              :disabled="controller.writeBusy.value" class="mt-2 block w-full rounded-lg bg-slate-950 p-3"/>
          </label>
          <label class="block text-sm font-semibold">Jersey number
            <input v-model="controller.registration.value.jersey" required maxlength="2" inputmode="numeric"
              pattern="[0-9]{1,2}" :disabled="controller.writeBusy.value"
              class="mt-2 block w-full rounded-lg bg-slate-950 p-3"/>
          </label>
          <label class="block text-sm font-semibold">Registration reason
            <textarea v-model="controller.registration.value.reason" required minlength="1" maxlength="500" rows="2"
              :disabled="controller.writeBusy.value" class="mt-2 block w-full rounded-lg bg-slate-950 p-3"></textarea>
          </label>
          <div class="flex flex-wrap gap-2">
            <button type="submit" :disabled="controller.writeBusy.value || controller.loading.value"
              class="rounded-lg bg-emerald-700 px-4 py-3 font-semibold disabled:opacity-50">
              {{ controller.writeBusy.value ? 'Submitting…' : 'Confirm registration' }}</button>
            <button type="button" :disabled="controller.writeBusy.value" @click="controller.cancelRegistration()"
              class="rounded-lg bg-slate-700 px-4 py-3 font-semibold">Cancel</button>
          </div>
        </form>
      </section>
      <p v-if="!home && controller.writeNotice.value && !scopeOnly" role="status"
        class="rounded-lg border border-emerald-800 p-3 text-emerald-200">{{ controller.writeNotice.value }}</p>
      <div v-if="!home && controller.writeError.value && !scopeOnly" role="alert"
        class="space-y-2 rounded-lg border border-rose-800 p-3 text-rose-200">
        <p>{{ controller.writeError.value }}</p>
        <button type="button" @click="controller.fetchPage()"
          :disabled="controller.writeBusy.value || controller.loading.value || controller.denied.value"
          class="rounded-lg border border-rose-700 px-4 py-2 text-sm font-semibold disabled:opacity-50">Refresh authorized roster</button>
      </div>
      <form v-if="!home && !scopeOnly && controller.pendingChange.value" @submit.prevent="controller.commitRosterChange()"
        class="space-y-3 rounded-xl border border-amber-600/60 bg-amber-950/20 p-4" aria-label="Confirm team membership change">
        <h2 class="font-bold">Review team assignment</h2>
        <p>{{ controller.pendingChange.value.add ? 'Add' : 'End assignment for' }}
          {{ controller.pendingChange.value.playerName }} {{ controller.pendingChange.value.add ? 'to' : 'from' }}
          {{ controller.pendingChange.value.teamName }}.</p>
        <p class="text-xs text-amber-200">Ending a team membership preserves the athlete and historical records. This is not a club departure.</p>
        <label class="block text-sm font-semibold">Reason
          <textarea v-model="controller.pendingChange.value.reason" required minlength="1" maxlength="500" rows="2"
            :disabled="controller.writeBusy.value" class="mt-2 block w-full rounded-lg bg-slate-950 p-3"></textarea>
        </label>
        <div class="flex flex-wrap gap-2">
          <button type="submit" :disabled="controller.writeBusy.value || controller.loading.value"
            class="rounded-lg bg-amber-700 px-4 py-3 font-semibold disabled:opacity-50">Confirm team change</button>
          <button type="button" :disabled="controller.writeBusy.value" @click="controller.cancelRosterChange()"
            class="rounded-lg bg-slate-700 px-4 py-3 font-semibold">Cancel</button>
        </div>
      </form>
      <div v-if="controller.error.value" role="alert" class="rounded-xl border border-rose-600/50 bg-rose-950/30 p-4 text-rose-200">
        <p>{{ controller.error.value }}</p><button type="button" class="mt-3 rounded-lg bg-slate-800 px-4 py-2 font-bold" @click="$emit('retry')">{{ controller.denied.value ? 'Refresh permissions' : 'Retry' }}</button>
      </div>
      <p v-else-if="controller.loading.value && !controller.rows.value.length" role="status" class="p-4 text-slate-300">Loading authorized roster…</p>
      <p v-else-if="!controller.organizations.value.length || (controller.role.value === 'manager' && !controller.teams.value.length)" class="rounded-xl border border-slate-700 p-5 text-slate-400">No authorized teams or clubs are available.</p>
      <p v-else-if="!controller.rows.value.length" class="rounded-xl border border-slate-700 p-5 text-slate-400">No players in this authorized scope.</p>
      <div v-else-if="home" class="grid grid-cols-2 gap-3" aria-label="Roster summary">
        <div class="sdl-panel p-4"><p class="text-xs text-slate-400">Authorized teams in club</p><p class="mt-2 text-2xl font-bold">{{ controller.teams.value.length }}</p></div>
        <div class="sdl-panel p-4"><p class="text-xs text-slate-400">Players loaded{{ controller.nextAfter.value ? ' (more available)' : '' }}</p><p class="mt-2 text-2xl font-bold">{{ controller.rows.value.length }}</p></div>
      </div>
      <template v-else-if="!scopeOnly">
        <label class="block text-sm">Search loaded players<input v-model="search" type="search" class="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-3" /></label>
        <p class="text-sm text-slate-400">{{ controller.rows.value.length }} loaded players{{ controller.nextAfter.value ? ' · more available' : '' }}</p>
        <p v-if="!visible.length" class="p-3 text-slate-400">No loaded players match your search.</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <article v-for="row in visible" :key="row.id" class="sdl-panel space-y-3 p-4">
            <button type="button" @click="$emit('open-profile',row)"
              class="flex w-full gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
              <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-950 font-bold text-cyan-300">#{{ row.jersey || '–' }}</span>
              <span class="min-w-0"><span class="block font-bold">{{ row.preferred_name || 'Player' }}</span><span class="block text-xs text-slate-400">{{ row.team_name || 'Club roster' }}</span><span class="block text-sm text-slate-300">{{ row.position || 'Position not set' }} · Throws {{ row.throws || '–' }} · Bats {{ row.bats || '–' }}</span></span>
            </button>
            <div class="border-t border-slate-700 pt-3">
              <label class="block text-xs font-semibold">Change team assignment
                <select v-model="teamTargets[row.id]" class="mt-2 w-full rounded-lg bg-slate-950 p-3 text-sm"
                  :disabled="controller.writeBusy.value || controller.loading.value || controller.denied.value">
                  <option value="">Choose a team</option>
                  <option v-for="team in controller.teams.value" :key="team.id" :value="team.id">{{ team.name }}{{ row.team_ids.includes(team.id) ? ' · assigned' : '' }}</option>
                </select>
              </label>
              <button v-if="changeAllowed(row)" type="button" @click="controller.prepareRosterChange(row,teamTargets[row.id])"
                :disabled="controller.writeBusy.value || controller.loading.value || controller.denied.value"
                class="mt-2 rounded-lg border border-slate-500 px-4 py-2 text-sm font-semibold disabled:opacity-50">{{ actionLabel(row) }}</button>
            </div>
          </article>
        </div>
      </template>
        <button v-if="!home && controller.nextAfter.value" type="button" :disabled="controller.loading.value" class="w-full rounded-xl bg-slate-700 p-3 font-semibold disabled:opacity-50" @click="$emit('more')">{{ controller.loading.value ? 'Loading…' : 'Load more players' }}</button>
    </section>`
};
