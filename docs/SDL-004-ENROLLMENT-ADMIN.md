# SDL-004 manual Club Enrollment Administration pilot

Implemented locally from `6ea53b876eb0d7e46b404ce99dd9c00e82253257` on `codex-SDL-004`.
Manual management by authorized organization administrators is the approved pilot approach.
Registration automation is deferred and is **not a prerequisite for this pilot**.

Both v2 gates remain false. No live SQL, deployment, provider setting/secret change, push, merge
or production access occurred. SQL tests ran only in isolated synthetic PGlite fixtures.

## Interface and workflow

The new Vue component appears for administrator navigation hints or server-confirmed administrator
clubs. Navigation hints do not confer authority: the server checks every organization read/write.
After backend enablement, an administrator explicitly selects one authorized club, then searches
existing club athlete profiles. Names are grouped by athlete within that club; each query returns
at most 100 cards. A literal, case-insensitive server name search can narrow results.

Each card displays the preferred name and short roster reference, enrollment state/dates, current
recording/storage authorization and its evidence reference, and effective optional Clubhouse
consent status/policy. It excludes dates of birth, family contacts, guardian identifiers, registration
numbers, video metadata and private audit details. Evidence references are escaped text, not links.

Actions use an inline review step naming the athlete, selected club and proposed change:

- Create active enrollment for an existing club athlete who has no enrollment.
- Inactivate or record a genuine club departure. Both invalidate continuous-enrollment consent and
  clear recording permission under the existing lifecycle trigger.
- Reactivate/rejoin using the existing enrollment ID. Generation rotation prevents previous consent
  or recording permission from returning. A verified guardian must grant fresh Clubhouse consent.
- Record/update or revoke recording/storage authorization. Both require a newly entered evidence
  reference (1–500 trimmed characters), an explicit evidence-review acknowledgement and confirmation.
  Current evidence is displayed separately and never prefilled into a new decision. Grants are
  offered only for active enrollments. The administrator is responsible for checking the actual
  approved evidence; the reference field is not an evidence-document verification service.

Internal team changes are not enrollment actions. The interface warns against using inactivation
or departure for a team transfer. It never edits team assignments or official statistics.
Recording permission and optional guardian Clubhouse consent are clearly separate. There is no
administrator control to grant parental consent or publish a clip. Revocation does not delete media.

Club switching, refresh, logout/account changes and permission failures clear child rows, staged
changes and evidence drafts. Requests are aborted and late results are ignored after scope or
identity changes. A failed/uncertain mutation is not automatically retried: actions are removed
until current server state is reloaded. Successful mutations refresh the selected club summaries.

## Verified existing mutation contracts, reused unchanged

| Worker route | Caller-authorized Supabase RPC |
| --- | --- |
| POST `/v2/club-enrollments` | `sdl_004_set_club_enrollment(p_athlete uuid, p_organization uuid, p_status text, p_enrollment uuid DEFAULT NULL)` |
| POST `/v2/club-enrollments/:id/recording` | `sdl_004_set_recording_permission(p_enrollment uuid, p_allowed boolean, p_permission_ref text)` |

Both functions recheck active session, active profile, active organization and active administrator
membership. The enrollment RPC checks athlete/club and enrollment/club consistency; recording
permission derives the club from the actual enrollment. An administrator of one club cannot supply
another club's enrollment ID to bypass authorization. Multi-club administrators are independently
authorized for each club. No mutator signatures, role rules, table-write grants or lifecycle
semantics were changed. There are no browser table writes or service-role keys.

These existing mutations lock the enrollment row; they do not accept an optimistic generation
argument. The UI rejects objects outside its loaded club/enrollment snapshot, but does not claim
an atomic stale-edit conflict guarantee between independent administrators. Refresh before shared
operator edits and verify multi-operator behavior during staging QA. Consent-generation security
and authorization remain enforced by the existing server functions/triggers.

## Small read-side addition to the pending backend

The previous contract provided guardian-only consent reads, so it could not populate an administrator
picker safely. Two narrow read RPCs were added to the same **unapplied** migration:

- `sdl_004_admin_organizations()`: only clubs for which the authenticated caller is currently an
  active administrator; curated id/name only.
- `sdl_004_admin_enrollments(p_organization uuid, p_query text DEFAULT '')`: explicit club-admin check,
  one summary per club athlete, latest/current enrollment, effective recording and consent state,
  no family fields or audit actors. Search is literal, bounded to 100 characters, with 100 results.

They use fixed search_path, RLS-protected source objects and explicit EXECUTE grants. Browser roles
still have no direct writes to the five v2 tables. The Worker forwards caller bearer authentication,
not a service-key read, through:

- GET `/v2/admin/organizations`
- GET `/v2/admin/enrollments?organization_id=...&q=...`

The pending database contract advertises `enrollmentAdmin:true`. The Worker exposes that capability
only when returned by the database, and rejects administration reads without it. The service also
requires the exact core revision and the admin capability. The existing frontend and Worker flags
remain the outer gates. Encoded Unicode/query search is permitted only in query parameters;
absolute URLs, encoded path traversal, malformed escapes and fragments remain rejected.

