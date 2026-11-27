# Swallows DataLab | Roadmap Status (Evidence-based)

**As of:** 2026-11-27. **Scope:** Current GitHub branch and independently checked staging services; not a production readiness certificate.

## E2E Round 2 update: 2026-11-27

**Owner-reported acceptance:** E2E Round 2 **12/12 PASS**. Roster integration is accepted for **staging UX** only. This supersedes Round 1's 8 PASS / 3 FAIL / 1 PENDING for the scenarios covered by Round 2. The exact assertion list, source revision, identity ledger and direct backend security coverage were not provided in the handoff.

**MVP next work:** SDL-UX-002 finishes other approved existing flows, tests role-aware navigation, responsive behavior and regressions for Coach, Guardian and dual-role users. SDL-004 owns any remaining direct roster RPC/security defects and restricted functions. SDL-000 tracks acceptance and release holds. No new features.

**Next evidence request:** Obtain owner Round 2 test matrix, synthetic identities/scope verification, tested frontend commit and environment, negative-access results, and remaining screen-by-screen MVP gaps. Prior notes that 12 identities had not been provisioned are historical and should not be interpreted as current proof that they are absent or present.

**Release gate unchanged:** SDL-004 remains staging-deployed in restricted mode. Independent security QA, direct authorization/consent and media tests, migration reconciliation, recoverable backup/restore and formal pilot approval remain outstanding. No production deployment, real-family onboarding, unrestricted media/RPC activation or PR merge is authorized.

---

## Current roadmap overlay: 2026-11-27 (supersedes older status snapshot below)

**Project strategy:** No feature expansion. Complete the approved frontend and test actual workflows against the currently restricted staging backend. Do not use frontend button visibility as authorization evidence.

### Current verified and reported state

| Workstream | Current stage | Next acceptance threshold |
|---|---|---|
| SDL-004 RBAC v5.1 | **Staging-deployed, restricted.** Supabase 22 v5 RPCs, 11 named session/account policies and bundled migration ledger observed read-only; Worker active version observed. | Credentials/scoped-role UAT, independent negative direct API tests, unresolved security/privacy QA findings, recovery evidence |
| SDL-UX-002 | Approved role-adaptive UX and implemented feature-branch components; existing UX reviews and tests recorded separately | Inspect latest source; integrate against the exact installed v5.1 contract, preserve old behavior, owner Live Server plus hosted staging acceptance |
| SDL-004 synthetic testing | Twelve synthetic identities and relationships planned; provisioning script prepared | Controlled provisioning, role grant verification, known cleanup ledger; no global Platform Admin activation |
| SDL-GOV | Independent QA FAIL for unrestricted staging; restricted-mode owner authorization | Track restricted RPC list, migration ledger reconciliation, backup/isolated restore, privacy approvals, formal sign-offs |
| SDL-005 | Existing video workflow and browser analyzer work may continue | Preserve private media controls and scientific uncertainty; no unrestricted media activation |
| SDL-006 | Independent scientific QA continues | No unverified biomechanics claims or new AI Coach features promoted into MVP |

### Task ownership and execution queue

