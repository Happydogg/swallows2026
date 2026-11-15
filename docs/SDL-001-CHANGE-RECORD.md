# SDL-001: Extract Team Overview into Vue component

Date: 2026-11-15
Scope approval: APPROVED by product owner in chat
Implementation: COMPLETED in supplied local copy
Release approval: PENDING
Production deployment: NOT PERFORMED
Priority: P2 maintenance/refactor (risk: medium)

## Change identity
The initial SDLC draft reused `SDL-001` for a security audit, conflicting with the later explicit owner-approved `SDL-001` UI extraction. For this delivery, SDL-001 means TeamOverview extraction. The hardcoded coach PIN finding is retained as separate proposed **SEC-001** backlog item, not fixed here. The SDLC draft's ticket IDs require reconciliation.

## Objective
Extract roster and leaderboard dashboard into `components/TeamOverview.js` with unchanged behavior, UI classes, and translations. Team state, business rules and mutations remain in root `js/app.js`.

## Modified files
- `index.html`: replaced former VIEW 1 markup with `<team-overview>` props and two `v-model` bindings.
- `js/app.js`: imports and registers `TeamOverview`. Its original `setup` API remains intact.
- `components/TeamOverview.js`: new native ES module with original dashboard markup and events for overview tab and roster search.

## Non-goals
No database/schema change, R2/Worker change, algorithm change, redesign, role routing, team scheduling, or fixes to the known client-side PIN bypass.

## Acceptance criteria
1. Roster and leaderboard layout/classes, translations and conditions stay equivalent.
2. Search and roster/leaderboard switch update root state.
3. Coach actions call original root handlers and player selection stays functional.
4. No change in Supabase/R2 requests.
5. Works with VS Code Live Server and native browser ES modules.

## Test evidence
- PASS: `node --check` all JavaScript source files.
- PASS: structural assertions for component registration, full prop/action binding, v-model tab/search and intact profile view.
- NOT RUN: browser runtime or live Supabase/Cloudflare integration tests.

## Manual staging checklist (release blockers)
- [ ] Launch `index.html` with VS Code Live Server. Verify no missing module or console error.
- [ ] Roster desktop table and mobile cards render and match the original.
- [ ] Switch Roster/Leaderboard multiple times; rankings and stats match baseline.
- [ ] Search by name, jersey and HKLL registration.
- [ ] Profile opens from avatar/name/button and Back returns to overview.
- [ ] EN/ZH/JA language switching displays correctly.
- [ ] Coach locked/unlocked views show correct actions. Use only staging test data for write/delete actions.
- [ ] Check responsive behavior at <768px and >=768px.

## Rollback
Restore `BASELINE_index_v3.html` as `index.html` and `BASELINE_app.js` as `js/app.js` from package root, and remove the unused component file. Deploy the previously known-good Cloudflare Pages commit. No database or media rollback is necessary for this refactor.

## Release approval
PENDING. No production deployment performed.
