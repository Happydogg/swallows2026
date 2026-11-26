# Review, staging acceptance and rollback

The candidate is ready for independent source review. Hosted installation is blocked pending a reconciled source/schema/Worker baseline and a separately authorized staging change. The two historical migrations depend on earlier core tables, policies, indexes and grants created outside this checkout. Preserve the existing release manifest, database backup, private storage inventory and recoverable Worker package before planning any rollout. Keep environment-specific findings and recovery material in the private operations record.

## Migration ledger

Apply the fourteen CLI-generated files in filename order as a unit on an isolated clone first. Each file is transactional. Each row depends on its predecessors and the historical pilot contracts. The migration names below are suffixes of the versioned files in [the migrations directory](../../../supabase/migrations/).

| Migration | Schema, permission and compatibility impact | Verification and containment |
|---|---|---|
| foundation | New private schema, platform grants, append-only events, role and action predicates. Empty initial grant table and restricted operator maintenance. | Check schema ACLs, no seeded administrators, AAL1 denial, AAL2 eligibility and operator audit. Retain all private tables on rollback. |
| staff | Authenticated delegation and registration RPCs. Existing memberships are preserved. New grants and required organization staff prerequisites are atomic. | Try manager delegation outside scope, duplicate registration and stale grant replay. Disable the two RPCs for containment. |
| family | Add invitation issuance scope and a v5 marker. Replace invitation and contact functions. Existing pending invitations need reissue. | Verify correct recipient, issuer removal and split field projections. Suspend invitation and contact routes on rollback. |
| performance | Allow official source labels for club and team administrators. Replace operation-specific code without rewriting measurements. | Check source identity, pending review, revisions and current official projections. Retain all new source labels and revisions during rollback. |
| media | Add nullable rejected-access deadline and staff upload types. Close old player-only grants, introduce object authorization. No R2 objects are moved. | Verify recording, subject, retention, disabled gate, range playback and independent approval. Suspend delivery if Worker and database versions differ. |
| consent | Add private preferences, classified protocols, an official-results page index and the v5 notice version. No existing receipt is upgraded. | Check agreement, objection, old receipts, invalidated sources and bounded pages. Suspend sharing on uncertain historical preferences. |
| reporting | Authenticated official export and minimal audit pages. Protected event and measurement rows remain private. | Check each scope and reauthorization on every page. Disable reporting endpoints independently. |
| roster | Add transfer requests with expiry, source membership and enrollment generation. Old team and player records remain. Cross-club completion creates a destination registration. | Verify competing changes, direction of approvals, preserved identity and source history isolation. Suspend transfer writes during rollback. |
| guardian_lifecycle | Add local restrictions and one-use verified cases. Restriction changes participation. Global unlink changes verified status and invokes existing consent invalidation. | Check independent roles and historic own-child access. Retain restrictions, objections, used cases and audit on rollback. |
| profiles | Add private baseball revisions and guardian-owned phone entries. Provide scoped family/registration reads, support-case corrections and team setting changes. | Verify stale-edit conflicts, revoked profile approval and field-level access. Preserve private revisions and existing contact values. |
| completion | Advertise v5 in the existing contract. Bind media lists, review queues, private history and exports to current scope. Capture future team audit scope and forward minimal pilot activity. Add independent subject confirmation and explicit correction reasons. | Check the complete native and Worker suites. A previous Worker version can require a scoped compatibility plan before resuming service. |

| p1_authentication | Adds action-specific assurance, active-account checks on existing session paths and restrictive core RLS. | Review AAL1 view and playback, AAL2 exports and attachments, ordinary roles and first-profile redemption. |
| p1_history | Adds private per-record evidence and retained media rights. Installs no historical evidence. | Verify provenance, continuing original authority, rights, retention and historical-only read limits. |
| p1_consent | Adds immutable objection and resolution records, reviewed expansion evidence and a private dry-run inventory. | Reconcile original receipts and objections. Confirm blank evidence keeps expansions closed. |

See the [P1 caller inventory](P1.md) for action policy, recovery and residual copying risk.

## Reproduction

Run `npm ci --ignore-scripts`, `npm ci --prefix backend/worker --ignore-scripts`, `npm run check:worker` and `npm test`. The npm regression suite uses PGlite, synthetic sessions, frontend harnesses, mocked provider decisions and packaged Worker checks.

For native verification, provide local PostgreSQL 17 binaries, the entry file of the Node `pg` client and the PostgREST executable. Run the following from repository root with these three environment variables set to their absolute local paths.

```sh
node tests/native/rbacV5.mjs
```

`SDL_TEST_PGBIN` points to the directory containing initdb and pg_ctl. `SDL_TEST_PG_MODULE` identifies the pg entry file. `SDL_TEST_POSTGREST` enables the HTTP boundary checks. The runner initializes a disposable Unix-socket PostgreSQL cluster and a loopback PostgREST process, generates a temporary signing key, exercises synthetic sessions, and removes its disposable cluster. It accepts no hosted connection string. The reviewed run used PostgreSQL 17.12 and PostgREST 16.6.

## Acceptance gates

1. Obtain authoritative core DDL, schema exposure settings, current migration ledger, function and table ownership, policy inventory, Worker bundle and binding contract. Reconcile differences privately with the release owner. Confirm the exact approved source revision.
2. Test a backup restore and apply the baseline to a disposable clone. Run [the read-only preflight](preflight.sql) before any v5 migration. It checks known function bodies, core RLS and direct write grants. Independently inspect all direct reads, views, storage policies, service credentials and exposed schemas. Any unresolved mismatch blocks release.
3. Apply the fourteen migrations only to the approved disposable database. Run [the read-only postflight](postflight.sql) immediately after installation, before synthetic platform provisioning. Confirm private ACLs, empty platform grants, definer search paths and immutable audit. Repeat local abuse-resistant role and scope scenarios using synthetic records in that clone.
4. Obtain privacy and operational sign-off on the standing notice, legacy consent and objections, guardian disputes, global recovery, media subject evidence, retention deadlines, download obligations and external rights. Verify legacy-only assets and enrollment changes individually. Keep ambiguous assets and preferences private. Review private avatar storage separately. Permanent deletion needs its own verified process.
5. The release owner approves the staging migration and compatibility window separately from a Worker deployment or gate activation. Capture restore evidence, release version and acceptance owner. Verify role transitions using the staging auth provider, MFA, PostgREST, private storage, byte-range playback and download history before calling the candidate Staging Verified.
6. Production requires a separate decision, deployment record and verification. This candidate authorizes no provisioning, public distribution or deletion.

## Rollback and containment

For an uninstalled candidate, withhold the migration and Worker release. For an installed candidate, first suspend the affected client entry points and private-media delivery under the release operator's separate authorization. A disabled Worker gate alone cannot close direct PostgREST RPCs. Preserve a private ACL snapshot first. On an isolated clone rehearse revoking execute privileges from `PUBLIC`, `anon`, `authenticated` and `service_role` for public `sdl_v5_*` RPCs and affected historical public pilot RPC entry points. If affected callers cannot be bounded, suspend the entire pilot API while reviewing the graph. Private helper revocation by itself does not stop definer-owned calls.

Preserve grant revocations, objections, transfer history, official corrections, audit rows, private objects and retained media. Avoid restoring an older Worker while a less-restrictive media RPC is available. Restore the last reviewed public contract or repair forward only after reviewing compatibility with new source types, receipts and revisions. Re-run preflight, postflight, positive and negative access scenarios and the backup/restore rehearsal. Re-enable the reviewed endpoints only with explicit release approval.
