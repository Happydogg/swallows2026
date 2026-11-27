import {mediaAction} from './mediaGates.mjs';
import {pilotWorkflowRoute} from './pilotWorkflowRoutes.mjs';
import {purgeArchivedMedia} from './mediaPurge.mjs';
const PLAYER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validPlayerId = value => typeof value === 'string' && PLAYER_UUID.test(value);
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
      const url = new URL(request.url);
      let path = url.pathname.replace(/\/+$/, '');
      if (origin && !ORIGINS.has(origin)) return json({ error: 'Origin not allowed' }, 403);
      // Existing Worker should handle OPTIONS, including GET/POST and auth headers.
      if (!configOk(env)) return json({ error: 'Staging configuration incomplete' }, 503, origin);
      const identity = await verifyIdentity(request, env);
      if (identity.error) return json({ error: identity.error }, identity.status, origin);
      const call = (name, body) => rpc(env, identity.bearer, name, body);
      const active = await call('sdl_004_session_active', {});
      if (active.error) return json({error:'Session verification unavailable'},503,origin);
      if (active.value !== true && path==='/v2/onboarding/invitations/redeem' && request.method==='POST') {
        // The redemption RPC validates the session, verified email and invite,
        // and can create the first profile. All other operations require one.
        return pilotWorkflowRoute({request,url,path,contract:{pilotWorkflow:'sdl004-final-pilot-v1'},call,validId,json,origin});
      }
      if (active.value !== true) return json({error:'Session expired or revoked'},401,origin);
      const contract = await call('sdl_004_submission_contract', {});
      if (contract.error || contract.value?.revision !== 'sdl004-club-enrollment-v2') return json({error:'Backend contract unavailable'},503,origin);
      if (mediaAction(path, request.method) && (contract.value.rbacVersion!==5 || contract.value.mediaRevision!=='v5.1-clean-start'))
        return json({error:'Media authorization contract unavailable'},503,origin);
      if (path === '/v2/capabilities' && request.method === 'GET') return json({...(contract.value.rbacVersion===5?{rbacVersion:5}:{}),pilotWorkflow:contract.value.pilotWorkflow??null,revision:'sdl004-club-enrollment-v2',submissions:true,review:true,clubhouse:true,clubConsent:true,enrollmentAdmin:contract.value.enrollmentAdmin===true,clubhouseRoster:contract.value.clubhouseRoster===true,clubhouseLeaderboard:contract.value.clubhouseLeaderboard===true,parentStatistics:contract.value.parentStatistics===true,statisticsConsent:contract.value.statisticsConsent===true},200,origin);
      // MEDIA-03B-06: read-only queue/count, using caller JWT and the same SQL snapshot.
      if(['/v2/media/review-inbox','/v2/media/action-summary'].includes(path)&&request.method==='GET'){
        if(env.MEDIA_REVIEW_ENABLED!=='true'||env.MEDIA_PLAYBACK_ENABLED!=='true'||contract.value.mediaInboxRevision!=='review-inbox-v1'||contract.value.mediaReviewRevision!=='independent-review-v1')return json({error:'Review inbox disabled',code:'media_disabled'},503,origin);
        const countOnly=path.endsWith('/action-summary'),params=url.searchParams;
        const allowed=new Set(['role','organization_id','scope_team_id',...(!countOnly?['team_id','player_id','category','cursor','limit','media_id']:[])]);
        if([...params.keys()].some(k=>!allowed.has(k)||params.getAll(k).length!==1||!params.get(k)))return json({error:'Invalid review query'},400,origin);
        const role=params.get('role'),organization=params.get('organization_id'),scope=params.get('scope_team_id'),team=params.get('team_id'),player=params.get('player_id'),category=params.get('category'),media=params.get('media_id'),cursor=params.get('cursor'),limit=params.get('limit')??'30';
        if(!['coach','club_admin'].includes(role)||[organization,scope,team,player].some(v=>v!==null&&!validPlayerId(v))||(media!==null&&!validId(media))||(category!==null&&!['pitching','batting','throwing'].includes(category))||!/^(?:[1-9]|[12][0-9]|30)$/.test(limit)||(media&&cursor))return json({error:'Invalid review filters'},400,origin);
        let before=null,beforeId=null;
        if(cursor!==null){const parts=cursor.split('|');if(parts.length!==2||parts[0].length>48||!/^\d{4}-\d{2}-\d{2}T/.test(parts[0])||!Number.isFinite(Date.parse(parts[0]))||!validId(parts[1]))return json({error:'Invalid cursor'},400,origin);[before,beforeId]=parts;}
        const result=await call('sdl_v5_video_review_inbox',{p_role:role,p_organization:organization,p_scope_team:scope,p_team:team,p_player:player,p_category:category,p_before:before,p_before_id:beforeId,p_limit:Number(limit),p_count_only:countOnly,p_media:media});
        if(result.error)return json({error:'Review access denied or unavailable'},result.status,origin);
        const data=result.value;
        if(data?.revision!=='review-inbox-v1'||data.status!=='ready'||data.complete!==true||!Number.isSafeInteger(data.pendingTotal)||data.pendingTotal<0)return json({error:'Invalid review response'},503,origin);
        if(countOnly)return json({revision:data.revision,status:'ready',complete:true,items:[{kind:'video_review',available:true,count:data.pendingTotal,required:false}]},200,origin);
        const fields=['id','playerId','playerLabel','teamId','teamLabel','teamIds','category','status','can_review','createdAt','sourceKind'];
        if(!Number.isSafeInteger(data.filteredTotal)||data.filteredTotal<0||data.filteredTotal>data.pendingTotal||!Array.isArray(data.items)||data.items.length>Number(limit)||!Array.isArray(data.teams)||!Array.isArray(data.players)||!(data.nextCursor===null||typeof data.nextCursor==='string')||data.items.some(row=>!row||!validId(row.id)||!validPlayerId(row.playerId)||!(row.teamId===null||validPlayerId(row.teamId))||!Array.isArray(row.teamIds)||row.teamIds.some(x=>!validPlayerId(x))||row.status!=='pending'||row.can_review!==true||!['pitching','batting','throwing'].includes(row.category)))return json({error:'Invalid review listing'},503,origin);
        return json({revision:data.revision,status:'ready',complete:true,pendingTotal:data.pendingTotal,filteredTotal:data.filteredTotal,items:data.items.map(row=>Object.fromEntries(fields.map(k=>[k,row[k]??null]))),teams:data.teams.map(t=>({id:t.id,label:t.label})),players:data.players.map(p=>({id:p.id,label:p.label,teamId:p.teamId,teamIds:p.teamIds})),nextCursor:data.nextCursor},200,origin);
      }
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
      if (path === '/v2/submissions/upload-eligibility' && request.method === 'GET') {
        const playerId=url.searchParams.get('player_id');
        if(!validPlayerId(playerId)) return json({error:'Invalid player_id'},400,origin);
        const allowed=await call('sdl_004_submission_can_submit',{p_player_id:playerId});
        if(allowed.error) return error(allowed);
        return json({allowed:allowed.value===true},200,origin);
      }
      if (path === '/v2/submissions' && request.method === 'POST') {
        const playerId = url.searchParams.get('player_id'), category = url.searchParams.get('category');
        if(url.searchParams.has('share_with_team')||url.searchParams.has('team_ids'))return json({error:'Uploads are private; manage standing club consent separately'},400,origin);
        if(!validPlayerId(playerId)||!['pitching','batting','throwing'].includes(category))return json({error:'Invalid submission'},400,origin);
        const allowed=await call('sdl_004_submission_can_submit',{p_player_id:playerId});
        if(allowed.error)return error(allowed);
        if(allowed.value!==true)return json({error:'Private upload authorization required'},403,origin);
        if (!['video/mp4','video/quicktime'].includes(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase())) {
          return json({ error: 'Only MP4 or QuickTime MOV accepted' }, 415, origin);
        }
        const upload = await limitedBytes(request);
        if (upload.error) return json({ error: upload.error }, upload.status, origin);
        const requestKey=request.headers.get('Idempotency-Key');
        if(!validId(requestKey)) return json({error:'Idempotency-Key UUID required'},400,origin);
        if (request.signal.aborted) return json({error:'Upload interrupted'},400,origin);
        const claim=crypto.randomUUID();
        const digest=await crypto.subtle.digest('SHA-256',upload.bytes);
        const fileHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        const meta=new TextEncoder().encode(JSON.stringify(upload.contentType==='video/quicktime'?[playerId,category,fileHash,'video/quicktime']:[playerId,category,fileHash]));
        const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',meta)),b=>b.toString(16).padStart(2,'0')).join('');
        const reservation=await call('sdl_004_reserve_submission',{p_player_id:playerId,p_request_key:requestKey,
          p_claim:claim,p_fingerprint:fingerprint,p_size:upload.bytes.byteLength,p_category:category});
        if(reservation.error) return error(reservation);
        const r=reservation.value;
        if(r?.state==='complete') {
          if(!validId(r.id) || r.player_id!==playerId || r.category!==category ||
              !['pending','approved','rejected'].includes(r.status))
            return json({error:'Invalid completed upload receipt'},503,origin);
          return json({id:r.id,player_id:r.player_id,category:r.category,status:r.status},201,origin);
        }
        if(r?.state!=='reserved'||!validId(r.id)||r.object_key!==`pilot/${playerId}/${r.id}.mp4`) return json({error:'Invalid upload reservation'},503,origin);
        try { await env.MEDIA_BUCKET.put(r.object_key,upload.bytes,{httpMetadata:{contentType:upload.contentType,cacheControl:'private, no-store'}}); }
        catch { return json({error:'Object write failed; retry with the same request key'},503,origin); }
        // No object deletion. A retry reuses this reservation/key, and metadata
        // commits atomically. Uncommitted objects remain private for recovery.
        try {
          const result=await adminQuery(env,upload.contentType==='video/quicktime'?'rpc/sdl_v5_finish_quicktime':'rpc/sdl_004_finish_submission',{method:'POST',
            body:JSON.stringify({p_request_key:requestKey,p_claim:claim,p_user_id:identity.userId})});
          if(!result.ok) return json({error:'Upload not committed; retry with the same request key'},[401,403,409].includes(result.status)?result.status:503,origin);
          const receipt=await result.json();
          if (receipt?.id!==r.id || receipt.player_id!==playerId || receipt.category!==category ||
              !['pending','approved','rejected'].includes(receipt.status))
            return json({error:'Invalid upload receipt; retry with the same request key'},503,origin);
          return json({id:receipt.id,player_id:receipt.player_id,category:receipt.category,status:receipt.status},201,origin);
        } catch { return json({error:'Upload result unknown; refresh or retry with the same request key'},503,origin); }
      }
      if (path === '/v2/submissions' && request.method === 'GET') {
        const playerId = url.searchParams.get('player_id');
        if (!validPlayerId(playerId)) return json({ error: 'Invalid player_id' }, 400, origin);
        const result = await call('sdl_004_list_submissions', { p_player_id: playerId });
        if(result.error) return error(result);
        if(!Array.isArray(result.value))return json({error:'Invalid media listing'},503,origin);
        const rows=result.value.map(row=>({...row,can_review:env.MEDIA_REVIEW_ENABLED==='true'&&contract.value.mediaReviewRevision==='independent-review-v1'&&row.can_review===true,can_publish:false}));
        // An unavailable archive capability never blocks the library or grants removal.
        if(env.MEDIA_ARCHIVE_ENABLED==='true' && Array.isArray(result.value)){
          const eligible=await call('sdl_v5_media_archive_ids',{p_player:playerId});
          const ids=new Set(!eligible.error&&Array.isArray(eligible.value)?eligible.value.filter(validId):[]);
          return json({items:rows.map(row=>({...row,can_archive:ids.has(row.id)}))},200,origin);
        }
        return json({items:rows},200,origin);
      }
      if (path === '/v2/clubhouse' && request.method === 'GET') {
        const teamId = url.searchParams.get('team_id');
        if (!validId(teamId)) return json({ error: 'Invalid team_id' }, 400, origin);
        const result = await call('sdl_004_clubhouse_videos', { p_team_id: teamId });
        return result.error ? error(result) : json({ items: result.value }, 200, origin);
      }
      const independentReview=path.match(/^\/v2\/submissions\/([^/]+)\/review-private$/);
      if(independentReview&&request.method==='POST'){
        if(contract.value.mediaReviewRevision!=='independent-review-v1')return json({error:'Review contract unavailable'},503,origin);
        if(!validId(independentReview[1]))return json({error:'Invalid video ID'},400,origin);
        let body;
        try {
          const reader=request.body?.getReader();if(!reader)throw Error();
          const parts=[];let size=0;
          while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return json({error:'Review request too large'},413,origin);}parts.push(value);}
          const bytes=new Uint8Array(size);let off=0;for(const part of parts){bytes.set(part,off);off+=part.byteLength;}
          body=JSON.parse(new TextDecoder().decode(bytes));
        } catch { return json({error:'Invalid review JSON'},400,origin); }
        if(!['approved','rejected'].includes(body?.decision)||typeof body.note!=='string'||body.note.length>1000||
          typeof body.single_subject!=='boolean'||(body.decision==='rejected'&&(body.single_subject||!body.note.trim())))return json({error:'Invalid independent review'},400,origin);
        const result=await call('sdl_v5_review_private_media',{p_id:independentReview[1],p_decision:body.decision,p_note:body.note,p_single_subject:body.single_subject});
        if(result.error)return error(result);
        return result.value===true?json({updated:true},200,origin):json({error:'Review denied'},403,origin);
      }
      // New v5.1 contracts never route through the held legacy publication RPCs.
      const consentRoute=path==='/v2/media/consent';
      const shareRoute=path.startsWith('/v2/media/')&&!consentRoute;
      const sharePlayback=path.match(/^\/v2\/media\/([^/]+)\/shared-playback$/);
      const parseSmallJson=async()=>{
        const reader=request.body?.getReader();if(!reader)throw Error('Invalid JSON');
        let size=0;const parts=[];
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw Error('Oversize JSON');}parts.push(value);}
        const bytes=new Uint8Array(size);let off=0;for(const part of parts){bytes.set(part,off);off+=part.byteLength;}
        return JSON.parse(new TextDecoder().decode(bytes));
      };
      if(consentRoute){
        if(env.MEDIA_CONSENT_ENABLED!=='true'||contract.value.mediaConsentRevision!=='sdl004-clubhouse-view-download-v2')return json({error:'Consent disabled',code:'media_disabled'},503,origin);
        const player=url.searchParams.get('player_id');
        if(!validPlayerId(player))return json({error:'Invalid player'},400,origin);
        let result;
        if(request.method==='GET')result=await call('sdl_v5_media_consent_status',{p_player:player});
        else if(request.method==='POST'){
          let body;try{body=await parseSmallJson();}catch{return json({error:'Invalid consent JSON'},400,origin);}
          if(!validPlayerId(body?.generation)||typeof body.accept!=='boolean'||(body.accept&&body.policy_version!=='sdl004-clubhouse-view-download-v2'))return json({error:'Explicit current consent required'},400,origin);
          result=await call('sdl_v5_set_media_consent',{p_player:player,p_generation:body.generation,p_accept:body.accept,p_policy:body.accept?body.policy_version:null});
        }else return json({error:'Method not allowed'},405,origin);
        return result.error?error(result):json(result.value,200,origin);
      }
      if(shareRoute){
        if(env.MEDIA_PUBLICATION_ENABLED!=='true'||env.MEDIA_CONSENT_ENABLED!=='true'||contract.value.mediaPublicationRevision!=='team-publication-v1'||contract.value.mediaConsentRevision!=='sdl004-clubhouse-view-download-v2')return json({error:'Publication disabled',code:'media_disabled'},503,origin);
        if(path==='/v2/media/publication-eligibility'&&request.method==='GET'){
          const id=url.searchParams.get('media_id');if(!validId(id))return json({error:'Invalid media ID'},400,origin);
          const result=await call('sdl_v5_media_publication_eligibility',{p_id:id});
          return result.error?error(result):json(result.value,200,origin);
        }
        const mutation=path.match(/^\/v2\/media\/([^/]+)\/(publish|unpublish)$/);
        if(mutation&&request.method==='POST'){
          if(!validId(mutation[1]))return json({error:'Invalid media ID'},400,origin);
          let body;try{body=await parseSmallJson();}catch{return json({error:'Invalid publication JSON'},400,origin);}
          if(!validPlayerId(body?.team_id))return json({error:'Invalid team ID'},400,origin);
          const publish=mutation[2]==='publish';
          const result=await call('sdl_v5_set_media_publication',{p_id:mutation[1],p_team:body.team_id,p_publish:publish});
          return result.error?error(result):result.value===true?json({updated:true,published:publish},200,origin):json({error:'Publication denied'},403,origin);
        }
        if(path==='/v2/media/clubhouse'&&request.method==='GET'){
          const team=url.searchParams.get('team_id'),cursor=url.searchParams.get('cursor');
          if(!validPlayerId(team))return json({error:'Invalid team ID'},400,origin);
          let before=null,beforeId=null;
          if(cursor!==null){const parts=cursor.split('|');if(parts.length!==2||parts[0].length>48||!/^\d{4}-\d{2}-\d{2}T/.test(parts[0])||!Number.isFinite(Date.parse(parts[0]))||!validId(parts[1]))return json({error:'Invalid cursor'},400,origin);[before,beforeId]=parts;}
          const result=await call('sdl_v5_shared_media_list',{p_team:team,p_before:before,p_before_id:beforeId});
          return result.error?error(result):json(result.value,200,origin);
        }
        if(!sharePlayback||request.method!=='GET')return json({error:'Not found'},404,origin);
        if(env.MEDIA_PLAYBACK_ENABLED!=='true')return json({error:'Playback disabled',code:'media_disabled'},503,origin);
      }
      const match = sharePlayback ? [null,sharePlayback[1],'shared-playback'] : path.match(/^\/v2\/submissions\/([^/]+)\/(review|publish|playback|download|archive)$/);
      if (!match || !validId(match[1])) return json({ error: 'Not found' }, 404, origin);
      const [, id, action] = match;
      if(action==='archive' && request.method==='POST'){
        const result=await call('sdl_v5_archive_media',{p_id:id});
        if(result.error)return error(result);
        if(result.value!==true)return json({error:'Media removal denied'},403,origin);
        // Archive and queue commit atomically before any physical R2 operation.
        // If interrupted, the scheduled retry processes the durable job.
        let deleted=false;
        try { deleted=await purgeArchivedMedia(env,id); } catch { /* queue remains retryable */ }
        return json({archived:true,deleted},deleted?200:202,origin);
      }
      if(action==='publish')return json({error:'Legacy publication route disabled',code:'media_disabled'},503,origin);
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
      if (['playback','download','shared-playback'].includes(action) && request.method === 'GET') {
        const team=action==='shared-playback'?url.searchParams.get('team_id'):null;
        if(action==='shared-playback'&&!validPlayerId(team))return json({error:'Invalid team ID'},400,origin);
        const allowed = action==='shared-playback' ? await call('sdl_v5_authorize_shared_playback',{p_id:id,p_team:team}) : action === 'download'
          ? await call('sdl_v5_authorize_download', { p_id: id })
          : await call('sdl_v5_authorize_playback', {p_id:id});
        if (allowed.error) return error(allowed);
        if (allowed.value !== true) return json({ error: 'Forbidden' }, 403, origin);
        let response, item;
        try {
          response = await adminQuery(env, `sdl_media_objects?select=object_key,player_id,byte_size,content_type&id=eq.${id}&limit=1`);
          if (!response.ok) return json({ error: 'Metadata unavailable' }, 503, origin);
          item = (await response.json())?.[0];
        } catch { return json({ error: 'Metadata unavailable' }, 503, origin); }
        if (!item) return json({ error: 'Not found' }, 404, origin);
        if (!validPlayerId(item.player_id) || item.object_key!==`pilot/${item.player_id}/${id}.mp4` ||
          !['video/mp4','video/quicktime'].includes(item.content_type) || !Number.isSafeInteger(item.byte_size) || item.byte_size<12 ||
          item.byte_size>40*1024*1024)
          return json({error:'Invalid media metadata'},503,origin);
        const range = request.headers.get('Range');
        const hasRange = range !== null;
        const bounds = hasRange && /^bytes=(\d+)-(\d*)$/i.exec(range);
        const first = bounds ? Number(bounds[1]) : 0;
        const last = bounds?.[2] ? Number(bounds[2]) : item.byte_size-1;
        if (hasRange && (!bounds || !Number.isSafeInteger(first) || !Number.isSafeInteger(last) ||
            first>=item.byte_size || last<first)) {
          const rejected = json({error:'Unsupported range'},416,origin);
          rejected.headers.set('Content-Range', 'bytes */'+item.byte_size);
          rejected.headers.set('Accept-Ranges', 'bytes');
          return rejected;
        }
        const end = Math.min(last,item.byte_size-1);
        const length = end-first+1;
        let obj;
        try { obj = await env.MEDIA_BUCKET.get(item.object_key, hasRange
          ? {range:new Headers({Range:'bytes='+first+'-'+end})} : undefined); }
        catch { return json({ error: 'Object unavailable' }, 503, origin); }
        if (!obj?.body) return json({ error: 'Not found' }, 404, origin);
        // R2 can report a full-span range even when the request had no Range.
        // Validate the returned span; only a client-requested range selects 206.
        if (obj.size!==item.byte_size ||
            (hasRange && !obj.range) ||
            (obj.range && (obj.range.offset!==first || obj.range.length!==length)))
          return json({error:'Invalid media size or range'},503,origin);
        const headers = new Headers({ 'Content-Type': item.content_type, 'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' });
        if (ORIGINS.has(origin)) { headers.set('Access-Control-Allow-Origin', origin); headers.set('Vary', 'Origin'); }
        if (action === 'download') headers.set('Content-Disposition','attachment; filename="video.'+(item.content_type==='video/quicktime'?'mov':'mp4')+'"');
        if (hasRange) headers.set('Content-Range', 'bytes '+first+'-'+end+'/'+obj.size);
        headers.set('Content-Length', String(length));
        return new Response(obj.body, { status: hasRange ? 206 : 200, headers });
      }
      return json({ error: 'Method not allowed' }, 405, origin);
    }
  };
}
