# SDL-004 submission release candidate — NOT DEPLOYED

## Scope and readiness

This package adds parent/coach submissions, coach review, explicit guardian sharing consent,
athlete-based My Players, and approved Team Clubhouse media to the existing private-media pilot.
The application, database and Worker changes are locally tested only. **New operations remain
disabled in the frontend (`SUBMISSION_FEATURES_ENABLED=false`) and Worker configuration
(`SUBMISSIONS_ENABLED='false'`).** Existing v1 private-media endpoints and locks are preserved.

The release candidate is not a production deployment authorization. No provider mutation,
remote SQL application, secret/binding update, R2 deletion, push, or merge occurred in this sprint.
Read-only catalog inspection verified the auth.sessions columns required for revocation checks;
no production database was queried. Existing live pilot successes were supplied by the user,
not repeated or relabeled as new live tests.

## Prepared artifacts

- `supabase/migrations/20261116184847_sdl004_submission_workflows.sql`: created by Supabase CLI
  `migration new`; additive staging candidate, not applied. The timestamp is CLI-generated UTC.
- `backend/worker/index.mjs`: complete staging entrypoint; routes v1 to the preserved pilot
  and v2 to the new handler. Includes preflight, error handling and default-off gate.
- `backend/worker/pilot.mjs`: verified pilot implementation with helper exports; unchanged v1 semantics.
- `backend/worker/submissionRoutes.mjs`: v2 routes using the same Supabase/R2 bindings.
- `backend/worker/cloudflare.config.ts`: only the named staging Worker/account, existing private
  bucket and staging Supabase URL. Explicit bucket identity prevents provisioning a new bucket.
- `backend/worker/package.json` and lockfile: pinned Cloudflare CLI/Vite build tools, separate
  from the browser's Vue global/ES-module architecture. `npm run build` performs local build only.
- `backend/worker/check-package.mjs`: verifies generated target, bucket, Supabase URL,
  default-off gate, built entrypoint and absence of embedded secret values.
- `backend/release/staging-preflight.sql` and `staging-postflight.sql`: read-only inventory/grants
  checks for a future explicitly authorized staging rollout.
- `backend/proposals/*`: compatibility pointers to the canonical migration/Worker sources;
  do not apply the old proposal SQL as a second migration.

Supabase CLI 3.2.0 generated the migration. Its configuration directory was isolated with
`SUPABASE_HOME=/tmp/sdl004-supabase-home`; no project linking or database push was performed.
Cloudflare CLI `cf` is used for the new configuration (not an unnecessary Wrangler migration).
References: https://developers.cloudflare.com/cf/projects/ and
https://developers.cloudflare.com/cf/projects/cloudflare-config/ .

## Database contract

New tables:

- `sdl_video_submissions`: private media reference, owner/player, category, pending/approved/
  rejected status, explicit sharing scope, review note, reviewer/timestamps and append-only-via-API history.
- `sdl_submission_uploads`: per-user idempotency key, server-generated media ID, byte/metadata
  fingerprint, reservation claim, lease, originating auth session and completion state.

Both tables enable RLS and revoke direct PUBLIC/anon/authenticated access. Narrow authenticated
RPCs perform identity checks; internal predicates and the finalize function are not executable
by browser roles. Fixed `search_path` and explicit EXECUTE grants apply to every new function.
The migration neither grants statistics writes nor modifies players/sessions/drill_videos or
existing media policies. It requires the existing pilot schema and fails if that prerequisite
is absent; it is not an empty-database bootstrap or a production baseline migration.

New RPC groups:

- Session/contract: `sdl_004_session_active`, `sdl_004_submission_contract`.
- Authorization: `sdl_004_submission_can_submit`, `sdl_004_submission_is_guardian`,
  `sdl_004_submission_can_review`, `sdl_004_clubhouse_member`, `sdl_004_submission_can_read`.
- Upload: `sdl_004_reserve_submission` (caller bearer) and `sdl_004_finish_submission`
  (Worker secret only). Internal `guardian_for`/`coach_for` predicates are not public client APIs.
- Read/review/consent: `sdl_004_list_submissions`, `sdl_004_review_queue`,
  `sdl_004_review_submission`, `sdl_004_submission_consent`, `sdl_004_clubhouse_videos`.
- Dashboard: `sdl_004_workspace_players`, returning explicit baseball/organization/team fields only.

Guardians must be verified and profiles active. Coaches need active profile, team, organization,
team-coach membership, org staff/admin membership and consistent, currently active player assignment.
Future assignments cannot authorize access. Parents without team-coach privileges cannot approve;
self-review is prohibited even for dual parent/coach accounts. Review transitions lock the row
and only permit pending -> approved/rejected; a conflicting review returns SQLSTATE PT409,
which must map to HTTP 409 in the staging PostgREST smoke test.

