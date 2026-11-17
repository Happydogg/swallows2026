# SDL-004 Windows backup, preservation and preflight handoff

Prepared locally from `76b205859982de51ffac202e64954e908f5a8242`, branch `codex-SDL-004`.
This is preparation, **not permission to run a live export/query/restore or deployment**.
No live Supabase queries, backups, restores, secret changes, R2 operations or deployments were run.
Only the named staging Worker's nonsecret metadata was read to preserve its current settings.

Both v2 gates remain false. Application/Vue/MediaPipe, v1 Worker handlers, SQL migration/RLS and
statistics permissions are unchanged. Registration automation remains deferred for the manual pilot.

## 1. What is ready and what is not

- Windows entry point: `backend/release/Sdl004-Staging.ps1`. Its default **Plan** mode performs no
  database connection, reads no password and creates no backup. Backup, read-only preflight and
  isolated validation each require explicit approval flags. The wrapper supports Windows PowerShell
  5.1+ or PowerShell 7 and invokes the Node tools without credentials in command arguments.
- Export implementation: `staging-backup.mjs`, native PostgreSQL 17 tools with exact staging host,
  verify-full TLS, read-only source sessions and no inherited PG connection overrides. It does not
  use a paid Supabase backup, new cloud project, plan upgrade or IPv4 add-on.
- Actual backup: **NOT CREATED. Recoverability: NOT VERIFIED.** Tests use synthetic executables and
  local PostgreSQL/WASM preparation only; they are not a native Windows or real export test.
  PowerShell and native PostgreSQL executables are unavailable in the current development runtime.
- Worker preservation: local patch complete. Preview URLs explicitly remain false, workers.dev
  remains true, compatibility date/flags and logpush/tails remain as observed. Observability is
  copied exactly from a reviewed baseline; no new logging/tracing feature is enabled. Existing
  secret values are retained by the pinned uploader. No route/domain/cron ownership is introduced.
- Preflight: scripts/instructions ready; still requires Windows PostgreSQL tools, approved CA,
  existing staging DB password, IPv6/direct connectivity, a reviewed history manifest and permission
  to execute the live read-only check. Nothing connects automatically during build/test/Plan.

## 2. Supported free-tier backup method and scope

Supabase recommends regular CLI exports for Free projects. We use the PostgreSQL tools alternative:

- One whole-database **custom-format pg_dump archive**, including schema, necessary data, Auth,
  Storage metadata, migration metadata when present, functions, triggers, RLS, ownership and ACLs.
  No application/managed schema is silently excluded and no --no-owner/--no-acl switch is used.
  Normal PostgreSQL system/extension-owned exclusions still apply; extensions and their registered
  configuration data follow pg_dump's standard semantics.
- `pg_dumpall --roles-only --no-role-passwords`, retaining role definitions/memberships without
  database login password hashes. Existing role passwords must be handled separately in an actual
  recovery environment. Auth account hashes/tokens **are database data** and are retained in the
  confidential database archive; never paste or publish the archive.
- Before/after read-only inventories contain relation counts, schema/role/ACL/RLS/policy/function/
  constraint fingerprints and extension versions. They record migration-history presence even when
  the table is absent. The archive itself includes history table data when it exists.
- Source must be quiescent for the approved export: no test logins, uploads, roster/role or schema
  edits. The archive uses pg_dump's consistent MVCC snapshot. Inventory differences stop the job;
  equal counts/fingerprints are not a guarantee that no same-count data update occurred.
- Managed Auth/Storage/Vault/extension permission or restore errors are **blocking**. Raw pg_dump
  includes platform internals and is not a blindly portable managed-project migration. Do not fix
  errors by excluding Auth, skipping data, disabling application security or ignoring exit codes.
  Use an isolated, compatible Supabase PostgreSQL environment to validate the actual archive.

