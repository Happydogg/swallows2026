// Read-only Club Admin / Team Manager presentation. No write or media actions.
export const ManagedRoster = {
  name: 'ManagedRoster',
  props: { controller: { type: Object, required: true }, home: Boolean },
  emits: ['organization', 'team', 'retry', 'more', 'open-profile', 'navigate'],
  setup(props) {
    const search = Vue.ref('');
    const visible = Vue.computed(() => props.controller.rows.value.filter(row =>
      `${row.preferred_name} ${row.jersey}`.toLowerCase().includes(search.value.trim().toLowerCase())));
    return { search, visible };
  },
  template: `
    <section class="space-y-4" aria-label="Authorized administrative roster">
      <header class="rounded-2xl border border-slate-700 bg-slate-800/70 p-5">
        <p class="text-xs font-bold uppercase tracking-wide text-cyan-300">Verified workspace</p>
        <h1 class="mt-2 text-2xl font-black">{{ controller.role.value === 'club_admin' ? 'Club Admin' : 'Team Manager' }} {{ home ? 'Dashboard' : 'Roster' }}</h1>
        <p class="mt-2 text-sm text-slate-400">Read-only roster for your authorized scope. Editing, review and media permissions are separate.</p>
        <button v-if="home" type="button" class="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 font-semibold" @click="$emit('navigate','team')">Open team roster</button>
      </header>
      <div class="grid gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:grid-cols-2">
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
      <div v-if="controller.error.value" role="alert" class="rounded-xl border border-rose-600/50 bg-rose-950/30 p-4 text-rose-200">
        <p>{{ controller.error.value }}</p><button type="button" class="mt-3 rounded-lg bg-slate-800 px-4 py-2 font-bold" @click="$emit('retry')">{{ controller.denied.value ? 'Refresh permissions' : 'Retry' }}</button>
      </div>
      <p v-else-if="controller.loading.value && !controller.rows.value.length" role="status" class="p-4 text-slate-300">Loading authorized roster…</p>
      <p v-else-if="!controller.organizations.value.length || (controller.role.value === 'manager' && !controller.teams.value.length)" class="rounded-xl border border-slate-700 p-5 text-slate-400">No authorized teams or clubs are available.</p>
      <p v-else-if="!controller.rows.value.length" class="rounded-xl border border-slate-700 p-5 text-slate-400">No players in this authorized scope.</p>
      <template v-else>
        <label class="block text-sm">Search loaded players<input v-model="search" type="search" class="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-3" /></label>
        <p class="text-sm text-slate-400">{{ controller.rows.value.length }} loaded players{{ controller.nextAfter.value ? ' · more available' : '' }}</p>
        <p v-if="!visible.length" class="p-3 text-slate-400">No loaded players match your search.</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <button v-for="row in visible" :key="row.id" type="button" @click="$emit('open-profile',row)" class="flex gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
            <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-950 font-bold text-cyan-300">#{{ row.jersey || '–' }}</span>
            <span class="min-w-0"><span class="block font-bold">{{ row.preferred_name || 'Player' }}</span><span class="block text-xs text-slate-400">{{ row.team_name || 'Club roster' }}</span><span class="block text-sm text-slate-300">{{ row.position || 'Position not set' }} · Throws {{ row.throws || '–' }} · Bats {{ row.bats || '–' }}</span></span>
          </button>
        </div>
        <button v-if="controller.nextAfter.value" type="button" :disabled="controller.loading.value" class="w-full rounded-xl bg-slate-700 p-3 font-semibold disabled:opacity-50" @click="$emit('more')">{{ controller.loading.value ? 'Loading…' : 'Load more players' }}</button>
      </template>
    </section>`
};
