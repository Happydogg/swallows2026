# UX-V01 Videos navigation handoff

This frontend-only candidate starts from accepted `sdl-staging` at `16e12bb1a0a3f9bf618d9c6670b1c049934fc22b`. It implements issue #22 against the frozen v1.0 design at `8a8da9548d6b2a75524b5beca5efe3ac1a0c6afd`. [Issue #22](https://github.com/Happydogg/swallows2026/issues/22) · [Frozen design](https://github.com/Happydogg/swallows2026/blob/8a8da9548d6b2a75524b5beca5efe3ac1a0c6afd/docs/design/SDL-UX-002/videos/README.md)

## Before and after

Previously, Library, Clubhouse and Review followed the global workspace selection. Videos now resolves each destination from verified account context and guardian links. The five global tabs and other workspaces keep their existing behavior.

| Verified role | Primary destinations |
|---|---|
| Guardian | My Videos, Team Videos when eligible |
| Coach | My Team Videos, Review Videos |
| Team Manager | My Team Videos |
| Club Admin | My Team Videos, Review Videos |
| Platform Admin alone | No operational Videos destination |
| Coach and Guardian | My Videos, My Team Videos, Review Videos. The candidate puts guardian Team Videos inside My Videos as a secondary control. |
| Manager and Coach | My Team Videos, Review Videos under Coach authority |
| Manager and Guardian | My Videos, Team Videos when eligible, My Team Videos |

## Role and request boundaries

- My Videos reads the existing verified-linked-child projection. Family Team Videos uses only the exact verified guardian team projection. The shared list keeps its existing neutral labels and consent and download checks.
- My Team Videos selects one verified role, club and team. Coach reads use the existing caller-scoped Coach roster RPC and retain only entries for the chosen team. Manager and Club Admin reads use the existing managed roster RPC with explicit role, organization and team. Club Admin also retains the existing club roster scope. Staff shared videos use this same verified team scope.
- Review uses the existing action-summary and inbox endpoints. Home carries its exact scope into Review. The Videos view can show all teams for one independently authorized review role, while the existing inbox filters narrow that view. Coach and Club Admin counts remain separate server results. The existing inbox validates and deduplicates rows. No Manager review scope is generated.
- For private library and shared-media requests the existing server contract uses the authenticated caller and exact player or team ID. UI state owns the selected role and aborts obsolete requests. The browser sends an explicit role only where the existing API accepts it. The reviewed private controller and its authorization callbacks remain in place. The library hides moderation controls in the Guardian and Manager Videos views and preserves server-gated upload. Independent Review keeps the same mutation, required rejection note and approval/publication separation.
- Destination, staff scope, effective identity and relevant guardian changes invalidate obsolete data and media objects. Staff team choices do not change guardian roster or team eligibility. Session transitions continue to use the existing auth layer.

## File inventory

| Path | Change |
|---|---|
| `composables/useVideoDestinations.js` | Verified destination and scope model, scoped roster loading and cleanup. |
| `js/app.js`, `index.html` | Videos-local navigation and selectors, scoped inputs to the existing library, Clubhouse and Review panels, and preserved Home Review entry. |
| `components/PrivateMediaPanel.js` | Optional presentation restriction for library moderation controls. Existing props, emits and media callbacks remain available. |
| `js/coachRosterService.js`, `js/supabaseService.js` | Optional abort signal on existing reads. Query contracts and selected fields are preserved. |
| `js/translations.js` | Navigation labels in English, Traditional Chinese and Japanese. |
| `tests/uxV01VideoNavigation.test.mjs` | Role matrix, exact scope, denial, aborts, identity, and Home/Review routing tests. |
| `tests/helpers/appHarness.mjs`, `tests/authLifecycle.test.mjs`, `tests/privateMedia.test.mjs`, `tests/vueBindings.test.mjs`, `tests/ux003DownloadLifecycle.test.mjs`, `tests/ux003LiveReview.test.mjs` | Restore the previously verified UX-003 synthetic test versions. The frontend-only staging promotion had left older auth and media fixtures in this branch. |
| `docs/design/SDL-UX-002/videos/UX-V01-HANDOFF.md` | Scope, evidence and rollback. |

## Verification

Node 24.22.1, npm 11.9.0.

- `SDL004_VUE_RUNTIME="$PWD/node_modules/vue/index.js" node --experimental-vm-modules --test tests/uxV01VideoNavigation.test.mjs tests/ux003DownloadLifecycle.test.mjs tests/ux003LiveReview.test.mjs tests/privateMedia.test.mjs tests/authLifecycle.test.mjs tests/stagingFrontend.test.mjs tests/vueBindings.test.mjs tests/workerContracts.test.mjs` passed 160 tests with zero skips. Includes 14 new UX-V01 cases.
- `node --check js/app.js`, `node --check composables/useVideoDestinations.js` and `git diff --check` passed.
- `npm run build:staging` passed and exported 92 allowlisted assets.
- Real Chromium with intercepted synthetic provider responses passed at 390 px and 1280 px for both Coach–Guardian and Manager-only. It exercised the Videos navigation, guardian Team Videos and Review and checked the absence of Manager-only review and deletion controls. This is local synthetic evidence. Logs and screenshots are in the private QA workspace.

## Owner decision and rollback

Please confirm the secondary guardian Team Videos control inside My Videos for Coach–Guardian accounts before promotion. This layout keeps the frozen three primary destinations and retains access to guardian-only teams. A fourth primary destination needs an explicit design decision. Athlete-identifying metadata for shared media remains deferred to the approved backend workstream. Physical-device and authenticated staging acceptance remain pending.

Rollback before promotion is to leave the draft unmerged. A future source rollback reverts this branch's change and leaves the accepted staging baseline intact. The frontend candidate has no Worker, SQL, consent policy, permission, secret, storage or gate changes. Any staging activation needs separate owner approval.
