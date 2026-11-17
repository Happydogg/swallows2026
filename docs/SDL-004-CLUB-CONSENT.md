# SDL-004: standing Clubhouse consent per continuous club enrollment

This local checkpoint replaces the pending per-video/per-team guardian consent design at
`b0fa4b0d42df4e8f916c38c14921d6b5b33e9822`. The existing CLI-generated migration is still
unapplied and was edited directly. No compatibility migration, remote SQL execution, deployment,
push, merge, secret change or production access was performed. Isolated local PGlite SQL tests
were explicitly authorized by the user; they are not staging tests.

The approved manual administrator pilot is implemented locally; see
[SDL-004-ENROLLMENT-ADMIN.md](SDL-004-ENROLLMENT-ADMIN.md) for current implementation, file list,
208-test validation and staging prerequisites. Registration automation is deferred, not required.

## Business and authorization model

A verified guardian may explicitly grant optional Clubhouse consent once for an athlete's
continuous enrollment in a particular organization. Default is no sharing. The guardian sees
separate club enrollment cards, consent policy text/version and acceptance/withdrawal/history.
An athlete with multiple club profiles can manage the clubs independently. No annual renewal,
per-video guardian confirmation or per-team guardian confirmation is required.

Team assignments and club enrollment are separate records. An internal transfer, including a gap
between team assignments or reuse of a team-membership ID, does not terminate club consent.
Current team assignment still determines which team may receive a published clip; old teams lose
access immediately on the next request. A coach must explicitly publish to an authorized current
team; transferring the athlete does not automatically publish the clip to the new team.

An explicit club enrollment end/inactivation permanently invalidates that enrollment generation's
consent. Reactivating the same enrollment row rotates its generation; a new enrollment ID also
starts without consent. An old generation supplied by a delayed client returns a conflict. Neither
case can reuse an old receipt. Withdrawal preserves private videos and removes Clubhouse access.
A later new acceptance does not silently republish previously withdrawn media: coaches explicitly
republish against the new consent receipt. Guardian revocation/profile suspension invalidates their
receipts too; re-verification does not restore them.

Any currently verified guardian of the athlete can withdraw standing consent for that club. An
acceptance is attributed to the accepting guardian. Concurrent accept/withdraw/enrollment changes
serialize on the enrollment row; unique indexes prevent two current receipts. The generation is
rotated by a database trigger, including attempts to reset it to an old value.

## Pending database objects

The single pending migration remains
`supabase/migrations/20261116184847_sdl004_submission_workflows.sql`.

| Table | Purpose |
| --- | --- |
| `sdl_club_enrollments` | Athlete, organization, continuous enrollment ID/generation, active/inactive/ended state, start/end timestamps, separate recording/storage authorization and evidence reference |
| `sdl_club_consents` | Consent receipt: enrollment/generation, athlete/club, accepting guardian, policy version, acceptance timestamp, withdrawal timestamp and invalidation timestamp/reason |
| `sdl_club_consent_events` | Append-only enrollment, acceptance, withdrawal, invalidation and recording-permission events with actor, server timestamp and scope/policy details |
| `sdl_video_submissions` | Private clip, athlete/club snapshot, upload enrollment/generation, source, review status, explicit team publication scope and bound consent receipt, accountable single-subject review |
| `sdl_submission_uploads` | Persistent per-user idempotency, server media ID/key, file fingerprint, claim/lease, originating session and upload enrollment snapshot |

All five tables enable RLS and deny direct anon/authenticated reads and writes. Service-role
access is SELECT only; narrow SECURITY DEFINER RPCs perform mutations with fixed empty search_path,
explicit grants, current session validation and server-side guardian/team/organization checks.
Internal predicates/finalization are not browser-executable. Audit UPDATE, DELETE and TRUNCATE
are blocked by database triggers, in addition to denied role grants. History retains original
acceptance and withdrawal events. Database administrators able to disable triggers remain trusted
platform operators; this is not an external tamper-proof audit service.

