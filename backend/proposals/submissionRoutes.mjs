/** REVIEW DRAFT ONLY — not imported by the frontend or deployed Worker.
 * Integrate into the verified Worker by passing its existing helpers to this
 * factory and dispatching /v2/ paths before the existing validRoute check.
 * Requires reviewed/deployed SQL from submissions.sql. No new bucket or secret.
 */
export function createSubmissionRoutes({ verifyIdentity, adminQuery, limitedBytes, configOk, validId, json, ORIGINS }) {
  async function rpc(env, bearer, name, body) {
    try {
      const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST', redirect: 'error', headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY,
          Authorization: bearer, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!response.ok) return { error: true, status: response.status === 401 || response.status === 403 ? response.status : 503 };
      if (response.status === 204) return { value: null };
      return { value: await response.json() };
    } catch { return { error: true, status: 503 }; }
  }
  return {
    async fetch(request, env) {
      const origin = request.headers.get('Origin');
      const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '');
      if (origin && !ORIGINS.has(origin)) return json({ error: 'Origin not allowed' }, 403);
      // Existing Worker should handle OPTIONS, including GET/POST and auth headers.
      if (!configOk(env)) return json({ error: 'Staging configuration incomplete' }, 503, origin);
      const identity = await verifyIdentity(request, env);
      if (identity.error) return json({ error: identity.error }, identity.status, origin);
      const call = (name, body) => rpc(env, identity.bearer, name, body);
      const error = result => json({ error: 'Authorization or submission service unavailable' }, result.status || 503, origin);
      if (path === '/v2/submissions' && request.method === 'POST') {
        const playerId = url.searchParams.get('player_id'), category = url.searchParams.get('category');
        const share = url.searchParams.get('share_with_team');
        if (!validId(playerId) || !['pitching','batting','throwing'].includes(category) || !['true','false'].includes(share)) {
          return json({ error: 'Invalid submission' }, 400, origin);
        }
        const allowed = await call('sdl_004_submission_can_submit', { p_player_id: playerId });
        if (allowed.error) return error(allowed);
        if (allowed.value !== true) return json({ error: 'Forbidden' }, 403, origin);
        if (share === 'true') {
          const guardian = await call('sdl_004_submission_is_guardian', { p_player_id: playerId });
          if (guardian.error) return error(guardian);
          if (guardian.value !== true) return json({ error: 'Verified guardian consent required' }, 403, origin);
        }
        if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'video/mp4') {
          return json({ error: 'Only video/mp4 accepted' }, 415, origin);
        }
        const upload = await limitedBytes(request);
        if (upload.error) return json({ error: upload.error }, upload.status, origin);
        const id = crypto.randomUUID(), key = `pilot/${playerId}/${id}.mp4`;
        try { await env.MEDIA_BUCKET.put(key, upload.bytes, { httpMetadata: { contentType: 'video/mp4', cacheControl: 'private, no-store' } }); }
        catch { return json({ error: 'Object write failed' }, 503, origin); }
        let saved = false;
        try {
          const result = await adminQuery(env, 'rpc/sdl_004_record_submission', { method: 'POST',
            body: JSON.stringify({ p_id: id, p_player_id: playerId, p_user_id: identity.userId,
              p_key: key, p_size: upload.bytes.byteLength, p_category: category, p_share: share === 'true' }) });
          saved = result.ok;
        } catch {}
        if (!saved) {
          // Roll back only this request's freshly generated object, never old media.
          try { await env.MEDIA_BUCKET.delete(key); } catch {}
          return json({ error: 'Submission save failed; upload not committed' }, 503, origin);
        }
        return json({ id, player_id: playerId, category, status: 'pending', share_with_team: share === 'true' }, 201, origin);
      }
      if (path === '/v2/submissions' && request.method === 'GET') {
        const playerId = url.searchParams.get('player_id');
        if (!validId(playerId)) return json({ error: 'Invalid player_id' }, 400, origin);
        const result = await call('sdl_004_list_submissions', { p_player_id: playerId });
        return result.error ? error(result) : json({ items: result.value }, 200, origin);
      }
      if (path === '/v2/clubhouse' && request.method === 'GET') {
        const teamId = url.searchParams.get('team_id');
        if (!validId(teamId)) return json({ error: 'Invalid team_id' }, 400, origin);
        const result = await call('sdl_004_clubhouse_videos', { p_team_id: teamId });
        return result.error ? error(result) : json({ items: result.value }, 200, origin);
      }
      const match = path.match(/^\/v2\/submissions\/([^/]+)\/(review|consent|playback)$/);
      if (!match || !validId(match[1])) return json({ error: 'Not found' }, 404, origin);
      const [, id, action] = match;
      if (['review','consent'].includes(action) && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400, origin); }
        if (action === 'review' && (!['approved','rejected'].includes(body?.decision) || typeof body.note !== 'string' || body.note.length > 1000)) {
          return json({ error: 'Invalid review' }, 400, origin);
        }
        if (action === 'consent' && typeof body?.share_with_team !== 'boolean') return json({ error: 'Invalid consent' }, 400, origin);
        const result = action === 'review'
          ? await call('sdl_004_review_submission', { p_id: id, p_decision: body.decision, p_note: body.note })
          : await call('sdl_004_submission_consent', { p_id: id, p_share: body.share_with_team });
        return result.error ? error(result) : json({ updated: true }, 200, origin);
      }
      if (action === 'playback' && request.method === 'GET') {
        const allowed = await call('sdl_004_submission_can_read', { p_submission_id: id });
        if (allowed.error) return error(allowed);
        if (allowed.value !== true) return json({ error: 'Forbidden' }, 403, origin);
        let response, item;
        try {
          response = await adminQuery(env, `sdl_media_objects?select=object_key&id=eq.${id}&limit=1`);
          if (!response.ok) return json({ error: 'Metadata unavailable' }, 503, origin);
          item = (await response.json())?.[0];
        } catch { return json({ error: 'Metadata unavailable' }, 503, origin); }
        if (!item) return json({ error: 'Not found' }, 404, origin);
        const range = request.headers.get('Range');
        if (range && !/^bytes=\d+-\d*$/i.test(range)) return json({ error: 'Unsupported range' }, 416, origin);
        let obj;
        try { obj = await env.MEDIA_BUCKET.get(item.object_key, range ? { range: new Headers({ Range: range }) } : undefined); }
        catch { return json({ error: 'Object unavailable' }, 503, origin); }
        if (!obj?.body) return json({ error: 'Not found' }, 404, origin);
        const headers = new Headers({ 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' });
        if (ORIGINS.has(origin)) { headers.set('Access-Control-Allow-Origin', origin); headers.set('Vary', 'Origin'); }
        if (obj.range) {
          headers.set('Content-Range', `bytes ${obj.range.offset}-${obj.range.offset+obj.range.length-1}/${obj.size}`);
          headers.set('Content-Length', String(obj.range.length));
        } else headers.set('Content-Length', String(obj.size));
        return new Response(obj.body, { status: obj.range ? 206 : 200, headers });
      }
      return json({ error: 'Method not allowed' }, 405, origin);
    }
  };
}
