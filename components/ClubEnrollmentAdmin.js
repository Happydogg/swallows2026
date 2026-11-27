export const ClubEnrollmentAdmin={
  name:'ClubEnrollmentAdmin',props:{controller:{type:Object,required:true}},
  setup(props){return {...props.controller};},
  template:`
<section v-if="visible" class="mt-3 space-y-4 border-t border-slate-700 pt-4 no-print" aria-label="Club enrollment administration">
  <h2 class="font-bold text-xl">Club enrollment administration</h2>
  <p class="text-sm text-slate-300">Manual pilot for authorized club administrators. Team transfers within a club do not end enrollment: leave these records active when changing teams.</p>
  <p v-if="!enabled" role="status" class="text-sm text-amber-300">Enrollment administration awaits backend deployment and live authorization testing. All v2 operations remain disabled.</p>
  <button v-if="enabled" @click="load" :disabled="busy" class="p-3 rounded bg-slate-700 disabled:opacity-50">Reload authorized clubs</button>
  <p v-if="busy" role="status" class="text-sm">Working securely…</p>
  <p v-if="error" role="alert" class="text-sm text-rose-300">{{ error }}</p>
  <p v-if="notice" role="status" class="text-sm text-emerald-300">{{ notice }}</p>
  <p v-if="enabled&&ready&&!organizations.length" class="text-sm text-slate-400">No active administrator access to a club was found.</p>
  <label class="block text-sm">Authorized club
    <select :value="organizationId" @change="selectOrganization($event.target.value)" :disabled="!enabled||!ready" class="w-full block p-3 mt-1 rounded bg-slate-900 disabled:opacity-50">
      <option value="">Select a club</option><option v-for="club in organizations" :key="club.id" :value="club.id">{{ club.name }}</option>
    </select>
  </label>
  <template v-if="organization">
    <form @submit.prevent="refresh" class="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label class="block text-sm flex-1">Search athlete name<input v-model="query" maxlength="100" type="search" :disabled="busy" class="w-full block p-3 mt-1 rounded bg-slate-900" /></label>
      <button type="submit" :disabled="busy||!enabled" class="p-3 rounded bg-blue-700 disabled:opacity-50">Search / refresh</button>
    </form>
    <p class="text-xs text-slate-400">Up to 100 athletes are shown. Search to narrow results. Athletes must already have a player profile in this club.</p>
    <p v-if="listReady&&!athletes.length" class="text-sm text-slate-400">No matching athlete profiles in this club.</p>
    <div v-if="pendingChange" class="border border-amber-500 rounded p-4 space-y-3" role="region" aria-label="Review administrator change">
      <h3 class="font-semibold">Review change before saving</h3>
      <p>{{ pendingChange.row.preferred_name }} · {{ pendingChange.organizationName }}</p>
      <p v-if="pendingChange.kind==='enrollment'" class="text-sm">Set club enrollment to <strong>{{ pendingChange.nextStatus }}</strong>.</p>
      <p v-if="pendingChange.kind==='enrollment'&&pendingChange.nextStatus!=='active'" class="text-sm text-amber-200">This ends continuous enrollment consent and clears recording/storage authorization. Do not use this for an internal team transfer.</p>
      <p v-if="pendingChange.kind==='enrollment'&&pendingChange.nextStatus==='active'" class="text-sm text-amber-200">Activation or rejoin does not restore old consent or recording permission. Fresh parental Clubhouse consent and separate recording evidence are required.</p>
      <template v-if="pendingChange.kind==='recording'"><p class="text-sm">{{ pendingChange.allowed?'Record':'Revoke' }} recording/storage authorization.</p><p class="text-sm break-words">Evidence reference: {{ pendingChange.evidence }}</p></template>
      <p class="text-xs text-slate-300">This action does not grant optional parental Clubhouse-sharing consent or delete private videos.</p>
      <div class="flex flex-wrap gap-3"><button @click="confirmChange" :disabled="busy||!enabled" class="p-3 rounded bg-amber-700">Confirm administrator change</button><button @click="cancelChange" :disabled="busy" class="p-3 rounded bg-slate-700">Cancel</button></div>
    </div>
    <div class="grid gap-3 md:grid-cols-2">
      <article v-for="athlete in athletes" :key="athlete.athlete_id" class="rounded bg-slate-900 p-4 space-y-3">
        <h3 class="font-semibold">{{ athlete.preferred_name || 'Athlete' }}</h3>
        <p class="text-xs text-slate-400">Roster reference {{ athlete.athlete_id.slice(-6) }} · {{ organization.name }}</p>
        <p class="text-sm">Club enrollment: <strong>{{ {active:'Active',inactive:'Inactive',ended:'Departed',not_enrolled:'Not enrolled'}[athlete.status] }}</strong></p>
        <p v-if="athlete.started_at" class="text-xs text-slate-400">Started {{ athlete.started_at }}<span v-if="athlete.ended_at"> · Ended {{ athlete.ended_at }}</span></p>
        <div class="flex flex-wrap gap-2">
          <button v-if="athlete.status!=='active'" @click="prepareEnrollment(athlete,'active')" :disabled="busy||!!pendingChange||!enabled" class="p-3 rounded bg-blue-700">{{ athlete.enrollment_id?'Reactivate / rejoin club':'Create active enrollment' }}</button>
          <button v-if="athlete.status==='active'" @click="prepareEnrollment(athlete,'inactive')" :disabled="busy||!!pendingChange||!enabled" class="p-3 rounded bg-slate-700">Inactivate enrollment</button>
          <button v-if="athlete.enrollment_id&&athlete.status!=='ended'" @click="prepareEnrollment(athlete,'ended')" :disabled="busy||!!pendingChange||!enabled" class="p-3 rounded bg-slate-700">Record club departure</button>
        </div>
        <div class="border-t border-slate-700 pt-3 space-y-2">
          <h4 class="text-sm font-semibold">Recording and private storage authorization</h4>
          <p class="text-sm">{{ athlete.recording_active?'Authorized for this active enrollment':'Not currently effective' }}</p>
          <p class="text-xs text-slate-400">Recorded permission: {{ athlete.recording_storage_authorized?'Granted':'Not granted' }}</p>
          <p class="text-sm break-words">Current evidence reference: {{ athlete.recording_permission_ref || 'None recorded' }}</p>
          <template v-if="athlete.enrollment_id">
            <label class="block text-sm">Evidence reference for this decision<input v-model="evidence[athlete.athlete_id]" maxlength="500" :disabled="busy||!!pendingChange" class="w-full block mt-1 p-3 bg-slate-800 rounded" /></label>
            <p class="text-xs text-slate-400">Use an approved document or case reference. Do not paste family contacts, sensitive document contents or secrets. Revocation also requires a decision reference.</p>
            <label class="flex gap-3 items-start text-sm py-2"><input type="checkbox" v-model="evidenceReviewed[athlete.athlete_id]" :disabled="busy||!!pendingChange" /><span>I reviewed the appropriate evidence for this recording/storage decision.</span></label>
            <div class="flex flex-wrap gap-2">
              <button v-if="athlete.status==='active'" @click="prepareRecording(athlete,true)" :disabled="busy||!!pendingChange||!enabled" class="p-3 rounded bg-purple-700">Record recording permission</button>
              <button v-if="athlete.recording_storage_authorized" @click="prepareRecording(athlete,false)" :disabled="busy||!!pendingChange||!enabled" class="p-3 rounded bg-slate-700">Revoke recording permission</button>
            </div>
          </template>
        </div>
        <div class="border-t border-slate-700 pt-3 space-y-2">
          <h4 class="text-sm font-semibold">Optional parental Clubhouse-sharing consent</h4>
          <p class="text-sm">{{ athlete.consent_active?'Active for this club enrollment':'Not active — keep Clubhouse sharing off' }}</p>
          <p v-if="athlete.consent_policy_version" class="text-xs text-slate-400">{{ athlete.consent_policy_version }}</p>
          <p class="text-xs text-slate-400">Only a verified guardian can grant this separate consent. Recording permission does not grant Clubhouse sharing. Departure and rejoin require fresh parental consent.</p>
        </div>
      </article>
    </div>
  </template>
</section>`
};
