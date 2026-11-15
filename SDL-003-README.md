# SDL-003 | Swallows DataLab Fast-Track Refactor

This is a **complete ready-to-copy project** built from the uploaded main ZIP. The same modifications are also available as a **changed-files-only ZIP**.

## What changed

- `index.html`: **1,109 → 203 lines** (application shell)
- `js/app.js`: **746 → 98 lines** (application coordinator)
- New components: `AppHeader`, `PlayerProfile`, `SessionFormModal`, `UploadVideoModal`, `ArAnalyzerModal`
- New composables: `usePlayers`, `useSessions`, `useVideos`, `useAnalytics`, `useCoachMode`, `useRosterCsv`
- Shared utilities: `jerseyUtils`, `playerUtils`, `sessionUtils`
- Existing `TeamOverview`, `PlayerFormModal`, Cloudflare, Supabase, and biomechanics implementation retained.

**No backend, database, deployment, or R2 changes are required for SDL-003.** All paths are native ES modules, so continue using VS Code Live Server; no bundler or npm install is needed for the application.

## Installation

1. Make sure your local `main` has the same baseline as the uploaded ZIP. Pull `main` and save a clean baseline.
2. Create `feature/SDL-003-modular-architecture` from `main` in VS Code.
3. Extract the ZIP **outside** your project folder.
4. Copy its files/folders into the project, preserving `components/`, `composables/`, `utils/`, `js/`, `docs/`, and `tests/`. If using the changed-files-only ZIP, it leaves untouched modules and `config.js` alone.
5. Confirm the changes in Source Control. **Do not overwrite the project with an older snapshot** if your `main` has advanced since uploading the ZIP.
6. Run `index.html` using Live Server (not by double-clicking `file://`). Hard-refresh the browser.

## Automated checks (optional, Node 22+)

From the project root:

```powershell
node --experimental-default-type=module --test tests/sdl003.test.mjs
```

These tests use synthetic records and a mocked Vue/cloud service. They do not touch Supabase or R2.

## One brief browser acceptance round

- Roster, search and leaderboard.
- Add/Edit Player, leading-zero jersey formatting, Cancel.
- Player profile and session Add/Edit, speed switch.
- Video list and upload modal (don't upload/delete in this first smoke check).
- Analyzer video, frame stepping, AR HUD and Close.
- Coach mode, EN/ZH/JA, mobile view and Chrome Console.

If something fails, capture **the failing screen plus the first red application error**, and fix that path rather than restarting the full test suite. After the six checks pass: stage, commit, PR `feature/SDL-003-modular-architecture` → `develop` (or use your approved release branch workflow). Production stays unchanged until you merge `develop` → `main`.

## Important integration note

The analyzer video/canvas refs are attached to the existing `createArAnalyzerController` object via Vue ref callbacks. We have tested these assignments in an in-memory Vue renderer, but you should check with a real video in the browser because MediaPipe is hardware/browser dependent.

## Known issues intentionally NOT addressed

Existing client-side coach PIN fallback and unverified backend authorization, CSV partial-import behavior, and R2 destructive operations remain separate high-priority items. Do not offer the MVP to independent clubs before secure authorization and tenant isolation are verified.

Detailed scope and verification: `docs/SDL-003-CHANGE-RECORD.md`.
