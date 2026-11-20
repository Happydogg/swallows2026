# SDL-UX-006 | Full Coach Roster, 15 Illustrated Portraits & Profile Drill-Down

**Date:** 2026-11-20
**Branch:** `feature/SDL-UX-002-login-redesign`
**Scope:** Frontend only. Existing protected staging Supabase and private-media Worker remain unchanged.

## Implemented and deployed

- `assets/demo-players/21.svg` through `35.svg`: fifteen distinct **fictional illustrated portraits**, each visibly labeled DEMO and with its corresponding jersey number. These are not photos of real youth players.
- `CoachHome.js`: shows the entire authorized roster on the home page, not a truncated five-player preview. Natural vertical document scrolling; the photo and name are separate keyboard-accessible buttons.
- `CoachTeamRoster.js`: full, unpaginated roster on the Team tab with optional team filter; tapping the player portrait, name, or profile button emits `open-profile`.
- `index.html` delegates both Coach Home and Team roster click events to `selectCoachRosterPlayer`.
- `js/app.js` cross-checks the selected athlete's ID and team ID against `coachRoster` (the existing membership-scoped RPC result) before opening their profile. Synthetic demo portrait URL is added to a local, view-only player projection. No unrestricted `players` table read or update was introduced.
- Existing `PlayerHeroCard` displays the selected athlete portrait in the detailed profile. `DemoGrowthLab` provides the mock-staging historical growth chart. Existing private-media controller selects that athlete for authorized video playback (clips only where existing staging media exist).
- Fixed **both static exporters** to package the 15 portraits, including an SVG content check on the authenticated build. Without this correction, the SVG URLs existed in source but returned HTTP 404 on the deployed website.
- Synthetic mobile review now renders the complete 15-player roster from `DEMO_GROWTH_SNAPSHOT` on both Coach Home and Team, and links into the selected avatar hero and history. This review environment remains disconnected from Supabase and media APIs.

## Verification evidence

- GitHub repository includes exactly 15 distinct SVG blobs.
- Cloudflare UX Live export and deployment of commit `e9a3dde786026730b683be966e0da6339d28a242` succeeded: 107 focused tests plus one Vue renderer smoke test passed (108/108).
- Synthetic UX Preview export and deployment of the same commit succeeded: 6/6 preview-package tests passed.
- A live-host browser fetch of all 15 `/assets/demo-players/{21..35}.svg` returned HTTP 200 and contained their DEMO artwork.
- Cloudflare Browser Rendering at a 390 × 844 phone viewport compiled the mock Coach Home (not uncompiled Vue), showed `Full team roster`, rendered 15 accessible player-profile buttons, and referenced 15 portrait paths.
- **Not yet user-accepted:** Actual authenticated coach click-through and real staging video selection on iPhone. A scripted browser click attempt in the synthetic preview timed out; the full mock roster was independently browser-rendered, but automated click-to-profile was verified by source contract tests, not end-to-end browser navigation.

## Important limitations

- The 15 images are **illustrated demo avatar assets**, not photographic portraits stored in Supabase `players.photo_url`. That field is deliberately not altered because the coach-scoped roster projection does not return photo URLs, and regular avatar uploads are still intentionally disabled.
- There are 120 seeded mock measurement sessions, but authorized live session-history access still requires the approved SDL-004 backend boundary; static fixture data is currently used for demo growth graphs.
- **No additional video clips were created** for each player. Existing staged media remains available only through the original authorization-checked Worker. Fake video per player requires a separate synthetic media seeding step if desired.

## Rollback

Revert the scoped frontend/preview commits or roll back either Cloudflare Pages deployment. The Supabase database, Worker origins, R2 bucket and permissions do not need rollback for this UI change.

## User walkthrough

1. Open `https://sdl-ux-preview.pages.dev/?role=coach` for a login-free full-roster visual check.
2. Tap the portrait/name of any DEMO player to inspect the hero card and eight-point growth trends.
3. Open `https://sdl-ux-live.pages.dev/` and sign in as the existing authorized demo coach to check the real Team roster and private media.
4. Report any portrait, profile navigation, scrolling or private-video issue with a screenshot.
