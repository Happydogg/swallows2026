# SDL-000 / SDL-004 / SDL-005 / SDL-UX | Staging Completion Sprint Handoff

**Checkpoint:** 2026-11-21  
**Owner authorization:** Staging Supabase, staging Cloudflare resources and GitHub UX branch may be changed. Production must not be changed. Every mutation must be documented.
**Source branch:** `feature/SDL-UX-002-login-redesign`  
**Code checkpoint:** `05fc32a67079973b435591a994396e68e5ec408a` before this documentation commit.

## Design reference and non-goals

Owner supplied five images: desktop/tablet coach and player dashboards, SDL-UX-002 approved mobile role-adaptive layout, invite-only login concept and the current mobile private-video cards. These are **visual references**, not evidence that the pictured statistics/videos are real or that the entire pictured workflow is implemented. Do not inject their invented numbers or use their child photographs as actual athlete profile data.

**Scope:** Stage-only frontend/data changes, keep original Vue global/no-bundler runtime, existing exports and authorization. No production deployment, DNS, production database, production R2, domain or secret changes.

## Work actually completed during this sprint

### SDL-005 | Real private video previews and safer analysis metadata

- Added `js/videoThumbnail.js`: browser decodes a frame from the **already authorized private MP4 Blob**, after loading metadata and seeking slightly into the clip. Produces a small in-memory JPEG data URL.
- Updated `composables/usePrivateMedia.js`: demand-load previews for visible cards only; one thumbnail worker at a time, bounded queue and two-MP4 memory cache. Reuses cached bytes for playback and **clears images/blobs on player switch, authorization reset, logout or account switch**. No public R2 thumbnail URLs, browser persistent storage, new Worker routes, or permanent thumbnails were introduced.
- Updated `components/PrivateMediaPanel.js`: replace empty giant video panels with compact responsive cards, actual rendered frame when decoded, visible progress/fallback, accessible play buttons and clip date/size.
- Fixed misleading private analyzer defaults: user must choose **Pitching or Batting** and the **actual original recording FPS (30, 60, 120 or 240)** before starting. The older media metadata does not contain this, so it is a user declaration, not automatically verified capture metadata.
- **Limitation:** First view of an older clip still requires downloading that authorized MP4 to generate the preview. This may be slow on weak outdoor reception. Persistent server-side JPEG thumbnail sidecars are a future SDL-005 optimization. Thumbnails are not fabricated or substituted with unrelated stock art.
- **Scientific limitation:** Automatic phase/velocity interpretations remain experimental and require SDL-006 QA. Generic throwing must not be mislabeled as validated pitching.

### SDL-004 | Live, scoped historical player growth

- Added a guarded, idempotent staging-only seed at `backend/seeds/SDL-004-fixture-002-active-demo-enrollments.sql`.
- Applied it against **only** staging Supabase `wvurolqbjhuckkkjiiiv`, creating **15 active synthetic club-enrollment links** for the 15 previously seeded DEMO-prefixed athletes. They all have `recording_storage_authorized=false`; no club consent or recording approval was granted and the original four other players were not modified.
- Verified after insert: 15 active demo enrollments; 15 distinct athletes; all recording disabled.
- Did not modify table RLS, auth users, the Worker, privileged credentials or production objects. Existing final pilot migration ledger remains installed.
- Added `js/authorizedStatsService.js`: loads up to 200 sanitized measurement rows from pre-existing, role-scoped staging RPCs only:
  - coach: `sdl_004_pilot_coach_statistics(p_player)`
  - guardian: `sdl_004_player_statistics(p_player_id)`
  - rejects mismatched player IDs, bad dates/metrics, unrecognized roles and unauthorized errors.
- Updated `js/app.js` and `components/PlayerProfile.js`: direct roster→profile and linked family→profile now retrieve actual authorized historical sessions for charts and metrics. The UI explicitly distinguishes **live authorized measurements** from the synthetic snapshot fallback.
- Added `composables/useAuthorizedStatsBoard.js` and `components/AuthorizedStatsBoard.js`: Stats tab shows recorded height, weight, throwing velocity, exit velocity, sprint and broad jump history for an authorized selected player. **No unverified roster-wide averages, normative thresholds or fabricated coaching scores.**
- Reads are deferred until the Stats tab is opened to avoid unnecessary downloads when coaching outdoors.
- `StatsHub.js` hides the synthetic demo snapshot on authenticated UX Live; the separate no-login UX preview retains its clearly labeled mock snapshot.
- Direct PostgreSQL QA executed in staging: under an existing active coach/session claim, the server-authorized function returned **8** expected DEMO sessions; with JWT claims removed, the same function rejected the request. This was a database authorization test, **not a real browser JWT or real-parent end-to-end test**.

### SDL-UX | Navigational and visual corrections

- Changed `components/AppShell.js` to render five consistent accessible SVG navigation icons instead of text characters that displayed as a chess piece/barcode on iOS. Maintained the already implemented sticky desktop sidebar, fixed mobile bottom navigation and five-tab workflow.
- Preserved existing profile photo editing through **Player Profile → Edit Player** and previously installed restricted staging avatar policies.
- Did not use attached concept imagery as real child records. Existing fictional SVG portraits remain mock placeholders until a permitted account uploads a picture.

## Verification and deployment evidence

