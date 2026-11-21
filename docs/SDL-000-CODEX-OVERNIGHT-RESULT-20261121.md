# SDL overnight development handoff | 2026-11-21

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
