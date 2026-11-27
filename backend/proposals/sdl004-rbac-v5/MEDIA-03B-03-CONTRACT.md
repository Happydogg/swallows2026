# MEDIA-03B-03 | Clubhouse publication contract (proposal)
2026-11-27. Proposed, source-only. Baseline 2d12a56eb773f22d1fa8e54b3b2d12c14557463d; staging DB 20261127134903, Worker aa351713-002a-4f7e-9d02-5cac7d5e9250. Dependency: 03B-02 versioned guardian consent explicitly covering shared viewing and downloading. No active receipts exist; do not synthesize acceptance or reuse v1. Download remains disabled.

## Live findings
Existing publish/Clubhouse RPCs held. Current private media_access only allows playback with empty publication_team_ids, so simply enabling publication would break private access. Existing active_club_consent verifies enrollment/generation, guardian, objections, preferences and lifecycle, but not explicit download policy. Existing clubhouse_member includes general platform view and roster authorization; not sufficient for media. QA Player A1-2 manager-source approved clip has distinct reviewer, single-athlete attestation, one current team and one verified guardian. No footage independently inspected.

## Proposed HTTP contract for SDL-UX-003
All routes require current authenticated session, server-authorized scope, strict media UUIDs and canonical roster UUIDs, private no-store response. No client actor/athlete/receipt/object-key proof, no public URLs. New narrow RPCs and routes; existing held RPCs stay held. MEDIA_PUBLICATION_ENABLED gates shared listing and mutations; shared bytes also require MEDIA_PLAYBACK_ENABLED. SUBMISSIONS_ENABLED remains false. Errors 400 invalid, 401 session, 403 forbidden, 409 conflict, 503 unavailable/disabled.
- GET /v2/media/publication-eligibility?media_id=<uuid>: authorized CA/Coach only; {eligible:boolean,reason_code:enum,targets:[{team_id,team_name,published:boolean}]}. Codes approved_required, subject_required, consent_required, no_current_team, eligible. Targets server-derived.
- POST /v2/media/<uuid>/publish: {team_id:uuid}; {updated:true,published:true}. Single team mutation, exact current target authorization.
- POST /v2/media/<uuid>/unpublish: {team_id:uuid}; {updated:true,published:false}. CA own club or coach exact target scope. CA can clear stale same-club publication. No active consent requirement for removal. Retain bytes.
- GET /v2/media/clubhouse?team_id=<uuid>&cursor=<opaque>: {items:[{id,category,display_name,published_at}],next_cursor:null|string}; max 30, stable order, identity only if explicitly allowed, else neutral label. No private notes/history, family IDs, source roles, receipt actors or object keys.
- GET /v2/media/<uuid>/shared-playback?team_id=<uuid>: identical scope checks each request including Range. Reuse validated MP4/MOV R2 byte response, 200/206/416. No duplicate object.
- 03B-04 download later, same scoped authorization plus independent download gate, audit, irreversible local-copy warning.

## Database requirements
Require active actor, clean-start nonarchived committed media, current fixture/enrollment/generation, matching player/athlete/org, approved status, independent reviewed_by distinct from uploader, single-athlete attestation by reviewer, active team and current assignment. CA own club or coach exact target; manager/guardian/platform-only denied. Verify bound receipt ID and current policy explicitly allowing view+download, accepting guardian, objections and preferences. Coordinate precise version with 03B-02. No conflicting consent ledger. Persist publication actor/time and assignment-generation evidence; invalidate on roster end/reuse so a return cannot resurrect an old share. New consent cannot silently republish. Lock and recheck authorization in consistent order with enrollment/consent lifecycle, clip/archive mutations. Keep audit; maintain compatible publication_team_ids / publication_consent_id projection.
Shared viewers: CA own club; manager/coach exact active team and org membership; guardian active parent membership, verified child currently enrolled on team, no local restriction. No platform-only grant. Separate shared predicate from private playback. Preserve private playback/list for already-authorized staff/family during publication, revocation and unpublish without widening access to teammates. Revalidate on each new request; clear UI blob URLs on access changes; delivered bytes cannot be recalled. Unpublish before existing authorized permanent deletion; consent withdrawal must not block cleanup. No retroactive archive deletion. Use fixed empty search_path, explicit narrow grants, private helpers, denied direct table access. Service reads exact metadata only after caller authorization. Keep legacy RPCs disabled.

## Acceptance
1. Approved A1-2 clip + explicit current consent publishes to current team.
2. Missing/v1/withdrawn/replaced receipt, objection, enrollment end/generation mismatch denied.
3. Pending/rejected/archived, self-approved, unknown/multiple subjects, legacy/nonfixture/missing object denied.
4. CA/Coach exact scope only; manager/guardian/platform-only/cross-team/cross-club publication denied.
5. Eligible current teammate family/manager/coach/CA shared playback; other team, cross club, sessionless, removed member or local restriction denied; ID substitution denied.
6. Roster transfer/end/reuse and consent replacement cannot silently reactivate shares. Fresh explicit publish.
7. Private playback preserved throughout, same R2 object, unpublish retains bytes, archive only under current authority.
8. Gates off deny list/bytes, existing review/upload/archive unchanged; range/MIME/CORS/no-store checks, download off.
9. Concurrency publication vs withdrawal/roster change/archive, repeat mutation behavior, no stale UI grant.
10. Synthetic device UAT: Guardian consent, Coach/CA publish, eligible teammate view, unauthorized viewer denied, withdrawal prevents future access. No real minor data or production.

## Handoff
SDL-UX-003 can prototype these proposed shapes with labeled synthetic data; coordinate before merging. Scoped review inbox/Home counts are separate contracts. No live changes or executable migration in this proposal. Implement 03B-02 then 03B-03; test independently and activate in dependency order.
