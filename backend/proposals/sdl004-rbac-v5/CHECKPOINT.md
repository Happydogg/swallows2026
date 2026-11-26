# RBAC v5 implementation checkpoint

Branch `feature/SDL-004-rbac-v5` at entry was `49f41814339586a2fa1d43ff3dd2691f2e458d03`, matching draft PR 7 against `sdl-staging`. The prior checkout was clean. The checkpoint adds four specification, proposal and test files over its base. Review applies to this source branch. Its Worker and migrations differ from other SDL development branches.

## Baseline and caller inventory

Both locked npm installs passed with lifecycle scripts disabled. The Worker built and passed its package check. The baseline suite passed 347 tests with zero skips. SQL coverage runs under synthetic PGlite. Packaged Worker coverage runs under local workerd.

- The two historical migrations define the v2 submission, consent, enrollment, performance, invitation, contact and audit contracts. Core identity, organization, team, player, media and membership tables are prerequisites. The test harness supplies those objects.
- Worker v1 routes in `pilot.mjs` call the separate media permission RPC before R2 access. V2 routes in `submissionRoutes.mjs` and `pilotWorkflowRoutes.mjs` use caller-scoped RPCs, with resource and lifecycle checks. The submission feature gate remains part of dispatch.
- Existing helpers serve multiple workflows. Changing coach or guardian eligibility globally would also change invitation, approval, media or sharing behavior. V5 integrations need operation-specific wrappers and tests for every historical entry point.
- Hosted migration versions need reconciliation with source before release. The live Worker version could not be independently verified during this audit. Reconcile the deployable bundle and binding names before proposing rollout.
- External distribution and permanent deletion require separate privacy and operational review. Preserve existing consent receipt meaning, private storage, and closed feature gates.

## Baseline decision matrix

P = partially implemented. M = missing. C = conflicts with earlier semantics. B = blocked by privacy or release requirements. T = candidate present with insufficient tests. Each row records the baseline gap, independent of later phase checkpoints.

| Decision | State | Required integration |
|---|---|---|
| Q01 | T | MFA-scoped platform reads with operation audit |
| Q02 | P | Club-scoped player, history and video reads |
| Q03 | M | Team settings, archive and support workflow |
| Q04 | M | Scoped player registration |
| Q05 | P | Baseball field updates and revision events |
| Q06 | P | Verify all role-specific avatar paths against target schema |
| Q07 | M | Team transfer and destination approval |
| Q08 | M | Both clubs and guardian authorize transfer |
| Q09 | B | Verified deletion, retention review and recovery |
| Q10 | P | Family contacts and scoped grants |
| Q11 | P | Separate legal identity and registration projections |
| Q12 | P | Guardian contacts, registration maintenance and audit |
| Q13 | C | Local revocation independent of guardian identity |
| Q14, Q15 | C | Direct official entry for club/team administrators and coach |
| Q16 | P | Scoped growth revisions for all four roles |
| Q17 | C | Consented session-level results and classified metrics |
| Q18 | M | Private bounded exports and audit |
| Q19, Q20 | P | Club and team scoped audited downloads |
| Q21 | P | Separate guardian own-child downloads and teammate streams |
| Q22 | C | Pending non-coach uploads through every media route |
| Q23 | P | Rejected object retention and read authorization |
| Q24 | B | Scoped unpublish, withdrawal, retention and external release gate |
| Q25 | P | Scope existing audit streams and add download events |
| Q26 | P | Preserve guardian-supervised MVP paths across new endpoints |
| F01, F02 | M | Global audited exports and reasoned private corrections |
| F03 | T | Independent multi-role authorization in actual caller context |
| F04 | M | Local restrictions and verified global unlink |
| F05 | P | Current assignments and historical guardian access |
| F06 | C | Guardian-specific objections and reviewed resolution |
| F07 | P | Scoped official correction and derived record invalidation |
| F08 | P | Preserve coach-only pending review across all write routes |
| F09 | B | Classified metric catalog, standing receipts and privacy review |
| F10 | P | Retention window shared by all download paths |
| F11 | B | Club admin is sole operational approver; distribution requires rights review |
| F12 | C | Independent staff video approval and consent-gated publication |

## Phase 1

The candidate private predicates now run through a fixture definer RPC under an authenticated SQL role. The predicates use the owner's private-table access while retaining the caller's identity. A restricted maintenance function performs initial platform grants or revocation with an immutable event in the same transaction. Revoked platform grants require separate recovery review. Platform MFA uses the validated JWT assurance claim. No user is seeded. The isolated foundation test passed before CLI migration generation. Operator identity is the database session user for maintenance events. A shared operator login requires a separately attributable operational approval.

## Staff delegation and Q04

The authenticated delegation and registration test applies both historical migrations and the v5 migrations. It exercises AAL2 club delegation, manager restrictions, atomic coach prerequisites, removal, registration retries and denial after role removal. Q04 is locally tested. Internal and cross-club transfers require additional workflow coverage.

## Guardian invitations and contacts

The family migration binds new manager invitations to an issuing team and rechecks the issuer, recipient, current assignment and enrollment at redemption. Existing unredeemed invitations require reissue. Revoked relationships cannot be reactivated by redemption. Contact and registration reads use distinct field projections. Q10–Q13 and F04 still need lifecycle and editing coverage. Both authenticated integration scenarios passed locally.
