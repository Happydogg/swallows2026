# SDL-004 RBAC v5 implementation candidate

Status: **partial backend candidate, NOT deployed, tests authored but not executed**.

Owner-approved product policy: [v5.0](../../../docs/SDL-004_Account_Roles_and_Permission_Specification_v5.0.md).

## Package

- `01_role_foundation.review.sql`: private-schema platform grant table, active-session/profile and AAL2 checks, scoped role predicates for existing club/team/enrollment/guardian relationships, explicit initial action gates. No grant rows, browser grants, public RPCs, changes to existing policies, or rollout changes.
- `tests/rbac-v5-foundation.test.mjs`: disposable PGlite fixture tests for roles, scope, dual roles, denied cross-club access, revoked sessions and memberships, ended enrollment, historic guardian access, MFA, and private schema ACLs. This mock auth fixture is not proof of hosted authorization.

The SQL is a review proposal deliberately outside the migrations directory. Do not run against hosted databases. Run locally from repository root after installing locked test dependencies: `npm ci --ignore-scripts`, then `node --test tests/rbac-v5-foundation.test.mjs`. Also run existing full regression suite and Worker build using the existing release instructions. Convert the reviewed SQL to a new CLI-generated migration; never edit previously applied migrations.

## Remaining integration and acceptance

1. Reconcile current staging migration history and repository base; inspect all existing RPCs, grants, RLS, media routes and actual release settings. Use an isolated disposable copy and synthetic data. Record recoverable backup and rollback evidence before any hosted changes.
2. Add controlled, audited Platform Admin grant/revocation with separate provisioning approval, and authenticated server-side role assignment, roster, registration, transfer and guardian lifecycle operations. Keep global guardian relationships distinct from local team/club access. Validate same-scope target identity and concurrent mutations. No generic client writes.
3. Integrate player scope predicates into explicitly allowlisted statistics reads/writes, official entry and corrections, growth and profile edits. Parent performance approval remains assigned Coach only. Preserve revision checks, protocols, actor identity, evidence and independent pending review. Never broaden a shared helper without tracing every caller.
4. Integrate media viewing, upload, review, publication and download through both database and Worker paths. Role eligibility alone never authorizes media: verify enrollment, consent, retention, subject permissions and audit. Preserve private R2, existing routes/bindings and compatibility. Do not enable external distribution until privacy release review is cleared.
5. Implement enrollment-scoped consent conflict handling, validated baseball metric classification, full consented official session projections, exports and scoped audit access. Keep unrelated private information out of Clubhouse. Version notices and review new metric categories; do not auto-share sensitive data. Guardians must retain own-child history; former staff access must end.
6. Test every allow/deny action across two independent clubs, multiple teams and guardians, role transitions, revocation, direct REST/RPC access, race conditions, R2 downloads and publication. Run positive and negative authenticated-role tests and existing regression suite. Verify audit and rollback, including provider-specific behavior that local mocks cannot cover.
7. Review each incremental migration independently. Obtain separate staging migration/activation approval with actual backup and release evidence. No production migration, privilege activation, secret changes, data deletion or gate changes are included.

Unspecified actions remain denied. This initial package is not a complete authorization implementation. Internal environment-specific security audit details are not published in this public repository.
