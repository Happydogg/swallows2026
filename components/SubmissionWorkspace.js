// No privileged flags are derived from form fields; server capabilities remain required.
export const SubmissionWorkspace={
  name:'SubmissionWorkspace',props:{controller:{type:Object,required:true}},
  setup(props){return {...props.controller};},
  template:`
<section class="my-6 rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-4 no-print" aria-label="Player and video workspace">
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
    <div>
      <h2 class="font-bold text-xl text-white">My Players and team videos</h2>
      <p class="text-xs text-slate-400">Mobile-first family dashboard, video submissions, and read-only Team Clubhouse.</p>
    </div>
    <span v-if="isVerifiedGuardian" class="self-start sm:self-auto text-xs px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 font-semibold">Verified Guardian Access</span>
  </div>
  <nav class="grid grid-cols-2 sm:flex sm:flex-wrap gap-2" aria-label="Player workspace views">
    <button v-for="view in ['players','submissions','review','clubhouse']" :key="view" @click="changeTab(view)" :aria-pressed="tab===view" class="px-3 py-3 rounded-lg bg-slate-700 text-sm font-medium text-left sm:text-center transition" :class="tab===view?'ring-2 ring-blue-400 bg-slate-700/90 text-white font-semibold':'text-slate-200 hover:bg-slate-600'">{{ {players:'My Players',submissions:'Video submissions',review:'Coach review',clubhouse:'Team Clubhouse'}[view] }}</button>
  </nav>
  <p v-if="!enabled" class="text-sm text-amber-300 bg-amber-950/30 border border-amber-800/50 rounded-lg p-3" role="status">Submission, review and team-sharing operations await backend deployment and verification. You can prepare a local video preview. The working private-media pilot remains available below.</p>
  <button v-if="enabled&&!ready" @click="load" :disabled="busy" class="w-full sm:w-auto p-3 rounded-lg bg-blue-600 font-semibold text-sm">Load authorized workspace</button>
  <p v-if="busy" role="status" class="text-sm text-slate-300">Working securely…</p>
  <p v-if="error" role="alert" class="text-sm text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-lg p-3">{{ error }}</p>
  <p v-if="notice" role="status" class="text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 rounded-lg p-3">{{ notice }}</p>
  <div v-if="tab==='players'" class="grid gap-4 md:grid-cols-2" aria-label="My Players">
    <div v-if="!cards.length" class="md:col-span-2 rounded-xl border border-slate-700 bg-slate-900/70 p-6 text-center space-y-2">
      <p class="text-slate-300 font-semibold">No verified children are linked to this account. Coach accounts can use the team roster and review center.</p>
      <p class="text-xs text-slate-400">Family accounts only display athletes with an active server-verified guardian link. Contact your club administrator if your invitation or athlete link is pending verification.</p>
    </div>
    <article v-for="card in cards" :key="card.athlete_id" class="bg-slate-900 border border-slate-700/80 rounded-xl p-4 space-y-4 shadow-sm">
      <div class="flex items-start justify-between gap-2">
        <div>
          <h3 class="font-bold text-lg text-white">{{ card.name }}</h3>
          <p class="text-xs text-slate-400">Linked athlete · Approved baseball profile only</p>
        </div>
        <span class="text-xs font-mono px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800/60 text-blue-300">{{ card.profiles.length }} {{ card.profiles.length===1?'profile':'profiles' }}</span>
      </div>
      <p v-if="!card.memberships.length" class="text-sm text-slate-400">Organization and team details await the authorized workspace service.</p>
      <ul v-else class="text-sm text-slate-300 space-y-1"><li v-for="membership in card.memberships" :key="membership.organization_id+':'+membership.team_id" class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span><span>{{ membership.organization_name }} · {{ membership.team_name }}</span></li></ul>
      <div v-for="profile in card.profiles" :key="profile.id" class="space-y-3 border-t border-slate-800 pt-3">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-semibold text-blue-300">{{ profile.clubLabel }}</p>
          <span class="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-200">#{{ profile.jersey }}</span>
        </div>
        <p class="text-sm text-slate-200">#{{ profile.jersey }} · {{ profile.position }} · Throws {{ profile.throws }} / Bats {{ profile.bats }}</p>
        <p v-if="!profile.statsAvailable" class="text-xs text-amber-300 bg-amber-950/20 border border-amber-800/50 rounded-lg p-2.5" role="status" data-stats-unavailable>{{ statsUnavailableNotice }}</p>
        <div v-else class="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 text-xs font-mono">
          <div>
            <span class="text-slate-400 text-[10px] block">Exit Velo</span>
            <span class="text-blue-400 font-bold">{{ profile.latestExitVelo ? profile.latestExitVelo + ' km/h' : '--' }}</span>
          </div>
          <div>
            <span class="text-slate-400 text-[10px] block">Throw Velo</span>
            <span class="text-emerald-400 font-bold">{{ profile.latestThrowingVelo ? profile.latestThrowingVelo + ' km/h' : '--' }}</span>
          </div>
          <div>
            <span class="text-slate-400 text-[10px] block">Sprint 18.29m</span>
            <span class="text-amber-300 font-bold">{{ profile.latestSprintTime ? profile.latestSprintTime + 's' : '--' }}</span>
          </div>
          <div>
            <span class="text-slate-400 text-[10px] block">Sessions</span>
            <span class="text-slate-200 font-bold">{{ profile.sessionCount ?? 0 }}</span>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button @click="showProfile(profile.id)" class="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white transition">Baseball profile and permitted statistics</button>
          <button @click="changeTab('submissions');selectPlayer(profile.id)" class="p-3 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium text-white transition">Video submissions</button>
          <button @click="openPrivateVideos(profile.id)" class="p-3 bg-purple-800/80 hover:bg-purple-700 rounded-lg text-sm font-medium text-white transition">Private videos</button>
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
      <div class="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-4" aria-label="Team Clubhouse read-only workspace">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 class="font-bold text-lg text-white">Team Clubhouse</h3>
            <p class="text-xs text-slate-400">Read-only team space · Only approved, consented team data is shown. No family contacts, DOB, or registration numbers.</p>
          </div>
          <span class="self-start sm:self-auto text-xs px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">Read-Only View</span>
        </div>

        <nav class="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label="Team Clubhouse sections">
          <button v-for="sec in [{id:'roster',label:'1. Team Roster'},{id:'leaderboard',label:'2. Leaderboard'},{id:'stats',label:'3. Player Statistics'},{id:'videos',label:'4. Approved Videos'}]"
            :key="sec.id" @click="changeClubhouseSection(sec.id)" :aria-pressed="clubhouseSection===sec.id"
            class="px-3 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition"
            :class="clubhouseSection===sec.id?'bg-blue-600 text-white font-semibold shadow':'bg-slate-800 text-slate-300 hover:bg-slate-700'">
            {{ sec.label }}
          </button>
        </nav>

        <!-- Section 1: Team Roster (Parent-Safe Read-Only) -->
        <section v-if="clubhouseSection==='roster'" class="space-y-3" aria-label="Clubhouse Team Roster">
          <div class="flex items-center justify-between">
            <h4 class="font-semibold text-sm text-white">Team Roster (Approved Baseball Fields Only)</h4>
            <span class="text-xs text-slate-400">{{ clubhouseRosterSafe.length }} players</span>
          </div>
          <div v-if="!clubhouseRosterReady" class="rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 space-y-1" role="status">
            <p class="text-sm font-semibold text-amber-300">Parent-safe Team Roster service coming soon</p>
            <p class="text-xs text-slate-300">{{ clubhouseRosterNotice || 'The dedicated parent-safe Clubhouse roster endpoint (/v2/clubhouse/roster) awaits backend deployment and verification. Unrestricted coach rosters and raw player records are never reused here.' }}</p>
          </div>
          <div v-else-if="!clubhouseRosterSafe.length" class="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
            No approved, consented team roster entries are available for the selected team yet.
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <article v-for="member in clubhouseRosterSafe" :key="member.team_id+':'+member.id" class="rounded-lg border border-slate-700 bg-slate-800/80 p-3.5 space-y-1.5">
              <div class="flex items-center justify-between gap-2">
                <p class="font-semibold text-white">{{ member.preferred_name }}</p>
                <span class="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-blue-300">#{{ member.jersey }}</span>
              </div>
              <p class="text-xs text-slate-400">{{ member.team_name }}</p>
              <p class="text-xs text-slate-200">Position: {{ member.position }} · Throws {{ member.throws }} / Bats {{ member.bats }}</p>
            </article>
          </div>
        </section>

        <!-- Section 2: Leaderboard (Parent-Safe Read-Only) -->
        <section v-if="clubhouseSection==='leaderboard'" class="space-y-3" aria-label="Clubhouse Leaderboard">
          <div class="flex items-center justify-between">
            <h4 class="font-semibold text-sm text-white">Team Leaderboard (Top 3 Approved Metrics)</h4>
            <span class="text-xs text-slate-400">Consented team members only</span>
          </div>
          <div v-if="!clubhouseLeaderboardReady" class="rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 space-y-1" role="status">
            <p class="text-sm font-semibold text-amber-300">Parent-safe Team Leaderboard service coming soon</p>
            <p class="text-xs text-slate-300">{{ clubhouseLeaderboardNotice || 'The dedicated parent-safe Clubhouse leaderboard endpoint (/v2/clubhouse/leaderboard) awaits backend deployment and verification. Unverified or raw session records are never used to populate team leaderboards.' }}</p>
          </div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div v-for="board in [{key:'exit_velo',title:'Top Exit Velo',unit:'km/h',accent:'text-blue-400'},{key:'throwing_velo',title:'Throwing Velo',unit:'km/h',accent:'text-emerald-400'},{key:'broad_jump_ratio',title:'Lower-Body Power (Jump Ratio)',unit:'x',accent:'text-purple-400'},{key:'sprint_time',title:'Sprint (18.29m)',unit:'s',accent:'text-amber-300'}]" :key="board.key" class="rounded-lg border border-slate-700 bg-slate-800/80 p-3.5 space-y-2">
              <div class="flex items-center justify-between">
                <h5 class="text-xs font-bold uppercase tracking-wider" :class="board.accent">{{ board.title }}</h5>
                <span class="text-[11px] text-slate-400 font-mono">{{ board.unit }}</span>
              </div>
              <p v-if="!clubhouseLeaderboardByMetric[board.key].length" class="text-xs text-slate-400 py-2">No approved leaderboard entries for this metric.</p>
              <ol v-else class="space-y-1.5">
                <li v-for="(item, idx) in clubhouseLeaderboardByMetric[board.key]" :key="item.id" class="flex items-center justify-between rounded bg-slate-900/80 px-3 py-2 text-xs">
                  <div class="flex items-center gap-2">
                    <span class="font-bold font-mono text-slate-300">#{{ idx + 1 }}</span>
                    <span class="font-semibold text-white">{{ item.preferred_name }}</span>
                    <span class="font-mono text-slate-400">#{{ item.jersey }}</span>
                  </div>
                  <span class="font-mono font-bold" :class="board.accent">{{ item.value }} {{ item.unit }}</span>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <!-- Section 3: Player Statistics (Permitted Linked Child Access + Teammate Notice) -->
        <section v-if="clubhouseSection==='stats'" class="space-y-3" aria-label="Clubhouse Player Statistics">
          <div class="flex items-center justify-between">
            <h4 class="font-semibold text-sm text-white">Player Statistics</h4>
            <span class="text-xs text-slate-400">Permitted athlete profiles</span>
          </div>
          <div class="rounded-lg border border-slate-700 bg-slate-800/60 p-3.5 text-xs text-slate-300 space-y-1">
            <p class="font-semibold text-slate-200">Privacy &amp; Authorization Policy</p>
            <p>Detailed dated session histories and physical growth charts are restricted to your verified linked children. Teammate individual statistics await the parent-safe Clubhouse summary service.</p>
          </div>
          <div v-if="!cards.length" class="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
            No verified linked children are available on this account for individual statistics review.
          </div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <article v-for="card in cards" :key="'stats-'+card.athlete_id" class="rounded-lg border border-slate-700 bg-slate-800/80 p-3.5 space-y-2.5">
              <h5 class="font-bold text-white">{{ card.name }}</h5>
              <div v-for="profile in card.profiles" :key="'stat-prof-'+profile.id" class="border-t border-slate-700/70 pt-2 space-y-2">
                <p class="text-xs font-semibold text-blue-300">{{ profile.clubLabel }} · #{{ profile.jersey }} · {{ profile.position }}</p>
                <p v-if="!profile.statsAvailable" class="text-xs text-amber-300 bg-amber-950/20 border border-amber-800/50 rounded p-2" role="status" data-stats-unavailable>{{ statsUnavailableNotice }}</p>
                <div v-else class="grid grid-cols-3 gap-2 text-xs font-mono bg-slate-900/80 p-2 rounded">
                  <div><span class="text-[10px] text-slate-400 block">Exit Velo</span><span class="text-blue-400 font-bold">{{ profile.latestExitVelo ? profile.latestExitVelo + ' km/h' : '--' }}</span></div>
                  <div><span class="text-[10px] text-slate-400 block">Throw Velo</span><span class="text-emerald-400 font-bold">{{ profile.latestThrowingVelo ? profile.latestThrowingVelo + ' km/h' : '--' }}</span></div>
                  <div><span class="text-[10px] text-slate-400 block">Sprint</span><span class="text-amber-300 font-bold">{{ profile.latestSprintTime ? profile.latestSprintTime + 's' : '--' }}</span></div>
                </div>
                <button @click="showProfile(profile.id)" class="w-full sm:w-auto px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs font-semibold text-white">{{ profile.statsAvailable ? 'Open full baseball profile and charts' : 'Open baseball profile' }}</button>
              </div>
            </article>
          </div>
        </section>

        <!-- Section 4: Approved Videos (Coach-Published & Consented) -->
        <section class="space-y-3 border-t border-slate-800 pt-3" aria-label="Clubhouse Approved Videos">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 class="font-semibold text-sm text-white">Approved Team Videos</h4>
              <p class="text-xs text-slate-400">Coach-published videos with current standing club consent only. Authorization is rechecked for every request; the list refreshes while this view is active.</p>
            </div>
            <button @click="refreshShared" :disabled="!enabled||!ready||!teamId||busy" class="p-3 rounded bg-slate-700 text-sm disabled:opacity-50">Refresh team videos</button>
          </div>
          <p v-if="!shared.length" class="text-sm text-slate-400">No approved, shareable videos loaded.</p>
          <article v-for="item in shared" :key="item.id" class="rounded bg-slate-900 p-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span class="font-semibold text-white">{{ item.preferred_name }} · {{ item.category }}</span>
              <p v-if="item.created_at" class="text-xs text-slate-400">{{ item.created_at }}</p>
            </div>
            <button @click="play(item,'clubhouse')" :disabled="!enabled||!ready||busy" class="p-3 bg-blue-700 rounded text-sm">Play approved video</button>
          </article>
        </section>
      </div>
    </template>
  </div>
  <video v-if="playbackUrl" :key="playbackUrl" :src="playbackUrl" @error="playbackError" controls playsinline class="w-full max-h-96 bg-black rounded"></video>
</section>`
};
