# SDL-UX-004 | Authenticated Staging Data Review

**Owner request:** Build an online page to sign in and view staging Supabase players and private video from a phone, keeping the existing `sdl-ux-preview` synthetic-only design preview.

## Owner-reported phone UAT — 2026-11-20

The project owner reports **"video play"** on the authenticated `sdl-ux-live.pages.dev` workflow. Record this as **user-verified successful playback**, not independent browser/network instrumentation. The existing staging Worker origin, R2 binding, and signed-in media player flow are therefore sufficient for at least one permitted phone playback. The specific iOS model, player and file were not provided, and broad playback compatibility remains unverified.

## SDL-UX-006 | Player-to-video mobile navigation

- Added `Open player videos` action to the staging family player browser; `Watch player videos` to parent cards; `Videos` action to each coach home roster row.
- All emit `open-video` to a single `openAuthorizedPlayerVideos` controller method. It accepts only rows present in the active server-scoped coach roster or verified-family projection, then invokes the already existing `privateMedia.selectMediaPlayer`, which separately calls the Worker to authorize read/upload.
- No new Supabase queries, R2 access paths, API endpoints or migrations.
- Build evidence: Cloudflare Pages commit `4fb0665ef3db5b46644157290378cac0c036475e`, **114/114** targeted automated checks plus **1/1** Vue renderer smoke test; deployment successful.
- **Acceptance pending:** owner confirms the shortcuts select the correct family/coached player and that the relevant video plays on a physical phone.

## SDL-004 Worker origin deployed and verified — 2026-11-20

**Status: Implemented, automated-test verified, browser-CORS verified, staging Worker deployed. User-authenticated media playback UAT remains open.**

Owner explicitly approved using the existing `sdl-media-staging` R2 bucket from `https://sdl-ux-live.pages.dev`. The existing `sdl-r2-staging-gate` Worker already had the bucket binding, so no new bucket, public link, migration, Worker secret, or media-copy process was needed.

- **Source change:** `backend/worker/pilot.mjs` now permits exactly `https://sdl-ux-live.pages.dev` alongside `https://sdl-staging.pages.dev` and both original localhost origins.
- **Worker artifact deployment:** Cloudflare Worker version `c764d3e4-2351-4416-8eb0-793e412d9d54` (deployment `196d31c4-3f1c-40d2-a90c-74111e446978`, 100%). This was prepared from the then-current, deployed Worker bundle with only the exact new origin added, not from an older baseline.
- **Preserved Worker bindings:** `MEDIA_BUCKET` remains `sdl-media-staging`; `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` remain bound; `SUBMISSIONS_ENABLED=false`; compatibility date `2026-11-16`; observability preserved.
- **Rollback reference:** immediately previous deployed version `d7639565-23ee-46f3-b8fe-8ea93ce21156`, previous deployment `ced69703-0f74-496c-9e14-0759754cce5e`. Restoring this version also removes the newly allowed origin.
- **Frontend:** `js/app.js` allows the new exact origin; `index.html` mounts the existing authorized `PrivateMediaPanel` for the Videos tab. Unapproved hostnames continue to show the staging portal fallback.
- **Automated verification:** Cloudflare Pages build `ac2d02daf6eb2261becfd63b2963046d3cc2f995` passed **98/98 focused tests plus 1/1 Vue 3 renderer smoke test**; the Cloudflare Pages deployment succeeded.
- **Runtime verification:** A 390-pixel-width Cloudflare browser session from `https://sdl-ux-live.pages.dev/` sent a CORS-preflighted Worker request using a deliberately invalid synthetic bearer and received readable HTTP **401**. This verifies the origin is accepted without bypassing authentication.
- **Not yet tested:** a real staging user's permitted player-video list and successful MP4 playback on iOS. No passwords, JWTs or private video URLs were acquired.

**Important historical drift:** `backend/release/staging-worker-baseline.json` refers to older version `891b26a8-bd75-4f2c-b6af-b0244cc699f7`; it must be refreshed through the reviewed baseline protocol before the next Worker release. Do not assume that old baseline describes today's deployment. The deployed bundle's source map was carried forward as part of the one-origin patch; recompile from reconciled source on a subsequent controlled release.

