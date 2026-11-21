# SDL overnight development handoff | 2026-11-21

## Staging release on November 21, 2026 (Taipei)

Started on clean `task/sdl-ux-002-overnight` at `0e2a824983e21fa46133999debc371ffc6d46b13`. Checked status, branch, history, origin, fetched and pruned refs, compared the SDL branches and inspected open PR #5. GitHub main was `cbbaba20d5f1322f6a482fa810129eb7342f177f`. The staging feature branch was four task commits behind at `0a3ec0881eb2be93967fdef271d4d6d3a18a8336`. The five archived design images and their approval distinctions were retained. No separate Backend Security Audit attachment or matching repository report was located. The repository security tests and SDL-004 release records were available.

**Deployed application commit** `950e3938701c01fb42da21958e717250720af506`. PR #5 merged into `feature/SDL-UX-002-login-redesign` by fast-forward at 09:35 Taipei time. The staging Pages projects use this Git branch for their canonical URLs. Their source repository, account, domains, build commands and output directories were checked before the update.

| Staging URL | Successful deployment ID | Acceptance |
|---|---|---|
| https://sdl-ux-live.pages.dev/ | `a373b9e9-64d3-4b94-b692-f778c1da52fe` | Email and invitation forms mounted and switched in Chromium. Served index, app entry, roster, private media panel and analyzer matched local export bytes. |
| https://sdl-ux-preview.pages.dev/ | `e20ac25b-6826-4e13-9185-13e63a7581b5` | Synthetic team and family navigation, roster and video screens exercised in Chromium. |

### Functional acceptance

| Workflow | Implemented and locally tested | Live evidence or remaining blocker |
|---|---|---|
| Coach | Team filter and name/jersey search over the complete scoped roster. Photo and name open the athlete profile. | Preview rendered 15 players, scrolled to the last, filtered jersey 35, opened profile and editor. Assigned-coach login, edits and practice recording await role UAT. |
| Parent | Linked athlete cards, independent guardian history, profile and photo controls subject to server permission. | Synthetic family switch opened the second linked child. Verified-parent editing and live cross-family denial await test accounts. |
| Administrator | Scoped photo manager and existing gated enrollment workflows. | Live administrator player creation, membership updates, audit entries and tenant denial remain unverified. |
| Statistics | Stats returns to the selected profile. Dated table and cards include only available metrics, including broad jump. | Read-only staging inventory found 15 DEMO athletes and 120 sessions. All 120 had height, weight, throwing and exit velocities, sprint and broad jump. Both statistics RPCs returned HTTP 401 with only the public application key. A browser fixture rendered dated columns and the profile action. |
| Private video | Profile is bound to its athlete. The Videos tab retains the role-scoped picker. Serial thumbnail requests support all visible clips and explicit retry. Role changes clear playback. | Browser-generated MP4 decoded to a verified colored frame with the deployed extractor and playback advanced. The Worker hostname was blocked by environment egress (CONNECT 403). Existing private R2 media and its live authorization remain unverified. |
| Drill analysis | Existing pose and phase engine retained. Local clips require movement and original FPS. Wrist estimates begin empty and are labeled. | Local lifecycle and package tests passed. Signed-in real-clip analyzer acceptance remains open. |
| Pilot, invitation and Clubhouse | Local tests cover approval, corrections, consent, withdrawal and isolation. | Four installed migrations, 30 public pilot functions, email auto-confirm off, both submission gates off. Provider backup listing returned zero backups. An isolated restore receipt and live role matrix are outstanding. |

The browser exercised 360, 390, 768 and 1280 CSS pixels on both deployed sites. All five mobile navigation buttons stayed fixed at the bottom. All desktop navigation buttons remained visible at the last roster row. The synthetic preview footer displaced the sidebar’s top edge by 57 px at maximum scroll. No horizontal overflow, page or console errors, HTTP errors or failed requests occurred on the tested public journeys. Private-role UAT requires dedicated assigned coach, verified guardian, admin, unrelated and revoked identities. Management metadata access supplies no such user sessions.

### Verification and infrastructure