Not included: R2/Supabase Storage object bytes, provider configuration, JWT/API/external encryption
keys, role passwords, PostgreSQL binaries and OS-level state. Encrypted columns/Vault data need
appropriate external key availability; an archive alone does not prove they can be decrypted.
Existing R2 objects must be retained. No media objects are read, exported or deleted by these tools.

Output is always a new folder under `work/backups/SDL-004/` (Git-ignored). The tool rejects outside
paths, reused folders and symlinks/junctions, replaces Windows directory ACLs with current-user-only
access before writing, and uses restrictive Unix permissions elsewhere. Git-ignore is not encryption:
use an approved protected local disk outside OneDrive/Dropbox/shared folders. Do not force-add dumps
or diagnostic/data files to Git. The tool captures/discards raw native diagnostics rather than
printing potentially sensitive error rows. An error leaves `FAILED_INCOMPLETE`, never a valid backup.

Successful export creates:

- `database.dump`, `roles.sql`, `archive-toc.txt`;
- `inventory-before.json`, `inventory-after.json`;
- `manifest.json` with SHA-256 checksums and **EXPORT_SUCCEEDED_UNVERIFIED**.

This status is deliberately not “recoverable”. The isolated validation helper also refuses to certify
recoverability automatically; real restore success and authorization/key checks must be reviewed.

References retrieved for this work:

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/self-hosting/restore-from-platform
- https://www.postgresql.org/docs/17/app-pgdump.html
- https://www.postgresql.org/docs/17/app-pg-dumpall.html
- https://www.postgresql.org/docs/17/app-pgrestore.html

The Supabase CLI's filtered schema/role/data dump is also supported, but requires Docker and managed
schema handling; it is not substituted silently if this full native export fails. Do not copy public
examples that put a password-bearing --db-url on the command line or suggest resetting passwords.

## 3. Windows setup — safe before database approval

1. Put this reviewed checkpoint in a local working copy, for example `C:\Projects\swallows2026`,
   **outside a cloud-synced folder**. This checkpoint is local only; obtain/copy it through the
   separately reviewed Git handoff. Do not push or change branches merely to follow this guide.
2. Install Node.js 24 (or a supported >=22 release) and Git for Windows if needed. Use the official
   installers. No global Supabase CLI install or Docker is required for the backup/preflight tools.
3. Install the current **PostgreSQL 17.x command-line tools** from
   https://www.postgresql.org/download/windows/ . The server inspected previously is major 17;
   this script deliberately rejects other client majors. A new local database service is not needed
   just to back up/preflight staging. Select the command-line tools in the installer.
4. Open a new PowerShell terminal. Set PATH for this terminal only if necessary:

   ```powershell
   Set-Location 'C:\Projects\swallows2026'
   $env:Path = 'C:\Program Files\PostgreSQL\17\bin;' + $env:Path
   Get-Command node, git, psql, pg_dump, pg_dumpall, pg_restore
   node --version
   psql --version
   pg_dump --version
   pg_dumpall --version
   pg_restore --version
   .\backend\release\Sdl004-Staging.ps1 -Operation Plan
   ```

   These commands do not connect to the database. Adjust the installation path to your actual 17.x
   directory. Use `npm.cmd` below if PowerShell blocks the npm.ps1 shim. Do not use machine-wide
   ExecutionPolicy Bypass; review/unblock only trusted local scripts under your organization's
   policy, or obtain the required signing/administrator help if script execution is restricted.
5. Obtain the **approved CA certificate chain in PEM format** from the signed-in staging project's
   Database/SSL settings or the approved certificate source. Confirm its authenticity/fingerprint
   through the approved source. Save it locally, e.g. `C:\SDL-Certificates\staging-ca.crt`.
   This is a public CA certificate, not a private key. Do not use an arbitrary server certificate,
   disable hostname checking, or trust a certificate simply because a connection offered it.

   ```powershell
   Get-FileHash 'C:\SDL-Certificates\staging-ca.crt' -Algorithm SHA256
   ```

