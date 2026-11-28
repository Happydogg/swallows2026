// Performance uses narrow authenticated RPCs and has no media transport dependency.
import { supabaseClient } from './config.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const databaseUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PostgreSQL UUIDs include deterministic fixture IDs; request and record IDs retain stricter validation.
function scopeIdentifier(value) {
  if(typeof value!=='string'||!databaseUuid.test(value))throw new Error('Invalid performance record identifier.');
  return value;
}
const units = { exit_velo:'km/h', throwing_velo:'km/h', sprint_time:'s', broad_jump:'cm' };
const statuses = ['pending', 'approved', 'rejected', 'correction_requested'];

function identifier(value) {
  if (typeof value !== 'string' || !uuid.test(value)) throw new Error('Invalid performance record identifier.');
  return value;
}

export const measurementToday = () => new Date().toISOString().slice(0, 10);

export function validateMeasurement(form, protocols, correcting) {
  const protocol = protocols.find(row => row.id === form.protocolId);
  const value = Number(form.value);
  const date = form.date;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(date+'T00:00:00Z');
  if (!protocol) throw new Error('Choose an active measurement protocol.');
  if (!Number.isFinite(value) || value <= 0 || value > 500) throw new Error('Enter a measurement greater than 0 and at most 500.');
  if (!parsed || !Number.isFinite(+parsed) || parsed.toISOString().slice(0,10) !== date ||
      date < '1900-01-01' || date > measurementToday()) throw new Error('Enter a valid measurement date through today.');
  const evidence = form.evidence.trim(), reason = form.reason.trim();
  if (!evidence || evidence.length > 1000) throw new Error('Enter measurement evidence of up to 1,000 characters.');
  if (correcting && (!reason || reason.length > 500)) throw new Error('Enter a correction reason of up to 500 characters.');
  return { p_protocol:protocol.id, p_value:value, p_date:date, p_evidence:evidence, ...(correcting ? {p_reason:reason} : {}) };
}

export function createPerformanceService({auth,client=supabaseClient}) {
  async function rpc(name, args, signal) {
    const identity = auth.captureIdentity();
    if (signal?.aborted || !auth.isCurrentIdentity(identity)) throw new DOMException('Session changed','AbortError');
    let request = args ? client.rpc(name,args) : client.rpc(name);
    if (signal && typeof request.abortSignal === 'function') request = request.abortSignal(signal);
    const {data,error} = await request;
    if (signal?.aborted || !auth.isCurrentIdentity(identity)) throw new DOMException('Session changed','AbortError');
    if (error) {
      const status = ({ '42501':403, PGRST301:401, PT409:409, '22023':400 })[error.code] || error.status || 503;
      const message = ({
        401:'Sign in again to manage measurements.',
        403:'Your account cannot perform this action in the selected scope.',
        409:'This measurement changed. Refresh before trying again.',
        400:'The measurement was rejected. Check the protocol, date and evidence.'
      })[status] || 'The performance service is unavailable. Try again or contact your club.';
      throw Object.assign(new Error(message),{status});
    }
    return data;
  }
  async function records(args, signal) {
    const rows = await rpc('sdl_004_pilot_performance', args, signal);
    if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => !row ||
      !uuid.test(row.id ?? '') || !databaseUuid.test(row.player_id ?? '') || !statuses.includes(row.status) ||
      !Number.isSafeInteger(row.revision) || (args.p_player && row.player_id !== args.p_player) ||
      (args.p_status === 'pending' && row.status !== 'pending'))) {
      throw new Error('The performance response did not match the selected scope.');
    }
    const fields = ['id','player_id','preferred_name','protocol_id','protocol_label','unit','value',
      'measurement_date','status','source_kind','revision','evidence','review_note','supersedes','superseded_by','can_review'];
    return rows.map(row=>({
      ...Object.fromEntries(fields.map(field=>[field,row[field]])),
      history:Array.isArray(row.history) ? row.history.filter(event=>typeof event?.action==='string').map(event=>({
        action:event.action, at:event.at,
        details:{note:event.details?.note,reason:event.details?.reason}
      })) : []
    }));
  }
  async function receipt(name, args, signal, expectedStatus) {
    const result = await rpc(name,args,signal);
    if (!result || !uuid.test(result.id ?? '') || result.status !== expectedStatus) {
      throw new Error('The save result could not be confirmed. Refresh or retry the same measurement.');
    }
    return result;
  }
  return {
    async protocols(signal) {
      const data = await rpc('sdl_004_pilot_workspace',undefined,signal);
      if (!Array.isArray(data?.protocols) || !data.protocols.length ||
          data.protocols.some(row => !row || typeof row.id !== 'string' || typeof row.label !== 'string' ||
            !Object.hasOwn(units,row.metric) || units[row.metric] !== row.unit) ||
          new Set(data.protocols.map(row => row.id)).size !== data.protocols.length) {
        throw new Error('The active measurement protocols are unavailable.');
      }
      return data.protocols.map(({id,label,unit})=>({id,label,unit}));
    },
    history:(player,signal)=>records({p_player:scopeIdentifier(player),p_status:'all'},signal),
    queue:(team,signal)=>records({p_team:scopeIdentifier(team),p_status:'pending'},signal),
    submit:(player,measurement,official,key,signal)=>receipt('sdl_004_pilot_submit_performance',{
      ...measurement,p_player:scopeIdentifier(player),p_official:official,p_key:identifier(key)
    },signal,official ? 'approved' : 'pending'),
    correct:(prior,measurement,key,signal)=>receipt('sdl_v5_correct_official',{
      ...measurement,p_prior:identifier(prior),p_request:identifier(key)
    },signal,'approved'),
    review:(row,decision,note,signal)=>rpc('sdl_004_pilot_review_performance',{
      p_id:identifier(row.id),p_decision:decision,p_note:note,p_revision:row.revision
    },signal)
  };
}