No new column or trigger is added to `player_team_memberships`; the previous pending assignment
epoch design was removed. Consent invalidation triggers attach to the new enrollment ledger and
the existing guardian/profile lifecycle. Existing players, sessions, drill_videos, pilot media
policies, statistics grants and v1 Worker source are preserved.

## Private upload, review and publication

Uploads never grant Clubhouse consent or publish a video. The old per-video consent endpoint and
upload sharing parameters are rejected. Verified guardians can submit their child privately.
Coach uploads require current team/org coaching authorization AND a separate, explicitly recorded
recording/storage authorization for that enrollment. The latter defaults false, has an evidence
reference and audit event, and can only be managed by an active organization administrator. Clubhouse
consent does not create that permission. No private video is deleted by withdrawing sharing consent.

Coach-source clips are eligible as coach-approved but remain private until explicit publication.
A guardian/coach dual-role uploader is treated as a parent source; another authorized coach must
approve it. Parent submissions start pending, and rejected/pending clips cannot be published.
Approval and publication are separate actions. Review transitions lock the row and return conflicts
for already-reviewed clips. Upload reservations preserve idempotent retries and never delete R2
objects on an uncertain v2 commit.

Publication requires a current coach for every target team, a current athlete assignment in the
same organization, approval and an active consent receipt for the clip's upload enrollment/generation.
A clip associated with an ended enrollment stays private after rejoin, even if the guardian grants
fresh consent for the new enrollment. Family and authorized coaching staff retain private access
under the existing role rules; reused player identifiers cannot expose old athlete metadata.

**Multi-child safety rule:** clips with multiple or unknown identifiable subjects remain private.
Publication requires an authorized coach to attest that the primary athlete is the only identifiable
child. Worker validation permits one declared subject only, and the database requires that UUID
to equal the clip's athlete. Actor, time, subject declaration and safety-policy version are recorded.
This is accountable human content review, not automated frame detection; falsely declaring a
multi-child clip is not technically detectable from an MP4 authorization request. Sharing such clips
requires a separately reviewed all-subject authorization/redaction workflow, not one child's consent.
Recording/storage permissions for every subject are a separate operational requirement.

Private playback rechecks family/coaching access or current published-team eligibility per request.
Clubhouse listings contain baseball fields only, excluding family metadata, review notes and audit
actors. Withdrawal takes effect on the next server request; visible tabs poll every five seconds
and on focus. Bytes already delivered to an authorized browser cannot be remotely erased.

## Prepared Worker API

Every v2 route verifies bearer identity, the database session and exact database contract revision
`sdl004-club-enrollment-v2`. An old per-video database contract fails closed even on direct API calls.
All database mutations below use the caller's bearer token except service-only atomic upload finish.

| Route | Contract |
| --- | --- |
| GET `/v2/capabilities` | Exact revision plus submissions, review, clubhouse and clubConsent capabilities |
| GET `/v2/workspace` | Authorized player/athlete/club/team context |
| GET `/v2/club-consents?athlete_id=...` | Guardian-authorized per-club enrollment status/receipt and curated history |
| POST `/v2/club-enrollments/:id/consent` | Explicit accept boolean, current generation UUID and `sdl004-clubhouse-v1` policy for acceptance; verified guardian only |
| POST `/v2/club-enrollments` | Athlete/organization, active/inactive/ended status and optional existing enrollment ID; organization admin only |
| POST `/v2/club-enrollments/:id/recording` | Separate allowed boolean and recording/storage evidence reference; organization admin only |
| POST `/v2/submissions?player_id=...&category=...` | Private MP4, max 20 MiB, UUID Idempotency-Key; no sharing parameters |
| GET `/v2/submissions?player_id=...` | Private authorized history, review/publication status |
| GET `/v2/review?team_id=...&status=...` | Current authorized team's pending/all/approved/rejected queue |
| POST `/v2/submissions/:id/review` | Approve/reject plus notes; no self-review |
| POST `/v2/submissions/:id/publish` | Explicit team_ids and one subject_athletes UUID for publication; empty team_ids unpublishes while preserving private storage |
| GET `/v2/clubhouse?team_id=...` | Published, approved, consented clips still authorized for this team |
| GET `/v2/submissions/:id/playback` | Private authenticated bytes with Range support |

