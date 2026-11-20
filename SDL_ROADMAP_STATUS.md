# Swallows DataLab | Roadmap Status (Evidence-based)

**As of:** 2026-11-21. **Scope:** Current GitHub branch and independently checked staging services; not a production readiness certificate.

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

- `docs/SDL-000-20261121-STAGING-COMPLETION-SPRINT.md`: detailed mutation, tests and rollback.
- GitHub code checkpoint `05fc32a67079973b435591a994396e68e5ec408a`.
- `sdl-ux-live`: 129/129 focused tests and 1/1 Vue renderer test; Cloudflare deploy succeeded.
- `sdl-ux-preview`: 7/7 package isolation tests; Cloudflare deploy succeeded.
- Staging SQL: verified 15 active synthetic enrollment records, all recording/storage not authorized. Database JWT-claim QA: coach 8 rows; no JWT denied.
- No production mutation. No new Worker deployed or setting changed in this sprint.

## Next critical path

**P0:** Run signed-in real-device coach/parent/admin flow tests, direct unauthorized API checks, and verified staging backup/isolated restore. **P1:** With these gates passed, separately activate the installed SDL-004 pilot workflows in staging, test email invitation and Clubhouse consent/withdrawal. **P2:** High-speed video validity, cached private thumbnail infrastructure, and SDL-006 science QA.

**Owner approval needed for:** production deployment or destructive cleanup; staging changes were already authorized in this sprint but remain subject to security/recovery checks.
