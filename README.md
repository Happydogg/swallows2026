> Current release candidate: see `docs/SDL-004-STAGING-RELEASE.md` and `docs/SDL-004-SPRINT-REPORT.md`.
> New submission/review/Clubhouse operations are implemented locally and remain disabled pending staging deployment and verification.

# SDL-004-006 | Staging-only safe coach roster and direct security testing

This package was prepared from the verified SDL-004-005 staging auth patch and SDL-004-002/003/004 migrations present in this conversation. It **has not** been executed on the Supabase server or exercised in a live browser.

## What changes

- `sql/01_STAGE_TEAM_A_PLAYER_A.sql` (write): sets only Test Player A's `organization_id` to Pilot Organization A and inserts one `player_team_memberships` row. Does not modify player/athlete IDs.
- `sql/02_COACH_SAFE_ROSTER_RPC.sql` (write): creates authenticated-only `public.sdl_004_coach_roster()` security-definer function. It verifies `auth.uid()`, active **coach** team membership, active **staff/admin** organization membership, active assigned player membership, and cross-org consistency. Returns only minimal baseball fields.
- `sql/03_VERIFY_STAGING_READ_ONLY.sql`: six post-setup checks. Neither SQL script weakens existing table RLS policies or enables writes to official stats.
- `frontend/index.html`, `frontend/js/app.js`: branch coach team overview to separate read-only component, preserving existing root Vue bindings and parent UI.
- `frontend/js/coachRosterService.js` (new): calls authenticated RPC.
- `frontend/components/CoachTeamRoster.js` (new): responsive coach-safe roster that doesn't link into private player profile.

## Install order

1. **Do not run in production.** Confirm project ref `wvurolqbjhuckkkjiiiv` and backup.
2. Execute `sql/01_STAGE_TEAM_A_PLAYER_A.sql` fully in staging SQL Editor.
3. Execute `sql/02_COACH_SAFE_ROSTER_RPC.sql` fully.
4. Execute `sql/03_VERIFY_STAGING_READ_ONLY.sql`, report six PASS.
5. Make a backup of the *working SDL-004-005 local staging folder*. Compare and merge files against local changes. Copy the four `frontend/` files into the corresponding paths of the staging folder.
6. Do **not** copy a `config.js` from an archive; preserve your currently working staging URL and publishable key.
7. Hard reload and run tests in `docs/SECURITY_TESTS.md` with Coach A, Parent A, unrelated user, and signed out.

## Risks and boundaries

- `01` changes a synthetic pilot player club assignment. It is deliberate, guarded, and **not** an inference about real players.
- This implementation is a **coach-only pilot roster**, not a Clubhouse roster. No parent-to-teammate sharing until approval/consent is implemented.
- `SECURITY DEFINER` is a privileged boundary; the only permitted output is an explicit allowlist, callable by authenticated users and filtered by current user's verified memberships. Review function ownership and exposed API execution privileges on deployment.
- Existing guardian query can still retrieve their child's private fields. Existing player-profile UI must not be reused for teammates. No official sessions, videos, statistics write policies, or R2 authorizations are implemented.
- The code is based on the previously generated SDL-004-005 frontend, rather than your possibly newer local staging changes. Merge, don't overwrite blindly.