Current staging-only targets remain unchanged: project `wvurolqbjhuckkkjiiiv`, Worker
`sdl-r2-staging-gate`, bucket `sdl-media-staging`, binding `MEDIA_BUCKET`. No new service binding,
secret, public URL, paid feature or deployment setting is introduced.

## Consent-architecture baseline validation and changed files

At checkpoint `6ea53b8`, `npm run check:worker` passed local build/package checks and `npm test`
passed **173 tests, 0 failures, 0 skips**. The current manual-administration checkpoint passes 208
tests; see its report above. This includes real local PostgreSQL/WASM, Vue compilation/custom rendering, built Worker
startup with outbound traffic forbidden, and mocked Worker/client authorization and R2 operations.
At that baseline, **64 JavaScript modules** passed syntax checks and `git diff --check` passed.
Tests for superseded per-team/per-video consent were updated to the approved enrollment rule;
existing v1, statistics-lock, login/logout/session, analyzer and private-media regression cases remain.
Actual multi-connection database contention and live mobile/backend tests remain deployment checks.

| Changed files | Purpose |
| --- | --- |
| `supabase/migrations/20261116184847_sdl004_submission_workflows.sql` | Pending enrollment, receipt/audit, role/session enforcement, private uploads, approval and publication RPCs |
| `backend/worker/submissionRoutes.mjs` | Enrollment/consent/recording/publication routes; exact revision on every request; reject obsolete sharing operations |
| `js/submissionService.js`, `js/privateMediaService.js` | Current contract/projection, private v2 transport, club consent and explicit publication |
| `composables/useSubmissionWorkspace.js`, `components/SubmissionWorkspace.js` | Per-club consent cards, private uploads, coach subject review/publication, identity-safe cleanup |
| `backend/release/staging-preflight.sql`, `staging-postflight.sql` | All five new objects checked, including consent/service write restrictions |
| `tests/consentLifecycle.test.mjs`, `proposalSql.test.mjs`, `preflightSql.test.mjs` | Real isolated SQL lifecycle, permissions, immutability, enrollment, publication and upload regressions |
| `tests/submissionBackend.test.mjs`, `workerContracts.test.mjs`, `helpers/workerHarness.mjs` | Current Worker contracts, direct-call denial, safe publication and synthetic RPC transport |
| `tests/submissionWorkspace.test.mjs`, `privateMedia.test.mjs`, `vueBindings.test.mjs` | Consent/UI/account switch, v2 XHR and actual Vue bindings |
| `tests/helpers/clubWorkflow.mjs` | New isolated synthetic club workflow fixture with savepoint recovery for negative tests |
| `docs/SDL-004-STAGING-RELEASE.md`, `SDL-004-PREDEPLOY-HARDENING.md`, this document | Current release instructions and explicit supersession of prior consent rules |

## Outstanding staging dependencies

- The ledger/RPCs are authoritative for v2. The approved pilot uses manual management by authorized
  organization administrators through the prepared interface and API. Verify administrator access,
  athlete/club mappings and operator-maintained enrollment records before enablement. Registration
  automation is deferred, not a pilot prerequisite. Never infer departure/rejoin from a temporary
  absence of team rows or import consent from registration/payment flags.
- Populate recording/storage authorization only from verified separate evidence. The default false
  state intentionally blocks coach v2 uploads until that evidence is recorded. Neither this ledger
  nor v2 is deployed. Existing v1 private media is not automatically adopted/published by v2.
- Review the actual staging schema/history with the guarded read-only preflight only after separate
  authorization. All five new tables must be absent; stop if this migration is already recorded.
- Preserve the hardening checkpoint's Worker settings baseline/release guard. No actual deployed
  observability/binding baseline was captured here. Review current version/settings, reconcile any
  drift, build with that reviewed metadata and require check:release before deployment approval.
- Apply migration/deploy only with explicit approval, keep both gates false, then perform synthetic
  live cross-user/session/content-review tests, data-preservation checks and mobile smoke tests.
  See the current staging release checklist. Production remains outside this work.
