# SDL-002 Change Record: Unified PlayerFormModal

**Status:** Implementation prepared; browser regression pending. **Release:** Not approved.
**Base:** SDL-001 ZIP source with confirmed SDL-001 Vue binding fix reapplied. Compare all files against your actual merged `develop` before copying. No live repository access was used.

## Scope
- New `components/PlayerFormModal.js`: single Vue component for Add/Edit Player forms; same modal layout retained.
- `index.html`: replaced two old modal blocks with one `<player-form-modal>` and in-DOM kebab-case prop/event bindings.
- `js/app.js`: imported and registered `PlayerFormModal` only. Existing root persistence and handlers retained.
- Prior SDL-001 fixes (`overview-tab` and `search-query`) are reflected in the provided `index.html`. Do not replace the existing `TeamOverview.js` from this package; it is not included.
- No database, storage, schema, RLS or infrastructure modifications.

## Behavior
- Add mode auto-generates preferred name until manually customized, using existing root handler.
- Edit mode exposes existing Supabase avatar-upload control and URL field.
- Position selection and validation continue through existing root methods.
- Save is disabled while saving or photo uploading, using existing flags. Cancel does not persist form edits, although an avatar upload itself may already have persisted (pre-existing behavior).

## Automated validation
- Both changed JavaScript files pass `node --check`.
- Structural tests for registration, props/events, one modal instance, retained fields and SDL-001 bindings passed.
- No browser integration or live Supabase writes were executed in this environment.

## Required manual acceptance checks
1. Application loads, no new Vue errors.
2. SDL-001 roster, search, leaderboard, profiles unaffected.
3. Add opens, Cancel closes, no database write; pref-name auto-gen until customized.
4. Edit opens existing player fields; Cancel does not save changes.
5. Position chips, handedness, date, jersey, contact and bat spec behave correctly.
6. Edit photo picker, preview, disabled upload state and error alerts work.
7. Save pending locks; re-open another player does not leak prior form state.
8. EN / ZH / JA, desktop/mobile layout and keyboard access work.
9. Verify actual save only using an approved disposable record/test backend.
10. Video analyzer, sessions, CSV import/export unaffected.

## Rollback
Revert this feature commit on `feature/SDL-002-player-form` or its merge commit in `develop`. No DB rollback required.

## Known issues / out of scope
- Client PIN / backend authorization audit remains P0.
- Avatar already uploaded when editing is canceled remains unchanged.
- Mobile bottom-sheet redesign is a separate change.