No extra tables, compatibility migrations, dependencies, secrets, resource bindings, paid features
or deployment configuration changes were introduced.

## Changed files

| File(s) | Change |
| --- | --- |
| `components/ClubEnrollmentAdmin.js` (new) | Mobile-friendly club picker, athlete cards, evidence review and inline action confirmation |
| `composables/useEnrollmentAdmin.js` (new) | Scoped reads/actions, decision drafts, loading/error/empty states and identity-safe cleanup |
| `index.html`, `js/app.js` | Component registration, controller binding, login loading and logout/unmount cleanup |
| `js/submissionService.js` | Admin capability, curated DTOs, scoped read methods and existing mutation adapters |
| `js/privateMediaService.js` | Safe percent-encoded query transport without encoded-path support |
| `backend/worker/submissionRoutes.mjs` | Two authenticated read routes, admin capability negotiation and input validation |
| `supabase/migrations/20261116184847_sdl004_submission_workflows.sql` | Two scoped read RPCs/EXECUTE grants and capability marker, pending only |
| `backend/release/staging-preflight.sql` | Reject partially present administration RPCs |
| `tests/enrollmentAdmin.test.mjs` (new) | Controller/service authorization, scope changes, evidence, lifecycle, disabled gate and account cleanup |
| `tests/enrollmentAdminSql.test.mjs` (new) | Actual isolated SQL admin authorization, minimal projections, existing lifecycle/permission mutations and cross-club isolation |
| `tests/enrollmentAdminWorker.test.mjs` (new) | Bearer/scoped RPC forwarding, unauthorized/direct-call denial, evidence and default-off behavior |
| `tests/helpers/workerHarness.mjs` | Synthetic administrator capability and per-club authorization mocks |
| `tests/privateMedia.test.mjs` | Actual query transport and unsafe-route rejection |
| `tests/vueBindings.test.mjs` | Real Vue compilation/rendering of admin states, confirmation and private-state cleanup |
| `docs/SDL-004-CLUB-CONSENT.md`, `docs/SDL-004-STAGING-RELEASE.md`, this document | Approved manual-pilot status, current validation and staging prerequisites |

## Validation

- `npm run check:worker`: local Cloudflare/Vite build and staging target/default-off package checks pass.
  The release check still requires a reviewed deployed Worker metadata baseline; local build is
  not deployment approval.
- `npm test`: **208 passed, 0 failed, 0 skipped**. All 173 baseline scenarios remain included; 35
  administration/transport cases were added. Includes real local SQL, actual Vue compiler/renderer,
  local workerd with outbound traffic forbidden, and explicitly synthetic Worker/R2 mocks.
- Syntax checks pass for **69 JavaScript modules**; `git diff --check` passes.
- No live administrator authorization, native mobile layout, actual backend API or production test
  was run. Local schema fixtures and mocks do not prove deployed grants, RLS or provider configuration.

## Remaining staging prerequisites

1. Review this checkpoint and the amended pending migration. Confirm target project
   `wvurolqbjhuckkkjiiiv` and reconcile actual schema/history using the guarded read-only preflight
   only after separate authorization. All five new tables and pending functions must be absent;
   stop if this version is already deployed. Back up staging and preserve existing pilot counts.
2. With explicit approval, apply the pending migration and deploy the reviewed staging Worker,
   initially keeping both gates false. Preserve existing secrets/bindings/observability using the
   existing metadata baseline and release guard. Run postflight and compare data/grants.
3. Provision/test actual authorized administrator accounts through the existing trusted membership
   process. Validate existing athlete/club profile mappings and approved evidence references. The
   interface does not create athlete profiles, grant administrator roles or upload evidence documents.
4. Under separately approved Worker QA enablement, test direct RPC/API reads/writes as authorized
   administrators with one and multiple clubs, non-admin coaches/parents, suspended/revoked admins
   and expired sessions. Verify no cross-club projection/write, consent grant by administrators,
   statistics editing, accidental media deletion or old-consent restoration.
5. Use synthetic records to test create, inactive, departure and same-ID rejoin; recording grant,
   revocation and evidence; team transfers that preserve enrollment; fresh guardian acceptance;
   multiple operators and interrupted/uncertain requests. Reconfirm relevant v1 behavior.
6. Only after backend deployment and live authorization tests pass, review enabling the frontend
   gate and conduct mobile/small-screen testing of selects, confirmation, long references, empty
   search/results, logout and account/club switching. Keep all v2 operations disabled until then.

Manual authorized administrators maintain the enrollment ledger for the pilot. Registration
synchronization remains future work, not a release blocker. Existing backup, audit/retention,
rollback, single-subject publication, private-media and production-separation rules still apply;
see [SDL-004-STAGING-RELEASE.md](SDL-004-STAGING-RELEASE.md).
