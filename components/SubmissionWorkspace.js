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
      <p class="text-sm text-slate-400">Uploads stay private. Clubhouse consent is managed once per club enrollment below. Parent submissions also need coach approval and publication.</p>
      <button type="submit" :disabled="!enabled||!ready||!playerId||!file||busy" class="p-3 rounded bg-purple-600 disabled:opacity-50">Submit for coach review</button>
      <progress v-if="busy&&file" :value="progress" max="100" class="w-full"></progress>
      <p v-if="progress" class="text-sm" role="status">{{ progress }}% — completion requires a saved submission receipt.</p>
    </form>
    <section v-if="clubEnrollments.length" class="space-y-3" aria-label="Club enrollment consent">
      <h3 class="font-semibold">Clubhouse sharing by club enrollment</h3>
      <p class="text-sm text-slate-300">Optional. Default is no sharing. Consent lasts throughout this continuous club enrollment, including team transfers, with no annual or per-video renewal. Leaving the club ends consent. Rejoining requires fresh consent. You can withdraw at any time; private videos remain available to authorized family and staff.</p>
      <article v-for="club in clubEnrollments" :key="club.id+club.generation" class="rounded border border-slate-600 p-3 space-y-2">
        <p class="font-semibold">{{ club.organization_name }} · {{ club.status }}</p>
        <p class="text-sm">Clubhouse consent: {{ club.consent_active?'Active':'Not active' }}</p>
        <p v-if="club.accepted_at" class="text-xs text-slate-400">Accepted {{ club.accepted_at }} · {{ club.policy_version }}</p>
        <p v-if="club.withdrawn_at" class="text-xs text-slate-400">Withdrawn {{ club.withdrawn_at }}</p>
        <label v-if="!club.consent_active&&club.status==='active'" class="flex gap-3 items-start text-sm py-2"><input type="checkbox" v-model="consentAccepted[club.id]" :disabled="!enabled||!ready||busy" /><span>I am a verified guardian and consent to authorized coaches publishing eligible single-athlete videos to my child's current teams within {{ club.organization_name }} for this continuous enrollment. This does not grant sharing to another club. Policy {{ consentPolicyVersion }}.</span></label>
        <button v-if="!club.consent_active&&club.status==='active'" @click="clubConsent(club,true)" :disabled="!enabled||!ready||busy||consentAccepted[club.id]!==true" class="p-3 bg-blue-700 rounded disabled:opacity-50">Grant club consent</button>
        <button v-if="club.consent_active" @click="clubConsent(club,false)" :disabled="!enabled||!ready||busy" class="p-3 bg-slate-700 rounded">Withdraw club consent</button>
        <details><summary class="py-2">Consent history</summary><ol class="text-xs"><li v-for="(entry,i) in club.history" :key="i">{{ entry.at }} · {{ entry.action }} · {{ entry.policy_version }}</li></ol></details>
      </article>
    </section>
    <div class="flex flex-wrap gap-2 items-center"><label>Status<select v-model="filter" class="p-3 bg-slate-900 rounded ml-2"><option value="all">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label><button @click="refreshItems" :disabled="!enabled||!ready||!playerId||busy" class="p-3 bg-slate-700 rounded disabled:opacity-50">Refresh history</button></div>
    <p v-if="!shownItems.length" class="text-sm text-slate-400">{{ enabled&&ready?'No matching submissions.':'Submission history awaits backend verification.' }}</p>
    <article v-for="item in shownItems" :key="item.id" class="rounded bg-slate-900 p-3 space-y-2">
      <p>{{ item.category }} · <strong>{{ item.status }}</strong> · {{ item.created_at }}</p>
      <p class="text-sm">{{ item.source_kind==='coach'?'Coach upload':'Parent submission' }} · Clubhouse publication is separate from private storage.</p>
      <p v-if="item.review_note" class="text-sm">Coach note: {{ item.review_note }}</p>
      <button @click="play(item)" :disabled="!enabled||!ready||busy" class="p-3 bg-blue-700 rounded">Private preview</button>
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
        <fieldset v-if="item.status==='approved'" class="border border-slate-600 p-3 rounded space-y-2" :disabled="!enabled||!ready||busy">
          <p class="text-sm">Publishing requires active standing club consent. Scope: selected team only. Multi-child or unidentified-subject clips must remain private.</p>
          <label v-if="item.can_publish" class="flex gap-3 items-start text-sm py-2"><input type="checkbox" v-model="subjectConfirmed[item.id]" /><span>I reviewed this clip: only this athlete is identifiable. No other child appears identifiably.</span></label>
          <button v-if="item.can_publish" @click="publish(item,true)" :disabled="!subjectConfirmed[item.id]||busy" class="p-3 bg-purple-700 rounded disabled:opacity-50">Publish to selected team</button>
          <p v-else class="text-sm text-slate-400">Publication unavailable: current enrollment consent or authorization is missing.</p>
          <button v-if="item.publication_team_ids&&item.publication_team_ids.length" @click="publish(item,false)" class="p-3 bg-slate-700 rounded">Remove all Clubhouse visibility</button>
        </fieldset>
        <details><summary class="py-2">Review history</summary><ol class="text-xs"><li v-for="(entry,i) in item.history" :key="i">{{ entry.at }} · {{ entry.action }} {{ entry.note }}</li></ol></details>
      </article>
    </template>
    <template v-else>
      <p class="text-sm text-slate-400">Coach-published videos with current standing club consent only. Authorization is rechecked for every request; the list refreshes while this view is active.</p>
      <button @click="refreshShared" :disabled="!enabled||!ready||!teamId||busy" class="p-3 rounded bg-slate-700 disabled:opacity-50">Refresh team videos</button>
      <p v-if="!shared.length" class="text-sm text-slate-400">No approved, shareable videos loaded.</p>
      <article v-for="item in shared" :key="item.id" class="rounded bg-slate-900 p-3 flex flex-wrap items-center justify-between gap-3"><span>{{ item.preferred_name }} · {{ item.category }}</span><button @click="play(item,'clubhouse')" :disabled="!enabled||!ready||busy" class="p-3 bg-blue-700 rounded">Play approved video</button></article>
    </template>
  </div>
  <video v-if="playbackUrl" :key="playbackUrl" :src="playbackUrl" @error="playbackError" controls playsinline class="w-full max-h-96 bg-black rounded"></video>
</section>`
};
