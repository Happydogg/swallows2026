# Swallows DataLab | Roadmap Status (Evidence-based)

**As of:** 2026-11-27. **Scope:** Current GitHub branch and independently checked staging services; not a production readiness certificate.

## Videos UX design closure and next UX priority (2026-11-28)

**Closed: SDL-UX-002 Videos UX visual/design phase v1.0.** Owner approval and dedicated documentation branch verified through [spec](https://github.com/Happydogg/swallows2026/blob/docs/SDL-UX-002-videos-freeze/docs/design/SDL-UX-002/videos/README.md), [freeze commit](https://github.com/Happydogg/swallows2026/commit/8944524421f15da0ac7776de863cdf54b51326ae), [mirror update](https://github.com/Happydogg/swallows2026/commit/8a8da9548d6b2a75524b5beca5efe3ac1a0c6afd). This newly approved design is **not implemented, tested, mobile-accepted or deployed**. Do not confuse it with existing synthetic staging UX-003 functionality already deployed.

| Workstream | Assigned dependency / next verifiable outcome | Current state |
|---|---|---|
| **SDL-004B** | Confirm authoritative Team Manager review/approval/delegation and exceptional guardian-plus-staff effective capability matrix; no frontend-driven grants | **Pending contract reconciliation** |
| **SDL-004D** | Map authorized content approval/rejection, next-item workflow, independent audit and failure paths to existing backend | **Design handoff; implementation not authorized** |
| **SDL-004E** | Confirm private/shared media access, current team scope, standing consent, publication and controlled download enforcement | **Security acceptance separate; existing gates retained** |
| **SDL-005** | Integrate existing high-FPS analyzer and video preparation without changing validated overlay/camera precision; advanced recording/batch upload deferred | **Future implementation dependency** |
| **SDL-UX-002** | Follow approved gallery, responsive player hero, Watch/Analyze, simplified Review design; prepare device acceptance and implementation handoff only when authorized | **Design frozen; coding/device acceptance pending** |
| **SDL-000 / SDL-GOV** | Reconcile original design/public references with independent Master Directory, resolve duplicate dated decision IDs, change control, rollback and formal release | **Documentation reconciliation outstanding** |

**Implementation details explicitly unresolved by source specification:** fourth activity-filter label requires original approved reference/category schema; Team Manager review authority cannot be inferred from role label; rejection reason and exceptional guardian-only team destination require narrower implementation decisions. Do not treat comments, thumbs-up, reactions or advanced camera/batch workflows as approved scope.

**Next UX priority recommended (not approved for coding):** SDL-UX-002 undertakes a separate, read-only **non-Videos interface clarity audit** of Home, Team, Stats, Me and Player Profile focused on reducing dense explanatory copy, repeated controls and mobile scroll length. Preserve consent disclosures and safety/error context, all accepted working flows, and the Videos freeze. Deliver a priority-ranked screen-by-screen proposal with before/after visual references; no application changes.

**Governance warning:** `SDL-D-20261128-01..03` identifiers collide between the frozen Videos docs branch and the existing SDL-000 coordination mirror. Preserve both originals; resolve centrally before merging registers. The independent Master Directory could not be located in accessible Project/Library sources. The two documentation branches are divergent and must be reconciled with controlled changes, not merged wholesale. No new deployment or permission change authorized.

---

## P0/P1 UX-003 remediation candidate (2026-11-28)

**Current checkpoint, retaining all previous QA issues and history below.** [Draft PR #21](https://github.com/Happydogg/swallows2026/pull/21) remains **unmerged**; active accepted UX staging source still `4590f86c458cacc461f45a8e62aeeda470e8646e`. Reviewed remediation source `8f8c9813aef064bba0e9a782a865793934370d90`, handoff-only tip `f4b452105fd23c5e37a09bf41b32742da83e370f`. [Handoff](https://github.com/Happydogg/swallows2026/blob/f4b452105fd23c5e37a09bf41b32742da83e370f/docs/design/SDL-UX-003/P0P1-QA-HANDOFF.md).

| ID | Status at this checkpoint | Next owner / acceptance gate |
|---|---|---|
| **UX-QA-01 · P0** | **Preview prepared / approval pending.** `http://127.0.0.1:5500` planned synthetic local environment, no approved active candidate deployment; hosted Worker preflight not verified in Codex environment. | SDL-000 + owner + RBAC-05: confirm hosted Worker/CORS/Auth redirect, existing staging permissions and exact SHA, approve isolated target; record rollback. Remote iPhone/Android device cannot use a tester computer's loopback address directly. |
| **UX-QA-02 · P1** | **Fix implemented, local tests reported PASS.** Stale consent context invalidated; current consent generation reread before explicit v2 decision. | RBAC-05 to inspect existing service consent GET/POST generation and revocation; UX-002/owner signed-in Guardian same-player enrollment/role tests. |
| **UX-QA-03 · P1** | **Fix implemented, local tests reported PASS.** Save-ready notice tied to live object URL and clears at 60s/close. | UX-002/owner actual iPhone/Android authorized Save, expiry, background/switch and revoke tests. |
| **UX-QA-04 · P1** | **Existing behavior verified by local test.** Review→Library clears private selection and requires fresh authorization. | UX-002 owner device usability confirmation; no authorization shortcut. |
| **UX-QA-05 · P1** | **Existing behavior verified by local tests.** Home/inbox independent server counts, scope-bound requests, stale cancel and mutation receipt refresh. | UX-002/RBAC-05 signed-in count/race test; do not require equal totals across different server snapshots. |
| **UX-QA-06/07 · P2** | **Open.** Legacy duplicate disclosure and 320px potential crowding. | UX-002 device visual assessment; separate authorized presentation batch if warranted. |

**Reported automated verification:** `npm test` **530/530** (14 additional cases over previous 516), UX-003 subset **73/73**, Vue **8/8**, UX build **178/178**, Worker local package PASS with release-preservation warning open. Counts overlap. This run is **Codex locally reported**, with log/manifest held outside GitHub and no new PR-tip CI status verified; previous [independent CI 516/516](https://github.com/Happydogg/swallows2026/actions/runs/46025411813/job/140595434819) is historical baseline, not substitute for new-source verification.

**Critical path:** (1) RBAC-05 review consent generation check/current Worker and origin/binding inventory, (2) acquire reproducible exact-source CI evidence or reviewer-verifiable local logs, (3) SDL-000/owner explicit approval for exact isolated synthetic preview and rollback, (4) UX-002/owner sign-in synthetic cross-role/browser/iPhone/Android QA, (5) SDL-GOV release-preservation and deferred security negatives, then separately decide combined staging merge/promotion. **No approval to merge/deploy in this update.**

---

## P0 UX-002 independent QA / UX-003 integration readiness (2026-11-27)

**Current checkpoint supersedes the earlier UX-IA-01–06 and media-planning status snapshots below; preserve those as dated history.** Working mirror only; not a production authorization.

| Gate / workstream | Evidence state | Decision |
|---|---|---|
| SDL-UX-002 independent source review | **Completed/read-only**; [diff](https://github.com/Happydogg/swallows2026/compare/4590f86c458cacc461f45a8e62aeeda470e8646e...0120c6b74b048478e52e83c39bef011dcd2d02b3) accepted baseline `4590f86c...` vs candidate `0120c6b...` = 10 ahead, 0 behind, 22 changed paths | Source QA accepted for validation. Existing five-tab, stats authority (54 current / 60 superseded), role-scoped roster/profile and media paths substantially preserved. No frontend authorization bypass found in reviewed source, not proof of backend security. |
| SDL-UX-003 automated verification | [GitHub Actions](https://github.com/Happydogg/swallows2026/actions/runs/46025411813/job/140595434819) pinned to `0120c6b...`: Worker local check PASS, `npm test` **516/516**, UX-003 **59/59 included**, Vue smoke **8/8**, UX build **178/178**, **91 static files** | **Tested: PASS**. Totals overlap; no full device/browser acceptance established. Worker release-preservation warning remains. |
| Backend/media staging development | [RBAC-05 conditional approval](https://github.com/Happydogg/swallows2026/issues/19#issuecomment-7222808064), rollback-only SQL negative/revocation and owner reported **74/74 applicable** signed-browser checks | **Conditional synthetic development acceptance**, not final signed HTTP security release. Remaining outsider/revocation/network-concurrency/save cases deferred. |
| Authenticated synthetic candidate browser/device UAT | UX-002 prepared **12-case** acceptance matrix; **no cases executed** on an approved candidate preview | **P0 HOLD** before final combined staging acceptance; verify iPhone Safari / Android Chrome, 320/375/390/430px, tablet, desktop, and Coach/CA/Manager/Guardian/dual-role. |
| Frontend integration / environment | Existing active staging `feature/SDL-UX-002-login-redesign` at `4590f86c...`; isolated UX-003 at `0120c6b...`; candidate preview reported queued, no verified accepted candidate deployment | **No merge or deployment authorized.** Verify exact active SHA, preview origin, binding/observability preservation and rollback before requesting owner approval. |
| Production pilot | Independent security, release preservation, mobile and recovery gates not complete | **HOLD**. No real family media or expanded child-data sharing. |

### UX-002 independent QA issue register

| ID | Severity | Finding / verification classification | Accountable owner / next acceptance |
|---|---|---|---|
| UX-QA-01 | **P0** | No approved authenticated candidate preview for integrated UAT. **Environment/acceptance blocker**, not a confirmed frontend defect | SDL-000: obtain separately approved isolated synthetic testing target; no automatic preview activation |
| UX-QA-02 | **P1** | Guardian same-player account or enrollment-context changes may retain stale consent status. **Source-confirmed lifecycle risk**, live impact not tested | SDL-UX-003 + SDL-004B-RBAC-05: targeted invalidation/refetch and same-ID generation/role change tests |
| UX-QA-03 | **P1** | Download-ready text may persist after 60-second save link expiry or close. **Source-confirmed messaging issue**, not evidence of URL retention | SDL-UX-003: clear/update notice on expiry and close; regression test |
| UX-QA-04 | **P1** | Moving into Review resets previous private Library selection; navigation usability effect **unverified** | SDL-UX-003: focused workflow and state-reset tests without loosening access |
| UX-QA-05 | **P1** | Home count and Review inbox fetched independently; concurrency/refresh consistency **unverified** | SDL-UX-003 + SDL-004B-RBAC-05: role/scope switch, conflict and same-snapshot semantics |
| UX-QA-06 | **P2** | Legacy `Submissions and Clubhouse` disclosure still surfaces below Library and duplicates concepts. **Source-confirmed presentation clutter** | SDL-UX-003: preserve disabled gate; simplify placement only if approved |
| UX-QA-07 | **P2** | Potential 320px compact-layout crowding. **Device hypothesis, not a confirmed defect** | SDL-UX-002: device/cross-role screenshot and accessibility review |

### Ordered integration/acceptance plan

1. **SDL-000:** Register this source QA handoff; keep original UX-002 and UX-003 evidence. No combined merge/staging deployment as part of documentation reconciliation.
2. **SDL-UX-003:** Propose narrowly scoped remedies for `UX-QA-02` and `UX-QA-03`, dispositions for `04..07`; preserve single optional Option C consent, `can_download`, two-step save, and held private/legacy routes. Any code change requires repeat exact-source full regression.
3. **SDL-004B-RBAC-05:** Confirm adapter/service and complete deferred signed HTTP role isolation, consent withdrawal/unpublication, revoked-session, late revocation/concurrency and download negative tests before production. Do not treat conditional development acceptance as unconditional.
4. **SDL-000 + SDL-GOV:** Review staging Worker version/bindings/observability, actual frontend Pages origin and exact isolated preview/rollback plan. Request explicit owner approval for synthetic candidate staging environment and later merge/promotion.
5. **SDL-UX-002 + owner:** Execute 12-case authenticated device matrix: Coach, Club Admin, Team Manager, Guardian, dual role, Team/Stats/Me and Videos; iPhone Safari / Android Chrome at 320/375/390/430 CSS pixels, tablet/desktop; 54 current vs 60 superseded; MP4/MOV playback, download save and consent/role lifecycle. Record observed PASS/FAIL separately from source inference.
6. **SDL-000:** Accept or reject combined staging only with exact commit, CI evidence, UX-002 and RBAC-05 reviews, rollback and distinct approval. Production remains a later decision.

Evidence: [Issue #19](https://github.com/Happydogg/swallows2026/issues/19); [CI job](https://github.com/Happydogg/swallows2026/actions/runs/46025411813/job/140595434819); [UX-003 handoff](https://github.com/Happydogg/swallows2026/blob/0120c6b74b048478e52e83c39bef011dcd2d02b3/docs/design/SDL-UX-003/FINAL-VIDEO-INTEGRATION-HANDOFF.md); [RBAC-05 conditional handoff](https://github.com/Happydogg/swallows2026/issues/19#issuecomment-7222808064).

---

## SDL-UX-002 final restructuring status (2026-11-27)

**Latest checkpoint; earlier UX-IA-01–05/candidate and media-blocker snapshots below are historical.**

| Batch | Implementation / staging status | Owner acceptance |
|---|---|---|
| UX-IA-01 | Merged and staging-deployed | Accepted: Home/Team/Videos and five-tab placement |
| UX-IA-02 | Merged and staging-deployed | Accepted: Stats Overview/Record/Review and revision presentation |
| UX-IA-03 | Merged and staging-deployed | Non-media accepted; private-media behavior tracked separately with SDL-004 |
| UX-IA-04 | Merged and staging-deployed | Accepted: visual consistency and accessibility presentation |
| UX-IA-05 | Merged and staging-deployed | Accepted: Me/account and gated administration presentation |
| UX-IA-06 | [PR #18](https://github.com/Happydogg/swallows2026/pull/18) merged at `bbe5582cc40f20e7b56417670d98162fb35a4dfb`; QA-only | Configured build and 8/8 Vue/performance smoke reported; **physical device/role UAT not completed** |

**Frozen UX implementation:** Five-tab navigation and previously approved player/roster/stats/video/account work should be preserved. Do not add further redesign or product features. Existing Round 2 12/12 and ADMIN-01 5/5 are owner-reported historical acceptance; performance correction shows 54 current vs 60 superseded. Full regression aggregate counts truncated in some Cloudflare logs, so exact full total is not independently reconstructed.

**Current separate integrated baseline:** GitHub `feature/SDL-UX-002-login-redesign` HEAD `2d12a56eb773f22d1fa8e54b3b2d12c14557463d` is **eight commits after** IA-06 merge and includes SDL-004 media changes. Cloudflare Pages verified successful deployments at this HEAD: UX Live `6c0bba9b-dea0-4b5a-aaa3-455959212610`, UX Preview `f4d12dac-ebd6-44fb-9fc9-6403ee0edbb7`. The subsequent media staging workflow, private review and permission checks need independent acceptance; UX-002 restructuring cannot certify them.

**P0/P1 follow-up ownership and gates:**
- **SDL-UX-002 + owner (P1):** Authenticated real iPhone/Android, tablet and desktop flows; keyboard/focus/zoom/print; all approved roles and dual-role switching; empty, denied and loading states; after-media integration regression. Preserve data/role scope and media cleanup after logout.
- **SDL-004B-RBAC-05 (P0):** Complete targeted private-media and independent-review authorization, signed JWT/HTTP negative role tests, recovery and private object lifecycle checks. Plan publication/consent/team download separately; no implicit release of held gates.
- **SDL-UX-003 (parallel P0 prototype):** [Issue #19](https://github.com/Happydogg/swallows2026/issues/19) owns separately committed Action Center/Video Review Inbox synthetic presentation. Integration blocked by new read-contract and shared-file agreement; not part of accepted UX-002 baseline.
- **SDL-GOV / SDL-000 (P0):** Independent security and privacy signoff, backup/restore, migration ledger reconciliation and formal pilot release decision, with separate owner authorization for production or real-family onboarding.

**Decision:** Freeze completed restructuring; continue scoped defects and acceptance. No production deployment, no feature expansion, no unrestricted media or PR merge authorized by this coordination checkpoint.

---

## UX IA-01 through IA-05 checkpoint (2026-11-27)

**Latest status (supersedes earlier candidate-only notes below):** Source PRs #13–17 merged; owner accepted IA-01, IA-02 and IA-04; IA-03 non-video functions accepted with private-media blocker open; IA-05 staging deployed, awaiting owner visual review. IA-06 mobile/cross-role QA is the next UX step. These are UX review staging deployments and do not authorize SDL production.

**IA-05 evidence:** [PR #17](https://github.com/Happydogg/swallows2026/pull/17) merged at `9437a44faf3d8bfaca7f9f65ddeabae7cf52cb4c`. [Issue #12 handoff](https://github.com/Happydogg/swallows2026/issues/12#issuecomment-7215859630) reports 8/8 focused Vue/performance smoke checks visible and full regression gate success with remaining logs truncated. Cloudflare directly shows successful `sdl-ux-live` deployment `2c151c7b-68c6-4260-840c-f18f0cae23dc` and `sdl-ux-preview` deployment `ad310875-8399-423f-aca2-36c41f0c0d86`, both at the PR #17 merge commit.

**Next actions:** (P0 SDL-UX) Owner visually checks IA-05 Me/preferences, existing role switch, gated tools, photo directory and sign-out; IA-06 tests mobile phone layouts, Club Admin/Team Manager/Coach/Guardian/multi-role navigation, focus/accessibility and screenshot evidence, preserving Round 2 12/12, ADMIN-01 5/5 and RBAC-10A. (P0 SDL-004 media) Independently diagnose and repair legacy-vs-v5 media authorization transport under approved scoped rights, with positive/negative tests and no loosening of gates. (P0 SDL-GOV) Complete consent/provenance, direct API, recovery and security gates.

**Prohibitions:** No new features, production pilot deployment, real-family onboarding, RBAC/consent expansion, unrestricted media or destructive migration. UX acceptance != backend security acceptance.

---

## UX-IA-01 approved candidate update (2026-11-27)

**Owner approval:** The proposed first UX-IA-01 batch is approved and has a source implementation candidate on [draft PR #13](https://github.com/Happydogg/swallows2026/pull/13). GitHub confirms head `239e29c5655ca692908d182b6b05158463c31ea9`, target UX feature branch, and 10 changed files (seven presentation, three tests). The source and issue comment report 17/17 focused assertions passed. **Full regression/Vue renderer and authenticated staging owner acceptance not run. No merge or manual deployment.**

**Candidate scope:** Home summary without duplicated full roster, Team canonical roster/registration, private Videos first, legacy toolbar hidden, language in Me; retain Guardian shortcuts and existing controllers, RBAC, media and feature gates. Existing issue proposal is superseded by owner approval only for UX-IA-01. **UX-IA-02..06 remain separate proposals, not yet authorized.**

**Immediate critical path:** (1) independent source/diff and regression verification including full existing suite; (2) confirm testable isolated preview without accidental release; (3) synthetic-role mobile and desktop owner UAT, including Coach/Guardian/Club Admin/Team Manager and multi-role switch; (4) re-run previously accepted Round 2 12/12, ADMIN-01 5/5 and RBAC-10A chart/history as relevant; (5) separately review any merge/promotion request. Preserve backend restricted mode and security release hold.

**Supplementary visual audit:** Nine current desktop-layout captures reported in Issue #12 comment. Coach Team and Videos showed gated submission content ahead of useful roster/media sections. Missing current phone and several role-specific captures; do not mark mobile visual acceptance.

---

## UX restructuring proposal: issue #12 (2026-11-27)

**Proposed, not authorized for implementation.** SDL-UX-002 read-only review at source baseline `c9ad810459db6e5ad4c5834f7e4882970842f987` reports overlapping headers/sections, duplicate Home roster, fragmented Stats context, long mixed-content Player Profile and misleading legacy/disabled controls. See https://github.com/Happydogg/swallows2026/issues/12. Source spot-check corroborates duplication, but device-level UX impact needs current authenticated screenshots.

**Next critical path:** (1) Owner review/approval or revision of IA; (2) obtain synthetic-role mobile, tablet and desktop current captures; (3) approve bounded UX-IA-01 only after mapping regressions and actual current branch; (4) implement presentation-only changes, preserving approved five tabs, stats readers, roster, private-media controllers, role gates and disabled pathways; (5) rerun owner-reported Round 2 12/12, ADMIN-01 5/5 and navigation/authorization regression on staging. UX-IA-02..06 remain proposals subject to separate reviews.

**Release holds unchanged:** No new features, no PR merging, no production deployment, no unrestricted media, no feature gate activation. Independent security acceptance pending.

---

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