6. Required host is exactly `db.wvurolqbjhuckkkjiiiv.supabase.co`, port 5432, database/user postgres.
   The strict guard does not allow poolers, IP substitutions or connection query overrides. Free
   direct connections normally need IPv6. If this Windows network is IPv4-only, stop and arrange an
   approved IPv6-capable operator environment. Do not buy an add-on, switch to an unreviewed pooler,
   downgrade TLS or bypass the existing project guard to make the check pass.
7. Obtain the **existing** staging database password through the approved credential process. Do
   not reset/rotate it, put it in a script/JSON file/URL command, paste it in chat, or enable transcript
   logging. Execution modes prompt with masked input and clear/restore temporary process variables.

## 4. Live backup — commands prepared, NOT authorized yet

After separate backup approval, an approved quiescent source and the setup above:

```powershell
.\backend\release\Sdl004-Staging.ps1 -Operation Backup `
  -ConfirmProject wvurolqbjhuckkkjiiiv `
  -CaFile 'C:\SDL-Certificates\staging-ca.crt' `
  -ApprovedLiveBackup -Quiescent
```

Enter the password only at the masked prompt. Do not pass it as a parameter. A failure means stop;
protect the incomplete files, do not exclude managed data or treat them as a backup. No raw errors
or data are printed by the wrapper. On success, copy the reported local directory path and inspect:

```powershell
.\backend\release\Sdl004-Staging.ps1 -Operation Inspect `
  -BackupDirectory 'C:\Projects\swallows2026\work\backups\SDL-004\EXACT-REPORTED-FOLDER'
```

Inspection checks required files and checksums without any connection. It cannot prove restore
success. Do not rename the manifest status or set recoverabilityVerified true by hand to bypass QA.

## 5. Isolated restore validation — supervised, separately approved

Never restore into the active staging project, any hosted Supabase project, or production as a test.
Never feed the archive to psql/pg_restore while connected to the staging host.

1. After a successful approved export, review its scope/extension inventory, roles file and checksums
   privately. Select a disposable **compatible PostgreSQL/Supabase 17 environment** with the needed
   extension binaries/versions. Do not guess an image tag, silently omit unsupported extensions or
   use a pre-existing application database. A Linux VM with a compatible Supabase PostgreSQL image
   may be needed for extensions unavailable on native Windows PostgreSQL.
2. Install/download dependencies before isolation, then disable the validation VM's external network
   adapter/egress. Do not run Auth, Storage, SMTP, scheduler/webhook application services with staging
   credentials. Run PostgreSQL locally inside that environment on `127.0.0.1:6543`. Execute the
   following steps **inside that isolated environment**, not against a forwarded staging endpoint.
   Copy only the approved archive/tooling into it; preserve private file access.
3. Reconcile `roles.sql` with the isolated cluster: bootstrap missing source roles and reproduce
   required attributes/memberships, without copying live passwords or ignoring duplicate-role errors.
   Use an isolated local administrator. Do not weaken anon/authenticated RLS or add privileges to
   make tests pass. Source role attributes and ACLs are part of inventory comparison.