| Priority / task | Responsible workstream | Required artifact / outcome | Execution status |
|---|---|---|---|
| P0 SDL-004-RBAC-CONTRACT | Backend RBAC + SDL-UX-002 | Reconciled API/role-to-screen matrix, deployed RPC and Worker gate inventory, feature flags and branch baseline | Planning, read-only |
| P0 SDL-004-SYN-12 | Backend RBAC workstream | Create exactly 12 approved synthetic identities, verified team/club/guardian links, scripted cleanup ledger and no global PA privilege | Prepared; NOT executed |
| P0 SDL-UX-002-INTEGRATE | SDL-UX-002 and Codex | Five-tab role-aware MVP with PA/CA/TM/CO/GU UI paths; preserve current permissions; disabled routes clearly unavailable | Pending integration and source review |
| P0 SDL-UX-UAT-01 | Project owner + SDL-UX-002 | Stepwise Live Server checklist with PASS/FAIL/BLOCKED plus screenshot/network evidence; repeat critical flows on hosted staging | Pending |
| P0 SDL-004-SEC-REMEDIATE | Backend RBAC + independent SDL-GOV security QA | Fix observed defects, verify direct RPC/table/R2 deny paths, session revocation, multi-role isolation, subject and consent boundaries | Outstanding; unrestricted QA FAIL |
| P0 SDL-004-MIG-LEDGER | Backend RBAC + release owner | Map all 14 source migration files/checksums to single hosted version, block unsafe future CLI push | Pending reconciliation |
| P0 SDL-004-RECOVERY | Backend + SDL-GOV | Verified hosted backup and isolated restore, containment/rollback rehearsal, provider MFA recovery and exact Worker/source/bindings | Outstanding |
| P1 SDL-004-GATES | Backend + SDL-GOV + owner | Individual evidence-backed release decisions for each restricted media/shared-session capability and submission gate | Blocked; leave off |
| P1 SDL-000-PILOT-DECISION | SDL-000 + owner | Review all accepted UAT, security, consent, recovery and rollback evidence; explicit pilot scope and authorization | NOT authorized |
| Parallel SDL-005 / SDL-006 | Their dedicated workstreams | Video/scientific verification consistent with restricted MVP; no scope expansion | Independent |

### Critical path to first production pilot

1. **Inventory and baseline:** Confirm UX and backend source branches, v5.1 API contracts, current Worker flags/restrictions, 14-to-1 migration ledger, and deployment identities. Document conflicts.
2. **Synthetic identities:** Backend provisions the 12 approved synthetic accounts and exact assignments in staging with no global PA activation. Verify each login and server-recognized scope.
3. **Frontend MVP integration:** SDL-UX-002 implements only approved role-specific navigation and workflows. Keep backend permission checks server-side and disabled features unavailable.
4. **Owner functional acceptance:** Test Coach, Guardian, Club Admin and Team Manager with synthetic accounts in Live Server; record PASS/FAIL/BLOCKED; repeat critical login, playback, CORS and authorization on hosted staging. Platform Admin restricted paths require separately approved synthetic access.
5. **Defect correction and negative tests:** Codex fixes narrowly scoped frontend/backend bugs; backend/independent QA exercises direct RLS, RPC, account/session revocation, multi-role and cross-team/cross-club denial, media subject and consent checks. UI success does not override security FAIL.
6. **Security/privacy/recovery gates:** Reconcile historical assignment and consent, media rights and retention, private avatar storage, MFA recovery, exact migration ledger and protected backup/restore. Keep remaining RPCs disabled until each restricted path is approved.
7. **Pilot release decision:** Independently re-review the resolved blockers and perform full hosted staging rehearsal. Only a separate explicit owner decision may authorize production deployment or real-family onboarding.

**Stop condition:** Any unresolved P0 unauthorized access, privilege escalation, consent violation, unreviewed media exposure, or unverified recovery path blocks production. Features not cleared may be excluded from a restricted pilot only when technically inaccessible and explicitly approved as out of pilot scope.

### Environment and evidence checkpoint

- Supabase staging ID: wvurolqbjhuckkkjiiiv; observed hosted bundled migration 20261126235408; 22 public sdl_v5_* functions and 11 matching account/session policy names.
- Cloudflare Worker sdl-r2-staging-gate: observed active version 2cd3f378-5636-466a-beac-aa4c6a48097c at 100% traffic.
- GitHub source: feature/SDL-004-rbac-v5, PR #7 draft/unmerged, head 6331aa965f8afaac50862a75a71993da0d7ae4c9. Separate UX branch feature/SDL-UX-002-login-redesign.
- Owner handoff reports 14 source migrations installed in one bundle, 18 temporarily restricted media/shared-session RPCs, preserved 19 players / 120 sessions / 2 media rows, and no global PA grant. These specifics were not all independently verified by this coordination review.
- Live Server uses a different origin from Cloudflare Pages. Final auth, OAuth redirects, CORS and video behavior must be checked on hosted staging.