Team sharing requires approval AND consent from the submitting verified guardian. The UI lists
the exact selected player's teams before consent; their UUIDs are included explicitly. Server
validation restricts them to active assignments. Consent binds both team IDs and membership-row
IDs, so a transfer or a later rejoin does not silently inherit consent. A new explicit grant is
required after assignment changes. Coaches without a guardian relationship cannot grant consent.
A revoked guardian/profile or withdrawn consent immediately removes eligibility at the database
and next request. The Clubhouse projection excludes family details, review notes and actor history.

Uploads use a per-user UUID Idempotency-Key and a server SHA-256 fingerprint of bytes/category/
player/consent/team scope. The database allocates the media ID/key. Concurrent reservation attempts
conflict; completed retries return the same receipt without another object write. An expired
2-minute lease can be reclaimed with the same key and data. Metadata/submission/history completion
is atomic and rechecks role/session eligibility. New v2 code never deletes R2 objects. On an
uncertain failure an object can remain private and uncommitted; same-key recovery reuses it.
Uncommitted reservation retention/cleanup requires a separately reviewed operational policy.
This is retry idempotency, not global duplicate-content detection across deliberately new keys.

Session checks validate the JWT's session ID against auth.sessions and not_after. Local tests
cover deleted/expired sessions; actual Supabase logout/revocation timing must be verified live.
The v1 pilot's authorization behavior is preserved; these new session checks apply to v2.

## Worker API (prepared, not live)

Every v2 endpoint requires bearer authentication plus an active database session. Origins remain
localhost/127.0.0.1 on port 5500. All responses are no-store. No new public bucket or signed public
URL architecture is introduced. GET/POST/OPTIONS are supported; no deletion endpoint is added.

| Route | Contract |
| --- | --- |
| GET /v2/capabilities | Exact revision `sdl004-submissions-v1`, with submissions/review/clubhouse true only if the DB contract exists |
| GET /v2/workspace | Curated authorized player/athlete/organization/team context and role flags |
| POST /v2/submissions?player_id=...&category=...&share_with_team=...&team_ids=... | Raw MP4, <=20 MiB; UUID Idempotency-Key; optional explicit consent team scope; 201 validated receipt |
| GET /v2/submissions?player_id=... | Own/coach-authorized status, review history and consent capability; newest 30 |
| GET /v2/review?team_id=...&status=pending\|approved\|rejected\|all | Team-scoped review queue with server-derived can_review; newest 50 |
| POST /v2/submissions/:id/review | JSON decision and note, max 1000 characters; 409 on reviewed/conflicting state |
| POST /v2/submissions/:id/consent | JSON share_with_team and team_ids for a grant; only the submitting verified guardian |
| GET /v2/clubhouse?team_id=... | Approved, consented and currently authorized baseball-only media list; newest 30 |
| GET /v2/submissions/:id/playback | Private bytes after fresh owner/coach/consented-team authorization; Range supported |

The frontend requires BOTH its explicit deployment flag AND exact server capability negotiation.
It never probes/calls v2 in the default-off configuration. It does not infer review permissions
from the old editing switch. Network errors preserve an upload's request key for safe retry;
401/403, logout/account changes and scope changes discard private lists/URLs and abort requests.
UI counters explicitly count displayed items, not an unbounded total.

## User interface and remaining limits

- Parent: verified child picker, categories, local MP4 preview, explicit team consent, upload
  progress, status filters, review history, grant/withdraw consent, and own-profile navigation.
- Coach: existing roster preserved with team selection and review navigation, scoped queue,
  player/team identification, private preview, notes, approve/reject, audit history and conflicts.
- Clubhouse: approved team-media listing and playback with safe loading/empty/error states.
- My Players: one card per athlete across club records, multiple children, club/team context
  from the new authorized service, baseball fields and links to permitted existing profiles/stats.
  Dual-role accounts retain both parent and coach functionality. No new statistics-write grant.

This is implemented and locally testable, but **not operational against staging until deployment
and verification**. Disabled UI can show existing verified athlete cards and prepare local previews;
server-backed memberships/statuses remain unavailable, not fabricated.

Consent withdrawal clears the actor's shared view/Blob immediately. Other open Clubhouse tabs
refresh every 5 seconds while visible and on focus; playback continues only if refreshed eligibility
still includes the clip. Server access is denied immediately on the next request after withdrawal.
Previously delivered bytes cannot be remotely erased. Strict instantaneous cross-client revocation
would require an approved realtime invalidation design; polling is not represented as that guarantee.

