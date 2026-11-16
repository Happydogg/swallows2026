# SDL-004 autonomous sprint checkpoint

## Outcome

Starting from `9b917e7c543074c9c8b217fab461fe872477434c` on `codex-SDL-004`, this sprint
implements the remaining submission workflow as a locally validated release candidate.
New functionality is **not deployed or enabled against staging**. Both deployment gates are
false; the previously working private-media pilot remains available without authorization changes.
No production data/resources, main, live policies, secrets, bindings, or R2 objects were changed.
No changes were pushed. This report is included in the local checkpoint; the exact SHA is reported
in the final handoff and can be read with `git log -1`.

## Backlog results

| Task | Delivered | Remaining |
| --- | --- | --- |
| 1 Parent backend | CLI-generated versioned migration, active guardian/coach checks, categorized pending submissions, review/history, explicit consent scope/withdrawal, sessions, idempotent reservations, complete buildable Worker | Approved migration/deployment and live cross-user verification |
| 2 Parent interface | Child/club picker, MP4 preview, categories, progress, explicit scoped consent, status/history and safe errors/retry | Enable only after verified backend; native mobile smoke test |
| 3 Coach approval center | Authorized team queue, player/team labels, private preview, approve/reject, notes/history, server can_review and 409 handling | Live concurrent PostgREST review test and backend deployment |
| 4 Clubhouse | Approved/consented team list and authenticated playback, fresh checks, empty/loading/error states, focus/5-second revalidation | Deployment; instantaneous cross-client invalidation would need a separate realtime design |
| 5 Regression/security | 109 passing local tests, including all 74 baseline scenarios and 35 new cases | Live v2 tests after authorized rollout |
| 6 Compatibility | 57 ES/JavaScript modules parse; real Vue compiler/renderer; existing auth/analyzer/chart/profile tests; real local Workers runtime and build checks | Native browser/mobile visual and GPU inference checks |
| 7 My Players | Verified athlete grouping across clubs, multiple children, safe baseball fields, club/team context, profile/history links, dual-role accounts | Server-backed context/status gates remain off; no new statistics permissions |
| 8 Coach dashboard | Existing roster preserved; team filter, review entry, displayed pending counts, authorized recent approved activity | Counts are bounded displayed-item counts; cursor pagination/global totals are not implemented |
| 9 Release preparation | Pinned tooling, staged Worker config/guard, versioned migration, read-only pre/postflight, rollout and rollback checklist | Production manifest/baseline/approval deliberately not obtained or created |

The largest remaining dependency is deployment/verification, not missing parent/review/Clubhouse
UI code. Production readiness still requires retention/cleanup, storage quotas/rate limiting,
privacy/business review, environment-specific configuration and real authorization testing.

## Security behavior

- New v2 calls require active Auth identity plus a matching, unexpired auth.sessions row.
  Local tests cover expired/deleted sessions; live Supabase invalidation timing is unverified.
- Verified guardians can submit only for linked children. Coaches need active team and org
  permissions and current, consistent player assignments. Suspended/future assignments fail closed.
- Parents cannot approve; self-review is prohibited even for dual-role accounts. Row locks and
  pending-only transitions ensure one review wins; subsequent transitions return PT409.
- Consent explicitly names the guardian-selected player's currently authorized teams and binds
  their membership IDs. Transfers/rejoins cannot inherit prior consent. Withdrawal/revocation
  removes authorization at the database and on the next request.
- Clubhouse returns baseball metadata only, not review history, actor IDs, family contacts,
  legal names, DOB or registration numbers. Browser-side projections also discard unknown fields.
- New metadata completion is atomic. Persistent per-user request keys/fingerprints prevent retry
  duplicates; same-key retries recover completed receipts or expired reservations. Busy leases
  can require waiting up to two minutes. Deliberately new request keys are not global content deduplication.
- Upload cancellation cannot undo a request already accepted by the server. Late responses cannot
  repopulate a different account; accepted data remains owned by the original authorized account.
- New v2 failures do not delete R2 data. Uncommitted private objects/reservations require separately
  approved retention/recovery procedures. No deletion or cleanup command was run.
- Default-off client and Worker gates plus exact capability revision prevent accidental activation.
  Neither media nor submission roles unlock official statistics editing. Legacy public media
  writes remain locked and no public-media dependency was reintroduced.

Consent withdrawal clears the actor's Blob/list immediately; other visible Clubhouse tabs poll
at five-second intervals and revalidate on focus. Already delivered bytes cannot be revoked.
This limitation is explicit and is not described as instantaneous global revocation.

## Migration and complete Worker package

Canonical migration:
`supabase/migrations/20261116184847_sdl004_submission_workflows.sql`.
It was generated with Supabase CLI 3.2.0, not applied remotely. The old proposal SQL is a pointer
and must not be applied again. The migration adds only new tables/functions/permissions, retains
existing pilot policies, and is not an empty-production-database bootstrap.

Canonical Worker:
`backend/worker/index.mjs`, `pilot.mjs`, `submissionRoutes.mjs`, and `cloudflare.config.ts`.
Its target is only `sdl-r2-staging-gate`, binding MEDIA_BUCKET to `sdl-media-staging` and the
confirmed staging Supabase URL. Secret declarations contain names, never values. The package
build/guard and a local Miniflare/workerd start check passed. A build is not a deployment.

See `SDL-004-STAGING-RELEASE.md` for exact endpoint and RPC contracts, request/consent scope,
retry/lease behavior, deployment sequencing and rollback constraints.

## Automated results