- Authenticated UX Live: `https://sdl-ux-live.pages.dev/`. Cloudflare successfully deployed commit `05fc32a67079973b435591a994396e68e5ec408a`. Latest CI: **128/128 focused tests** and **1/1 Vue runtime renderer smoke check**, no failures.
- Public synthetic design review: `https://sdl-ux-preview.pages.dev/`. Same commit deployed; **7/7** preview isolation/allowlist tests passed.
- Testing includes new `tests/authorizedStats.test.mjs` (role paths, deny/error, cross-player rejection, data minimization) and updated `tests/privateMedia.test.mjs` (video frames, reuse, logout cleanup, explicit analysis FPS and movement).
- Cloudflare headless mobile browser confirmed that the unauthenticated UX Live login screen renders. The browser service later returned rate-limit HTTP 429, so the final signed-in mobile video, thumbnail, chart and upload acceptance tests are **not marked passed**.
- Owner previously confirmed the tab switch retained their selected player profile after 60 seconds, but this does **not** validate offline reload or long-term session revocation.

## Important operations NOT performed

- **No deployment or write to production** Supabase, Cloudflare, DNS or GitHub main.
- **No new Cloudflare Worker version/binding/route deployed in this sprint.** Existing `sdl-r2-staging-gate` continues to use `sdl-media-staging` and the previous protected media contract.
- **The staging Worker still has `SUBMISSIONS_ENABLED=false` and the frontend has `SUBMISSION_FEATURES_ENABLED=false`.** New final-pilot database tables/functions are installed, but invitation, review, parent submission and Clubhouse workflows have not yet been activated, and are not falsely described as operational.
- No production-grade pg_dump/isolated restore has been independently verified. No real parent/coach/admin credentialed acceptance test has yet completed for the new live-growth, photo editor and video thumbnails.

## Known limitations and next required work

1. **P0:** Credentialed iOS and desktop coach test: Team → DEMO player → 8 dated live history points; Stats → select DEMO player; Videos → authorized clip → visible true frame preview → Play; change tabs; logout.
2. **P0:** Verified parent, coach, admin, unrelated user and revoked-role negative testing for private photos, statistics, video and enrollment controls. Test denied data requests directly as well as hidden UI.
3. **P0:** Run protected staging backup, isolated restore, migration/permission preflight and confirm Auth email confirmation/delivery and exact Worker source/version before enabling any remaining SDL-004 submission/Clubhouse gates.
4. **P1:** Live v2 Worker/frontend staging activation with individual feature checks, rollback baseline, tests for invitation, growth correction, performance review, Clubhouse consent and removal. Keep production unchanged.
5. **P1:** Persistent server-side private thumbnail sidecars, originally recorded FPS/category metadata, and video batch/high-speed optimization under SDL-005.
6. **P1:** Replace Tailwind runtime CDN with pinned compiled static CSS as a field reliability/build hardening task, separate from this sprint.
7. **P2:** SDL-006 independent QA for phase timing, single-camera measurement uncertainty, ball release/contact estimation and AI Coach thresholds. The AR analyzer is not a validated youth injury predictor.

## Rollback and data preservation

- Revert only these feature-branch commits and Cloudflare UX Pages deployments to the preceding compatible version if the frontend fails UAT. No production rollback is involved.
- Keep the synthetic enrollment seed and SQL verification evidence. Removing those rows is a **destructive action requiring separate approval and dependency checks**, not an automatic rollback; they currently have no consent or recording authorization.
- Live R2/Worker, existing Supabase migration ledger and audit records must remain preserved. Disable any future v2 feature gates before rolling back their Worker implementation.

**Governance conclusion:** The new user-visible core has been implemented and passed automated checks in staging, but it is **not yet independently verified as a fully functional production-ready platform**. The unverified v2 workflows and real-account UAT remain explicit release blockers.

## Follow-up: private video is now embedded inside the player profile

- Updated `components/PlayerProfile.js` with a named `private-media` slot. In the authenticated staging app, that slot displays the **same authorized R2 video room and its actual decoded previews** directly where the player's recent videos belong.
- The original video gallery implementation remains intact as the slot fallback, preserving the source API and legacy workflows.
- Updated `index.html` to show the player-specific private room only when the selected athlete is in the permitted coach/guardian player projection, the current tab is Team, and the Worker origin is approved. The standalone Videos tab uses the same controller and only mounts on that tab. Admin-only/nonlinked accounts are not given private video cards.
- Updated `tests/uxShell.test.mjs` and `tests/vueBindings.test.mjs` for the tighter visible-only lifecycle. The latest successful authenticated build passed **129/129 focused tests and 1/1 Vue renderer test**; the synthetic preview passed **7/7**.
- Tested source checkpoint: `20f74d292ad3f9f34a000aff91c49a9e4d099d00`.
- Cloudflare Pages UX Live and UX Preview both deployed that checkpoint. No R2 Worker or Supabase permissions changed for the player-video integration.
- **Still owner-UAT pending:** Verify on an actually signed-in coach and guardian iPhone that the video appears immediately inside the intended player's profile, extracts an actual thumbnail, plays privately, and does not appear for unrelated players.

### Release-gate reminder

The submission/review/Clubhouse v2 feature gates remain off. Full pilot completion has **not** been independently verified; a successful frontend build must not be presented as full production release readiness.