- Reinstalled the root and Worker lockfiles with `npm ci --ignore-scripts` in their respective directories using a writable temporary cache.
- Baseline `npm test` passed 405 tests. Final `NODE_OPTIONS=--experimental-vm-modules node --test tests/authLifecycle.test.mjs tests/privateMedia.test.mjs` passed 68. Final `npm test` passed 406, zero failures or skips.
- `npm run build:ux-live` passed 130 focused tests and one Vue compiler/renderer smoke test. `npm run build:ux-preview` passed seven. `npm run check:worker` built and verified the package locally.
- [Application diff and files changed](https://github.com/Happydogg/swallows2026/commit/950e3938701c01fb42da21958e717250720af506)
- Only staging Pages deployments changed. The staging Worker remained on version `c764d3e4-2351-4416-8eb0-793e412d9d54`, bound to `sdl-media-staging` and the verified Supabase staging project. No DB migration, role mutation, R2 write, Worker deployment, DNS or production change occurred.
- To roll back the frontend, restore the prior canonical UX Live and UX Preview deployment IDs listed below. Reconcile the staging Git branch with a reviewed revert before its next release. No backend rollback is needed.

## Earlier development checkpoint

The frontend regression is repaired in source commit `6f1ebe66a99ca5ec0895e21a2851482c668160ba` on `task/sdl-ux-002-overnight`. The PR base is `feature/SDL-UX-002-login-redesign`. The full local suite passed. Both review sites still serve the starting commit `0a3ec0881eb2be93967fdef271d4d6d3a18a8336`.

## Repair and verification

The dual-role test omitted its coach roster assignment and mocked a Worker route while the profile called a Supabase RPC. The fixture now explicitly assigns the player and mocks the two approved RPCs independently. Player selection returns the scoped history operation, and late responses cannot repopulate a profile after navigation or identity changes. The family submission workspace uses the same navigation revision to prevent late history from reopening a profile.

The fix touches `js/app.js`, `composables/useSubmissionWorkspace.js`, `tests/helpers/appHarness.mjs` and `tests/parentStatisticsClient.test.mjs`. Compared with the GitHub `main` source baseline `cbbaba20d5f1322f6a482fa810129eb7342f177f`, the feature branch has a scoped roster and history flow plus a separate family workspace. This repair uses those paths and makes no changes to the authorization service, SQL, Worker or legacy standalone modules.

| Check | Local result |
|---|---|
| `NODE_OPTIONS=--experimental-vm-modules node --test tests/parentStatisticsClient.test.mjs` | 12 passed. The VM flag is required by the existing harness. |
| `npm test` | 405 passed, zero failed or skipped |
| `npm run build:ux-live` | 129 focused tests and one Vue renderer smoke test passed. Static export contains 78 files. |
| `npm run build:ux-preview` | Seven passed |
| `npm run check:worker` | Local bundle and package checks passed. The release check still requires a reviewed current bindings and observability baseline. |

## Staging observations

Read-only checks were performed on 2026-11-21 UTC. Both canonical Pages deployments report success at starting commit `0a3ec0881eb2be93967fdef271d4d6d3a18a8336`. Preview deployments for non-production branches are disabled on both projects.

| Service | Review URL or target | Deployment or version |
|---|---|---|
| Authenticated UX Live | https://sdl-ux-live.pages.dev/ | `3d49f31b-38a4-44ed-af71-ab5bdb4361ec` |
| Synthetic UX Preview | https://sdl-ux-preview.pages.dev/ | `47c4bb06-aabb-4cda-8b5a-9209cf8d14b1` |
| Staging media Worker | `sdl-r2-staging-gate` | `c764d3e4-2351-4416-8eb0-793e412d9d54` |
| Supabase staging | `wvurolqbjhuckkkjiiiv` | Management API listed migration versions `20261117151156`, `20261117151227`, `20261118081242` and `20261120132046` |

Worker settings returned binding names `MEDIA_BUCKET`, `SUBMISSIONS_ENABLED`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `SUPABASE_URL`. The submissions flag was verified off. Prior row counts and JWT-claim QA are recorded in the staging sprint handoff. This run did not reverify live row counts or exercise authenticated RPC responses.

Headless Chromium checked both existing deployments at 360, 390, 768 and 1280 CSS pixels. UX Live mounted the email form and opened the Invitation form. UX Preview rendered its DEMO content. All eight page checks returned HTTP 200 with no horizontal overflow, console errors or failed requests. This trace covers the public entry screens.

## Acceptance matrix

| Feature | Approved scope | Implemented and automated-tested | Staging / production verification |
|---|---|---|---|
| Assigned coach history | View assigned team players only | Correct player and measurement, stale player and scope invalidation | Repaired commit awaits staging deployment and signed-in acceptance |
| Verified family history | View verified linked children only | Separate guardian RPC and family-card history, no coach fallback, account and role invalidation | Signed-in acceptance pending |
| Admin, unrelated and revoked users | Keep server role and enrollment checks | Full local authorization suite passed, including deny cases | Authenticated browser and live negative role checks pending |
| Private media, photos and responsive navigation | Existing staging workflow | Worker and frontend packages passed | Public entry screens verified. Signed-in thumbnails, playback, photo editing and sticky navigation remain pending. |
| Pilot v2 | Activation held for recovery and identity prerequisites | Local contracts tested with gates off | Worker gate observed off. Live end-to-end pilot and production verification pending. |

## Review and rollover

Open UX Live to review sign-in and Invitation navigation. With dedicated staging test accounts, sample Coach Home → Team → Player → Stats → Videos, repeat with a verified guardian, then verify sign-out and denials for unrelated or revoked accounts. Use UX Preview for a public synthetic walkthrough.

The available environment had no dedicated staging role accounts or database connection binding. Authenticated device and role acceptance, live row counts, and isolated restore validation therefore remain open. A reviewed backup and restore receipt and a current Worker baseline are needed before v2 activation. No staging or production resources were changed during this repair. For source rollback, revert the repair commit on the task branch. The existing Pages deployments are the rollback reference if the repair is later released.
