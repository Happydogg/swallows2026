// Clean-start v5.1 Worker contract. Every request is authorized again by the Worker.
import { supabaseClient, SUPABASE_URL, PRIVATE_MEDIA_WORKER_URL } from './config.js';
export const MEDIA_LIMIT = 40 * 1024 * 1024;
const STAGING = 'https://wvurolqbjhuckkkjiiiv.supabase.co';
const WORKER = 'https://sdl-r2-staging-gate.sampson-ho.workers.dev';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class MediaError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'MediaError'; this.status = status; }
}
const messages = {
  401: 'Your session expired or was revoked. Sign in again.',
  403: 'You do not have permission to access this media.',
  404: 'This video could not be found.',
  409: 'Another upload or review is in progress or already completed. Refresh before retrying.',
  410: 'This invitation expired or was revoked. Request a new invitation from the club.',
  411: 'The browser did not send the file length. Please retry with a supported browser.',
  413: 'Choose a non-empty MP4 or MOV file no larger than 40 MiB.',
  415: 'This service accepts MP4 and QuickTime MOV videos only.',
  503: 'The media service is unavailable. Please try again later.'
};
const disabled = () => Object.assign(new MediaError('This media feature is currently disabled.', 503), {code:'media_disabled'});
const failure = status => new MediaError(messages[status] || 'The media request failed. Please retry.', status);
const PLAYER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const playerIdValue = value => { if (typeof value !== 'string' || !PLAYER_UUID.test(value)) throw new MediaError('Invalid media or player ID.'); return value; };
const id = value => { if (!UUID.test(value ?? '')) throw new MediaError('Invalid media or player ID.'); return value; };
export function validateMediaFile(file) {
  // iOS Photos/Files may report generic MIME or a transcoded container.
  const mime = typeof file?.type === 'string' ? file.type.toLowerCase().trim() : '';
  const name = typeof file?.name === 'string' ? file.name : '';
  if (!file || !/\.(mp4|mov)$/i.test(name) || !['video/mp4','video/quicktime','application/octet-stream',''].includes(mime))
    throw new MediaError('Choose an MP4 or MOV video from Photo Library or Files.',415);
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MEDIA_LIMIT) throw failure(413);
  return /\.mov$/i.test(name) ? 'video/quicktime' : 'video/mp4';
}

