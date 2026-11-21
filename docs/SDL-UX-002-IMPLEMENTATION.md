# SDL-UX-002 | Frontend Redesign Implementation Checkpoint

**Workstream:** SDL-UX-002 (frontend UX and MVP design freeze), coordinated with SDL-000 and SDL-004.
**Branch:** `feature/SDL-UX-002-login-redesign`, based on `sdl-staging`.
**Owner approval:** phased frontend redesign; no deployment, RLS, API/Worker or authentication-policy expansion.

Use the [approved SDL-UX-002 design archive](design/SDL-UX-002/README.md) for Coach Direction 3 and Parent/Player Direction 2. The Final UX Design blueprint is the primary specification.

## Current source changes (provisional, not staged/deployed)

- `LoginLanding.js`: responsive invite-only sign-in; delegates to existing `useAuthSession`.
- `AppShell.js`: shared Home, Team, Stats, Videos, Me navigation for phone/tablet/desktop.
- `CoachHome.js`: data-forward coach workspace using only authorized coach-roster projection.
- `ParentHome.js`: verified-guardian family home using explicit guardian-to-athlete filtering.
- `InviteOnboarding.js`: invitation handoff after successful sign-in; existing Worker performs redemption.
- `js/app.js` and `index.html`: integrate UI components with existing controllers, modals, and workflows.
- `tests/uxShell.test.mjs`: navigation, mode isolation, logout and invite regression tests.
- `tests/vueBindings.test.mjs`: update sign-in wording assertions for new login design.

## Non-negotiable protections

1. Server-verified authentication remains the only route to private UI.
2. The five tabs and Coach/Family selector are presentation routing, not authorization.
3. Family Home reads only players whose `athlete_id` matches a verified guardian link. No private identifiers or direct client-side table queries were introduced.
4. Stage `SUBMISSION_FEATURES_ENABLED=false` remains unchanged. Phone OTP is not active.
5. Invite links are removed from the URL fragment promptly; linking is still a separate protected Worker request.
6. Existing official stat writes, private media access, coach reviews, analytics math and player/session editing logic have not been rewritten.
7. No backend source, database schema, RLS policy, production branch, or staging deployment was modified.

## Verification recorded

- GitHub source verified on the development branch.
- Static syntax, component wiring, authorization-boundary assertions and retention of old workspaces checked.
- Targeted automated regressions written but **not executed** in the current environment.
- No Live Server, mobile Safari, staging backend or hosted Pages runtime test performed.

### Required manual checks before merger or deployment

1. Run the full existing `npm test` suite using the documented prerequisites, including Vue renderer tests.
2. Use Live Server: signed-out and restored sessions; email login; invalid login; sign-out.
3. Phone viewport and landscape tablet: navigation, touch targets, scroll, focus and keyboard.
4. Verify no-child, one-child and multiple-child family accounts; no PII for unrelated children.
5. Verify dual coach/guardian mode selector cannot broaden backend data access.
6. Verify coach roster and all old Team, Stats, Videos and AR analyzer workflows remain reachable.
7. Verify expired/invalid, replayed and cross-account invitation tokens fail closed once the backend invitation endpoint is approved.
8. Validate staging Worker and RLS authorization independently. Do not enable the final-pilot feature flag before SDL-004 acceptance.

## Next implementation slice

Review browser behavior and fix runtime defects. Then develop the approved player Hero Card/profile presentation and consolidated video/stat navigation. Maintain backward-compatible exports and access rules.

**Rollback:** revert this development branch or its component commits. Neither `sdl-staging` nor `main` has been changed.

## Approved direction follow-up

Coach Direction 3 now starts with a compact dashboard title, verified roster counts and direct access to the full roster, stats and private video. Parent/Player Direction 2 starts with linked athlete cards and direct access to each athlete’s profile, growth and videos. The homes remain wired to the existing authorized profile and media handlers.

Local Chromium checks rendered both homes at 360, 390, 768 and 1280 CSS pixels using synthetic profiles. They checked profile and video actions and horizontal overflow. The family empty state was checked separately. Signed-in staging acceptance remains pending.
