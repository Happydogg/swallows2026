# Swallows DataLab | Decision Register (Working Mirror)

## 2026-11-27 | ADMIN-01 staging acceptance and ADMIN-02 scope authorization (latest)

| Decision ID | Owner decision | Stage and evidence |
|---|---|---|
| SDL-D-20261127-13 | Accept and close `SDL-UX-002-ADMIN-01` for the five tested staging UX workflows, preserving strict separation from the production pilot and independent backend security acceptance. | **Staging-verified for owner-tested UI flows.** Owner-reported 5/5 authenticated browser PASS, Cloudflare `sdl-ux-live` success at merge `c9ad810459db6e5ad4c5834f7e4882970842f987`, 155 automated tests and one UI smoke PASS, [PR #9](https://github.com/Happydogg/swallows2026/pull/9) merged. No independently attached browser assertion log. |
| SDL-D-20261127-14 | Approve start of `SDL-UX-002-ADMIN-02` Staff Management in this chat; reuse verified staff/delegation policies, no implicit grant of expanded authorization or production deployment. | **Approved to prepare, backend contract pending.** Staging has `sdl_v5_set_staff`, but `sdl_004_pilot_administration` does not expose current Manager/Coach assignments. Require a scoped authoritative staff-role read contract and independent security QA before enabling UI writes; [contract](docs/SDL-UX-002-ADMIN-02-STAFF-CONTRACT.md). |

These entries take precedence for ADMIN-01/ADMIN-02 over older coordination snapshots below; retain those snapshots as historical context.

---

**Updated:** 2026-11-27. Reconcile with original decisions and external SDL Master Directory; this is not a replacement for historical evidence.

| ID | Decision and rationale | State | Evidence / consequence |
|---|---|---|---|
| SDL-D-20261121-01 | Owner approved staging-only source, Supabase and Cloudflare changes. **No production mutations.** | Approved | Conversation scope; latest UX Pages deployments only |
| SDL-D-20261121-02 | Decode genuine video poster frames on demand from authorized MP4 in browser, clear on logout; do **not** expose private JPEGs publicly. | Implemented, automated-tested, deployed to UX Live | `js/videoThumbnail.js`, `composables/usePrivateMedia.js`, `components/PrivateMediaPanel.js`; user video thumbnail UAT pending |
| SDL-D-20261121-03 | Use existing server-role-checked stats RPCs for dynamic coach/family charts, no direct `sessions` SELECT or global RLS expansion. | Implemented, SQL QA and automated-tested, deployed to UX Live | `js/authorizedStatsService.js`; live PostgreSQL authenticated-coach claim 8 rows/unauthorized denied |
| SDL-D-20261121-04 | Add 15 demo club enrollments only in staging so mock histories work, default recording/sharing **off**, do not touch unrelated athletes. | Staging-verified | `backend/seeds/SDL-004-fixture-002-active-demo-enrollments.sql`; 15 active/15 recording disabled |
| SDL-D-20261121-05 | Do not misclassify private videos as batting/60 FPS. Require the user to identify movement and original FPS; label algorithmic judgments experimental. | Implemented, automated-tested, deployed to UX Live | `composables/usePrivateMedia.js`, `components/PrivateMediaPanel.js`; actual recording metadata persistence still missing |
| SDL-D-20261121-06 | Replace confusing mobile Team/Stats text-symbol icons with static SVGs, keep five tabs and desktop sticky sidebar. | Implemented, automated-tested, deployed to UX review sites | `components/AppShell.js`, source checkpoint `05fc32a6` |
| SDL-D-20261121-07 | Preserve SDL-004 v2 backend and frontend feature gates **off** until validated backup/restore, exact Auth confirmation and live role tests. | Release hold, not completed | Worker `SUBMISSIONS_ENABLED=false`; frontend `SUBMISSION_FEATURES_ENABLED=false` |
| SDL-D-20261121-08 | Keep scientific QA independent: no unsupported injury predictions, simulated velocities, or fixed thresholds promoted into AI Coach. | Approved architecture requirement, not implementation | SDL-006 research/integration workstreams |
| SDL-D-20261121-09 | Present the **same private, permission-enforced video room inside Player Profile** and retain Videos tab; never present the disabled legacy empty gallery in place of actual R2 clips. | Implemented, automated-tested, deployed to UX Live | `PlayerProfile.js` named slot and `index.html`; real coach/parent UAT pending |
| SDL-D-20261121-10 | Select player history through the active role’s approved scope and invalidate pending profile results on navigation or identity changes. | Implemented and locally tested | Full suite 405/405. Signed-in staging acceptance pending. |

## Decisions and holds recorded 2026-11-27

The following add to, and do not replace, the historical entries above. **Reported execution status is not independently verified security acceptance.**

| ID | Decision / owner direction | Classification | Evidence / remaining gate |
|---|---|---|---|
| SDL-D-20261127-01 | Adopt SDL-004 RBAC permission specification v5.1 for five roles PA, CA, TM, CO and GU; allow independent multi-role accounts. | Approved policy, restricted staging implementation reported | v5.1 amendment; PR #7 and 22 public v5 RPCs observed |
| SDL-D-20261127-02 | Permit controlled staging deployment despite independent QA FAIL for unrestricted installation; retain restrictive mode. | Owner-approved restricted staging deployment, NOT unrestricted acceptance | Hosted migration 20261126235408; Worker version 2cd3f378-5636-466a-beac-aa4c6a48097c; both observed |
| SDL-D-20261127-03 | Freeze new feature scope; finish approved frontend UX before pilot. | Owner-approved development direction | SDL-UX-002 owns complete role-aware UI based on existing design |
| SDL-D-20261127-04 | Owner performs smoke and functional testing using VS Code Live Server; repeat critical flows on hosted staging. | Approved testing process, NOT waiver of security gates | Synthetic role accounts required; direct RLS/PostgREST/Worker denial tests remain mandatory for release |
| SDL-D-20261127-05 | Keep SUBMISSIONS_ENABLED=false and the 18 temporary media/shared-session RPC restrictions until applicable findings are resolved. | Operational hold | Media authorization, subject confirmation, consent/provenance and negative tests remain; restrictions owner-reported |
| SDL-D-20261127-06 | Resolve historical-consent broadening only on approved evidence, not by inventing fresh consent; retain objections and audit. | Approved safeguards / privacy release hold | v5.1 amendment section 3; privacy review and reconciliation needed |
| SDL-D-20261127-07 | Preserve Platform Admin provider MFA recovery gate; no synthetic global PA grant activated as part of installation. | Security hold | Verify provider MFA and AAL1 viewing versus AAL2 download/export, sensitive writes and recovery |
| SDL-D-20261127-08 | Reconcile fourteen source migration files to the single hosted bundled ledger version before future CLI push. | Mandatory migration governance hold | Hosted migration 20261126235408 independently observed; detailed per-file reconciliation pending |
| SDL-D-20261127-09 | Do not merge PR #7, deploy production, onboard real families or open unrestricted media as part of this planning handoff. | Release hold | PR #7 confirmed draft/unmerged; independent security QA previously FAIL |
| SDL-D-20261127-10 | Backend workstream owns twelve synthetic identities, scoped club/team/guardian assignment and server-side authorization defect triage; SDL-UX owns UI integration and owner UAT; SDL-000 manages cross-workstream gates. | Coordination assignment, execution pending | Synthetic provisioning script prepared, not executed; separate owner approval for privilege-granting/provisioning actions |
| SDL-D-20261127-11 | Earlier Goal 2C manual workflow pass and owner-deferred remaining tests remain distinct from the new RBAC security release criteria. | Evidence preservation | Prior Goal 2C report, automated fixture cleanup reconciliation outstanding; no implicit security pass |

**Implementation note:** These entries are a working coordination mirror. Reconcile with the independent Master Directory and operational release ledger before treating them as a final governance register.

| SDL-D-20261127-12 | Owner reports E2E Round 2 passed 12/12 and accepts roster integration for staging UX; proceed with approved MVP completion without feature expansion. | Owner-reported staging UX functional acceptance, NOT independent security sign-off | SDL-UX-002 handoff of November 27; Round 1 8/3/1 superseded only for rerun scenarios; raw matrix, identities and build evidence not supplied to SDL-000. Production, unrestricted media, PR merge and real-family onboarding remain withheld. |

**Non-decisions:** No permission to merge `main`, deploy production, auto-delete seeded enrollments, weaken player RLS or publish private media. A successful unit test is not a final owner acceptance test.
