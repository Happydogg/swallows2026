# SDL-UX-002-ADMIN-02 | Staff role management contract and integration gate

**Stage:** Approved to prepare frontend integration; **blocked for write-capable staging release** pending an independently reviewed authorized staff-directory contract.

**Coordination:** SDL-UX-002 owns the interface, SDL-004B-RBAC-02 owns backend role delegation and read contract, SDL-GOV owns independent authorization QA, SDL-000 maintains evidence and release status.

## Verified source baseline

- Frontend base: `feature/SDL-UX-002-login-redesign`, merged roster commit `c9ad810459db6e5ad4c5834f7e4882970842f987`.
- Supabase staging project: `wvurolqbjhuckkkjiiiv`. Read-only inspection on 2026-11-27 confirms `public.sdl_v5_set_staff(p_scope uuid,p_target uuid,p_role text,p_grant boolean,p_reason text)` is present and authenticated-executable; authorization is enforced by the function and `sdl_rbac_v5.team_role_gate`.
- Grant/revoke policy: **Club Admin** may assign/remove `manager` or `coach` within active teams in its authorized organization. **Team Manager** may assign/remove `coach` only in its assigned team. **Club Admin grant/revoke is Platform Admin only**, outside this UI. Self-delegation prohibited. Reasons required (1 to 500 characters). Dormant/revoked memberships and conflicting assignments require separate review; never auto-reactivate or retry after conflict.
- `public.sdl_004_pilot_administration(p_org)` requires club-admin authorization but returns only active staff/admin member IDs, display names, active teams and **explicit contact permissions**. It does **not** supply the authoritative current `manager`/`coach` role-assignment state, eligibility/revocation state or complete candidate lifecycle.
- The existing PilotWorkspace's **scoped staff permissions** section controls `family_contacts`, `registration_contacts`, `guardian_invite`, not manager/coach role assignments. Global `SUBMISSION_FEATURES_ENABLED=false` remains untouched.
- `sdl_v5_account_context` and `sdl_v5_authorized_roster` provide the acting account's own verified scopes and authorized players, not a staff-role directory for delegation targets.

## Minimal backend read contract needed before enabling UI writes

A separately proposed, approved, staging-tested **authenticated, organization-scoped, role-authorized staff directory** (name provisional: `sdl_v5_staff_directory`) must return:

1. A strict schema/version and requested organization UUID; active organization and authorized team identities.
2. Minimal **active eligible staff** identity records: stable user UUID, safe display name, current membership scope, and only fields required for delegation. No email, telephone, guardian or athlete information.
3. Current active `manager` and `coach` assignment rows by user/team/role and lifecycle status suitable for displaying a truthful **Grant** or **Revoke** action. Revoked/dormant/recovery-restricted assignments must never be silently represented as grantable; return an explicit safe unavailability marker instead of sensitive reason details.
4. Effective assignable actions for the **current authenticated actor** as a convenience to render controls, derived server-side and *rechecked inside the write RPC*. No frontend role hierarchy inference, no client-decided access control.
5. Page size/cursor limits (including bounded member and assignment output), stable ordering, account/session validity, and defensive handling of a changing organization or actor session.
6. Separate read scope for Manager only if approved; no cross-team, cross-organization or Platform Admin directory access via an ordinary account.
7. A meaningful refresh path after each write and after a PT409 conflict. No client-side direct reads of `organization_memberships`, `team_memberships` or `profiles`.

**No new function, privilege, RLS policy, migration or credential has been deployed for this contract.** Backend owner must approve the precise output schema and implementation before frontend integration can depend on it.

## Planned frontend integration after contract acceptance

- New focused staff-role service using only the signed-in Supabase client and narrow `sdl_v5_*` RPCs.
- Reuse the existing Club Admin/Team Manager scopes; keep the legacy PilotWorkspace staff **contact permissions** visually and logically separate.
- Use an explicit eligible member selector (never free-text UUID), authorized team selector, selected role, grant/revoke confirmation and nonempty reason. Prevent self-grant, request duplication, and stale scope action in the UI, with server always authoritative.
- Clear private lists and cancel in-flight reads on account, organization, team or workspace changes, including denial, 401 and 403. PT409 requires refresh/manual review.
- Do not add a Platform Admin role management surface, auto-reactivation, staff invitation, email discovery, guardian contact, new media permissions or broad table reads.

## Required QA before staging acceptance

1. Club Admin assigns Coach and Manager in its own active club/team; correctly reads assignment state and can explicitly revoke.
2. Team Manager assigns Coach only in assigned team; Manager assignment and cross-team attempts denied server-side.
3. Coach, Guardian, unrelated Club Admin, stale membership, unauthorized Manager, self-grant and synthetic Platform Admin impersonation negative direct-RPC checks.
4. Active/revoked/reassignment/recovery conflict cases and 1–500 character reason validation.
5. Role revocation impacts on previously issued permissions/invitations, multi-role preservation, current-session refresh, audit event correctness.
6. Existing ADMIN-01 registration/roster 5/5 browser acceptance, 155-test frontend baseline, performance corrections and private R2/media gate remain unaffected.
7. Owner functional browser acceptance with synthetic accounts, independent security review and a reversible deployment record.

## Acceptance and approvals

- **ADMIN-01:** Owner-reported five of five authenticated browser tests PASS; CI deployment checked (155 automated + one UI smoke), merged PR #9; **staging-verified for the tested UI workflows**. Independent security review and production pilot remain separate.
- **ADMIN-02:** Preparation approved; backend contract **pending**. No production deployment or role expansion authorized.
- **Next handoff:** SDL-004B-RBAC-02 should verify or implement the narrowly scoped directory and return source/migration/role-specific test evidence. SDL-UX-002 then integrates the UI on an isolated branch and runs regressions before requesting staging acceptance.
