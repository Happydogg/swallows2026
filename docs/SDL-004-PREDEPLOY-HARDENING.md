# SDL-004 focused pre-deployment hardening

Local changes from `c05c85fac9fcaa1c3a020a8d3c9149d6affc0cec` on `codex-SDL-004`.
No live SQL, deployment, secret/provider change, push, merge or production access was performed.
Both v2 gates remain false. Existing v1 routes/locks and statistics permissions are unchanged.

## Findings and changes

1. **Overbroad consent selection:** a single checkbox previously selected every team for a player
   profile. Uploads and later consent changes now require individual, initially unchecked team
   selections, with organization labels. Only the selected subset is sent; empty means private.
   A child can have several club profiles, but each submission/consent is scoped to one profile;
   the UI explains selecting another club separately. No cross-club propagation is introduced.
   Changing profile/file, refreshing metadata/history, logout and permission failures clear the
   relevant drafts. Existing grants are shown separately and never preselect a replacement grant.
2. **Same-ID consent resurrection reproduced:** marking a membership inactive and then active
   restored old sharing in the previous draft. Consent now records the assignment's generation
   UUID as well as team/membership IDs. A new BEFORE trigger rotates that generation whenever
   assignment identity, status or dates change. Read authorization requires a current generation,
   so a stale captured grant cannot authorize access even if a concurrent write missed invalidation.
   AFTER triggers remove affected consent scopes and record invalidation; new pending uploads lose
   sharing on lifecycle changes too. Deletion/reinsertion with the same ID also starts a new generation.
   Guardian revocation/re-verification and uploader profile suspension/reactivation clear previous
   grants, so these transitions cannot restore them automatically. Unchanged roster updates preserve
   valid consent. A new explicit grant is required to share again.
3. **Scope validation:** consent capture and playback now also require an active team and organization
   matching the player's organization. A malformed membership referencing another club's team cannot
   grant consent through a direct RPC. Other still-consented teams retain their scope when one
   membership ends; rejoining that team requires a new grant. Submission/consent history records
   selected team IDs; the curated browser history still excludes reviewer identities/private metadata.
4. **Preflight was informational and checked only one new table.** It now raises errors for either
   new table already existing, partial release objects, incompatible/missing pilot columns, missing
   Auth/pilot RPCs, unexpected pilot grants/RLS, insufficient migration permissions and mismatched
   migration history. Both tables must be absent. The runner requires explicit project confirmation,
   a reviewed history manifest, the dedicated staging host, and verify-full TLS with an approved CA.
   Inherited PostgreSQL connection overrides and psql startup files are excluded. Credentials are
   passed only in the child environment, never command arguments or reported output.
5. **Worker config enabled tracing without a verified baseline.** That opt-in was removed. The
   deployment configuration requires a reviewed staging settings baseline unless invoked through
   the explicitly local build script. Existing observability is copied exactly, with no default
   paid feature added. Unknown/additional bindings, embedded secret values, wrong targets, changed
   compatibility dates and enabled v2 flags block release. The pinned uploader retains existing
   secret values (`keepSecrets`); no secret put/delete command is prepared or run.

## Changed files

| Files | Purpose |
| --- | --- |
| `components/SubmissionWorkspace.js`, `composables/useSubmissionWorkspace.js` | Individual consent controls, club labels, scoped requests and draft cleanup |
| `js/submissionService.js` | Validated current consent-team projection |
| `supabase/migrations/20261116184847_sdl004_submission_workflows.sql` | Generation-bound consent, lifecycle invalidation, scope validation and history |
| `backend/release/staging-preflight.sql`, `run-staging-preflight.mjs` | Fail-closed SQL and guarded operator runner |
| `backend/release/worker-baseline.example.json` | Deliberately unconfirmed metadata template; no credentials |
| `backend/worker/cloudflare.config.ts`, `deploymentPreservation.mjs`, `check-package.mjs`, `package.json` | Local-build/release separation and exact settings preservation checks |
| `.gitignore` | Ignore local reviewed metadata files |
| `tests/consentLifecycle.test.mjs`, `preflightSql.test.mjs`, `deploymentHardening.test.mjs` | Targeted lifecycle, schema/history, target/TLS and settings regressions |
| `tests/helpers/submissionDatabase.mjs`, `proposalSql.test.mjs` | Shared synthetic pilot fixture and same-ID regression |
| `tests/submissionWorkspace.test.mjs`, `vueBindings.test.mjs` | Team subset/default/reset and actual Vue checkbox bindings |
| `docs/SDL-004-STAGING-RELEASE.md`, this report | Current rollout requirements, limits and findings |

