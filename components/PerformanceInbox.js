export const PerformanceInbox={name:'PerformanceInbox',props:{controller:{type:Object,required:true},teamId:{type:String,default:''}},setup(props){Vue.watch?.(()=>[props.teamId,props.controller.ready.value],([team,ready])=>{if(team&&ready)void props.controller.loadReview(team);},{immediate:true});return {...props.controller};},template:`
<section class="space-y-3 border border-slate-600 rounded-xl p-3" aria-label="Performance review inbox">
 <h3 class="font-bold">Official baseball statistics review</h3><p class="text-sm text-slate-300">Parent results stay private until reviewed. Sharing requires separate current consent.</p>
 <button @click="loadReview(teamId)" :disabled="!enabled||!ready||busy||!teamId" class="p-3 rounded bg-blue-700 disabled:opacity-50">Refresh performance reviews</button>
 <p v-if="error" role="alert" class="text-rose-300">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
 <p v-if="!reviewRows.length" class="text-sm text-slate-400">No performance reviews loaded.</p>
 <article v-for="row in reviewRows" :key="row.id" class="space-y-2 p-3 bg-slate-900 rounded">
  <h4>{{ row.preferred_name }} · {{ row.protocol_label }}</h4><p>{{ row.value }} {{ row.unit }} · {{ row.measurement_date }} · {{ row.status }}</p><p class="text-sm whitespace-pre-wrap">Evidence: {{ row.evidence }}</p>
  <p class="text-sm">{{ row.review_note }}</p>
  <template v-if="row.can_review"><label class="block text-sm">Review note<textarea v-model="reviewNotes[row.id]" maxlength="1000" class="block w-full rounded p-3 bg-slate-800"></textarea></label>
  <div class="flex flex-wrap gap-2"><button v-for="decision in ['approved','rejected','correction_requested']" :key="decision" @click="review(row,decision)" :disabled="busy" class="p-3 rounded bg-blue-700 disabled:opacity-50">{{ {approved:'Approve',rejected:'Reject',correction_requested:'Request correction'}[decision] }}</button></div></template>
  <details class="text-xs"><summary class="p-2">Review history</summary><p v-for="(event,index) in row.history" :key="index">{{ event.action }} · {{ event.at }} · {{ event.actor }} · {{ event.details?.note || '' }}</p></details>
 </article>
</section>`};
