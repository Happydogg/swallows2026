# SDL-002-A fast-track release CANDIDATE (not approved to execute)

Source: uploaded SDL-002 working snapshot and last frontend-only patch, NOT the current live GitHub develop/main or local feature branch. Review diffs before using. Nothing has been deployed, and production Supabase remains unchanged.

## Contents
- `components/PlayerFormModal.js`: text input, one/two digits, leading zeros
- `js/app.js`: Add/Edit string jersey, normalized duplicate warning, removes pre-migration padded-number save block; **do not deploy before coordinated DB conversion**
- `js/csvManager.js`: string jerseys, 1-2-digit validation, normalized collision checks, refuses jersey-only player matching. CSV import is not transactionally atomic and needs a targeted CSV test before production enablement.
- `sql/00_PRE_FLIGHT_READ_ONLY.sql`: production read-only check
- `sql/01_PRODUCTION_MIGRATION_REVIEW_AND_APPROVAL_REQUIRED.sql`: proposed transaction, **not authorized to run**
- `sql/02_POST_RELEASE_READ_ONLY.sql`: production verification

## Release gate
1. Confirm feature branch and inspect diff against EXACT current files. Do not blindly drag-drop old snapshot files.
2. Review CSV import: existing importer is sequential, could partially import if a later row fails; for lowest risk, temporarily refrain from using CSV import during release until tested. Excel can strip leading zeros despite CSV quoting; import jersey column explicitly as text.
3. Verify fresh backup and recovery procedure (CSV is not complete DB rollback), production dependency review and production RLS/security posture.
4. Freeze Add/Edit/import writes for deployment window; production and dev share DB.
5. Review SQL and explicitly approve migration and release; do NOT run the included candidate SQL until then.
6. Coordinate database migration with compatible frontend: release only after acceptance on exact code, then smoke test 19 existing players and a new unused padded jersey, conflict rejection and reload. Do not create duplicate `00` with test player `0` assigned.
7. Roll forward to fix if postmigration issue. Reverting TEXT -> INTEGER would destroy leading zero display and can be unsafe after new writes; use DB restore only with assessed data loss and full recovery procedure.

## Security
Production RLS policies remain unverified. Avoid exposing real children's information or changing production privileges. Staging has no access policies, so browser tests require a separate secure test setup. No R2 changes are included.

## Branch
Only apply reviewed changes on `feature/SDL-002-player-form`, not main. This is a code candidate, not an automatic production release.
