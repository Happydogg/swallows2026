# SDL-004 parent statistics and Clubhouse API integration — NOT DEPLOYED

Integration branch: `codex-SDL-004-parent-integration`.
Base: `c3dc20ae1e2105193f0a28a33f9b020676959719`; Gemini parent UI/fixes:
`199e921eac5cbbce61d7bb4f6fb455392317a50e` (three commits, fast-forwarded on the new branch).
Original `codex-SDL-004` and main are unchanged. Checkpoint SHA is supplied by the final Git handoff.

Both existing gates remain false. No live SQL, provider settings change, deployment, push or production
access occurred. All database/Worker/authentication fixtures are synthetic and isolated.

## Completed contracts

All routes below require a verified Supabase identity, an existing current `auth.sessions` row and the
expected SQL contract. Parent Clubhouse access also requires an active parent team membership and that parent's own linked
child's current roster membership in that team. Enrollment does not automatically create either row.
The Worker forwards the caller JWT with the publishable key to narrow RPCs;
these reads never use the service-role key. New tables deny direct authenticated/anonymous reads and
all browser/service-role table mutations. Internal helper EXECUTE is not granted to browser roles.
The definer RPCs are needed because source tables remain private: fixed empty search_path, explicit
identity/scope checks and fixed column lists replace any need for blanket raw-table SELECT grants.

| Route | PostgreSQL RPC | Response and authorization |
| --- | --- | --- |
| `GET /v2/clubhouse/roster?team_id=UUID` | `sdl_004_clubhouse_roster(p_team_id)` | `{items:[...]}`, max 100. Current authorized coach/team guardian, active team/org and continuous subject enrollment, separate profile-sharing consent. Only id, team_id/name, preferred_name, jersey, position, throws, bats. |
| `GET /v2/clubhouse/leaderboard?team_id=UUID` | `sdl_004_clubhouse_leaderboard(p_team_id)` | Same current-team authorization. Top 3 per metric, max 12. Explicitly coach/admin-approved, unchanged-source statistics, current enrollment generation and separate guardian metric opt-in. Matches Gemini id/player_id/team_id/team_name/metric/preferred_name/jersey/value/unit/rank/recorded_at contract. |
| `GET /v2/players/UUID/statistics` | `sdl_004_player_statistics(p_player_id)` | `{items:[...],historyLimit:200}`. Verified active guardian of that athlete and active club enrollment. Latest 200 sessions, deterministic date/id order. Fixed fields listed below; no arbitrary select/filters. |
| `GET /v2/statistic-consents?athlete_id=UUID` | `sdl_004_list_statistic_consents(p_athlete)` | Guardian-only separate profile/statistics choices by club enrollment/generation; no guardian identifiers or private family fields. |
| `POST /v2/club-enrollments/UUID/statistics-consent` | `sdl_004_set_statistic_consent(p_enrollment,p_generation,p_roster,p_metrics,p_policy_version)` | Verified guardian only; explicit roster boolean and metric allowlist, exact generation and separate policy version. Bounded 2 KiB JSON. Withdrawal is roster false plus metrics []. |

Capability flags `clubhouseRoster`, `clubhouseLeaderboard`, `parentStatistics`, `statisticsConsent`
are advertised only when the SQL contract reports them. Existing revision and flags remain compatible.
Older contracts leave the new operations unavailable; there is no raw-table fallback.
New reads reject unexpected/duplicate query parameters, wrong methods, malformed IDs, overlarge or
wrong-scope RPC responses; output projects fixed fields. Responses are no-store and origin-restricted.

## Family history and frontend behavior

Guardian history returns exactly:
`id, player_id, session_date, exit_velo, throwing_velo, sprint_time, broad_jump,
control_exit_velo, attack_angle, height_cm, weight_kg`.
Height and weight are private family chart inputs, never team roster/leaderboard fields. No shoulder
assessment, free-text notes, creator/reviewer identities, DOB, registration, legal name or contacts
are returned. Family performance history does not imply an official-stat approval.

The frontend validates identifiers, dates, finite values and matching player scope; unexpected fields
are discarded. My Players summaries and profile/chart navigation use only this API, **including dual-role
coach/guardian accounts**. Existing coach sessions/analytics remain separate. Family profile navigation
also projects the seven permitted player fields plus athlete_id, avoiding raw coach profile objects.
Expired/denied requests clear family history and close an active family profile; late responses after
logout/reset/account changes are ignored. Ordinary legacy coach navigation restores its own context.
Both cards and API document the 200-session bound. Complete pagination is future work; the UI does not
claim that this is an unlimited lifetime history. Existing v1 private media/picker/playback are unchanged.