**Approvals NOT granted:** PR merge, production, real-family onboarding, unrestricted media/RPC access, destructive migrations or deletions, synthetic global PA privilege, automatic consent broadening. This document updates a working GitHub mirror, not the independent project directory or final release record.

---

| Workstream | Planned | Verified implementation stage | Remaining release requirements |
|---|---|---|---|
| SDL-001/002 | Coach roster, profiles, official measurements and core workflow | Original implementation preserved in GitHub; complete behavior parity **not proven** | Authorized edit/log flows, regression and device UAT |
| SDL-003 | Modular Vue architecture, resilient mobile load | Implemented; native modules preserved; runtime Tailwind CDN still in use | Pinned compiled CSS, offline/poor-network field UAT |
| SDL-004 Auth | Login, roles, verified guardian/coach/admin, secure sessions | Staging core deployed; same-user tab resume owner-tested for 60 seconds | Revocation and role negative tests, identity provider/email confirmation checks |
| SDL-004 R2 | Private videos in staging R2 with authorized playback | Staging deployed; user previously reported playback | Thumbnail/video owner UAT, retry and bandwidth tests |
| SDL-004 Pilot v2 | Invites, growth corrections, performance submissions, coach approval, Clubhouse | Migration ledger shows workflow objects installed; source/isolated tests exist; **both v2 gates remain OFF** | Recoverable backup, Worker activation QA, Auth confirmation, role tests and approval |
| SDL-004 Demo | 15 mocked players, 8 growth sessions each, permission-scoped live stats | 15 club enrollments and 120 sessions in staging; live stats UI deployed | Signed-in coach/guardian test on live site |
| SDL-UX | Role-adaptive dashboard, scrolling roster, hero card, unified Edit Player and authorized player video section | Two UX review sites deployed, automated passing | Real device fidelity, private thumbnail/video and photo UAT, field use acceptance |
| SDL-005 | Capture high-FPS video, visual mechanics, drill review, genuine previews | Pose-overlay analyzer and lazy genuine previews implemented | Captured frame-rate validation, recorded media metadata, persistent secure posters, high-FPS optimization |
| SDL-006 | Independent science QA and evidence-gated AI Coach | Research/integration requirements organized | Claim-level independent QA and validated coaching requirements |
| SDL-GOV | Documentation, rollback, release gating, feature parity | New staging sprint record and decision mirror established | Verify backup restore, master directory reconciliation and production release approval |

## Recent source and deployment evidence

- SDL-004 dual-role history regression repaired in source commit `6f1ebe66a99ca5ec0895e21a2851482c668160ba`. Full local suite passed 405/405. Both Pages review URLs still serve `0a3ec0881eb2be93967fdef271d4d6d3a18a8336`. See `docs/SDL-000-CODEX-OVERNIGHT-RESULT-20261121.md` for browser evidence and signed-in acceptance blockers.

- `docs/SDL-000-20261121-STAGING-COMPLETION-SPRINT.md`: detailed mutation, tests and rollback.
- GitHub code checkpoint `05fc32a67079973b435591a994396e68e5ec408a`.
- `sdl-ux-live`: 129/129 focused tests and 1/1 Vue renderer test; Cloudflare deploy succeeded.
- `sdl-ux-preview`: 7/7 package isolation tests; Cloudflare deploy succeeded.
- Staging SQL: verified 15 active synthetic enrollment records, all recording/storage not authorized. Database JWT-claim QA: coach 8 rows; no JWT denied.
- No production mutation. No new Worker deployed or setting changed in this sprint.

## Next critical path

**P0:** Run signed-in real-device coach/parent/admin flow tests, direct unauthorized API checks, and verified staging backup/isolated restore. **P1:** With these gates passed, separately activate the installed SDL-004 pilot workflows in staging, test email invitation and Clubhouse consent/withdrawal. **P2:** High-speed video validity, cached private thumbnail infrastructure, and SDL-006 science QA.

**Owner approval needed for:** production deployment or destructive cleanup; staging changes were already authorized in this sprint but remain subject to security/recovery checks.
