# SDL-UX-003-FIX-01 handoff to SDL-000

The original integration candidate was `0120c6b74b048478e52e83c39bef011dcd2d02b3`. The accepted Staging source and exact common ancestor were `4590f86c458cacc461f45a8e62aeeda470e8646e`. The candidate adds ten commits over that ancestor. The independently approved Review adapter and MEDIA-03B-04 presentation arrived before this remediation and are retained. The tested frontend source is `8f8c9813aef064bba0e9a782a865793934370d90` on `task/sdl-ux-003-p0p1-qa-fixes`. This documentation is the only follow-up to that source commit. Draft PR targets `feature/SDL-UX-002-login-redesign`. [Coordination issue](https://github.com/Happydogg/swallows2026/issues/19) · [Prior pinned CI](https://github.com/Happydogg/swallows2026/actions/runs/46025411813/job/140595434819) · [Governance](https://github.com/Happydogg/swallows2026/blob/7dd1414104eac0d80abda02c52fd58019f28a9da/SDL_ROADMAP_STATUS.md)

## A. QA resolutions

| ID | Status | Finding and resolution | Verification and owner dependency |
|---|---|---|---|
| UX-QA-01 | Prepared / Approval Pending | No approved authenticated candidate target. Prepare the exact static build and use an already allowlisted loopback origin for initial synthetic testing. | Verify live baseline and get exact-target approval from SDL-000 and the owner. RBAC-05 confirms test accounts, current Worker contract and fixture scope. |
| UX-QA-02 | Fixed | The consent panel watched only player IDs. It now invalidates using the verified user, account context, readiness and current guardian-to-player projection. It aborts obsolete work, clears state synchronously and coalesces revalidation reads. A fresh consent read before an explicit decision checks the server's organization, enrollment generation and eligibility. A change requires a new user decision. | Tests cover stable player IDs, authorization changes, guardian switch, logout, delayed responses, a server-only generation change, explicit withdrawal, denied reacceptance and ordinary reactive updates. RBAC-05 to verify the existing consent GET/POST and generation conflict against a disposable synthetic receipt. |
| UX-QA-03 | Fixed | The save-ready notice lived independently of the temporary link. It now renders inside the panel owned by that link. Clearing the link or expiring it removes the panel, filename and message. | Tests cover 60-second expiry, close, repeated download, backgrounding, account invalidation, refresh, scope changes, unmount and late responses. Native browser save and mobile lifecycle acceptance remain pending. |
| UX-QA-04 | Verified Existing Behavior | Library → Review → Library intentionally resets the selected player and discards private playback, list and pending file. The return to Library requires a new selection and server authorization. | App-harness test verifies URL revocation, no automatic library fetch on return and refusal when the new library request is denied. Testers should assess re-selection friction on devices. |
| UX-QA-05 | Verified Existing Behavior | Both projections use the same resolved role/org/team scope. Each uses its own authoritative server receipt. The existing controller cancels obsolete reads and refetches both projections on a review result. | Tests cover both arrival orders, role/club/team and logout, overlapping refreshes, review success/409 during pending reads, different exact totals and successful reads followed by 401/403/503. Existing tests cover deduplication, scoped canonical team membership, unassigned Club Admin records and self-review exclusion in the reviewed server contract. Signed HTTP acceptance remains a separate gate. |

Before the fixes, the focused reproduction failed four assertions covering consent context, stale-generation submission, download expiry and manual close. Those assertions pass with the fixes.

## B. Changed files

| Path | Purpose |
|---|---|
| `components/MediaConsentPanel.js` | UX-QA-02. Consent request ownership, revalidation and explicit decision generation check. |
| `components/MediaSharingPanels.js` | UX-QA-03. Save-ready status renders only alongside its live URL. |
| `tests/ux003DownloadLifecycle.test.mjs` | UX-QA-02 and UX-QA-03. Real Vue reactivity with synthetic consent responses and a deterministic URL timer. |
| `tests/ux003MediaIntegration.test.mjs` | UX-QA-04. Library and Review navigation with a revoked read after re-selection. |
| `tests/ux003LiveReview.test.mjs` | UX-QA-05. Deferred-response concurrency and denial coverage. |
| `docs/design/SDL-UX-003/P0P1-QA-HANDOFF.md` | P0 readiness, QA evidence and release/rollback instructions. |

PR also carries the ten preexisting candidate commits over the accepted UX branch. The complete integration inventory is in [the original candidate diff](https://github.com/Happydogg/swallows2026/compare/4590f86c458cacc461f45a8e62aeeda470e8646e...0120c6b74b048478e52e83c39bef011dcd2d02b3).

## C. Automated evidence

Node 24.22.1, npm 11.9.0, Vue 3.5.13, PGlite 0.5.16. The locked installs and completed build/test runs establish compatibility for these dependencies. Tests use only disposable engines, synthetic roles and local or mocked providers. Counts overlap.

| Exact command | Result |
|---|---|
| `npm ci` | Passed |
| `npm ci --prefix backend/worker` | Passed |
| `npm run check:worker` | Local build/package passed. Existing release-preservation warning remains. |
| `npm test` | **530 passed, 0 failed, 0 skipped**. Prior 516 preserved, with 14 additional cases. |
| `SDL004_VUE_RUNTIME="$PWD/node_modules/vue/index.js" node --experimental-vm-modules --test tests/ux003DownloadLifecycle.test.mjs tests/ux003LiveReview.test.mjs tests/ux003MediaIntegration.test.mjs tests/ux003Presentation.test.mjs` | **73 passed, 0 failed, 0 skipped**, included in full suite. |
| `node scripts/run-ux-ui-smoke.mjs` | **8 passed, 0 failed, 0 skipped** |
| `npm run build:ux-live` | **178 passed, 0 failed, 0 skipped**, including eight Vue smoke tests. Built 91 allowlisted assets plus headers and a 404 document. |

The prior CI job ran a separate pinned, read-only verification workflow. It checked out `0120c6b`, installed both lockfiles and ran local Worker packaging, the full suite and UX build. This remediation uses the same local commands and adds no workflow. The static file SHA-256 manifest has digest `bf694e0581443d228a4d366cf5530745ec25db14fcf964db796a3d7645af9f8a` over the newline-terminated list in path order. Local logs and the file manifest are held in the QA workspace.

## D. P0 candidate environment readiness

**Status: Prepared / Approval Pending.** The proposed first target is `http://127.0.0.1:5500` on an approved tester's machine, with `dist-staging` served from loopback after SDL-000 confirms synthetic credentials and current provider settings. Stop the local host when the test ends. Existing `http://localhost:5500` is equivalent for the source allowlists. Mobile acceptance requires separately approved access on a physical device. An exact already-authorized staging origin can be considered for a controlled promotion only after owner approval and rollback preparation. A generated Pages preview hostname is outside the compiled allowlists.

| Dependency | Required configuration and evidence |
|---|---|
| Frontend | Build with `npm ci` and `npm run build:ux-live` at the pinned candidate. Serve only `dist-staging` with the generated security headers. Keep the existing staging Supabase project (`wvurolqbjhuckkkjiiiv`), publishable client configuration, Worker URL and `SUBMISSION_FEATURES_ENABLED=false`. GitHub records a successful UX Live Pages release for accepted source `4590f86`. Preserve that deployment and the separate mock UX Preview. |
| Origins | Frontend and Worker source permit exactly `https://sdl-staging.pages.dev`, `https://sdl-ux-live.pages.dev`, `http://localhost:5500` and `http://127.0.0.1:5500`. Local CORS cases exercise approved and denied origins. Hosted Worker preflight could not be rechecked from this environment because its CONNECT proxy returned 403. |
| Auth and Supabase | Hosted staging Auth, verified account-context/roster reads, current enrollment and guardian relationship checks, and existing session-bound RPC/consent authority. Confirm exact Auth redirect handling for the chosen origin and use approved test accounts. |
| Worker and storage | Preserve the existing staging Worker and private staging R2 binding, staging Supabase target, secret bindings and observability. Keep `SUBMISSIONS_ENABLED=false` and independently review the seven current media flags and route revisions. Preserve MEDIA-03B-04 shared download and MEDIA-03B-06 independent review semantics. A previously reported Worker version is `f4784d08-9a5d-45b4-9991-07488208e3e8`; live version/bindings and Pages settings need fresh operator readback because the provider metadata requests returned HTTP 401. |
| Synthetic fixtures | Existing approved Coach, Club Admin, Manager, verified Guardian and distinct teammate-family accounts. Add negative contexts for an unrelated role/team/club, dual-role switching and a revoked test session. Use a disposable pending clip for review mutations and a separate disposable consent/share for withdrawal and objection exercises. Preserve the current accepted share and consent receipts. |
| Rollback | For local acceptance, stop the loopback host and discard the temporary profile and asset copies. For an approved later Pages promotion, retain the current accepted Pages deployment and capture its live ID and exact SHA before promotion. Roll back the frontend through that preserved deployment or revert the new frontend fix and handoff commits. Preserve Worker, R2, grants, enrollments and consent history. Recheck gate state and the exact restored frontend. |

The Pages integration supports a commit prefix that skips automatic builds. GitHub Pages serves `main`, the separate verification workflow is pinned to its own branch, and the existing candidate's GitHub checks show no Cloudflare deployment. PR publication uses `[skip ci]`. A future deliberate staging release requires a separately approved deployment action and current hosted configuration evidence. [Cloudflare Pages skip rule](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/#skipping-a-build-via-a-commit-message)

## E. Integration safety and remaining acceptance

Existing UX-IA-01 through UX-IA-06, five main tabs, performance authorization and revision pathways, Library and independent Review, and the media and publication gates are preserved by this narrow change and passed local regression. The reviewed controller, Worker/service contracts, migrations, bindings and routes are unchanged. Download still requires a server-provided `can_download===true`, explicit confirmation and a distinct `sharedDownload()` request before the mobile Save action. Consent remains one optional versioned decision with explicit withdrawal and existing objection restrictions.

Implementation and automated verification are complete for this candidate. Environment preparation is complete for SDL-000 review. Environment approval, authenticated staging, physical mobile acceptance, and production acceptance remain pending. The Worker release-preservation warning remains open.
