# SDL-004 release-blocker checkpoint

Prepared on `codex-SDL-004` from `76b205859982de51ffac202e64954e908f5a8242`.
The checkpoint SHA is reported by Git/the final handoff; it is not embedded into its own contents.

| Area | Result |
| --- | --- |
| Windows backup preparation | PASS locally: secure wrapper, full PostgreSQL archive, roles without login password hashes, managed-schema inventory/checksums and isolated validation procedure prepared. Native PowerShell/PostgreSQL execution remains untested. |
| Actual staging backup/recovery | BLOCKED: no export or restore was authorized/run; no recoverable backup is certified. |
| Worker preservation patch | PASS: local package/release guards pass against reviewed staging metadata; no provider settings changed. |
| Live staging database preflight | BLOCKED: approved native client/CA/credential/direct connection/current history and query approval still required. |
| Deployment/enablement | BLOCKED pending recovery evidence, live guarded preflight, separate deployment approval and live authorization QA. Both v2 gates remain false. |

## Validation

- `npm run check:worker`: PASS, both ordinary local-only build and observed-baseline build.
- `npm run check:release --prefix backend/worker`: PASS with reviewed baseline and independently
  read version receipt `891b26a8-bd75-4f2c-b6af-b0244cc699f7`. A receipt is an operator assertion,
  not automatic freshness proof; refresh metadata before a later deployment.
- `npm test`: **221 passed, 0 failed, 0 skipped** (baseline 208 plus 13 new cases).
- Includes existing real isolated PGlite SQL lifecycle/security cases, Vue compilation/rendering,
  v1/authentication/analyzer/statistics tests and local workerd tests with no outbound services.
- New coverage includes safe default/approval gates, exact staging/TLS credentials/environment,
  synthetic full export/incomplete export/source changes, checksums, isolated restore restrictions,
  inventory mismatch, native diagnostic redaction, PowerShell script/ACL structure, local SQL
  preparation, preview/rollback/version/settings drift and pinned route/secret preservation.
- Backup executables were simulated. PowerShell/native PostgreSQL tools are unavailable here;
  no claim of actual Windows execution, live archive validity or managed-schema recoverability.
- `git diff --check`: PASS. No application/Vue code, pilot/v2 handlers or migration SQL changed.

## Complete changed-file inventory

| File | Change |
| --- | --- |
| `.gitignore` | Ignore database archives and backup directory in addition to existing work/local metadata exclusions. |
| `backend/release/Sdl004-Staging.ps1` | Windows Plan/Backup/Preflight/Inspect/isolated-validation wrapper, explicit approvals, masked password and temporary environment cleanup. |
| `backend/release/ProtectBackupDirectory.ps1` | Restrict Windows backup directory DACL to current user before sensitive output. |
| `backend/release/staging-backup.mjs` | Staging-only native PostgreSQL backup plan/export/checksum inspection and isolated read-only recovery-inventory comparison; never automatically certifies recovery. |
| `backend/release/backup-inventory.sql` | Read-only counts and schema/role/RLS/grant/function/constraint/extension/history inventory for approved export/isolated comparison. |
| `backend/release/run-staging-preflight.mjs` | Scrub inherited connection/credential variables case-insensitively; reject invalid password encoding and redact uncontrolled diagnostics. Existing identity/history/TLS guards retained. |
| `backend/release/staging-history.example.json` | Deliberately incomplete manifest template that fails until actual reviewed history is entered. |
| `backend/release/staging-worker-baseline.json` | Sanitized observed staging settings, route-preservation method and original deployment/version rollback metadata; secret names only. |
| `backend/release/worker-baseline.example.json` | Required preservation/rollback metadata template, still unconfirmed. |
| `backend/worker/cloudflare.config.ts` | Explicitly preserve workers.dev, disabled previews, compatibility flags, logpush and tails; leave route/domain/trigger ownership unset. |
| `backend/worker/deploymentPreservation.mjs` | Check exact supported settings, rollback/version and unmanaged-route preservation; require independently checked active-version receipt. |
| `backend/worker/check-package.mjs` | Verify preview/hosting and enforce current-version receipt on release checks. |
| `backend/worker/build-local.mjs` | Cross-platform Node local build launcher, no deployment/provider commands. |
| `backend/worker/package.json` | Replace POSIX-only environment assignment with that launcher. |
| `tests/backupPreparation.test.mjs` | Eleven isolated/synthetic backup and Windows safety regression cases. |
| `tests/deploymentHardening.test.mjs` | Extend environment/metadata tests and add preview/rollback/version and pinned route-preservation cases. |
| `docs/SDL-004-STAGING-RELEASE.md` | Link current Windows handoff, update regression total and release-guard receipt instructions. |
| `docs/SDL-004-WINDOWS-RELEASE.md` | Beginner Windows setup, supported free backup scope, explicit approval commands, isolated recovery validation, trusted TLS, preflight and rollback procedures. |
| `docs/SDL-004-BLOCKER-HANDOFF.md` | This consolidated result, limitations, file inventory and remaining requirements. |

## Exact remaining manual requirements

Follow [the Windows guide](SDL-004-WINDOWS-RELEASE.md) in order. These are prerequisites and future
commands, not permission to execute live work:

1. Prepare a protected Windows checkout, Node >=22, Git, Windows PowerShell 5.1+/PS7 and all four
   native PostgreSQL **17.x** tools. Default `Sdl004-Staging.ps1 -Operation Plan` is safe locally.
   Confirm PowerShell/ACL behavior under the operator's security policy; do not bypass execution policy.
2. Obtain the authentic approved staging PEM CA chain and the existing database password securely.
   Dedicated target must remain `db.wvurolqbjhuckkkjiiiv.supabase.co:5432`, database/user postgres,
   verified hostname TLS, no pooler/query overrides and an IPv6-capable route. No paid add-on is needed.
3. Approve a quiescent staging export separately. Run the masked Backup mode, require every command
   and checksum to pass. Managed-schema permission failures remain blockers, not an excuse to exclude Auth.
4. Separately approve a compatible disposable isolated Supabase/PostgreSQL 17 restore and validation.
   Reconcile source role/extension bootstrap, restore without skipped errors, compare inventory/counts,
   test Auth/family/coach permissions and review external keys/R2 retention. Record actual recovery evidence.
5. Obtain approval for read-only staging queries. Review actual migration-ledger presence/versions and
   fill the local history manifest; the earlier absent-ledger observation is not a current guarantee.
   Run masked Preflight mode with the exact project confirmation and approved CA; preserve its PASS/counts.
   Query failure is not absence; unexpected schema/dependencies/RLS/grants/history must stop release.
6. Refresh only staging Worker metadata/version immediately before any approved release and rerun
   baseline/package guards. Prior version `891b26a8-bd75-4f2c-b6af-b0244cc699f7`, deployment
   `58789ec0-88db-4006-8d1c-603d2691f041`, was observed at 100% traffic. Secrets/bucket/preview settings
   must remain preserved. Existing observability is retained; no new tracing/logging/paid features.
7. Only after backup and preflight evidence, obtain separate approval for the pending staging migration
   and Worker deployment **with v2 off**. Then approved synthetic live authorization/consent/upload/v1
   compatibility/mobile checks must pass before either gate can be enabled. Production is outside scope.

No push, merge, PR, deployment, live SQL, live backup/restore, secret change or R2 object mutation occurred.
No production resources or data were accessed. The checkpoint is local only.
