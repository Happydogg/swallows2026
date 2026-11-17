import {pilotWorkflowRoute} from './pilotWorkflowRoutes.mjs';
// Staging release candidate. Not deployed.
export function createSubmissionRoutes({ verifyIdentity, adminQuery, limitedBytes, configOk, validId, json, ORIGINS }) {
  async function rpc(env, bearer, name, body) {
    try {
      const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST', redirect: 'manual', headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY,
          Authorization: bearer, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!response.ok) return { error: true, status: [400,401,403,404,409,410,413,415].includes(response.status) ? response.status : 503 };
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
      const active = await call('sdl_004_session_active', {});
      if (active.error) return json({error:'Session verification unavailable'},503,origin);
      if (active.value !== true) return json({error:'Session expired or revoked'},401,origin);
      const contract = await call('sdl_004_submission_contract', {});
      if (contract.error || contract.value?.revision !== 'sdl004-club-enrollment-v2') return json({error:'Backend contract unavailable'},503,origin);
      if (path === '/v2/capabilities' && request.method === 'GET') return json({pilotWorkflow:contract.value.pilotWorkflow??null,revision:'sdl004-club-enrollment-v2',submissions:true,review:true,clubhouse:true,clubConsent:true,enrollmentAdmin:contract.value.enrollmentAdmin===true,clubhouseRoster:contract.value.clubhouseRoster===true,clubhouseLeaderboard:contract.value.clubhouseLeaderboard===true,parentStatistics:contract.value.parentStatistics===true,statisticsConsent:contract.value.statisticsConsent===true},200,origin);
      const pilotResult=await pilotWorkflowRoute({request,url,path,contract:contract.value,call,validId,json,origin});
      if(pilotResult)return pilotResult;
      // Narrow caller-JWT RPCs: authorization and column restrictions live in PostgreSQL.
      const statisticsPlayer=path.match(/^\/v2\/players\/([^/]+)\/statistics$/);
      const statisticsRead=statisticsPlayer||['/v2/clubhouse/roster','/v2/clubhouse/leaderboard'].includes(path);
      if(statisticsRead){
        if(request.method!=='GET')return json({error:'Method not allowed'},405,origin);
        const player=statisticsPlayer?.[1],team=url.searchParams.get('team_id');
        if(player?!validId(player):!validId(team))return json({error:'Invalid identifier'},400,origin);
        if([...url.searchParams.keys()].some(k=>statisticsPlayer||k!=='team_id')||(!statisticsPlayer&&url.searchParams.getAll('team_id').length!==1))return json({error:'Unexpected query'},400,origin);
        const kind=statisticsPlayer?'parentStatistics':path.endsWith('/roster')?'clubhouseRoster':'clubhouseLeaderboard';
        if(contract.value[kind]!==true)return json({error:'Safe statistics contract unavailable'},503,origin);
        const name=statisticsPlayer?'sdl_004_player_statistics':kind==='clubhouseRoster'?'sdl_004_clubhouse_roster':'sdl_004_clubhouse_leaderboard';
        const result=await call(name,statisticsPlayer?{p_player_id:player}:{p_team_id:team});
        if(result.error)return json({error:'Statistics access denied or unavailable'},result.status,origin);
        const fields=statisticsPlayer?['id','player_id','session_date','exit_velo','throwing_velo','sprint_time','broad_jump','control_exit_velo','attack_angle','height_cm','weight_kg']:
          kind==='clubhouseRoster'?['id','team_id','team_name','preferred_name','jersey','position','throws','bats']:
          ['id','player_id','team_id','team_name','metric','preferred_name','jersey','value','unit','rank','recorded_at',...(contract.value.pilotWorkflow?['protocol_id','protocol_label','distance_m']:[])];
        const max=statisticsPlayer?200:kind==='clubhouseRoster'?100:24;
        if(!Array.isArray(result.value)||result.value.length>max||result.value.some(row=>!row||typeof row!=='object'||!validId(row.id)||
          (statisticsPlayer?row.player_id!==player:row.team_id!==team)))return json({error:'Invalid statistics response'},503,origin);
        return json({items:result.value.map(row=>Object.fromEntries(fields.map(k=>[k,row[k]??null]))),...(statisticsPlayer?{historyLimit:200}:{})},200,origin);
      }
      if(path==='/v2/statistic-consents'&&request.method==='GET'){
        if(contract.value.statisticsConsent!==true)return json({error:'Statistics consent contract unavailable'},503,origin);
        const athlete=url.searchParams.get('athlete_id');if(!validId(athlete))return json({error:'Invalid athlete'},400,origin);
        const result=await call('sdl_004_list_statistic_consents',{p_athlete:athlete});
        return result.error?json({error:'Statistics consent unavailable'},result.status,origin):json({items:result.value},200,origin);
      }
      const statisticsConsent=path.match(/^\/v2\/club-enrollments\/([^/]+)\/statistics-consent$/);
      if(statisticsConsent){
        if(request.method!=='POST')return json({error:'Method not allowed'},405,origin);
        if(contract.value.statisticsConsent!==true)return json({error:'Statistics consent contract unavailable'},503,origin);
        if(!validId(statisticsConsent[1]))return json({error:'Invalid enrollment'},400,origin);
        // Small JSON only. Bound the stream even when a Content-Length is missing/forged.
        let body;try{
          const reader=request.body?.getReader();if(!reader)throw Error();let size=0;const parts=[];
          while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();return json({error:'Request too large'},413,origin);}parts.push(value);}
          const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}body=JSON.parse(new TextDecoder().decode(bytes));
        }catch{return json({error:'Invalid JSON'},400,origin);}
        if(!validId(body?.generation)||typeof body.roster!=='boolean'||!Array.isArray(body.metrics)||body.metrics.length>4||
          body.metrics.some(m=>!(contract.value.pilotWorkflow?['exit_velo','throwing_velo','sprint_time','broad_jump']:['exit_velo','throwing_velo','sprint_time','broad_jump_ratio']).includes(m))||new Set(body.metrics).size!==body.metrics.length||
          (!body.roster&&body.metrics.length)||(body.roster&&body.policy_version!=='sdl004-baseball-statistics-v1'))return json({error:'Explicit separate statistics consent required'},400,origin);
        const result=await call('sdl_004_set_statistic_consent',{p_enrollment:statisticsConsent[1],p_generation:body.generation,p_roster:body.roster,p_metrics:body.metrics,p_policy_version:body.roster?body.policy_version:null});
        return result.error?json({error:'Statistics consent denied or changed'},result.status,origin):json({updated:true},200,origin);
      }
      if(path.startsWith('/v2/admin/')) {
        if(contract.value.enrollmentAdmin!==true)return json({error:'Enrollment administration backend unavailable'},503,origin);
        if(request.method!=='GET')return json({error:'Method not allowed'},405,origin);
        let result;
        if(path==='/v2/admin/organizations')result=await call('sdl_004_admin_organizations',{});
        else if(path==='/v2/admin/enrollments'){
          const organization=url.searchParams.get('organization_id'),query=url.searchParams.get('q')||'';
          if(!validId(organization)||query.length>100)return json({error:'Invalid organization or search'},400,origin);
          result=await call('sdl_004_admin_enrollments',{p_organization:organization,p_query:query});
        }else return json({error:'Not found'},404,origin);
        return result.error?json({error:'Administrator access denied or unavailable'},result.status,origin):json({items:result.value},200,origin);
      }
      if(path==='/v2/club-consents'&&request.method==='GET') {
        const athlete=url.searchParams.get('athlete_id');if(!validId(athlete))return json({error:'Invalid athlete_id'},400,origin);
        const result=await call('sdl_004_list_club_consents',{p_athlete:athlete});
        return result.error?json({error:'Club consent unavailable'},result.status,origin):json({items:result.value},200,origin);
      }
      const club=path.match(/^\/v2\/club-enrollments\/([^/]+)\/(consent|recording)$/);
      if((club||path==='/v2/club-enrollments')&&request.method==='POST') {
        if(club&&!validId(club[1]))return json({error:'Invalid enrollment'},400,origin);
        let body;try{body=await request.json();}catch{return json({error:'Invalid JSON'},400,origin);}
        let result;
        if(club?.[2]==='consent'){
          if(typeof body?.accept!=='boolean'||!validId(body.generation)||(body.accept&&body.policy_version!=='sdl004-clubhouse-v1'))return json({error:'Explicit current club consent required'},400,origin);
          result=await call('sdl_004_club_consent',{p_enrollment:club[1],p_generation:body.generation,p_accept:body.accept,p_policy_version:body.accept?body.policy_version:null});
        }else if(club?.[2]==='recording'){
          if(typeof body?.allowed!=='boolean'||typeof body.permission_ref!=='string'||!body.permission_ref.trim()||body.permission_ref.length>500)return json({error:'Recording permission reference required'},400,origin);
          result=await call('sdl_004_set_recording_permission',{p_enrollment:club[1],p_allowed:body.allowed,p_permission_ref:body.permission_ref});
        }else{
          if(!validId(body?.athlete_id)||!validId(body.organization_id)||!['active','inactive','ended'].includes(body.status)||(body.enrollment_id!=null&&!validId(body.enrollment_id)))return json({error:'Invalid enrollment'},400,origin);
          result=await call('sdl_004_set_club_enrollment',{p_athlete:body.athlete_id,p_organization:body.organization_id,p_status:body.status,p_enrollment:body.enrollment_id??null});
        }
        return result.error?json({error:result.status===409?'Enrollment changed; refresh':'Club authorization denied or unavailable'},result.status,origin):json({updated:true},200,origin);
      }
      if (path === '/v2/workspace' && request.method === 'GET') {
        const result = await call('sdl_004_workspace_players', {});
        return result.error ? json({error:'Workspace unavailable'},result.status,origin) : json({items:result.value},200,origin);
      }
      if (path === '/v2/review' && request.method === 'GET') {
        const teamId=url.searchParams.get('team_id');
        if(!validId(teamId)) return json({error:'Invalid team_id'},400,origin);
        const status=url.searchParams.get('status') || 'pending';
        if(!['all','pending','approved','rejected'].includes(status)) return json({error:'Invalid status'},400,origin);
        const result=await call('sdl_004_review_queue',{p_team_id:teamId,p_status:status});
        return result.error ? json({error:'Review access denied or unavailable'},result.status,origin) : json({items:result.value},200,origin);
      }
      const error = result => json({ error: result.status===409?'Upload or review conflict; refresh before retrying':'Authorization or submission service unavailable' }, result.status || 503, origin);
      if (path === '/v2/submissions' && request.method === 'POST') {
        const playerId = url.searchParams.get('player_id'), category = url.searchParams.get('category');
        if(url.searchParams.has('share_with_team')||url.searchParams.has('team_ids'))return json({error:'Uploads are private; manage standing club consent separately'},400,origin);
        if(!validId(playerId)||!['pitching','batting','throwing'].includes(category))return json({error:'Invalid submission'},400,origin);
        const allowed=await call('sdl_004_submission_can_submit',{p_player_id:playerId});
        if(allowed.error)return error(allowed);
        if(allowed.value!==true)return json({error:'Private upload authorization required'},403,origin);
        if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'video/mp4') {
          return json({ error: 'Only video/mp4 accepted' }, 415, origin);
        }
        const upload = await limitedBytes(request);
        if (upload.error) return json({ error: upload.error }, upload.status, origin);
        const requestKey=request.headers.get('Idempotency-Key');
        if(!validId(requestKey)) return json({error:'Idempotency-Key UUID required'},400,origin);
        const claim=crypto.randomUUID();
        const digest=await crypto.subtle.digest('SHA-256',upload.bytes);
        const fileHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        const meta=new TextEncoder().encode(JSON.stringify([playerId,category,fileHash]));
        const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',meta)),b=>b.toString(16).padStart(2,'0')).join('');
        const reservation=await call('sdl_004_reserve_submission',{p_player_id:playerId,p_request_key:requestKey,
          p_claim:claim,p_fingerprint:fingerprint,p_size:upload.bytes.byteLength,p_category:category});
        if(reservation.error) return error(reservation);
        const r=reservation.value;
        if(r?.state==='complete') return json({id:r.id,player_id:r.player_id,category:r.category,status:r.status},201,origin);
        if(r?.state!=='reserved'||!validId(r.id)||r.object_key!==`pilot/${playerId}/${r.id}.mp4`) return json({error:'Invalid upload reservation'},503,origin);
        try { await env.MEDIA_BUCKET.put(r.object_key,upload.bytes,{httpMetadata:{contentType:'video/mp4',cacheControl:'private, no-store'}}); }
        catch { return json({error:'Object write failed; retry with the same request key'},503,origin); }
        // No object deletion. A retry reuses this reservation/key, and metadata
        // commits atomically. Uncommitted objects remain private for recovery.
        try {
          const result=await adminQuery(env,'rpc/sdl_004_finish_submission',{method:'POST',
            body:JSON.stringify({p_request_key:requestKey,p_claim:claim,p_user_id:identity.userId})});
          if(!result.ok) return json({error:'Upload not committed; retry with the same request key'},[401,403,409].includes(result.status)?result.status:503,origin);
          const receipt=await result.json();
          return json(receipt,201,origin);
        } catch { return json({error:'Upload result unknown; refresh or retry with the same request key'},503,origin); }
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
      const match = path.match(/^\/v2\/submissions\/([^/]+)\/(review|publish|playback)$/);
      if (!match || !validId(match[1])) return json({ error: 'Not found' }, 404, origin);
      const [, id, action] = match;
      if (['review','publish'].includes(action) && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400, origin); }
        if (action === 'review' && (!['approved','rejected'].includes(body?.decision) || typeof body.note !== 'string' || body.note.length > 1000)) {
          return json({ error: 'Invalid review' }, 400, origin);
        }
        if(action==='publish'&&(!Array.isArray(body?.team_ids)||body.team_ids.length>20||body.team_ids.some(id=>!validId(id))||
          (body.team_ids.length&&(!Array.isArray(body.subject_athletes)||body.subject_athletes.length!==1||!validId(body.subject_athletes[0])))))return json({error:'Publication requires explicit teams and a single-subject safety confirmation; multi-child clips remain private'},400,origin);
        const result=action==='review'
          ?await call('sdl_004_review_submission',{p_id:id,p_decision:body.decision,p_note:body.note})
          :await call('sdl_004_publish_submission',{p_id:id,p_team_ids:body.team_ids,p_subject_athletes:body.subject_athletes??[]});
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
