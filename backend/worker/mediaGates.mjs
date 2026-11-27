// Exact opt-in for each action. These gates do not grant database privileges.
export const mediaGates = {
  consent: 'MEDIA_CONSENT_ENABLED',
  playback: 'MEDIA_PLAYBACK_ENABLED',
  upload: 'MEDIA_UPLOAD_ENABLED',
  review: 'MEDIA_REVIEW_ENABLED',
  publish: 'MEDIA_PUBLICATION_ENABLED',
  download: 'MEDIA_DOWNLOAD_ENABLED',
  archive: 'MEDIA_ARCHIVE_ENABLED'
};

export function mediaAction(path, method) {
  if (path === '/v2/submissions') {
    if (method === 'GET') return 'playback';
    if (method === 'POST') return 'upload';
  }
  if (path === '/v2/submissions/upload-eligibility' && method === 'GET') return 'upload';
  if (path === '/v2/media/consent' && ['GET','POST'].includes(method)) return 'consent';
  if (['/v2/media/publication-eligibility','/v2/media/clubhouse'].includes(path) && method==='GET') return 'publish';
  if (/^\/v2\/media\/[^/]+\/shared-playback$/.test(path) && method==='GET') return 'publish';
  if (/^\/v2\/media\/[^/]+\/(publish|unpublish)$/.test(path) && method==='POST') return 'publish';
  if (path === '/v2/clubhouse' && method === 'GET') return 'playback';
  if (['/v2/media/review-inbox','/v2/media/action-summary','/v2/review'].includes(path) && method === 'GET') return 'review';
  if (/^\/v2\/submissions\/[^/]+\/review-private$/.test(path) && method==='POST') return 'review';
  const action = /^\/v2\/submissions\/[^/]+\/(playback|download|publish|review|archive)$/.exec(path)?.[1];
  if (action && method === (action === 'playback' || action === 'download' ? 'GET' : 'POST')) return action;
  return null;
}

export const disabledMediaBindings = Object.fromEntries(
  Object.values(mediaGates).map(name => [name, {type:'json', value:'false'}])
);
