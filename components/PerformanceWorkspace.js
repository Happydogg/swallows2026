import { usePerformanceWorkspace, usePerformanceReview } from '../composables/usePerformanceWorkspace.js';
import { measurementToday } from '../js/performanceService.js';
import { PerformanceInbox } from './PerformanceInbox.js';

const inputClass = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-base text-white';
const buttonClass = 'min-h-11 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const statuses = {pending:'Pending review', approved:'Official', rejected:'Rejected', correction_requested:'Correction requested'};

export const PerformanceWorkspace = {
  name:'PerformanceWorkspace',
  components:{PerformanceInbox},
  props:{
    auth:{type:Object,required:true},
    mode:{type:String,required:true},
    players:{type:Array,required:true},
    fixedPlayerId:{type:String,default:null},
    teams:{type:Array,default:()=>[]}
  },
  emits:['updated'],
  setup(props,{emit}) {
    const choice = Vue.ref(''), reviewTeam = Vue.ref(''), protocolField = Vue.ref(null);
    const playerId = Vue.computed(()=>{
      const id = props.fixedPlayerId ?? choice.value;
      return props.players.some(player=>player.id===id) ? id : '';
    });
    const context = () => !props.auth.authError.value && props.auth.authUser.value?.id;
    const onUpdated = id => emit('updated',id);
    const workspace = usePerformanceWorkspace({
      auth:props.auth,mode:()=>props.mode,playerId:()=>playerId.value,context,onUpdated
    });
    const teamAllowed = id => props.mode==='coach' && !!id && props.teams.some(team=>team.id===id);
    const review = usePerformanceReview({auth:props.auth,teamAllowed,context,onUpdated:id=>{
      if (workspace.ready.value && playerId.value===id) void workspace.refresh();
      onUpdated(id);
    }});
    Vue.watch(()=>[props.mode,context(),props.teams.map(team=>team.id).join('|')],([mode])=>{
      reviewTeam.value = mode==='coach' ? props.teams[0]?.id || '' : '';
    },{immediate:true});
    function startCorrection(row) {
      workspace.correct(row);
      if (workspace.correcting.value) void Vue.nextTick(()=>protocolField.value?.focus?.());
    }
    return {...workspace,startCorrection,protocolField,playerId,choice,reviewTeam,inboxController:Vue.markRaw(review),
      inputClass,buttonClass,statuses,today:measurementToday,
      earlier:row=>workspace.rows.value.find(item=>item.id===row.supersedes)};
  },
  template:`
    <section class="my-4 space-y-4 rounded-2xl border border-slate-700 bg-slate-900/90 p-4 sm:p-6" aria-label="Performance measurements">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-xl font-bold">Performance measurements</h2>
        <button v-if="playerId" type="button" :class="buttonClass" :disabled="busy" @click="refresh">Refresh measurements</button>
      </header>
      <label v-if="fixedPlayerId===null" class="block max-w-lg text-sm font-semibold">Choose player
        <select v-model="choice" :class="inputClass">
          <option value="">Select an authorized player</option>
          <option v-for="p in players" :key="p.id" :value="p.id">{{ p.preferred_name || 'Player' }}{{ p.jersey ? ' · #'+p.jersey : '' }}</option>
        </select>
      </label>
      <p v-if="!players.length" class="text-sm text-slate-300">No players are available in this scope.</p>
      <p v-if="busy" class="text-sm text-slate-300" role="status">Updating performance measurements…</p>
      <p v-if="error" class="break-words text-sm text-rose-300" role="alert">{{ error }}</p>
      <p v-if="notice" class="text-sm text-emerald-200" role="status">{{ notice }}</p>
      <form v-if="ready" class="space-y-4 border-t border-slate-700 pt-4" @submit.prevent="save">
        <h3 class="font-semibold">{{ correcting ? 'Correct official measurement' : (official ? 'Enter official measurement' : 'Submit for coach review') }}</h3>
        <fieldset :disabled="busy" class="space-y-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-sm font-semibold sm:col-span-2">Measurement protocol
              <select ref="protocolField" v-model="form.protocolId" required :class="inputClass">
                <option value="">Choose a protocol</option>
                <option v-for="p in protocols" :key="p.id" :value="p.id">{{ p.label }} ({{ p.unit }})</option>
              </select>
            </label>
            <label class="text-sm font-semibold">Value{{ unit ? ' ('+unit+')' : '' }}
              <input v-model="form.value" type="number" inputmode="decimal" step="any" max="500" required :class="inputClass">
            </label>
            <label class="text-sm font-semibold">Measurement date
              <input v-model="form.date" type="date" min="1900-01-01" :max="today()" required :class="inputClass">
            </label>
          </div>
          <label class="block text-sm font-semibold">Measurement evidence
            <textarea v-model="form.evidence" required maxlength="1000" rows="2" :class="inputClass"></textarea>
          </label>
          <label v-if="correcting" class="block text-sm font-semibold">Correction reason
            <textarea v-model="form.reason" required maxlength="500" rows="2" :class="inputClass"></textarea>
          </label>
          <div class="flex flex-wrap gap-2">
            <button type="submit" :class="buttonClass">{{ correcting ? 'Save official correction' : (official ? 'Save official result' : 'Submit for review') }}</button>
            <button v-if="correcting" type="button" class="min-h-11 rounded-lg bg-slate-700 px-4" @click="clearForm">Cancel correction</button>
          </div>
        </fieldset>
      </form>
      <div v-if="ready" class="space-y-3">
        <h3 class="font-semibold">Measurement history</h3>
        <p v-if="!rows.length" class="text-sm text-slate-300">No measurements have been entered.</p>
        <article v-for="row in rows" :key="row.id" class="space-y-2 rounded-xl border border-slate-700 bg-slate-950 p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="font-semibold">{{ row.protocol_label || row.protocol_id }}</h4>
            <span class="rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-200">{{ row.superseded_by ? 'Superseded' : statuses[row.status] }}</span>
          </div>
          <p class="text-sm">{{ row.value }} {{ row.unit }} · {{ row.measurement_date }}</p>
          <p v-if="row.evidence" class="whitespace-pre-wrap break-words text-sm text-slate-300">{{ row.evidence }}</p>
          <p v-if="row.review_note" class="whitespace-pre-wrap break-words text-sm text-slate-300">Coach note: {{ row.review_note }}</p>
          <details class="text-sm text-slate-300">
            <summary class="min-h-10 cursor-pointer py-2">Revision history · revision {{ row.revision }}</summary>
            <p v-if="earlier(row)">Previous result: {{ earlier(row).value }} {{ earlier(row).unit }} · {{ earlier(row).measurement_date }}</p>
            <p v-else-if="row.supersedes">Previous result is outside the loaded history.</p>
            <p v-for="(event,index) in row.history" :key="index" class="break-words py-1">{{ event.action?.replaceAll('_',' ') }} · {{ event.at }}<span v-if="event.details?.reason || event.details?.note"> · {{ event.details.reason || event.details.note }}</span></p>
          </details>
          <button v-if="official && row.status==='approved' && !row.superseded_by && protocols.some(p=>p.id===row.protocol_id)" type="button" :class="buttonClass" :disabled="busy" @click="startCorrection(row)">Correct official result</button>
        </article>
      </div>
      <template v-if="mode==='coach' && teams.length">
        <label class="block max-w-lg text-sm font-semibold">Team to review
          <select v-model="reviewTeam" :class="inputClass">
            <option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option>
          </select>
        </label>
        <performance-inbox v-if="reviewTeam" :controller="inboxController" :team-id="reviewTeam"></performance-inbox>
      </template>
    </section>`
};
