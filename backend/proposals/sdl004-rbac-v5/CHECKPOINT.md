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

## Official performance and growth

Q14–Q16, F07 and F08 now use distinct named operations. Synthetic RPC tests cover club-admin direct entry, correction, duplicate retry, invalidation, denial of pending review and independent coach approval. Growth role attribution and manager permissions still need expanded tests. Correction evidence must document the reason for the replacement. Historical submissions and official revisions remain in place.

## Media authorization

Q19–Q24, F01, F10 and F12 now have object-specific decisions for playback and download, transactionally recorded download authorization, retention deadline checks, independent review and scoped publication. Staff and guardian uploads require current recording authorization at reservation and finish. Non-coach uploads are pending. The v1 player-level RPC denies requests following migration. Legacy-only media needs an independently verified provenance and client cutover plan. Four authenticated integration scenarios passed. Reject deadlines require an approved retention policy. External distribution stays closed.

## Clubhouse and consent

Q17, F06 and F09 have a synthetic integration test covering an official session, a legacy receipt, a fresh standing receipt, a second guardian's withdrawal, a later first-guardian grant, restored agreement and a foreign team. Five integration scenarios passed. Both video and statistics receipts consult category-specific preferences. The new session projection requires an explicitly classified protocol and matching notice. Approval of the notice, historical preference reconciliation and review of new categories remain release gates.

## Exports and audit

Q18 and Q25 include bounded official-statistics export pages and v5 audit pages. Role and generation checks apply to each page. Guardians can read only the download-authorized projection for their child. The test confirms current-club scope and historical guardian scope after enrollment ends. Six authenticated integration scenarios passed. Historical audit stream consolidation and additional export formats remain follow-up work.

## Roster and transfers

Q07–Q08 now have roster ending, scoped internal requests, destination approval, and a cross-club completion workflow. The latter requires source club, destination club and verified family authority. It creates a separate destination player record for the same athlete. The synthetic test checks the destination receives no source player record, the old assignment ends and approval cannot be replayed. Seven integration scenarios passed.

## Local restrictions and verified unlinking

Q13 and F04 have separate team/club participation restrictions and a global relationship transition that consumes an operator-verified case. The local restriction preserves own-child history and other roles, while blocking new affected guardian submissions. Verified grounds, dispute handling and recovery remain operational release requirements. All eight scenarios passed in PGlite and independently on an isolated native PostgreSQL 17 server using synthetic JWT/session fixtures.

## Final integration and verification

The private profile, family, team support, scoped history, audit and Worker contracts are now in the candidate. The final integration migration preserves the older RPC signatures, binds the review queue to current team membership, records team scope at event time and separates an explicit official correction reason from its source evidence. The packaged Worker recognizes v5, validates the requested object, and reauthorizes compatible legacy playback. A native competing-correction test identified a lock upgrade conflict. Locking the previous revision before inserting the replacement and using a compatible player lock resolved it.

The final npm suite passed 360 tests with zero failures or skips. The Worker build and package check passed. A separate run on native PostgreSQL 17.12 passed all 11 authenticated integration scenarios and two competing-writer checks. A local PostgREST 16.6 process verified an allowed private-history RPC, an unauthorized account, direct-table denial and revocation. Both native services used synthetic records and local authentication. The SQL postflight passed on a fresh native fixture. The 347-test baseline preceded the implementation. See the decision matrix, API and release guide for the remaining acceptance gates.

## MEDIA-03A

See the [clean-start implementation checkpoint](MEDIA-03A.md) for the exact baseline, provisional migration map, closed gates, local verification approach and proposed staging sequence. The original v5.1 installation and provider security holds continue.
