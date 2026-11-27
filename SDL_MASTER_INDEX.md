# Swallows DataLab | Repository Master Index (Coordination Mirror)

**Updated:** 2026-11-27. **Status:** Working GitHub coordination mirror. Reconcile against the independent SDL Master Directory before calling this authoritative.

## 2026-11-27 E2E Round 2 functional acceptance handoff

**Latest owner-reported result:** 12 of 12 E2E Round 2 scenarios PASS. The owner accepts **roster integration for staging UX**. This supersedes the earlier reported Round 1 functional roster result of 8 PASS, 3 FAIL and 1 PENDING **for the scenarios actually rerun**. Raw assertion logs, identities, test date/time, exact frontend build and direct API coverage were not supplied to SDL-000; do not infer additional coverage.

**Coordination decision:** Continue approved MVP completion, with zero new feature expansion. Preserve passing Coach, Guardian and multi-role workflows, complete remaining frontend functionality and owner-led smoke tests. SDL-004 backend still owns server-side authorization/security remediation, evidence and restricted function gates. Full security acceptance, PR merges, unrestricted media access, real-family onboarding and production deployment are NOT authorized.

**Previous checkpoint note:** The earlier note that 12 synthetic identities were merely prepared reflects the earlier stage; their actual provisioned identities and scope ledger must be reconciled from Round 2 evidence. Do not mark provisioning verified without the ledger.

---

## 2026-11-27 coordination checkpoint: RBAC v5.1 and frontend-first completion

**Status:** Working coordination mirror, not the independent SDL Master Directory or a security approval. This checkpoint supersedes the older environment and priority snapshot below where they conflict; historical entries remain preserved.

- **Scope freeze:** Complete the previously approved mobile-first product. No new features. Owner tests functionality via VS Code Live Server and then hosted staging. Direct backend authorization testing remains a separate release gate.
- **SDL-004 RBAC:** The November 27 owner handoff reports v5.1 staging deployed in restricted mode. Roles: Platform Admin (PA), Club Admin (CA), Team Manager (TM), Coach (CO), Guardian (GU). Accounts may hold independent concurrent roles. The source policy is in the RBAC feature branch.
- **Verified metadata (read-only, November 27):** Supabase staging project wvurolqbjhuckkkjiiiv is active, contains 22 public sdl_v5_* RPC functions and 11 matching account/session policy names, and lists hosted migration 20261126235408. Cloudflare Worker sdl-r2-staging-gate lists version 2cd3f378-5636-466a-beac-aa4c6a48097c at 100% traffic. These observations confirm deployment metadata, not full security verification.
- **Git:** RBAC branch feature/SDL-004-rbac-v5, draft PR #7 targeting sdl-staging, is open and unmerged. Worker source checkpoint 6331aa965f8afaac50862a75a71993da0d7ae4c9. UX implementation continues separately on feature/SDL-UX-002-login-redesign. Plan contract reconciliation before integration; do not treat two divergent branches as one deployed source.
- **Restricted operation (owner-reported):** SUBMISSIONS_ENABLED=false and temporary execution restrictions on 18 media/shared-session RPCs. Unresolved media authorization, subject evidence, provenance, consent, MFA recovery and retention/privacy gates remain. No synthetic global Platform Admin grant.
- **Staging data (owner-reported):** Existing 19 players, 120 sessions and 2 media rows preserved after installation; counts were not independently repeated in this coordination checkpoint.
- **Synthetic UAT:** Backend RBAC workstream owns provisioning 12 synthetic accounts and scoped relationships; provisioning script is prepared but NOT executed. Do not create real-family accounts to test.
- **Owners:** SDL-000 coordinates scope, decisions and gates; SDL-004 backend/RBAC workstream owns synthetic identities, grants, authorization and defects; SDL-UX-002 owns role-aware frontend and owner UAT; SDL-GOV owns independent security release evidence; SDL-005/006 continue only within approved dependencies.

**Source contracts:** [RBAC v5 API](https://github.com/Happydogg/swallows2026/blob/feature/SDL-004-rbac-v5/backend/proposals/sdl004-rbac-v5/API.md), [v5.1 policy amendment](https://github.com/Happydogg/swallows2026/blob/feature/SDL-004-rbac-v5/docs/SDL-004_Account_Roles_and_Permission_Amendment_v5.1.md), [PR #7](https://github.com/Happydogg/swallows2026/pull/7).

**Next coordination gate:** Authorize and verify synthetic staging identities; complete read-only frontend/API contract mapping; implement role-aware UX without expanding permission; run owner Live Server/hosted staging UAT and direct API denials; resolve independent security QA findings before any release. Production deployment, PR merging, real-family onboarding and unrestricted media access are NOT approved.

---

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