Final full run: **109 passed, 0 failed, 0 skipped**.

| Group | Count | Runtime/evidence |
| --- | ---: | --- |
| Original auth/analyzer tests | 24 | Actual ES modules with synthetic Supabase |
| Existing private-media tests | 30 | Synthetic authenticated transport/XHR and lifecycle |
| Existing Worker contract tests | 18 | 11 inspected pilot-source cases plus 7 updated extension cases |
| Versioned SQL integration | 1 | PGlite/PostgreSQL with synthetic schema/roles and inspected pilot predicate; many positive/negative assertions |
| Vue rendering integration | 1 | Vue 3.5.13 compiler/custom renderer, now including new workflow views |
| New complete backend cases | 9 | Complete staging Worker, gates, capabilities, reservation conflicts and no-deletion recovery |
| New workspace/service cases | 25 | Parent, coach, Clubhouse, consent, grouping, retry, timeout and isolation |
| Built Worker runtime | 1 | Actual local workerd with outbound traffic blocked |

The SQL integration includes direct grants, own/unrelated child submission, org/profile suspension,
reviewer history/self-review/conflicts, approved sharing, explicit consent, withdrawal, team transfer,
rejoin, lease recovery and revoked sessions. It is a reduced reference schema; no full staging
migration application or independent PostgreSQL multi-connection contention benchmark was performed.
The API tests mock provider responses; they are not live Supabase/Cloudflare authorization results.

Real Vue rendering covers shell, submission preview/history, coach review, Clubhouse, private media,
player profile, analyzer and logout without missing bindings or render errors. Responsive Tailwind
layouts and touch targets are implemented, but no native mobile viewport/codec/GPU success is claimed.
Existing live v1 tests reported by the user were accepted as the baseline, not repeated.

Reproduce:

```sh
npm ci --ignore-scripts
npm ci --prefix backend/worker --ignore-scripts
npm run check:worker
npm test
```

The root npm package contains validation-only dependencies. The browser remains Vue global,
Tailwind CDN and ES modules with no frontend bundler. Backend tooling is independently locked.

## Files changed in this sprint

Application:

- `components/SubmissionWorkspace.js` — new parent, review, Clubhouse and My Players views.
- `composables/useSubmissionWorkspace.js` — gated workflow state, retries, cancellation, cleanup and polling.
- `js/submissionService.js` — exact capability negotiation, curated DTOs and authenticated v2 contract.
- `utils/dashboardUtils.js` — athlete grouping and safe team projections.
- `components/CoachTeamRoster.js` — preserve roster, add team selection and review navigation.
- `components/PlayerProfile.js` — own-profile link to submission history.
- `components/PrivateMediaPanel.js` — updated cross-reference to the new gated workspace.
- `index.html`, `js/app.js` — mount/register workspace and connect existing identity cleanup/navigation.
- `js/config.js` — default-off frontend feature gate.
- `js/privateMediaService.js` — reuse staging bearer/XHR transport for v2, progress and 409 errors.

Backend/release:

- `supabase/migrations/20261116184847_sdl004_submission_workflows.sql` — canonical additive migration candidate.
- `backend/worker/index.mjs`, `pilot.mjs`, `submissionRoutes.mjs` — complete additive staging Worker.
- `backend/worker/cloudflare.config.ts`, `vite.config.mjs`, `package.json`, `package-lock.json` — pinned staging package/configuration.
- `backend/worker/check-package.mjs` — local target/default-off/secret-preservation guard.
- `backend/release/staging-preflight.sql`, `staging-postflight.sql` — read-only future release checks.
- `backend/proposals/submissions.sql`, `submissionRoutes.mjs` — compatibility pointers to canonical artifacts.

Validation/documentation:

- Root `package.json`, `package-lock.json`, `.gitignore` — reproducible validation tools and generated/secret exclusions.
- `tests/run.mjs` — complete test runner supplying installed runtimes and requiring a built Worker.
- `tests/submissionWorkspace.test.mjs`, `submissionBackend.test.mjs`, `packagedWorker.test.mjs` — new cases.
- `tests/helpers/workerHarness.mjs`, `appHarness.mjs` — reusable isolated fixtures.
- `tests/proposalSql.test.mjs`, `workerContracts.test.mjs`, `vueBindings.test.mjs` — extend existing coverage against canonical sources.
- `README.md`, `docs/SECURITY_TESTS.md`, `SDL-004-PHASE3-REPORT.md` — current entry points and historical checkpoint distinction.
- `docs/SDL-004-STAGING-RELEASE.md`, `SDL-004-SPRINT-REPORT.md` — full release/handoff documentation.

No generated bundle, node_modules, provider credentials, local database or secret file is included.

## Exact next handoff

1. Review the local commit and staged release document. Do not push/deploy without authorization.
2. Confirm staging prerequisites and backup/history; run prepared read-only preflight and preserve counts.
3. With explicit approval, apply only the versioned staging migration; run postflight and synthetic-role RPC tests.
4. With explicit approval, deploy the reviewed Worker package to the named staging Worker, retaining existing
   secret values/bindings and initially leaving the new backend flag false. Verify affected v1 behavior.
5. Review a staging version enabling only the Worker flag. Verify every v2 route and real session, consent,
   idempotency, Content-Length/CORS, cross-org and concurrent-review behavior with synthetic accounts.
6. After passing live security/functional tests, review the frontend gate change; run browser/mobile smoke tests.
7. Keep production blocked until its independent baseline, configuration, privacy/retention/rate limits,
   backup/rollback and release authorization are reviewed. No main merge or production access is implied.
