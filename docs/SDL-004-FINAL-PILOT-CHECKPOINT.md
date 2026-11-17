# SDL-004 final-pilot local checkpoint

Feature branch: `codex-SDL-004-final-pilot`. Starting checkpoint: `6721d1e4286743c8305b09b8710b2d1bcee3ef2e`.
Final commit SHA is reported by `git log -1` and the implementation handoff. No push or merge is authorized by this checkpoint.

Implementation, deployment prerequisites and limitations: [SDL-004-FINAL-PILOT.md](SDL-004-FINAL-PILOT.md).

## Exact files changed

38 files; existing production/Worker configuration, v1 Worker/media implementation and base migration are unchanged.

| File | Change |
|---|---|
| `.gitignore` | Ignore the static staging export directory. |
| `backend/release/build-staging-frontend.mjs` | Allowlisted static Pages export, staging/gate/import/credential guards and safe headers. |
| `backend/release/final-pilot-preflight.sql` | Read-only Auth/source dependency, owner permission and locked-membership checks. |
| `backend/release/run-staging-preflight.mjs` | Run the additional final-pilot dependency check under the existing staging/TLS/history guards. |
| `backend/release/staging-postflight.sql` | Inspect all final-pilot table and function grants/RLS after both migrations. |
| `backend/release/staging-preflight.sql` | Reject partial installation of any of the 13 workflow tables or final RPCs/history. |
| `backend/worker/pilotWorkflowRoutes.mjs` | Authenticated invitation, growth, profile/stat review, consent and staff-contact RPC facade; canonical units and projections. |
| `backend/worker/submissionRoutes.mjs` | Advertise the final contract, dispatch new routes, preserve 410 errors and protocol-aware leaderboards. |
| `components/PerformanceInbox.js` | Coach performance approve/reject/correction-request actions, evidence and review history. |
| `components/PilotWorkspace.js` | Mobile parent/coach growth, profile approval, submissions, invitations, private family and explicitly scoped staff forms. |
| `components/SubmissionWorkspace.js` | All/none sharing with disclosure, advanced controls, the shared review center and separate protocol boards. |
| `composables/useAuthSession.js` | Gated email registration, invitation-to-email handoff, membership reload and identity cleanup. |
| `composables/usePilotWorkspace.js` | Abortable identity-scoped state/actions, guarded delayed completions, private-state cleanup and workflow forms. |
| `composables/useSubmissionWorkspace.js` | Confirmed atomic all/none sharing, immediate shared-playback cleanup and protocol-separated board state. |
| `docs/SDL-004-FINAL-PILOT-CHECKPOINT.md` | Exact file inventory and local validation handoff. |
| `docs/SDL-004-FINAL-PILOT.md` | Business rules, exact API/migration contracts, Git-integrated Pages setup, staging sequence, rollback and live blockers. |
| `docs/SDL-004-PARENT-BACKEND.md` | Mark the final contract authoritative; replace obsolete best-result/ratio and generic-admin approval descriptions. |
| `docs/SDL-004-STAGING-RELEASE.md` | Point the older release package to the final two-migration and Git-integrated staging sequence. |
| `index.html` | Wire the new pilot controller/component and email invitation/account entry points. |
| `js/app.js` | Initialize/reset/dispose pilot state; strip invitation fragments; use narrow v2 coach history while preserving the disabled v1 path. |
| `js/pilotWorkflowService.js` | Staging authenticated transport requiring the final capability before any workflow request. |
| `js/privateMediaService.js` | Explain expired/revoked invitation responses without changing v1 media behavior. |
| `js/submissionService.js` | Use absolute broad jump in the separate statistics-consent allowlist. |
| `package.json` | Add the local-only build:staging command; no dependencies added. |
| `supabase/migrations/20261117064603_sdl004_final_pilot.sql` | CLI-generated additive candidate: 6 protected tables, immutable events, narrow workflows, staff profile approval and lifecycle/ranking overrides. |
| `tests/finalPilot.client.test.mjs` | Workflow forms, signup/invitation handoff, identity races, 401/403 cleanup and private-state regressions. |
| `tests/finalPilot.database.test.mjs` | Actual isolated SQL authorization, invitation lifecycle, growth audit, reviews, rankings, consent, profile and contact scopes. |
| `tests/finalPilot.integration.test.mjs` | Worker routes calling actual isolated SQL functions with caller identity; no network services. |
| `tests/finalPilot.worker.test.mjs` | Caller JWT, token hashing, unit conversion, projections, contracts and denied/invalid request cases. |
| `tests/helpers/appHarness.mjs` | Synthetic signup, real URL constructor and fragment/identity fixtures. |
| `tests/helpers/finalPilot.mjs` | Synthetic final schema prerequisites, both migrations and explicit fixture profile approvals. |
| `tests/helpers/workerHarness.mjs` | Shared ES-module loading plus caller/RPC overrides for isolated Worker/database tests. |
| `tests/packagedWorker.test.mjs` | Run invitation token generation inside real isolated workerd. |
| `tests/parentStatisticsClient.test.mjs` | Dual-role safe coach-history assertions replacing broad-session expectations. |
| `tests/preflightSql.test.mjs` | Partial final-table/function rejection cases. |
| `tests/stagingFrontend.test.mjs` | Static export isolation, disabled gates, credentials, symlinks and excluded-module checks. |
| `tests/vueBindings.test.mjs` | Compile/render new ready-state forms and verify sensitive state disappears on logout. |
| `utils/dashboardUtils.js` | Safe absolute-jump and explicit protocol projection; no private team fields. |

## Validation

- Baseline: 285 passing tests before edits.
- Final results will be recorded after the complete final run; no local test represents live staging authorization.
- Local Worker build/package checks must pass with both v2 gates disabled. The release guard still intentionally blocks deployment without a current reviewed Worker baseline/version receipt.
- ES modules, Vue compilation/rendering and the root static export are checked locally; real mobile devices and live provider behavior remain unverified.
- No Supabase or Cloudflare mutation, SQL execution against a service, backup/restore, remote Git update or production operation occurred.

## Next operation requiring approval

Approve live **read-only staging preflight/metadata verification** using the dedicated staging connection, reviewed migration-history manifest and trusted verify-full TLS CA. A separate actual backup plus isolated restore-validation approval is required before any migration. Git synchronization/reviewed staging merge, Pages creation/first deployment, Worker deployment, Auth/CORS changes and gate enablement remain separate approvals.
