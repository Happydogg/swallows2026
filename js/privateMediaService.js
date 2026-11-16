// Verified Phase 2 Worker contract. Every request is authorized again by the Worker.
import { supabaseClient, SUPABASE_URL, PRIVATE_MEDIA_WORKER_URL } from './config.js';
export const MEDIA_LIMIT = 20 * 1024 * 1024;
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
  411: 'The browser did not send the file length. Please retry with a supported browser.',
  413: 'Choose a non-empty MP4 file no larger than 20 MiB.',
  415: 'This service accepts MP4 video files only.',
  503: 'The media service is unavailable. Please try again later.'
};
const failure = status => new MediaError(messages[status] || 'The media request failed. Please retry.', status);
const id = value => { if (!UUID.test(value ?? '')) throw new MediaError('Invalid media or player ID.'); return value; };
export function validateMediaFile(file) {
  if (!file || file.type !== 'video/mp4' || !/\.mp4$/i.test(file.name ?? '')) throw failure(415);
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MEDIA_LIMIT) throw failure(413);
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
    if (!response.ok) throw failure(response.status);
    try {
      if (!blob) return await response.json();
      if (response.headers.get('Content-Type')?.split(';')[0] !== 'video/mp4') throw new MediaError('Invalid video response.');
      const length = Number(response.headers.get('Content-Length'));
      if (!Number.isFinite(length) || length <= 0 || length > MEDIA_LIMIT) throw new MediaError('Invalid video size.');
      const file = await response.blob();
      if (file.size !== length) throw new MediaError('The video download was incomplete.');
      return file;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof MediaError) throw error;
      throw new MediaError('The media service returned an invalid response.');
    }
  }
  async function uploadRoute(playerId, file, { signal, onProgress = () => {}, submission } = {}) {
      id(playerId); validateMediaFile(file);
      const { token, identity } = await bearer(signal);
      return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
        const xhr = xhrFactory();
        const abort = () => xhr.abort();
        const finish = (fn, value) => { signal?.removeEventListener('abort', abort); fn(value); };
        xhr.open('POST', submission ? `${WORKER}/v2/submissions?player_id=${playerId}&category=${submission.category}&share_with_team=${submission.share}&team_ids=${(submission.teamIds||[]).map(id).join(',')}` : `${WORKER}/v1/media?player_id=${playerId}`);
        xhr.timeout = 60000;
        xhr.withCredentials = false;
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Content-Type', 'video/mp4');
        if(submission) xhr.setRequestHeader('Idempotency-Key', id(submission.key));
        // Blob/File bodies let the browser set Content-Length; JS cannot set it.
        xhr.upload.onprogress = event => {
          if (event.lengthComputable && auth.isCurrentIdentity(identity) && !signal?.aborted) {
            onProgress(Math.min(99, Math.floor(event.loaded / event.total * 100)));
          }
        };
        xhr.onload = () => {
          if (signal?.aborted) return finish(reject, new DOMException('Cancelled', 'AbortError'));
          if (!auth.isCurrentIdentity(identity)) return finish(reject, failure(401));
          if (xhr.status !== 201) return finish(reject, failure(xhr.status));
          try {
            const result = JSON.parse(xhr.responseText);
            if (!UUID.test(result.id) || result.player_id !== playerId || (submission ? (!['pending','approved','rejected'].includes(result.status)||result.category!==submission.category||typeof result.share_with_team!=='boolean') : result.byte_size !== file.size || result.content_type !== 'video/mp4')) {
              throw new MediaError('Invalid upload receipt. Refresh the list before retrying.');
            }
            onProgress(100);
            finish(resolve, submission ? {id:result.id,player_id:playerId,category:result.category,status:result.status,share_with_team:result.share_with_team} : { id: result.id, player_id: playerId, byte_size: result.byte_size, content_type: result.content_type });
          } catch (error) { finish(reject, error instanceof MediaError ? error : new MediaError('Invalid upload receipt. Refresh the list before retrying.')); }
        };
        xhr.onerror = () => finish(reject, new MediaError('Upload interrupted. Refresh the list before retrying; the file may have been saved.'));
        xhr.ontimeout = () => finish(reject, new MediaError('Upload timed out. Refresh the list before retrying; the file may have been saved.'));
        xhr.onabort = () => finish(reject, new DOMException('Cancelled', 'AbortError'));
        signal?.addEventListener('abort', abort, { once: true });
        try { xhr.send(file); } catch { finish(reject, new MediaError('Unable to start the upload.')); }
      });
    }
  return {
    async authorize(playerId, action, options = {}) {
      if (!['read', 'upload'].includes(action)) throw new MediaError('Unsupported media action.');
      try {
        const result = await request('/v1/authorize', { ...options, method: 'POST', body: { player_id: id(playerId), action } });
        if (typeof result.allowed !== 'boolean') throw new MediaError('Invalid authorization response.');
        return result.allowed;
      } catch (error) { if (error.status === 403) return false; throw error; }
    },
    async list(playerId, options) {
      const result = await request(`/v1/media?player_id=${id(playerId)}`, options);
      if (!Array.isArray(result.items)) throw new MediaError('Invalid media listing.');
      return result.items.map(item => {
        if (!UUID.test(item.id) || item.player_id !== playerId || item.content_type !== 'video/mp4' ||
          !Number.isSafeInteger(item.byte_size) || item.byte_size <= 0 || item.byte_size > MEDIA_LIMIT) throw new MediaError('Invalid media listing.');
        // Do not carry URLs, storage keys, family details, or unknown fields into UI state.
        return { id: item.id, player_id: item.player_id, byte_size: item.byte_size,
          content_type: item.content_type, created_at: item.created_at ?? null };
      });
    },
    playback(mediaId, options) { return request(`/v1/media/${id(mediaId)}`, { ...options, blob: true }); },
    upload(playerId,file,options) { return uploadRoute(playerId,file,options); },
    requestJson(route,options) {
      if(!/^\/v2\/[a-z0-9/?=&_-]+$/i.test(route)) throw new MediaError('Invalid submission route.');
      return request(route,options);
    },
    submissionPlayback(mediaId,options) { return request(`/v2/submissions/${id(mediaId)}/playback`,{...options,blob:true}); },
    submit(playerId,file,metadata,options) {
      if(!['pitching','batting','throwing'].includes(metadata.category)||typeof metadata.share!=='boolean') throw new MediaError('Invalid submission.');
      id(metadata.key); return uploadRoute(playerId,file,{...options,submission:metadata});
    }

  };
}