The existing **unapplied** migration was amended, not executed. In addition to the two new tables,
this candidate adds `player_team_memberships.sdl_consent_epoch` and triggers on memberships,
guardians and profiles. Review lock/rewrite time for populating the UUID default before staging
application. It does not replace existing RLS, alter official statistics or delete media. If the
version has unexpectedly been applied anywhere, stop and prepare a new reviewed migration;
do not apply these edits over it. Preflight is designed to reject that state.

## Local validation

- `npm run check:worker`: local Cloudflare/Vite package build and staging target/default-off checks.
- `npm test`: **153 passed, 0 failed, 0 skipped**, including all previous regressions, real Vue
  compilation/rendering and a workerd startup test with outbound traffic forbidden.
- ES-module syntax parsing: **63 files passed**. `git diff --check` passes.
- The actual package release-check command correctly rejects a missing reviewed baseline.
- PostgreSQL tests use isolated synthetic PGlite data. Preflight failure tests intentionally
  introduce drift only there. The stale-generation test simulates an invalidator missing a
  concurrent captured grant; it is not a live multi-connection contention test.
- No live staging or native mobile tests were performed. Local fixtures do not prove the deployed
  schema, grants, settings, migration history or authorization; these are rollout dependencies.

## Required next steps, only after separate staging authorization

1. Review this checkpoint and the amended migration. Back up staging and confirm the exact target
   `wvurolqbjhuckkkjiiiv`. Review the real migration-history presence and versions, dependency
   schema, and any lock impact. Save a local JSON manifest with that project_ref and
   `history: {"exists": true|false, "versions": ["14-digit-version", ...]}`. Use an empty list
   when a reviewed history table is absent; never infer absent history from a failed query.
2. In an authorized operator session with `psql`, supply `SDL004_STAGING_DB_URL` via a secure
   environment (dedicated `db.wvurolqbjhuckkkjiiiv.supabase.co`, postgres database/user, port 5432,
   password included; no pooler or query overrides) and `SDL004_STAGING_CA_FILE` pointing at the
   approved certificate CA. Then run the **read-only** command below. It prints the confirmed
   staging project and PASS only after all checks succeed. Stop on any error; do not relax it
   to bypass a schema mismatch. The runner was not executed against a service this session.

   ```sh
   node backend/release/run-staging-preflight.mjs \
     --confirm-project wvurolqbjhuckkkjiiiv \
     --manifest /approved/path/staging-history.local.json
   ```

3. Read and review the currently deployed staging Worker's version, all binding **metadata** and
   observability settings; never export secret values. Use `worker-baseline.example.json` as an
   unconfirmed template. Normalize approved metadata into the cf configuration's field format.
   Record the real versionId and exact observability object (null only if actually absent).
   Review additional settings outside this package, including routes, compatibility flags,
   placement, limits, logpush and tail consumers. If any would change, stop and reconcile the
   configuration; the `otherSettingsReviewed` flag is an operator attestation, not a live diff.
   Set confirmed true only after review and save outside Git as a `.local.json` file. Recheck
   remote version/settings immediately before any later deployment; this local guard cannot
   detect remote changes itself. No actual staging baseline is supplied in this checkpoint.

   ```sh
   SDL004_WORKER_BASELINE=/approved/path/staging-worker.local.json npm run check:worker
   SDL004_WORKER_BASELINE=/approved/path/staging-worker.local.json npm run check:release --prefix backend/worker
   ```

   Without the baseline, normal local builds pass but the release check fails deliberately.
   `SDL004_LOCAL_BUILD_ONLY=1` is for local validation and must never be supplied to a deployment.
   Omission of observability is not assumed to preserve the live Worker's settings.
4. Obtain explicit approval before applying the versioned migration or deploying the reviewed
   Worker. Keep both gates false initially. Compare postflight counts and pilot grants with the
   preflight baseline. Preserve existing secrets/bindings; stop on any provisioning/settings drift.
5. Under separately reviewed staging enablement, use synthetic accounts for own/unrelated child,
   cross-club team selection, same-ID transfers/rejoins, withdrawal, approvals, expired/revoked
   sessions and interrupted uploads. Confirm missing grants fail closed and existing v1 remains
   functional. Also test actual simultaneous transactions and PostgREST error mapping.
6. Only then review enabling the frontend gate and run mobile upload/preview/consent smoke tests.
   Preserve tables, audit history, reservations and objects during rollback. Production is a
   separate release requiring its own authorization, identifiers, baseline and approval.
