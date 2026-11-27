# SDL-004-RBAC-10A | Performance revision integrity

Status: staging-deployed; hosted SQL assertions passed; browser and independent security acceptance pending.

- Staging migration 20261127075638_sdl004_v5_performance_revision_integrity.
- Source commit cc71c44c164fe739ed0c4904d43af8d17832a32e; implementation blob 1bd29187953d48d558abe74d71900175b2a16618.
- Source: performance-revision-integrity.sql. Rehearsal: performance-revision-rehearsal.sql (requires transaction and synthetic batch). Reconcile the hosted ledger and source migration chain before CLI push; do not reapply.
- Ran candidate plus synthetic assertions in one rollback-only transaction before applying. Repeated assertions in rollback-only transaction after applying.
- Verified official entry, guardian submission, review isolation, blank reason and direct correction bypass denials, private core ACL, exact retries, changed reason conflicts, stale supersession, retention and invalidation, active chart/export results, reason in authorized history, guardian correction proposal requiring reason on approval.
- Actual owner browser test pair: 60 km/h superseded; 54 km/h current. Four authorized identities passed v5 chart/history and export checks; legacy coach and guardian chart RPCs returned only 54. History retained both, including correction reason.
- Before and after counts: 122 sessions, 2 performance submissions, 25 players, 2 media objects; 1 superseded and 1 invalidated. No rehearsal events retained. All 18 existing held RPCs remain unexecutable by anon, authenticated, service_role.
- Current-session predicate preserves legacy unsuperseded sessions; official export/Clubhouse retains existing attestation, invalidation, source hash and consent checks. This is not a blanket assertion that all historic raw measurements are certified official.
- Leaderboard/shared session queries incorporate the predicate; positive sharing consent and end-to-end leaderboard acceptance remain pending. Shared-session hold remains.
- Existing RPC signatures and return types unchanged. History includes official_correction event with details.reason. Pending parent correction approvals with supersedes require a nonblank 1–500-character coach reason, unlike ordinary approvals. UX should make this conditional reason visible.
- Rollback strategy: preserve all measurements and audit records; prefer forward correction. Do not restore reasonless public correction access or old chart projection in a live environment. If necessary, contain affected public RPCs with explicit authorization and test on clone.
- No frontend/Worker deployment, no PA grant or production changes. Existing security QA/privacy gates remain.
