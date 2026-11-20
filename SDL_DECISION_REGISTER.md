# Swallows DataLab | Decision Register (Working Mirror)

**Updated:** 2026-11-21. Reconcile with original decisions and external SDL Master Directory; this is not a replacement for historical evidence.

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

**Non-decisions:** No permission to merge `main`, deploy production, auto-delete seeded enrollments, weaken player RLS or publish private media. A successful unit test is not a final owner acceptance test.