export function createPrivateMediaService({ auth, client = supabaseClient, baseUrl = PRIVATE_MEDIA_WORKER_URL,
  supabaseUrl = SUPABASE_URL, fetchImpl = (...args) => fetch(...args), xhrFactory = () => new XMLHttpRequest() }) {
  function assertStaging() {
    if (supabaseUrl !== STAGING || baseUrl.replace(/\/$/, '') !== WORKER) {
      throw new MediaError('Private media is restricted to the verified staging services.');
    }
  }
  async function bearer(signal) {
    assertStaging();
    const identity = auth.captureIdentity();
    if (!auth.isCurrentIdentity(identity)) throw failure(401);
    const { data, error } = await client.auth.getSession();
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (!auth.isCurrentIdentity(identity)) throw failure(401);
    const session = data?.session;
    if (error || !session?.access_token || !Number.isFinite(session.expires_at) ||
      session.expires_at <= Date.now() / 1000 || session.user?.id !== identity.userId) throw failure(401);
    return { token: session.access_token, identity };
  }
  async function request(route, { signal, method = 'GET', body, blob = false } = {}) {
    const { token, identity } = await bearer(signal);
    let response;
    try {
      response = await fetchImpl(`${WORKER}${route}`, {
        method, signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new MediaError('Could not reach the media service. Check your connection.');
    }
    if (!auth.isCurrentIdentity(identity)) throw failure(401);
    if (!response.ok) {
      if (response.status === 503 && (await response.json().catch(() => null))?.code === 'media_disabled') throw disabled();
      throw failure(response.status);
    }
    try {
      if (!blob) {
        const payload=await response.json();
        if (!auth.isCurrentIdentity(identity)) throw failure(401);
        return payload;
      }
      if (!['video/mp4','video/quicktime'].includes(response.headers.get('Content-Type')?.split(';')[0])) throw new MediaError('Invalid video response.');
      const length = Number(response.headers.get('Content-Length'));
      if (!Number.isFinite(length) || length <= 0 || length > MEDIA_LIMIT) throw new MediaError('Invalid video size.');
      const file = await response.blob();
      if (!auth.isCurrentIdentity(identity)) throw failure(401);
      if (file.size !== length) throw new MediaError('The video download was incomplete.');
      return file;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof MediaError) throw error;
      throw new MediaError('The media service returned an invalid response.');
    }
  }
  async function uploadRoute(playerId, file, { signal, onProgress = () => {}, submission } = {}) {
      playerIdValue(playerId); const declaredType = validateMediaFile(file);
      const { token, identity } = await bearer(signal);
      return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
        const xhr = xhrFactory();
        const abort = () => xhr.abort();
        const finish = (fn, value) => { signal?.removeEventListener('abort', abort); fn(value); };
        xhr.open('POST', `${WORKER}/v2/submissions?player_id=${playerId}&category=${submission.category}`);
        xhr.timeout = 120000;
        xhr.withCredentials = false;
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', declaredType);
        xhr.setRequestHeader('Idempotency-Key', id(submission.key));
        // Blob/File bodies let the browser set Content-Length; JS cannot set it.
        xhr.upload.onprogress = event => {
          if (event.lengthComputable && auth.isCurrentIdentity(identity) && !signal?.aborted) {
            onProgress(Math.min(99, Math.floor(event.loaded / event.total * 100)));
          }
        };
        xhr.onload = () => {
          if (signal?.aborted) return finish(reject, new DOMException('Cancelled', 'AbortError'));
          if (!auth.isCurrentIdentity(identity)) return finish(reject, failure(401));
          if (xhr.status !== 201) {
            let payload;
            try { payload = JSON.parse(xhr.responseText); } catch {}
            return finish(reject, xhr.status===503 && payload?.code==='media_disabled' ? disabled() : failure(xhr.status));
          }
          try {
            const result = JSON.parse(xhr.responseText);
            if (!UUID.test(result.id) || result.player_id !== playerId || (!['pending','approved','rejected'].includes(result.status)||result.category!==submission.category)) {
              throw new MediaError('Invalid upload receipt. Refresh the list before retrying.');
            }
            onProgress(100);
            finish(resolve, {id:result.id,player_id:playerId,category:result.category,status:result.status});
          } catch (error) { finish(reject, error instanceof MediaError ? error : new MediaError('Invalid upload receipt. Refresh the list before retrying.')); }
        };
        xhr.onerror = () => finish(reject, new MediaError('Upload interrupted. Refresh the list before retrying; the file may have been saved.'));
        xhr.ontimeout = () => finish(reject, new MediaError('Upload timed out. Refresh the list before retrying; the file may have been saved.'));
        xhr.onabort = () => finish(reject, new DOMException('Cancelled', 'AbortError'));
        signal?.addEventListener('abort', abort, { once: true });
        try { xhr.send(file); } catch { finish(reject, new MediaError('Unable to start the upload.')); }
      });
    }
  function submit(playerId,file,metadata,options) {
    if(!['pitching','batting','throwing'].includes(metadata?.category)||metadata.share===true||metadata.teamIds?.length) throw new MediaError('Invalid submission. Choose a valid video category.');
    id(metadata.key);
    return uploadRoute(playerId,file,{...options,submission:metadata});
  }
  function reviewQuery(scope,filters={},summary=false){
    if(!['coach','club_admin'].includes(scope?.role))throw new MediaError('Review workspace required.');
    const params=new URLSearchParams({role:scope.role});
    for(const [k,v] of [['organization_id',scope.organizationId],['scope_team_id',scope.scopeTeamId],...(!summary?[['team_id',filters.teamId],['player_id',filters.playerId]]:[])]){
      if(v!==undefined&&v!==null&&v!=='')params.set(k,playerIdValue(v));
    }
    if(!summary){
      if(filters.category){if(!['pitching','batting','throwing'].includes(filters.category))throw new MediaError('Invalid review category.');params.set('category',filters.category);}
      if(filters.cursor){if(typeof filters.cursor!=='string'||filters.cursor.length>100)throw new MediaError('Invalid review cursor.');params.set('cursor',filters.cursor);}
      if(filters.limit!==undefined){if(!Number.isInteger(filters.limit)||filters.limit<1||filters.limit>30)throw new MediaError('Invalid review page size.');params.set('limit',String(filters.limit));}
      if(filters.mediaId)params.set('media_id',id(filters.mediaId));
    }
    return params.toString();
  }
  return {
    // Use the same scope for Home and Inbox. Never infer a zero from a failed request.
    async reviewInbox(scope,filters={},options){
      const data=await request('/v2/media/review-inbox?'+reviewQuery(scope,filters),options);
      if(data?.revision!=='review-inbox-v1'||data.status!=='ready'||data.complete!==true||!Number.isSafeInteger(data.pendingTotal)||data.pendingTotal<0||!Number.isSafeInteger(data.filteredTotal)||data.filteredTotal<0||data.filteredTotal>data.pendingTotal||!Array.isArray(data.items)||data.items.length>30||!Array.isArray(data.teams)||!Array.isArray(data.players)||!(data.nextCursor===null||typeof data.nextCursor==='string'))throw new MediaError('Invalid review inbox response.');
      return data;
    },
    async mediaActionSummary(scope,options){
      const data=await request('/v2/media/action-summary?'+reviewQuery(scope,{},true),options);
      const row=data?.items?.[0];
      if(data?.revision!=='review-inbox-v1'||data.status!=='ready'||data.complete!==true||!Array.isArray(data.items)||data.items.length!==1||row?.kind!=='video_review'||row.available!==true||!Number.isSafeInteger(row.count)||row.count<0)throw new MediaError('Invalid action summary.');
      return data;
    },
    async authorize(playerId, action, options) {
      if (action !== 'upload') throw new MediaError('Unsupported media action.');
      try {
        const result = await request(`/v2/submissions/upload-eligibility?player_id=${playerIdValue(playerId)}`, options);
        if (typeof result.allowed !== 'boolean') throw new MediaError('Invalid authorization response.');
        return result.allowed;
      } catch (error) {
        if (error.status === 403) return false;
        throw error;
      }
    },
    async list(playerId, options) {
      const result = await request(`/v2/submissions?player_id=${playerIdValue(playerId)}`, options);
      if (!Array.isArray(result.items) || result.items.length > 30) throw new MediaError('Invalid media listing.');
      return result.items.map(item => {
        if (!UUID.test(item?.id) || item.player_id !== playerId ||
          !['pitching','batting','throwing'].includes(item.category) ||
          !['pending','approved','rejected'].includes(item.status)) throw new MediaError('Invalid media listing.');
        return { id:item.id, player_id:item.player_id, category:item.category, status:item.status, created_at:item.created_at ?? null, ...(item.can_archive===true?{can_archive:true}:{}), ...(item.can_review===true?{can_review:true}:{}) };
      });
    },
    async review(mediaId,decision,note,singleSubject,options) {
      if(!['approved','rejected'].includes(decision)||typeof note!=='string'||note.length>1000||typeof singleSubject!=='boolean'||(decision==='rejected'&&(singleSubject||!note.trim())))throw new MediaError('Invalid independent review.');
      const result=await request(`/v2/submissions/${id(mediaId)}/review-private`,{...options,method:'POST',body:{decision,note,single_subject:singleSubject}});
      if(result?.updated!==true)throw new MediaError('Review status unknown. Refresh before retrying.');
      return true;
    },
    // Narrow staging-only contracts for SDL-UX-003 integration.
    mediaConsent(playerId,options) { return request(`/v2/media/consent?player_id=${playerIdValue(playerId)}`,options); },
    setMediaConsent(playerId,generation,accept,options) {
      if(typeof accept!=='boolean')throw new MediaError('Explicit consent decision required.');
      return request(`/v2/media/consent?player_id=${playerIdValue(playerId)}`,{...options,method:'POST',body:{generation:playerIdValue(generation),accept,policy_version:accept?'sdl004-clubhouse-view-download-v2':null}});
    },
    publicationEligibility(mediaId,options) { return request(`/v2/media/publication-eligibility?media_id=${id(mediaId)}`,options); },
    setMediaPublication(mediaId,teamId,publish,options) {
      if(typeof publish!=='boolean')throw new MediaError('Explicit publication decision required.');
      return request(`/v2/media/${id(mediaId)}/${publish?'publish':'unpublish'}`,{...options,method:'POST',body:{team_id:playerIdValue(teamId)}});
    },
    sharedMedia(teamId,cursor,options) {return request(`/v2/media/clubhouse?team_id=${playerIdValue(teamId)}${cursor?'&cursor='+encodeURIComponent(cursor):''}`,options);},
    sharedPlayback(mediaId,teamId,options) {return request(`/v2/media/${id(mediaId)}/shared-playback?team_id=${playerIdValue(teamId)}`,{...options,blob:true});},
    async archive(mediaId,options) {
      const result=await request(`/v2/submissions/${id(mediaId)}/archive`,{...options,method:'POST'});
      if(result?.archived!==true||typeof result.deleted!=='boolean')throw new MediaError('Removal status unknown. Refresh before retrying.');
      return {deleted:result.deleted};
    },
    playback(mediaId, options) { return request(`/v2/submissions/${id(mediaId)}/playback`, { ...options, blob: true }); },
    upload(playerId,file,options) { return submit(playerId,file,options?.submission,options); },
    requestJson(route,options) {
      if(!/^\/v2\/[a-z0-9/_-]+(?:\?(?:[a-z0-9=&_+.-]|%[0-9a-f]{2})*)?$/i.test(route)) throw new MediaError('Invalid submission route.');
      return request(route,options);
    },
    submissionPlayback(mediaId,options) { return request(`/v2/submissions/${id(mediaId)}/playback`,{...options,blob:true}); },
    submit
  };
}
