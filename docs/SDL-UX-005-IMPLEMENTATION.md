# SDL-UX-005 | Player Profile, Stats & Video Room

**Milestone:** SDL-UX-005 frontend presentation, related to SDL-003 application composition and SDL-004 authenticated data/media.  
**Branch:** `feature/SDL-UX-002-login-redesign`.  
**Approved scope:** Continue the frontend redesign in reversible increments. No Supabase schema, Auth/RLS, staging Worker, private R2 bucket or production release changes are authorized by this slice.

## User-confirmed baseline

On 2026-11-20 the owner reported that **private staging video playback works** on the previously deployed authenticated UX Live page. This is **user-reported acceptance of that playback path**, not independently measured decoding success on every browser. The Video Room UI was subsequently redesigned; playback of the redesigned UI still requires fresh UAT.

## Changes implemented in the development branch

- **`components/PlayerHeroCard.js` (new):** shared responsive compact and detailed player identity; retains coach-only official name and registration fields in detailed form and measurement functions supplied by the existing caller. Function-valued optional props use safe setup wrappers to avoid Vue default-factory behavior.
- **`components/ParentHome.js`:** family cards reuse the compact Player Hero without adding identity data or statistics queries.
- **`components/PlayerProfile.js`:** detailed Profile reuses the Player Hero; session history, charts, CSV-related flows, analyzer, modal interactions and legacy profile view remain intact.
- **`components/PrivateMediaPanel.js`:** new phone-first Video Room, horizontal quick player selector, clear clip cards, native inline MP4 playback, analysis shortcut, private upload section and explicit empty/error states. No change to `usePrivateMedia` or `privateMediaService` permissions or Worker endpoints.
- **`components/StatsHub.js` (new):** role-aware stats page. Family view accepts only existing `useSubmissionWorkspace.cards` guardian-scoped projection; only `statsAvailable===true` rows display performance measures. Coach view uses the role-scoped roster, without inventing team statistics.
- **`js/app.js`, `index.html`:** register Stats Hub, preserve existing controller and mounted legacy workspaces.
- **Synthetic mobile review:** additional Player Profile screen plus real Video Room layout with mock controller, and fictional, clearly labeled sample Stats content. Strict preview export now allows exactly 15 files and still excludes Supabase, private media APIs and credentials.
- **Automated tests:** Vue renderer recurses through nested child components and checks Player Hero render; UX assertions cover stats projections and unchanged media actions; the preview export check enforces its allowlist.

## Security and scientific boundaries

No new direct Supabase `SELECT`, SQL, Worker request, or storage binding was introduced by these presentation components. Existing authenticated session guard and per-player media authorization remain unchanged. No player data or private video is included in synthetic preview assets. Unavailable or unauthorized metrics remain blank; all preview sample measurements are fictional.

The legacy `60+ km/h Club` display was retained rather than silently changed. It must not be interpreted as a scientifically validated youth benchmark. No injury-risk or new biomechanical prediction is introduced.

## Verification levels

- GitHub changes: **Implemented**.
- Source syntax and targeted contract assertions: checked during implementation.
- Cloudflare Pages CI and Vue renderer: **must be checked on the latest commit**, not assumed from earlier successful builds.
- Device acceptance of this updated layout: **Pending owner testing**.
- Supabase stats integration: parent-safe statistics service remains gated in staging; the new Stats Hub does not unlock it.
- New backend migrations, Workers, RLS, flags, production: **None**.

## Suggested acceptance walkthrough

1. On **SDL UX Live** sign in with existing staging credentials, select Videos, select an authorized athlete, play a clip, and verify inline controls plus AR analyzer shortcut.
2. Choose Stats; verify the card shows legitimate authorized metrics or an accurate unavailability notice, never fabricated values.
3. Visit the Team/player workspace and open an authorized Player Profile. Check the hero, charts, session history, video controls, language labels and coach-only details.
4. On **SDL UX Preview** check the fictional Parent/Coach Home, Player Profile, Stats and Video Room in phone portrait and landscape.
5. Report any clipping, overlap, wrong account data, stale playback or navigation issue with a screenshot and build version.

**Rollback:** Revert the recent frontend component commits in this isolated branch or roll back the affected Pages deployment. Preserve the already independently approved and deployed staging media Worker; this UI slice does not require a Worker rollback.

## Verified hosted checkpoint (source `050f2435598153eea4aabe55554f4231090e6137`)

- **SDL UX Live:** Cloudflare Pages deployment of commit `050f2435` succeeded, including **101/101 targeted regression tests** and **1/1 Vue 3 compiler/renderer smoke test**. The protected staging export contained 54 frontend files.
- **SDL UX Preview:** Cloudflare Pages deployment of the same commit succeeded with **4/4 synthetic-export safety checks**. The package contains exactly 15 allowlisted files and no connected Supabase/R2 services.
- **Browser evidence:** Cloudflare Browser Rendering at a 390 × 844 mobile viewport rendered the direct `?screen=profile` link with the reusable detailed hero and demo marker, without uncompiled custom elements.
- **Not independently browser-verified:** the direct `?tab=stats` and `?tab=videos` views could not be retested in the same batch because the Cloudflare Browser Rendering API returned HTTP 429 rate limits. Their source and Vue template integration passed the hosted automated checks, but mobile visual UAT is still due.
- **Previously user-reported:** the original private video playback path works; the revised Video Room must be retested by the project owner on their actual signed-in device.

**User review URLs:** `https://sdl-ux-live.pages.dev/`, `https://sdl-ux-preview.pages.dev/?screen=profile`, `https://sdl-ux-preview.pages.dev/?tab=stats`, `https://sdl-ux-preview.pages.dev/?tab=videos`.