## Independent sharing permission and official approval

The inspected schema had no official-stat approval marker. No session is backfilled or treated as
approved merely because it exists or a coach can read it. The pending migration adds:

- `sdl_official_statistics`: explicit per-session/per-metric approved snapshots, source fingerprint,
  approving coach/admin and timestamp, player/club/enrollment generation. Approval audits use the
  existing immutable event store. A source-update trigger permanently invalidates the attestation until reviewed again, even if old values are restored.
- `sdl_statistic_consents`: separate standing roster/metric choices per club enrollment/generation,
  verified guardian, policy version, acceptance, withdrawal and permanent invalidation timestamps.
  The existing immutable event store records grants/changes/withdrawals and invalidations.

`sdl_004_approve_statistics(p_session uuid,p_metrics text[])` is the prepared staff-only RPC.
It verifies a current session and coach authority for that player, or administrator authority for
that organization, with active enrollment. It reads existing source measurements; it cannot edit a
raw session or accept client-supplied metric values. A nonempty list explicitly approves only those
metrics; [] revokes that session's approvals. A player-row lock serializes conflicting approval writes.
It has no new browser write-mode/PIN toggle and no coach approval UI in this task. Review this narrow
approval workflow before live QA. Guardians without the corresponding staff role cannot approve.

Allowed official metrics reuse SDL's definitions: best/max exit/throw velocity in km/h, best/min
18.29 m sprint in seconds, best rounded-to-two-decimal broad-jump/height ratio. Approval computes the
ratio with the source height or the latest available height for the same player, matching the existing
fallback. The resulting ratio is an explicit approved snapshot; underlying height/jump measurements
are not returned on the leaderboard. Later reference-height changes do not silently recompute that
snapshot. Changing the approved source session makes its fingerprint stale. Ties use player UUID for
a deterministic top-three order. Unapproved raw values and video submissions never enter rankings.

Separate policy: `sdl004-baseball-statistics-v1`. Defaults: no roster sharing, no metrics. The prepared
parent controls explicitly select minimal baseball profile sharing and individual official metrics,
performance dates/rankings; saving is a separate action from VIDEO consent. No raw height, weight,
medical notes or dated family history is ever team-shared by this policy. The product/privacy owner
must review this new separate policy before staging enablement; existing video consent is unchanged.

Internal team transfers preserve continuous club permission but only currently authorized teams can
read. Club departure/inactivation rotates the existing enrollment generation and permanently invalidates
statistic consent. Reusing the same row/ID cannot revive it. Fresh consent AND new official approval
are required after rejoin. Guardian-link/profile revocation permanently invalidates old receipts.
Another club needs its own choices. Withdrawing statistics sharing removes roster/ranking visibility
on the next request/foreground poll, preserves family history and leaves video consent unchanged.
Withdrawing video consent does not withdraw an independently granted statistics permission.
Already received bytes cannot be erased from another browser; polling is not instantaneous realtime.

## Migration and release guards

Updated the existing **unapplied** CLI-generated migration
`supabase/migrations/20261116184847_sdl004_submission_workflows.sql` instead of inventing a compatibility
migration. It now creates seven workflow tables. Do not use it if the old candidate has been applied:
preflight must stop and the migration history/schema must be reconciled through a separately reviewed
migration. No existing deployed RLS, source-session grants or Worker settings were altered.

Preflight now verifies all seven tables/new functions are absent and checks the actual typed player/
session dependencies (including a unique sessions.id key). Existing project, TLS, migration-history,
pilot RLS/grant/role guards remain. Postflight includes the new table RLS/direct-read/write checks.
The stored catalog from the prior authorized staging inspection supplied these field/type assumptions;
no new live catalog query was run. Approved live preflight must verify them again before application.

A real workerd test caught an inherited v2 incompatibility: Workers does not support Fetch redirect
mode `error`. V2 caller-JWT RPCs now use `manual` and reject non-success responses, including redirects,
without forwarding credentials. V1 already used manual and its source remains unchanged.
Reference: https://developers.cloudflare.com/workers/runtime-apis/request/ .

## Validation and limitations

Commands: `npm run check:worker`, `npm test`, `git diff --check`.
The full suite includes prior authentication/v1/analyzer/roster/consent/admin regressions, real isolated
PGlite SQL role/lifecycle tests, actual Vue compilation/rendering, Node VM transport simulations and
built workerd routes with synthetic outbound responses only. No tests authorize access to live data.
**Final result: 285 passed, 0 failed, 0 skipped** (integrated Gemini baseline: 247 passing).
The Worker build/package and whitespace checks pass. The final Git handoff supplies the commit.

