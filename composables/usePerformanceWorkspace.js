import { createPerformanceService, measurementToday, validateMeasurement } from '../js/performanceService.js';

const staffModes = ['admin','manager','coach'];
const emptyForm = () => ({protocolId:'',value:'',date:measurementToday(),evidence:'',reason:''});

// Each player and team panel owns its requests. Scope changes invalidate both
// the request and the state even if a transport resolves after cancellation.
function usePerformanceScope(auth, scope) {
  const busy = Vue.ref(false), error = Vue.ref(''), notice = Vue.ref('');
  let pending;
  function reset() {
    pending?.abort();
    pending = undefined;
    busy.value = false;
    error.value = '';
    notice.value = '';
  }
  async function run(work, apply, onError=()=>{}) {
    if (busy.value || !scope()) return;
    const selectedScope = scope(), identity = auth.captureIdentity();
    if (!auth.isCurrentIdentity(identity)) return;
    const request = new AbortController();
    pending = request;
    busy.value = true;
    error.value = '';
    const timeout = setTimeout(()=>request.abort(),20000);
    const current = () => pending === request && scope() === selectedScope && auth.isCurrentIdentity(identity);
    try {
      const result = await work(request.signal);
      if (current() && !request.signal.aborted) apply(result);
      else if (current()) error.value = 'Request timed out. Refresh before retrying.';
    } catch (cause) {
      if (current()) {
        error.value = cause.name==='AbortError' ? 'Request interrupted. Refresh before retrying.' : cause.message;
        onError(cause);
      }
    } finally {
      clearTimeout(timeout);
      if (current()) {
        busy.value = false;
        pending = undefined;
      }
    }
  }
  Vue.onScopeDispose(reset);
  return {busy,error,notice,run,reset};
}

export function usePerformanceWorkspace({auth,playerId,mode,context,onUpdated,service=createPerformanceService({auth})}) {
  const scope = () => playerId() && mode() && context() ? JSON.stringify([playerId(),mode(),context()]) : '';
  const {busy,error,notice,run,reset} = usePerformanceScope(auth,scope);
  const rows = Vue.ref([]), protocols = Vue.ref([]), form = Vue.ref(emptyForm());
  const ready = Vue.ref(false), correcting = Vue.ref(null);
  const unit = Vue.computed(()=>protocols.value.find(row=>row.id===form.value.protocolId)?.unit || '');
  const official = Vue.computed(()=>staffModes.includes(mode()));
  let attempt;
  function clearForm() {
    form.value = emptyForm();
    correcting.value = null;
    attempt = undefined;
  }
  function refresh() {
    return run(async signal=>{
      ready.value = false;
      rows.value = [];
      const history = await service.history(playerId(),signal);
      const catalog = await service.protocols(signal);
      return {history,catalog};
    },({history,catalog})=>{
      rows.value = history;
      protocols.value = catalog;
      ready.value = true;
    });
  }
  Vue.watch(scope,()=>{
    reset();
    ready.value = false;
    rows.value = [];
    protocols.value = [];
    clearForm();
    if (scope()) void refresh();
  },{immediate:true,flush:'sync'});
  function correct(row) {
    if (!ready.value || busy.value || !official.value || !rows.value.includes(row) ||
        row.status!=='approved' || row.superseded_by || !protocols.value.some(p=>p.id===row.protocol_id)) return;
    clearForm();
    correcting.value = row;
    form.value = {protocolId:row.protocol_id,value:row.value,date:row.measurement_date,evidence:row.evidence || '',reason:''};
  }
  async function save() {
    if (!ready.value || busy.value || (!official.value && mode()!=='family')) return;
    let measurement;
    try { measurement = validateMeasurement(form.value,protocols.value,correcting.value); }
    catch (cause) { error.value = cause.message; return; }
    const player = playerId(), prior = correcting.value?.id, isOfficial = official.value;
    const fingerprint = JSON.stringify([player,prior,isOfficial,measurement]);
    if (attempt?.fingerprint !== fingerprint) attempt = {fingerprint,key:crypto.randomUUID()};
    let committed = false;
    await run(signal=>prior ? service.correct(prior,measurement,attempt.key,signal)
      : service.submit(player,measurement,isOfficial,attempt.key,signal), result=>{
      committed = true;
      clearForm();
      notice.value = prior ? 'Official correction saved.' :
        result.status==='approved' ? 'Official measurement saved.' : 'Measurement submitted for coach review.';
      onUpdated(player);
    },cause=>{
      if ([401,403,409].includes(cause.status)) {
        ready.value = false;
        rows.value = [];
        if (cause.status!==409) clearForm();
      }
    });
    if (committed && playerId()===player) await refresh();
  }
  return {rows,protocols,form,ready,correcting,official,unit,busy,error,notice,refresh,clearForm,correct,save};
}

export function usePerformanceReview({auth,teamAllowed,context,onUpdated,service=createPerformanceService({auth})}) {
  const teamId = Vue.ref('');
  const scope = () => teamId.value && teamAllowed(teamId.value) && context() ? JSON.stringify([teamId.value,context()]) : '';
  const {busy,error,notice,run,reset} = usePerformanceScope(auth,scope);
  const reviewRows = Vue.ref([]), reviewNotes = Vue.ref({}), ready = Vue.ref(true);
  let loadedScope = '';
  Vue.watch(scope,()=>{
    reset();
    loadedScope = '';
    reviewRows.value = [];
    reviewNotes.value = {};
  },{flush:'sync'});
  function loadReview(team) {
    if (!teamAllowed(team)) return;
    teamId.value = team;
    return run(signal=>{
      loadedScope = '';
      reviewRows.value = [];
      reviewNotes.value = {};
      return service.queue(team,signal);
    },rows=>{
      loadedScope = scope();
      reviewRows.value = rows;
    });
  }
  async function review(row,decision) {
    if (busy.value || !scope() || loadedScope!==scope() || !reviewRows.value.includes(row) || row.can_review!==true || row.source_kind!=='parent' ||
        !['approved','rejected','correction_requested'].includes(decision)) return;
    const note = (reviewNotes.value[row.id] || '').trim();
    if (note.length>1000 || (!note && decision!=='approved')) {
      error.value = 'Enter a review note to reject a result or request a correction.';
      return;
    }
    const team = teamId.value;
    let committed = false;
    await run(signal=>service.review(row,decision,note,signal),()=>{
      committed = true;
      loadedScope = '';
      reviewRows.value = [];
      reviewNotes.value = {};
      notice.value = 'Review saved.';
      onUpdated(row.player_id);
    });
    if (error.value) {
      // A denied or stale queue must not retain actionable results.
      loadedScope = '';
      reviewRows.value = [];
      reviewNotes.value = {};
    }
    if (committed && teamId.value===team) await loadReview(team);
  }
  return {enabled:true,ready,busy,error,notice,reviewRows,reviewNotes,loadReview,review};
}