4. Create a fresh `sdl004_restore_check` database using template0. Start a fresh terminal inside
   the isolated environment and clear inherited PG connection variables first. Native PostgreSQL
   tools accept --password for a masked prompt (no password argument):

   ```powershell
   Get-ChildItem Env:PG* | Remove-Item
   # Review/substitute the isolated local administrator name; never a staging URI.
   createdb --host=127.0.0.1 --port=6543 --username=postgres --password `
     --template=template0 sdl004_restore_check 2>$null
   if ($LASTEXITCODE -ne 0) { throw 'Isolated database creation failed; stop.' }
   # Apply only the privately reviewed isolated-role bootstrap if required.
   # Do not blindly apply roles.sql over existing reserved roles or ignore errors.
   pg_restore --host=127.0.0.1 --port=6543 --username=postgres --password `
     --dbname=sdl004_restore_check --single-transaction --exit-on-error `
     'FULL-LOCAL-BACKUP-PATH\database.dump' 2>$null
   if ($LASTEXITCODE -ne 0) { throw 'Restore failed; do not certify recoverability.' }
   ```

   Use the appropriate isolated administrator if source postgres is not a local superuser. Preserve
   source owners/ACLs, reconcile role bootstrap deliberately and record the exact archive SHA and
   successful restore exit code. Raw native diagnostics are suppressed to avoid logging private
   rows/hashes; do not use --verbose or publish raw restore errors. Stop on every error. Do not use
   --clean against an existing DB, skip failed tables, or disable application protections.
5. Reproduce source role attributes/memberships after bootstrap as necessary, then run the prepared
   read-only inventory comparison from the isolated working copy, using its separate local password:

   ```powershell
   .\backend\release\Sdl004-Staging.ps1 -Operation ValidateLocalRestore `
     -BackupDirectory 'FULL-LOCAL-BACKUP-PATH' `
     -RestoreDatabase sdl004_restore_check -RestorePort 6543 -ApprovedLocalValidation
   ```

   Only an explicit loopback address, dedicated non-5432 port and sdl004_restore_ database name are
   permitted by the helper; it removes inherited connections and forces read-only validation. Local
   loopback TLS may be disabled **only inside the isolated validation environment**; the staging
   connection always requires verify-full. Do not forward this local port to a hosted database.
6. `isolated-validation.json` must show inventoryMatches true. Compare counts, all expected tables,
   role attributes/ACLs, RLS/policies, function/constraint fingerprints, extensions and migration
   metadata. It still says recoverabilityVerified false until a human reviews actual pg_restore
   success, archive SHA, data/foreign-key validity and the authorization/key checks below.
7. Run isolated functional/role checks for Auth user/identity relationships, guardian-child links,
   coach/team/org access, denied unrelated access, private media metadata and migration history.
   Encrypted data needs its external key plan; restored Auth services would use isolated JWT/API
   settings and new sessions, never live provider keys or original tokens. R2 object bytes are not
   in this archive: separately verify the retention/recovery plan without changing R2 objects.
8. Record a separate reviewed recovery certificate (archive SHA, isolated environment/version,
   restore exit, validation result, authorization checks, reviewer/time). Only after that evidence
   can this export be called recoverable for the approved SDL database scope. A successful mock,
   file checksum or pg_restore --list alone is insufficient. Do not mark a failed test as verified.

No isolated instance or restore has been run in this session. Native/managed-schema compatibility
and recoverability remain unverified until these steps complete under separate approval.

## 6. Guarded staging preflight on Windows — read-only, approval required

The existing project, dedicated host, migration-history and verify-full checks are unchanged.
The inspected ledger was absent at 2026-11-17T00:41:27Z; do not assume it is still absent or that a
failed query means absence. A reviewed current expected manifest is required:

```powershell
New-Item -ItemType Directory -Force .\work\release | Out-Null
Copy-Item .\backend\release\staging-history.example.json .\work\release\staging-history.local.json
```

The example deliberately has history null and fails validation. After an approved read-only review,
fill exactly `{"exists":false,"versions":[]}` if the table is confirmed absent, or
`{"exists":true,"versions":["ACTUAL_14_DIGIT_VERSION",...]}` from the actual ledger. Preserve project_ref.
The existing guard compares the full reviewed list/presence and rejects an already-applied release,
partial objects, missing dependencies, RLS/grant drift and wrong privileges.

Only after approval for live read-only SQL, use the wrapper instead of hand-writing a password URI:

```powershell
.\backend\release\Sdl004-Staging.ps1 -Operation Preflight `
  -ConfirmProject wvurolqbjhuckkkjiiiv `
  -CaFile 'C:\SDL-Certificates\staging-ca.crt' `
  -HistoryManifest '.\work\release\staging-history.local.json' `
  -ApprovedReadOnlyPreflight
