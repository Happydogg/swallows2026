# Swallows DataLab | Repository Master Index (Coordination Mirror)

**Updated:** 2026-11-28. **Status:** Working GitHub coordination mirror. Reconcile against the independent SDL Master Directory before calling this authoritative.

## SDL-000 | Videos UX design freeze (2026-11-28 HKT)

**Owner-approved design; frozen, not implementation acceptance.** [Videos UX Design Freeze v1.0](docs/design/SDL-UX-002/videos/README.md), [design record commit `8944524`](https://github.com/Happydogg/swallows2026/commit/8944524421f15da0ac7776de863cdf54b51326ae). The public-safe specification is archived on `docs/SDL-UX-002-videos-freeze` under the existing SDL-UX-002 design archive. Full internal handoff and original renderings are retained separately.

Scope: guardian and staff galleries, independent concurrent roles, multi-team selection, cross-team Review Videos, shared Watch/Analyze player and responsive layouts. Review uses simplified content-approval playback rather than biomechanics analysis. Future engagement and advanced capture/upload remain deferred.

Ownership: SDL-UX-002 owns design fidelity and device QA; SDL-004B owns role/capability reconciliation (including Team Manager approval/delegation); SDL-004D owns submission review, SDL-004E secure media access, SDL-005 capture/upload integration, SDL-000 coordination and SDL-GOV release evidence. Confirm scope against the independent Master Directory. This design milestone neither supersedes the November 27 implementation/owner-acceptance evidence below nor clears outstanding media, authorization, or release gates. No new feature implementation, branch merge or deployment authorized.

---

## SDL-000 UX-IA-05 deployed checkpoint (2026-11-27)

**This is the latest coordination status for Issue #12 and supersedes earlier UX-IA-01 candidate-only notes below. Preserve the old records as history.**

[Issue #12 latest handoff](https://github.com/Happydogg/swallows2026/issues/12#issuecomment-7215859630) reports that UX-IA-01, 02, 03, 04 and 05 have been merged to `feature/SDL-UX-002-login-redesign` and deployed to the UX staging review sites. GitHub confirms PR #13–17 merged. **Owner acceptance:** IA-01, IA-02 and IA-04 accepted; IA-03 non-video portions accepted with video still blocked; IA-05 visual review pending. IA-06 mobile/cross-role QA is next, not yet accepted.

**IA-05:** [PR #17](https://github.com/Happydogg/swallows2026/pull/17) merged at `9437a44faf3d8bfaca7f9f65ddeabae7cf52cb4c`, source candidate `261a216bb4b1c7a0b2c038c8436323440aa6a967`. Me/account/preferences grouped; restricted family/staff/enrollment components remain gated; existing photo directory retained. Six presentation/test files, no intended RBAC/backend/media modifications. Configured isolated regression build passed; 8/8 Vue/performance smoke checks visible, other test output truncated.

**Directly verified deployments:** Cloudflare Pages `sdl-ux-live` deployment `2c151c7b-68c6-4260-840c-f18f0cae23dc` success, and `sdl-ux-preview` deployment `ad310875-8399-423f-aca2-36c41f0c0d86` success, both commit `9437a44faf3d8bfaca7f9f65ddeabae7cf52cb4c`. These are Pages project 'production' environments *within UX review projects*, NOT SDL production pilot approval.

**Backend handoff:** SDL-004 owns the private-media compatibility/authorization blocker from IA-03. Legacy media RPC fail-closed status must not be bypassed. No unrestricted playback, storage exposure or media/RBAC gate relaxation. SDL-UX owns accurate unavailable-vs-denied UI feedback and IA-06 cross-role usability QA. Production pilot and full independent security acceptance remain pending.

---

## 2026-11-27 UX-IA-01 approved implementation candidate

**Supersedes Issue #12's earlier 'approval pending' status for UX-IA-01 only.** The owner approved **UX-IA-01** after the current-desktop visual evidence supplement. [Issue #12](https://github.com/Happydogg/swallows2026/issues/12) now has two comments: [visual evidence supplement](https://github.com/Happydogg/swallows2026/issues/12#issuecomment-7214518696) and [approval/implementation candidate](https://github.com/Happydogg/swallows2026/issues/12#issuecomment-7214618734).

**Draft [PR #13](https://github.com/Happydogg/swallows2026/pull/13)** is confirmed open, draft, unmerged; branch `task/sdl-ux-ia-01` head `239e29c5655ca692908d182b6b05158463c31ea9` targets `feature/SDL-UX-002-login-redesign`. The diff has seven presentation files and three updated tests. Changes place Team roster first, compact Home summaries, private video before gated submission UI, hide the legacy toolbar and move language to Me. Existing authentication, API contracts, DB, Worker and gates are stated unchanged in PR scope; this does not independently establish behavior.

**Testing status:** 17 focused source/syntax checks reported passing. Full Node/Vue regression suite NOT run; current signed-in mobile/desktop owner acceptance pending; preview auto-deploy disabled on review. Next gate is full regression and isolated preview/owner acceptance **before** any separately approved merge or promotion. Retain Round 2 12/12, ADMIN-01 5/5, RBAC-10A and direct authorization safeguards. UX-IA-02..06 remain proposed and unimplemented.

**Outstanding visual evidence:** Current mobile screenshots plus Team Manager, broader Guardian and Club Admin tabs, multi-role and empty/denied states; desktop captures do not settle phone usability.

---

## SDL-UX-002 usability audit handoff — issue #12 (2026-11-27)

**Proposed, not yet owner-approved for implementation.** The [read-only audit](https://github.com/Happydogg/swallows2026/issues/12) reviewed UX source baseline `c9ad810459db6e5ad4c5834f7e4882970842f987`. Its top issues: overlapping headers and workspace sections, full roster duplication on Home/Team, fragmented performance contexts, long mixed-content Player Profile and confusing legacy/disabled controls. SDL-000 independently spot-checked `index.html`, `CoachHome.js`, `AppShell.js`, `PlayerProfile.js` and `AppHeader.js` at the cited commit; source supports duplication/placement concerns, not final device usability conclusions.

**Suggested IA:** Retain the approved five tabs (Home, Team, Stats, Videos, Me). Home is a role-specific summary, Team is canonical roster, Stats is shared player-scoped performance, Videos is authorized private media, Me is account and permitted administrative settings. Player Profile uses contextual Overview/Growth/Stats/Videos/History groupings, retaining existing controllers, exports and permission gates. No new capabilities.

**Pending:** Owner approves or revises the IA before any UX-IA-01 coding. Obtain current authenticated synthetic-role mobile, tablet and desktop captures, including empty/denied states. UX-IA-01 through UX-IA-06 are proposed batches only. Preserve owner-reported Round 2 12/12 and ADMIN-01 5/5, and keep all SDL-004 security/release holds.

---

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
