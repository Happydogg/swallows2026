// No privileged flags are derived from form fields; server capabilities remain required.
export const SubmissionWorkspace={
  name:'SubmissionWorkspace',props:{controller:{type:Object,required:true}},
  setup(props){return {...props.controller};},
  template:`
<section class="my-6 rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-4 no-print" aria-label="Player and video workspace">
  <h2 class="font-bold text-xl">My Players and team videos</h2>
  <nav class="flex flex-wrap gap-2" aria-label="Player workspace views">
    <button v-for="view in ['players','submissions','review','clubhouse']" :key="view" @click="changeTab(view)" :aria-pressed="tab===view" class="px-3 py-3 rounded bg-slate-700" :class="tab===view?'ring-2 ring-blue-400':''">{{ {players:'My Players',submissions:'Video submissions',review:'Coach review',clubhouse:'Team Clubhouse'}[view] }}</button>
  </nav>
  <p v-if="!enabled" class="text-sm text-amber-300" role="status">Submission, review and team-sharing operations await backend deployment and verification. You can prepare a local video preview. The working private-media pilot remains available below.</p>
  <button v-if="enabled&&!ready" @click="load" :disabled="busy" class="p-3 rounded bg-blue-600">Load authorized workspace</button>
  <p v-if="busy" role="status" class="text-sm text-slate-300">Working securely…</p>
  <p v-if="error" role="alert" class="text-sm text-rose-300">{{ error }}</p>
  <p v-if="notice" role="status" class="text-sm text-emerald-300">{{ notice }}</p>
  <div v-if="tab==='players'" class="grid gap-3 md:grid-cols-2">
    <p v-if="!cards.length" class="text-slate-400">No verified children are linked to this account. Coach accounts can use the team roster and review center.</p>
    <article v-for="card in cards" :key="card.athlete_id" class="bg-slate-900 rounded-xl p-4 space-y-3">
      <h3 class="font-bold text-lg">{{ card.name }}</h3>
      <p v-if="!card.memberships.length" class="text-sm text-slate-400">Organization and team details await the authorized workspace service.</p>
      <ul class="text-sm text-slate-300"><li v-for="membership in card.memberships" :key="membership.organization_id+':'+membership.team_id">{{ membership.organization_name }} · {{ membership.team_name }}</li></ul>
      <div v-for="profile in card.profiles" :key="profile.id" class="space-y-2 border-t border-slate-700 pt-2">
        <p class="text-sm font-semibold">{{ profile.clubLabel }}</p>
        <p class="text-sm">#{{ profile.jersey }} · {{ profile.position }} · Throws {{ profile.throws }} / Bats {{ profile.bats }}</p>
        <div class="flex flex-wrap gap-2">
          <button @click="showProfile(profile.id)" class="p-3 bg-slate-700 rounded">Baseball profile and permitted statistics</button>
          <button @click="changeTab('submissions');selectPlayer(profile.id)" class="p-3 bg-blue-700 rounded">Video submissions</button>
        </div>
      </div>
    </article>
  </div>
  <div v-if="tab==='submissions'" class="space-y-4">
    <label class="block text-sm">Linked child or coached player
      <select :value="playerId" @change="selectPlayer($event.target.value)" class="block w-full mt-1 p-3 rounded bg-slate-900"><option value="">Select a player</option><option v-for="p in choices" :key="p.id" :value="p.id">{{ p.name }}</option></select>
    </label>
    <form @submit.prevent="submit" class="space-y-3 border border-slate-700 rounded p-3">
      <label class="block">Category<select v-model="category" :disabled="busy" class="w-full block p-3 mt-1 bg-slate-900 rounded"><option value="pitching">Pitching</option><option value="batting">Batting</option><option value="throwing">Throwing</option></select></label>
      <label class="block">MP4 video (up to 20 MiB)<input type="file" accept="video/mp4,.mp4" @change="pickFile" :disabled="busy" class="block w-full py-3 text-sm" /></label>
      <video v-if="previewUrl" :key="previewUrl" :src="previewUrl" @error="previewError" controls playsinline class="w-full max-h-80 rounded bg-black"></video>
      <fieldset class="border border-slate-700 rounded p-3 space-y-2" :disabled="busy||!enabled||!ready">
        <legend class="text-sm">Optional team sharing — choose individual teams</legend>
        <p class="text-xs text-slate-400">Nothing is shared by default. Select only the teams you consent to; coach approval is still required. Consent applies to this club profile. Choose another club profile above to submit there.</p>
        <label v-for="team in consentTeams" :key="team.id" class="flex gap-3 items-center text-sm py-2">
          <input type="checkbox" :checked="selectedTeamIds.includes(team.id)" @change="toggleUploadTeam(team.id,$event.target.checked)" />
          <span>{{ team.organization }} · {{ team.name }}</span>
        </label>
        <p v-if="!consentTeams.length" class="text-sm text-slate-400">No verified team scope loaded. This video will remain private.</p>
      </fieldset>
      <button type="submit" :disabled="!enabled||!ready||!playerId||!file||busy" class="p-3 rounded bg-purple-600 disabled:opacity-50">Submit for coach review</button>
      <progress v-if="busy&&file" :value="progress" max="100" class="w-full"></progress>
      <p v-if="progress" class="text-sm" role="status">{{ progress }}% — completion requires a saved submission receipt.</p>
    </form>
    <div class="flex flex-wrap gap-2 items-center"><label>Status<select v-model="filter" class="p-3 bg-slate-900 rounded ml-2"><option value="all">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label><button @click="refreshItems" :disabled="!enabled||!ready||!playerId||busy" class="p-3 bg-slate-700 rounded disabled:opacity-50">Refresh history</button></div>
    <p v-if="!shownItems.length" class="text-sm text-slate-400">{{ enabled&&ready?'No matching submissions.':'Submission history awaits backend verification.' }}</p>
    <article v-for="item in shownItems" :key="item.id" class="rounded bg-slate-900 p-3 space-y-2">
      <p>{{ item.category }} · <strong>{{ item.status }}</strong> · {{ item.created_at }}</p>
      <p class="text-sm">Team-sharing consent: {{ item.share_with_team?'Granted':'Not granted' }}</p>
      <p v-if="item.review_note" class="text-sm">Coach note: {{ item.review_note }}</p>
      <p v-if="item.share_with_team" class="text-sm">Currently consented teams: {{ grantedTeams(item) || 'No current team scope' }}</p>
      <button @click="play(item)" :disabled="!enabled||!ready||busy" class="p-3 bg-blue-700 rounded">Private preview</button>
      <fieldset v-if="item.can_consent" class="border border-slate-700 rounded p-3 space-y-2" :disabled="!enabled||!ready||busy">
        <legend class="text-sm">Grant or replace team consent</legend>
        <p class="text-xs text-slate-400">Select individual teams explicitly. Existing consent is not preselected.</p>
        <label v-for="team in consentTeams" :key="team.id" class="flex gap-3 items-center py-2 text-sm">
          <input type="checkbox" :checked="(consentSelections[item.id]||[]).includes(team.id)" @change="toggleConsentTeam(item,team.id,$event.target.checked)" />
          <span>{{ team.organization }} · {{ team.name }}</span>
        </label>
        <div class="flex flex-wrap gap-2">
          <button @click="consent(item,true)" :disabled="!enabled||!ready||busy||!(consentSelections[item.id]||[]).length" class="p-3 bg-slate-700 rounded disabled:opacity-50">Save selected teams</button>
          <button v-if="item.share_with_team" @click="consent(item,false)" :disabled="!enabled||!ready||busy" class="p-3 bg-slate-700 rounded">Withdraw all consent</button>
        </div>
      </fieldset>
      <details><summary class="py-2 cursor-pointer">Submission history</summary><ol class="text-xs space-y-1"><li v-for="(entry,i) in item.history" :key="i">{{ entry.at }} · {{ entry.action }} {{ entry.note }}</li></ol></details>
    </article>
  </div>
  <div v-if="tab==='review'||tab==='clubhouse'" class="space-y-4">
    <label class="block">Authorized team<select :value="teamId" @change="selectTeam($event.target.value,tab)" class="mt-1 block w-full bg-slate-900 p-3 rounded"><option value="">Select a team</option><option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option></select></label>
    <template v-if="tab==='review'">
      <p class="text-sm text-slate-400">{{ ready?'Pending among the displayed submissions: '+pendingCount:'Review counts await the authorized backend.' }} Up to 50 items are displayed.</p>
      <select v-model="reviewFilter" @change="refreshQueue" :disabled="!enabled||!ready||busy" class="p-3 bg-slate-900 rounded"><option value="pending">Pending</option><option value="all">All statuses</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
      <button @click="refreshQueue" :disabled="!enabled||!ready||!teamId||busy" class="p-3 ml-2 bg-slate-700 rounded disabled:opacity-50">Refresh reviews</button>
      <p v-if="!queue.length" class="text-sm text-slate-400">No review items loaded.</p>
      <article v-for="item in queue" :key="item.id" class="rounded bg-slate-900 p-3 space-y-3">
        <p class="font-semibold">{{ item.preferred_name }} · {{ item.team_name }} · {{ item.category }} · {{ item.status }}</p>
        <button @click="play(item,'review')" :disabled="!enabled||!ready||busy" class="p-3 bg-blue-700 rounded">Private video preview</button>
        <template v-if="item.can_review&&item.status==='pending'"><label class="block text-sm">Review notes<textarea v-model="notes[item.id]" maxlength="1000" :disabled="busy" class="mt-1 block p-3 w-full bg-slate-800 rounded"></textarea></label><div class="flex gap-3"><button @click="review(item,'approved')" :disabled="!enabled||!ready||busy" class="p-3 bg-emerald-700 rounded">Approve</button><button @click="review(item,'rejected')" :disabled="!enabled||!ready||busy" class="p-3 bg-rose-700 rounded">Reject</button></div></template>
        <p v-else-if="item.status==='pending'" class="text-xs text-slate-400">You cannot review this submission. Another authorized coach must review your own submissions.</p>
        <details><summary class="py-2">Review history</summary><ol class="text-xs"><li v-for="(entry,i) in item.history" :key="i">{{ entry.at }} · {{ entry.action }} {{ entry.note }}</li></ol></details>
      </article>
    </template>
    <template v-else>
      <p class="text-sm text-slate-400">Approved videos with current guardian consent only. Authorization is rechecked for every request; the list refreshes while this view is active.</p>
      <button @click="refreshShared" :disabled="!enabled||!ready||!teamId||busy" class="p-3 rounded bg-slate-700 disabled:opacity-50">Refresh team videos</button>
      <p v-if="!shared.length" class="text-sm text-slate-400">No approved, shareable videos loaded.</p>
      <article v-for="item in shared" :key="item.id" class="rounded bg-slate-900 p-3 flex flex-wrap items-center justify-between gap-3"><span>{{ item.preferred_name }} · {{ item.category }}</span><button @click="play(item,'clubhouse')" :disabled="!enabled||!ready||busy" class="p-3 bg-blue-700 rounded">Play approved video</button></article>
    </template>
  </div>
  <video v-if="playbackUrl" :key="playbackUrl" :src="playbackUrl" @error="playbackError" controls playsinline class="w-full max-h-96 bg-black rounded"></video>
</section>`
};