Native browser/mobile visual testing and live v2 authorization are outstanding. Existing successful
live v1 tests were not rerun. Local Vue rendering validates bindings, not real layout, codec or GPU behavior.
Uploads are limited to the pilot's MP4/20 MiB contract; ftyp checks are not malware scanning or full decoding.
No cursor pagination beyond 30/50 entries, notifications, global deduplication, general administrator
stats editing or production configuration was added.

## Reproducible local validation

```sh
npm ci --ignore-scripts
npm ci --prefix backend/worker --ignore-scripts
npm run check:worker
npm test
```

Root dependencies are test-only, pinned Vue 3.5.13 and PGlite 0.5.16. The browser still loads
Vue globals and ES modules without a bundler. Backend build dependencies are independently locked.
The test runner requires the built Worker and supplies real Vue/PGlite runtimes; Miniflare/workerd
checks the built package with outbound traffic forbidden. Tests use synthetic actors/data and
local storage only. SQL fixture coverage is a reduced reference schema, not a live migration test.

The full suite includes the existing 74 regression scenarios (adapted to the canonical backend
contract where necessary), new upload/session/conflict/security/UI cases, actual local SQL,
Vue custom-renderer flows, and a real local Workers runtime check. Final totals are recorded in
the sprint checkpoint report. All JavaScript/ES modules and component/shell templates are checked.

## Exact next steps for a separately authorized staging rollout

1. Review this commit, migration, complete Worker/configuration, explicit consent scope, retention
   and idempotency behavior. Confirm the backend matches approved business rules; do not auto-enable it.
2. In project `wvurolqbjhuckkkjiiiv` only, take a recoverable backup and reconcile migration history.
   Run the prepared read-only preflight and capture counts/grants. The new tables must not already
   exist; pilot tables/RPC must exist. Stop on drift; do not edit an applied migration in place.
3. Obtain explicit approval before applying the versioned migration in staging. Do not use a
   production project/profile, execute ad hoc policy relaxations, or apply the pointer SQL.
4. Run read-only postflight. Existing table counts and pilot RPC grants should match the baseline
   before any QA uploads. Test new RPCs as synthetic guardian/coach/peer/unrelated users, not only SQL owner.
5. Review the generated local Worker package with `npm run check:worker`. Confirm exact Worker,
   account, bucket and Supabase target; retain existing secret bindings and values. Do not call
   secret put/delete or provisioning commands. Stop if the deployment tool proposes resource changes.
6. With explicit deployment approval, deploy only the reviewed staging package while its backend
   flag remains false; retest the already working v1 pilot only where deployment changes affect it.
7. In a separately reviewed staging version, set the Worker flag true while frontend flag remains
   false. Use synthetic accounts to test every v2 route, idempotency retry/conflicts, self-review,
   suspended memberships, withdrawn consent, cross-org access and session revocation. Use a valid
   synthetic MP4. Verify CORS, Content-Length and actual 409 behavior; no production or real child data.
8. Only after those checks pass, review a frontend change enabling `SUBMISSION_FEATURES_ENABLED`.
   Capability negotiation must pass. Smoke test mobile upload/playback, dashboards, consent and
   logout/account changes. Do not disable gates via an unreviewed browser-console workaround.
9. Keep rollback artifacts and audit results. Push/PR/merge/deploy require their own authorization;
   none are performed by local build or test commands.

## Rollback and production preparation

- First disable the new frontend feature and revert to the known pilot UI if necessary. Any
  Worker flag change/redeployment/rollback is a provider mutation requiring explicit approval.
- A Worker rollback does not roll back R2 objects or PostgreSQL. Preserve new tables, histories,
  media metadata, reservations and object keys. Do not DROP tables or purge objects as a routine rollback.
- Old v1 endpoints retain private family/coach access; they do not grant teammates access to pending media.
- Reconcile uncertain uploads using request keys and metadata before considering separately approved cleanup.
- Production remains a **separate blocked release**: no production endpoints, credentials, database
  baseline or resource identifiers were read or prepared. Do not reuse the hardcoded staging config
  as a production target. Inventory production only under explicit authorization, reconcile prerequisite
  schema/history, prepare a separately reviewed environment manifest/guard, backup/retention plan and
  deployment approval, then repeat cross-user tests with synthetic production QA records if approved.
- Require security/business review, passing local/live staging QA, data-preservation comparison,
  rollback ownership, privacy/consent approval, and explicit release authorization before production.
