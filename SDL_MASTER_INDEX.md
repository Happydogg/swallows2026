# Swallows DataLab | Repository Master Index (Coordination Mirror)

**Updated:** 2026-11-21. **Status:** Working GitHub coordination mirror. Reconcile against the independent SDL Master Directory before calling this authoritative.

## Milestone ownership

| Milestone | Scope | Current primary records |
|---|---|---|
| SDL-000 | Coordination, inventory, status, decisions | `SDL_ROADMAP_STATUS.md`, `SDL_DECISION_REGISTER.md`, `docs/SDL-000-20261121-STAGING-COMPLETION-SPRINT.md`, `docs/SDL-000-CODEX-OVERNIGHT-RESULT-20261121.md` |
| SDL-001/002 | Original team, player, stats workflows | `docs/SDL-001-CHANGE-RECORD.md`, `docs/SDL-002-CHANGE-RECORD.md` |
| SDL-003 | Frontend modular architecture and build reliability | `SDL-003-README.md`, `docs/SDL-003-CHANGE-RECORD.md` |
| SDL-004 | Auth, memberships, private media, submissions, family, Clubhouse and pilot gates | `docs/SDL-004-FINAL-PILOT.md`, `docs/SDL-004-STAGING-RELEASE.md`, `docs/SDL-004-SESSION-UX-001-CONSOLE-AUDIT.md` |
| SDL-005 | Video metadata, capture, private thumbnails and pose processing | `docs/SDL-000-20261121-STAGING-COMPLETION-SPRINT.md`; implementation `js/arAnalyzer.js`, `js/videoThumbnail.js` |
| SDL-006 | Scientific QA and evidence-gated AI Coach | Separate SDL-006 research/integration workstreams; preserve original GEM-006-A |
| SDL-UX | Mobile role-adaptive experience, profiles, navigation, charts | `docs/SDL-UX-008-PLAYER-EDIT-AND-DRILL-ANALYSIS.md`, `docs/SDL-UX-007-PRODUCTION-PARITY-AVATARS.md` |
| SDL-GOV | Releases, approvals, verification, rollback | `docs/SDL-004-FINAL-PILOT-CHECKPOINT.md`, `docs/SDL-004-BLOCKER-HANDOFF.md`, `SDL_DECISION_REGISTER.md` |

The [SDL-UX-002 design archive](docs/design/SDL-UX-002/README.md) contains the governing approved blueprint and the four supporting, concept and bug references.

The [overnight release record](docs/SDL-000-CODEX-OVERNIGHT-RESULT-20261121.md) identifies the deployed application, Pages rollback IDs and remaining signed-in acceptance work.

## Current environments

- Original GitHub `main`: **production-source baseline; do not equate with currently deployed production without verification**.
- Branch `feature/SDL-UX-002-login-redesign`: automatic UX review deployments.
- `https://sdl-ux-live.pages.dev/`: authenticated staging-connected UX.
- `https://sdl-ux-preview.pages.dev/`: public isolated fictional-data preview.
- Supabase `wvurolqbjhuckkkjiiiv`: staging only; verified SDL-004 workflow migrations, 15 DEMO players, 120 sessions, 15 club enrollments without consent or recording authorization.
- R2 `sdl-media-staging` behind Worker `sdl-r2-staging-gate`; v2 submissions feature gate remains **off**.
- Production: no changes from the 2026-11-21 completion sprint.

## Evidence principles

Architecture/design records and old handoffs do not establish actual deployment. Live Supabase migration ledger and Worker settings supersede outdated claims that final-pilot tables are absent, **but present schema objects do not prove enabled user workflows**. Separate Implemented, Tested, Staging-verified and Production-verified. Do not mark the overall production pilot complete without full role/UAT/recovery evidence.

## Next coordination action

Reconcile this mirror with project conversations/workstream directory, verify protected backup/isolated restore, run credentialed coach/parent/admin/outside-role UAT, and address the intentionally disabled SDL-004 v2 activation gate before pilot release.
