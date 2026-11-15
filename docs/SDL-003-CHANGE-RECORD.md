# SDL-003 | Modular Application Architecture & Code Reusability

**Status:** Implementation candidate, automated checks passed; live browser acceptance and PR review pending.
**Source baseline:** User-provided `swallows2026-main (2)(1).zip` (Nov 2026 main snapshot).
**Change type:** Refactor only, no intentional feature or database behavior change.
**Target branch:** `feature/SDL-003-modular-architecture` created from current `main`.

## Approved intent

- Preserve current roster, player forms, training sessions, CSV, videos, analyzer, statistics, coach mode, and EN/ZH/JA UI.
- Extract large in-DOM templates into Vue 3 components.
- Split the former root controller into cohesive feature composables while retaining the native ES-module, zero-bundler architecture.
- Reuse shared validation / formatting / speed helpers rather than copy/paste.
- Deliver bulk code changes with a single short regression pass, then fix only failures and affected routes.
- Do **not** change Supabase schemas, credentials, R2 behavior, Cloudflare deployments, or biomechanics calculations in SDL-003.

## Changes

| Area | Result |
|---|---|
| `index.html` | Replaced header, player profile, video-upload, session forms, and analyzer markup with component mounts. |
| `js/app.js` | Reduced to app setup, shared state, data load, and feature integration. |
| `components/AppHeader.js` | New reusable header/navigation/coach toolbar. |
| `components/PlayerProfile.js` | New profile presentation (session cards/table, charts, clips). |
| `components/SessionFormModal.js` | One Add/Edit measurement form; emits unit/save/cancel actions. |
| `components/UploadVideoModal.js` | New metadata/upload UI. |
| `components/ArAnalyzerModal.js` | New analyzer UI bound to the **existing** `arAnalyzer.js` controller. |
| `composables/usePlayers.js` | Add/Edit/Delete, avatar state, player selection, position buttons. |
| `composables/useSessions.js` | Log/Edit/Delete session state and speed-unit conversions. |
| `composables/useVideos.js` | Video form/list/upload/delete orchestration. |
| `composables/useAnalytics.js` | Chart state, session expansion, leaderboard/analytics helpers. |
| `composables/useCoachMode.js` | Preserved existing coach-mode UI behavior; **not an authorization fix**. |
| `composables/useRosterCsv.js` | CSV import/export coordinator. |
| `utils/jerseyUtils.js` | Shared jersey validation, normalized comparison, conflict detection, sorting. |
| `utils/playerUtils.js` | Player display/legal name and position helpers. |
| `utils/sessionUtils.js` | Null/velocity-unit conversion helpers. |
| `js/csvManager.js` | Reuses jersey helpers; import/export behavior otherwise unchanged. |

Original `TeamOverview.js`, `PlayerFormModal.js`, `arAnalyzer.js`, `statsEngine.js`, `supabaseService.js`, `mediaStorage.js` and other service/biomechanics files have not been modified.

## Automated checks performed

- `node --check` across all ES-module JavaScript files: passed.
- Vue runtime-template compilation (Vue 3.5.x local test runtime), all extracted/existing components plus shell: passed.
- Node dependency-free synthetic-data tests: 7/7 passed.
- In-memory Vue renderer integration (no remote requests): roster, leaderboard, profile, log/edit session modal, upload modal, batting/pitching analyzer, video/canvas ref ownership: no render errors.

**Not yet tested:** Full browser with production CDN dependencies and live Supabase/R2/MediaPipe devices; uploading, deleting, actual MediaPipe video inference; manual mobile layout after bulk refactor. This change is not ready to go straight to production without a local smoke check.

## Quick acceptance (one browser round)

1. Roster and leaderboard: counts, search, player selection.
2. Add/Edit player: modal opens and `00`/`07` display, Cancel works. Do not save real records during refactor testing.
3. Player Profile and session Add/Edit modal: existing data and km/h ⇄ mph controls display.
4. Video cards and Upload modal: file input, metadata, Cancel (avoid production writes).
5. Analyzer: open recorded batting/pitching clip, frame stepping, HUD, canvas overlay, close. Use an existing clip.
6. Coach mode, EN/ZH/JA, desktop/mobile layout, console free of **new application errors**.

## Rollback

Do all work on `feature/SDL-003-modular-architecture`, starting from current `main`. If the bulk change fails, switch back to `main` in VS Code; don't merge the feature PR. No database migration is involved. For a post-deployment regression, revert the SDL-003 merge commit via GitHub and redeploy the previous app; do not roll back Supabase (no SDL-003 database changes).

## Existing technical risks, not changed here

- Original coach-mode logic contains a browser-side PIN fallback; browser UI state cannot authorize storage/database operations. Supabase RLS and R2 Worker authorization still need independent verification before multi-club onboarding.
- CSV imports may partially apply earlier rows when a later row fails. Leave bulk CSV import off until its transaction behavior is reviewed.
- Video quota/deletion workflow has not been hardened in this UI-only refactor.
- Modularization reduces coupling but does not yet establish an independent backend API; server-side authorization is planned separately.