New cases cover denied guardians/direct APIs, cross-team/club isolation, explicit metric grants,
no implicit video permission, approved-only ranking/math, source invalidation, withdrawal, same-ID
rejoin, guardian revocation, expired/revoked sessions, finite/bounded responses, dual-role family
isolation, history/chart rendering, stale-response/logout cleanup and runtime redirect rejection.
Native mobile/browser layout, real PostgreSQL concurrent transactions, actual PostgREST error mapping,
Auth-session expiry behavior and live staging authorization still need approved staging QA.

## Exact next staging steps — separate approval required

1. Review the integration checkpoint, separate statistics policy/field allowlists and staff approval RPC.
   Preserve the original branch/main; do not enable either v2 gate merely to preview these features.
2. Complete the Windows backup prerequisites and obtain an actual export with isolated recovery proof;
   no recoverable backup has been created by this task. See SDL-004-WINDOWS-RELEASE.md.
3. With approved staging-only credentials/CA and query permission, refresh migration history and run
   guarded preflight for `wvurolqbjhuckkkjiiiv`. Stop if any candidate tables/functions already exist.
4. Separately approve applying the pending migration, then read-only postflight. Compare original
   table counts and confirm source RLS/grants remain intact. Test authenticated direct RPC denial.
5. Confirm the actual staging frontend origin before mobile/browser QA. The preserved Worker
   allowlist currently permits only `http://localhost:5500` and `http://127.0.0.1:5500`; no new
   origin was guessed or added. A different staging UI origin needs a separately reviewed code change.
   Refresh Worker settings/version metadata and preservation baseline; approve deployment with the
   existing Worker gate false. No configuration, secrets, bindings, observability or R2 changes are needed.
6. Separately authorize synthetic QA enablement while frontend remains off. Create verified club
   enrollments through the approved admin workflow. Have test guardians make separate profile/metric
   choices and authorized coaches approve specific synthetic source statistics; no historic bulk approval.
   Verify all new routes/capabilities, separate video consent, transfers/rejoins/withdrawal, unrelated
   accounts, revoked/expired sessions, multi-club and dual-role behavior. Test actual concurrent reviews.
7. Only after all backend checks pass, separately approve frontend enablement and mobile family/coach/
   chart/video smoke tests. Production deployment, onboarding/OTP/invitations, push and merge remain
   outside this checkpoint. No new messaging provider or invitation redemption was implemented.

## Complete integration file inventory

All changes relative to the requested c3dc20a base are listed below. “Gemini” rows are integrated
unchanged from the reviewed checkpoint; “Backend/integration” rows include this task's local changes.

| File | Scope |
| --- | --- |
| `backend/release/staging-postflight.sql` | Backend/integration |
| `backend/release/staging-preflight.sql` | Backend/integration |
| `backend/worker/submissionRoutes.mjs` | Backend/integration |
| `components/PlayerProfile.js` | Backend/integration |
| `components/SubmissionWorkspace.js` | Backend/integration |
| `composables/useAuthSession.js` | Gemini |
| `composables/useSubmissionWorkspace.js` | Backend/integration |
| `docs/SDL-004-PARENT-BACKEND.md` | Backend/integration |
| `docs/SDL-004-STAGING-RELEASE.md` | Backend/integration |
| `index.html` | Gemini |
| `js/app.js` | Backend/integration |
| `js/submissionService.js` | Backend/integration |
| `js/supabaseService.js` | Gemini |
| `supabase/migrations/20261116184847_sdl004_submission_workflows.sql` | Backend/integration |
| `tests/authLifecycle.test.mjs` | Gemini |
| `tests/helpers/appHarness.mjs` | Backend/integration |
| `tests/helpers/submissionDatabase.mjs` | Backend/integration |
| `tests/helpers/workerHarness.mjs` | Backend/integration |
| `tests/parentDataScope.test.mjs` | Backend/integration |
| `tests/parentStatisticsClient.test.mjs` | Backend/integration |
| `tests/parentStatisticsSql.test.mjs` | Backend/integration |
| `tests/parentStatisticsWorker.test.mjs` | Backend/integration |
| `tests/preflightSql.test.mjs` | Backend/integration |
| `tests/submissionWorkspace.test.mjs` | Backend/integration |
| `tests/vueBindings.test.mjs` | Backend/integration |
| `utils/dashboardUtils.js` | Gemini |
