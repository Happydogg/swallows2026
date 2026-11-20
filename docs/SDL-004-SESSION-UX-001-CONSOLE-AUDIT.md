# SDL-004-SESSION-UX-001 | Field-use session continuity and console audit

**Reported:** 2026-11-20. **Environment:** authenticated SDL UX Live against staging Supabase. **Risk:** high usability in poor outdoor connectivity; preserve youth-data authorization.

## Original user observations

- Every return to the browser page appeared to show **Checking secure session**, with lost or reloaded state.
- Repeated MediaPipe WebGL graph initialization/closure in the console.
- Staging `GET /rest/v1/sessions?select=*&order=session_date.desc` returned **HTTP 403**, with `Sessions Error` in `supabaseService.js`.
- Tailwind CDN production warning.
- `contentscript.js` EventEmitter listener / ObjectMultiplex warnings and message-channel-closed exceptions.

## Root causes confirmed in current GitHub source

1. `composables/useAuthSession.js` previously called `invalidateIdentity()` on **every** auth event. Supabase emits `SIGNED_IN` on tab focus and `TOKEN_REFRESHED` on automatic JWT renewal. Each event cleared memberships, UI, media, charts, and GPU state, set `authReady=false`, then called `getUser` and reloaded app. This was not a true signout.
2. `js/app.js` fetched the safe coach roster **only when** the gated pilot flag was on, otherwise it called legacy `fetchAllCloudData()`, which reads `public.sessions.select('*')`. Staging deliberately has no direct authenticated sessions SELECT policy; the 403 is expected for this forbidden request.

## Implemented corrections

- Same-user auth notifications now preserve the **mounted workspace** and in-memory selections, do not rerun user/membership/roster queries, and do not reset MediaPipe.
- First login, a truly changed identity, or explicit `SIGNED_OUT` still run the original invalidation and fresh authorization sequence. Signed out state still clears synchronously.
- Multiple pending same-identity notifications coalesce. No Supabase calls run within `onAuthStateChange` lock.
- Coach startup **always** uses the membership-scoped `sdl_004_coach_roster` RPC, regardless of pilot flag; it never falls back to the unrestricted sessions loader.
- Parent access remains through the existing verified-guardian projection. Official session data remains constrained to approved server endpoints; no RLS or data-visibility expansion occurred.
- Tests updated for real signout/account switch vs same-user focus/refresh. An offline tab return test verifies no additional session calls or GPU init.

## Console message disposition

| Message | Assessment / action |
|---|---|
| `/rest/v1/sessions` HTTP 403 | **Actual SDL bug:** unauthorized fallback query. Removed its coach-startup caller. |
| Many WebGL graph start/close cycles | **Likely SDL side effect:** repeated auth resets called full cleanup and init. Same-user reset removed. Legitimate new analyzer sessions or real signouts may still open/close GPU contexts. |
| `contentscript.js` MaxListenersExceededWarning | **Probable extension-injected script**, not an SDL filename or import. Confirm in a fresh Chrome profile with extensions disabled before attributing to the app. |
| `ObjectMultiplex` orphaned streams | Browser extension / injected provider stream warning. Not evidence of Supabase failure. |
| Async listener indicates response, channel closed | Usually a browser extension message-port race; isolate with extensions disabled. |
| Tailwind CDN production warning | **Real build-quality debt**, not an auth failure. Track SDL-003/UX static Tailwind CSS build, separate from this targeted session fix. |
| MediaPipe `Successfully created/destroyed` / disabled WebGL error checking | Normal diagnostic logs by themselves. Repetition, not isolated messages, was concerning. |

## Verification

- Cloudflare Pages **authenticated UX Live** commit `e4235825607a9d239433d8d616993cd2e7d2c968` deployed successfully.
- **118/118 focused regression tests** plus **1/1 Vue renderer smoke test** passed on that commit.
- No changes to staging Supabase schema, Auth policies/RLS, Cloudflare Workers/R2, or production.
- **Browser tab focus / mobile field conditions not independently device-tested**. The owner should test in Chrome with DevTools and on a phone with weaker reception.

## Acceptance steps

1. Login to `https://sdl-ux-live.pages.dev/` as a staging coach, open a player profile and play a permitted clip.
2. Switch to another Chrome tab for 30–60 seconds, then return. Confirm no full-screen session check, loss of player selection, avatar or video state.
3. Repeat after several minutes (across a token refresh) and with temporary offline connectivity. Existing visible layout should stay; new requests while offline may fail and must not be falsely claimed successful.
4. In Network filter `sessions`: no startup request to `/rest/v1/sessions?select=*` for a coach session.
5. Logout: private roster, media and chart data must still clear promptly.
6. Repeat Chrome tests with extensions disabled to isolate `contentscript.js` warnings.
7. Revisit the page via **full refresh** while offline: first-time identity verification may still fail by design. An opt-in offline read cache for private minor data would require separate threat modeling and explicit approval.

## Follow-up

SDL-004: future nonblocking, rate-limited auth/role freshness strategy, including revoked membership and session changes on other tabs, while preserving visible workspace during ordinary network transitions. SDL-003: replace Tailwind runtime CDN with a version-pinned, compiled static CSS asset before production pilot. SDL-005: lazy MediaPipe GPU creation on first analyzer use rather than all successful signins (requires isolated video regression tests).

**No production deployment was made.**

## Follow-up verification, 2026-11-20

- Removed the remaining same-user `authError` dependency from the tab-focus fast path: an unrelated transient network error must not force a session reset on the next `SIGNED_IN` focus notification.
- Added a focused regression reproducing that case while ensuring `SIGNED_OUT` still immediately clears private data.
- Final verified implementation commit: `d12a5f69e4dab713ba38c8fcb1e6a6179071d588`.
- Cloudflare `sdl-ux-live` deployed this source successfully: **119/119 tests**, plus **1/1 Vue renderer test**.
- Cloudflare `sdl-ux-preview` deployed this source successfully.
- Actual browser tab background/foreground, Chrome extension isolation and real poor-reception UAT remain outstanding; source and synthetic unit tests alone do not establish field acceptance.