```

The password is URL-escaped only in memory, never logged/passed in command arguments. The child
uses psql -X, ON_ERROR_STOP, explicit host/user/database, read-only SQL and verify-full with the
approved CA. Source password variables and inherited PG overrides are stripped from child env.
Require explicit project/PASS output and retain baseline counts. Any failure is BLOCKED: fix the
connection/history mismatch; never change sslmode to require/prefer/disable or relax the guard.

## 7. Worker preservation and rollback

Nonsecret GET metadata was refreshed for the named staging Worker only. Preserved version:

- Version `891b26a8-bd75-4f2c-b6af-b0244cc699f7`, deployment
  `58789ec0-88db-4006-8d1c-603d2691f041`, 100% traffic; created 2026-11-16T15:11:40.663916Z.
- Staging bucket, Supabase URL and secret binding names unchanged; no secret values retrieved.
- Compatibility 2026-11-16, flags [], workers.dev on, previews off, standard usage, logpush off,
  no placement/limits/tail consumers/tags. Existing logs on/sampling 1, traces off; exact observed
  sampling/persistence/query-redaction values are retained through baseline injection.
- Routes/domains/triggers remain **unset** in the candidate. Reviewed pinned CLI 1.0.0-rc.0 only
  mutates route/custom-domain associations for configured nonempty lists. Unmanaged routes are
  preserved, not recreated from an invented inventory. Zone inventory is not claimed verified.

Sanitized observation/rollback record: `backend/release/staging-worker-baseline.json`.
The guard now checks preview/hosting/compatibility/logpush/tails, rejects managed-route overrides,
unknown settings/bindings and stale rollback/version receipts. It still requires reviewed metadata.
No build flag grants deployment approval. Current-version receipt is an operator assertion, not
an API call or cryptographic proof: re-read the actual active version immediately before any
separately approved deployment; do not copy an old ID merely to make the guard pass.

Offline Windows package validation:

```powershell
$env:SDL004_WORKER_BASELINE = (Resolve-Path .\backend\release\staging-worker-baseline.json).Path
# Use the independently rechecked active version, not a guessed or stale baseline value.
$env:SDL004_CURRENT_WORKER_VERSION = '891b26a8-bd75-4f2c-b6af-b0244cc699f7'
npm.cmd run check:worker
npm.cmd run check:release --prefix backend/worker
npm.cmd test
Remove-Item Env:SDL004_WORKER_BASELINE, Env:SDL004_CURRENT_WORKER_VERSION
```

The build script is now cross-platform Node, with no POSIX environment-variable assignment.
It sets LOCAL_BUILD_ONLY for build only. Never supply that flag to deploy or use configuration
CLI overrides to bypass a guard. This package check does not establish backup/preflight readiness.

If an approved deployment later needs rollback, use the recorded prior version/deployment only
under separate approval, recheck it still exists and review traffic/settings. Do not use an
unreviewed rollback command, reset the database, rotate secrets or delete media as rollback.
A code rollback does not undo a database migration; preserve data/audit records and disable v2 first.

## 8. Remaining staging blockers and approval order

1. Native Windows/PowerShell/PostgreSQL setup, approved CA/password/direct IPv6 connection and
   current migration-history review are still operator prerequisites. No live preflight ran here.
2. Separate approval is required for a live export. No recoverable backup exists from this work;
   successful real export plus isolated restore/auth/key verification remains a release blocker.
3. Guarded live preflight and postflight plans must pass with current data; no SQL executed live.
4. Recheck current Worker metadata/version, preserve unmanaged routes and run the release guard
   with that reviewed baseline. Local preservation patch/package checks are complete, not deployment.
5. Only after these pass, separately approve applying the pending staging migration and deploying
   the reviewed Worker with v2 off. Live synthetic authorization/mobile QA comes before frontend
   enablement. No production operation, push, merge or paid infrastructure change is included.
