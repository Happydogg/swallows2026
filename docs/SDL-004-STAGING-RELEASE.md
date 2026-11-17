# SDL-004 staging release candidate — NOT DEPLOYED

The current business rule and API are documented in
[SDL-004-CLUB-CONSENT.md](SDL-004-CLUB-CONSENT.md). Standing optional Clubhouse consent belongs to
one athlete/club/continuous enrollment, survives internal team transfers and has no annual or
per-video renewal. A club departure/rejoin or withdrawal cannot revive an obsolete consent receipt.
The earlier per-video/per-team pending design is superseded.
The approved manual administration interface and current file/test report are in
[SDL-004-ENROLLMENT-ADMIN.md](SDL-004-ENROLLMENT-ADMIN.md). Registration automation is deferred.

Windows backup/preflight setup, current nonsecret Worker preservation evidence and remaining blockers:
[SDL-004-WINDOWS-RELEASE.md](SDL-004-WINDOWS-RELEASE.md). No backup or restore is yet verified.

Parent-safe roster/leaderboard/history integration, separate statistic consent, approval RPCs and
updated staging prerequisites: [SDL-004-PARENT-BACKEND.md](SDL-004-PARENT-BACKEND.md).

Both flags remain disabled:

- `js/config.js`: `SUBMISSION_FEATURES_ENABLED=false`.
- `backend/worker/cloudflare.config.ts`: `SUBMISSIONS_ENABLED='false'`.

No live SQL, deployment, provider setting change, push, merge or production access occurred.
Local SQL tests use isolated synthetic PGlite fixtures with explicit user authorization.
The existing v1 pilot, statistics locks and private R2 architecture are preserved. No public
media URLs, secrets in browser code, extra paid resources or new deployment bindings are added.

## Artifacts and prerequisites

- Existing CLI-generated, still-unapplied migration:
  `supabase/migrations/20261116184847_sdl004_submission_workflows.sql`.
  It creates seven tables, narrow RPCs and lifecycle/immutable-audit triggers; there is no compatibility
  migration. Existing player_team_memberships is not altered by this final design.
- Complete Worker entrypoint: `backend/worker/index.mjs`; preserved v1 `pilot.mjs`; current v2
  implementation `submissionRoutes.mjs` with revision `sdl004-club-enrollment-v2` checked on every call.
- Existing staging-only configuration, pinned local build tools, exact metadata preservation guard
  and `check:release`. Unknown binding/compatibility/settings drift blocks release; the uploader
  retains existing secret values. Local builds without reviewed metadata are not deployable artifacts.
- Guarded `backend/release/run-staging-preflight.mjs`, read-only pre/postflight SQL and deliberately
  unconfirmed `worker-baseline.example.json`. All seven workflow/consent/statistics tables must be absent. Old draft schema/functions, missing pilot prerequisites, grants/RLS drift,
  incompatible dependency types and unreconciled migration history raise errors.
- `backend/proposals/*` are compatibility pointers to canonical source. Do not apply old proposal SQL.

The approved pilot uses the prepared manual Club Enrollment Administration interface. Authorized
organization administrators must populate/maintain verified enrollment records, including explicit
ends/inactivations/rejoins; team roster changes do not define club departure. Registration
automation is deferred and is not required for this pilot. New coach uploads require separate recording/storage evidence,
default false. Neither membership nor Clubhouse consent supplies that evidence automatically.
Unknown/multi-child clips stay private; coaches must perform the documented single-subject safety
review before publication. All-subject/redaction authorization is a separate future design.

## Reproducible local validation

```sh
npm ci --ignore-scripts
npm ci --prefix backend/worker --ignore-scripts
npm run check:worker
npm test
```

Root dependencies are test-only pinned Vue/PGlite; the browser remains Vue global build and ES
modules without a bundler. The Worker build has its own locked dependencies. Current full result:
**285 passed, 0 failed, 0 skipped**, including existing v1/authentication/analyzer/statistics regression
cases, real isolated SQL, actual Vue compilation/rendering, and local workerd with outbound traffic
forbidden. Mocked authorization/R2 tests are labeled; they do not prove deployed policies.
Native mobile testing, actual PostgreSQL contention, Supabase/PostgREST responses and live v2
storage/authorization remain staging checks. Previously supplied live pilot results were not rerun.

## Exact sequence after separate staging authorization

1. Review this checkpoint and migration against the approved enrollment/recording/privacy rules.
   Confirm project `wvurolqbjhuckkkjiiiv`, take a recoverable backup and review actual schema and
   migration-history presence/versions. Save a local reviewed manifest with that `project_ref` and
   `history: {"exists": true|false, "versions": [...]}`; an absent history table requires an explicitly
   reviewed empty list. A failed query is not evidence of absence. Do not edit an applied migration.
