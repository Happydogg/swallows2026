# SDL-UX-004 | Authenticated Staging Data Review

**Owner request:** Build an online page to sign in and view staging Supabase players and private video from a phone, keeping the existing `sdl-ux-preview` synthetic-only design preview.

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