**Supersedes the earlier video-host CORS blocker in this document.** The existing staging portal remains a fallback, but is no longer required for users visiting the approved `sdl-ux-live.pages.dev` hostname.

## Deployed architecture

- **Synthetic UX review:** https://sdl-ux-preview.pages.dev/ (no backend connection)
- **Authenticated UX review:** https://sdl-ux-live.pages.dev/ (new Cloudflare Pages project on `feature/SDL-UX-002-login-redesign`)
- **Existing authorized video origin:** https://sdl-staging.pages.dev/ (existing Cloudflare Pages staging site, unchanged)
- **Supabase:** the existing `swallows-datalab-staging` project `wvurolqbjhuckkkjiiiv`. No database changes.
- **Cloudflare Worker:** existing `sdl-r2-staging-gate`. No Worker changes.
- **Build:** `npm run build:ux-live`; runs regression tests and the pre-existing `backend/release/build-staging-frontend.mjs` export into `dist-staging`.

## What works and what has not been verified

1. Sign-in uses unchanged `useAuthSession` and Supabase Auth email/password. The signed-out page was browser-rendered at a 390px wide mobile viewport.
2. The Team tab contains `StagingDataBrowser`, displaying **only** a server-scoped coach roster or verified guardian-linked player projection. No general-purpose SELECT * was added.
3. Existing workspace, player profile, video, review, and analytics Vue modules are preserved in the exported app.
4. The Videos tab on **sdl-ux-live.pages.dev** intentionally provides a link to the **existing staging video portal**. The deployed media Worker currently restricts CORS to `https://sdl-staging.pages.dev` and localhost, so new-host playback cannot be asserted or circumvented. The Worker still authenticates every media read and checks access per player.
5. **Not yet verified:** interactive sign-in with a real staging account; whether that account has coach/guardian membership; playback of either staging video; iOS Safari video decoding; browser runtime of the signed-in dashboard.
6. Private videos become directly playable inside the new UX Live site only after a separate, explicitly approved, narrowly scoped media Worker CORS-origin addition and authorized staging deployment. Do not bypass the origin check with a proxy or spoofed header.

## Evidence and tests

- Read-only staging Supabase inventory (2026-11-20): 4 player rows, 2 private media metadata rows, 1 verified guardian link, 1 active coach membership. Row counts do not prove content is synthetic; owner reports staging uses mock data.
- Cloudflare `sdl-ux-live` deployment tested with **89/89** automated targeted tests (auth, guardian scoping, private media, UX routing, packaging) passing, and Pages build published successfully.
- Additional real Vue 3 compiler/custom-renderer smoke test: **1/1 passed**, covering signed-out/login views, private media, authorized player UI, and role-dependent navigation. The live build now requires this test before export.
- Browser Rendering returned a loaded sign-in screen with email/password fields on a 390 × 844 mobile viewport; no player data rendered before login.
- Entire branch and export retain `SUBMISSION_FEATURES_ENABLED=false`. No auth, database, RLS, Worker or credential changes.
- Original `sdl-staging` Cloudflare Pages project and source branch remain unchanged.

## Phone-based UAT

1. Open https://sdl-ux-live.pages.dev/.
2. Sign in with an existing staging Supabase account (not the Supabase dashboard login unless it is also an app Auth account).
3. Choose **Team** to view players visible to your coach or guardian role.
4. Choose **Videos**. Follow the linked existing staging portal and sign in there to use its **Private player videos** selector and playback controls.
5. In ChatGPT, send a screenshot and describe the screen, action, expected/actual result. Do not paste passwords, tokens, JWTs, or media URLs.

## Next authorization dependency

To make videos play **on the redesigned `sdl-ux-live.pages.dev` host itself**, obtain explicit owner approval for an SDL-004 staging Worker change adding exactly that HTTPS origin to the `ORIGINS` allowlist, preserving all existing origins, Auth and Worker authorization. Inspect current deployed Worker source and bindings before implementation, and test both preflight and actual authenticated playback. This approval has **not** been given.

**Rollback:** Disable GitHub deployments or delete the separate `sdl-ux-live` Pages project. Do not alter `sdl-staging`, database, or media Worker as part of rollback.