2. With an approved staging connection in `SDL004_STAGING_DB_URL` and an approved CA path in
   `SDL004_STAGING_CA_FILE`, run the guarded read-only preflight. It accepts only the dedicated
   `db.wvurolqbjhuckkkjiiiv.supabase.co` host, postgres user/database, port 5432, verified TLS and no
   connection query overrides/poolers. It ignores inherited PostgreSQL overrides/startup files.
   Credentials belong in a secure environment, never source or command arguments.

   ```sh
   node backend/release/run-staging-preflight.mjs \
     --confirm-project wvurolqbjhuckkkjiiiv \
     --manifest /approved/path/staging-history.local.json
   ```

   Capture confirmed project/PASS, preserved counts, dependency and grant results. Stop on any
   error; reconcile schema/history instead of bypassing the guard.
3. Obtain explicit approval to apply the migration in staging. Run read-only postflight and compare
   existing table counts/pilot grants before new QA writes. Verify RLS, denied direct writes (including
   service-role consent/audit writes), immutable audit and internal function EXECUTE restrictions.
   Exercise authenticated RPCs as synthetic users, not only SQL owner. Record required enrollment
   and recording evidence through approved manual administrator operations; do not invent historic
   consent. Verify the new scoped admin read RPCs and `enrollmentAdmin` capability before enabling
   the administrator interface. New read RPCs are in the same pending migration.
4. Read/review the current staging Worker version, all binding metadata and exact observability
   settings. Never export secret values. Refresh the sanitized `staging-worker-baseline.json` observation
   or use the unconfirmed baseline example and save a reviewed
   `.local.json` outside Git. Review additional settings (routes, compatibility flags, placement,
   limits, logpush, tails); `otherSettingsReviewed` is an operator attestation, not an automated live
   diff. Stop on unrepresented settings drift. Recheck the remote version immediately before release.

   ```sh
   SDL004_WORKER_BASELINE=/approved/path/staging-worker.local.json npm run check:worker
   SDL004_WORKER_BASELINE=/approved/path/staging-worker.local.json \
   SDL004_CURRENT_WORKER_VERSION=INDEPENDENTLY_RECHECKED_ACTIVE_VERSION \
     npm run check:release --prefix backend/worker
   ```

   The release check intentionally fails without this baseline. `SDL004_LOCAL_BUILD_ONLY=1` is for
   local validation and must never be supplied to a deployment. Do not assume omitting observability
   preserves deployed settings. Do not put/delete secrets or provision/rebind a bucket.
5. Obtain explicit approval to deploy only the reviewed staging Worker, keeping its flag false.
   Retest affected v1 behavior. Do not invoke deployment as a build hook or use a production target.
6. Separately review enabling the Worker flag while the frontend stays off. Use synthetic guardian,
   dual-role parent/coach, coach, admin, teammate and unrelated accounts. Verify exact contract,
   CORS, expired/revoked sessions, direct RPC/API denial, uploads/idempotency/lease recovery, pending
   approval/review conflict, single-subject safety confirmation, current-team scope, cross-club denial,
   private storage without sharing, withdrawal, transfer, explicit departure and same-ID/new-ID rejoin.
   Verify actual simultaneous transactions and stale generations. Neither new consent nor enrollment
   reactivation should automatically republish prior withdrawn/ended-enrollment media.
7. Only after these checks pass, review frontend enablement. Smoke test mobile consent cards,
   upload/codec/playback, My Players, coach queue/publication, logout/account switching, team transfers,
   withdrawal in other open tabs and retained private videos. No console bypass of gates.
8. Retain reviewed artifacts, counts and audit results. Push/PR/merge and production require separate
   authorization. No rollout command in this checklist was executed during local implementation.

## Rollback and remaining limitations

Disable new frontend operations first. Worker rollback/redeployment or flag changes require provider
approval. Preserve consent receipts/events, enrollment generations, metadata, reservations and R2
objects; do not drop tables/purge clips or restore withdrawn consent as routine rollback. A Worker
rollback is not a database rollback. Account for enrollment/guardian lifecycle triggers in any
separately reviewed downgrade. Reconcile uncertain uploads by request key; cleanup/retention and
legal erasure need their own approved procedure.

Existing v1 private-media access remains separate from v2 publication; legacy clips are not
implicitly shared. Existing strictness of v1 session checks is not changed by v2. Current team
visibility is rechecked on every server request, and Clubhouse tabs poll/focus-refresh; already
received video bytes cannot be erased remotely. MP4 ftyp validation is not malware/content scanning.
Lists retain the existing 30/50 item limits, not an unbounded total or cursor pagination.

Production is a separate blocked release: no production endpoints, secrets, schema baselines or
resource identifiers were accessed/prepared. Do not reuse this hardcoded staging configuration for
production. A future production release needs its own reviewed environment/dependency/history
manifest, backup/retention and enrollment integration plan, explicit approval, controlled deployment
sequence, data-preservation comparison and independent security/regression verification.
