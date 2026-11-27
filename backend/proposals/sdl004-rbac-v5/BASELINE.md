# Hosted baseline evidence and disposable recovery

Capture hosted evidence only under separately authorized read-only access. Keep exports, diffs, checksums and operator approvals in the private release record. Use separate labels for the deployed baseline, its disposable restore before candidate migrations, and the disposable candidate after migrations. Record project and environment IDs, Git SHA, capture time, operator, access role, active version identifiers and evidence locations.

## Database catalog and migration ledger

Run this command from the repository root after configuring an approved read-only libpq service. The connection configuration belongs outside the repository. Use a private directory for outputs.

```sh
umask 077
psql 'service=sdl_review' -X -qAt -v ON_ERROR_STOP=1 \
  -f backend/proposals/sdl004-rbac-v5/baseline-inventory.sql > "$SDL_PRIVATE_EVIDENCE/hosted-catalog.jsonl"
```

Repeat against the restored clone using a different service name and output file. Compare each snapshot to the exact artifact approved for that phase. For restored baseline comparison, start with the hosted snapshot. A disposable candidate is expected to differ after migration. Review and approve that delta against the candidate SQL.

```sh
diff -u "$SDL_PRIVATE_EVIDENCE/hosted-catalog.jsonl" "$SDL_PRIVATE_EVIDENCE/restored-baseline-catalog.jsonl"
```

The inventory covers the ordered migration versions, relation ownership and ACLs, column types and ACLs, RLS modes and policies, function identities and owner/EXECUTE ACLs, default privileges, role memberships, indexes, constraints, triggers and views. It includes Storage and Auth catalog objects where present. Use the sealed schema-only DDL from approved backup tooling to review definition differences. Confirm the capture role can read the migration ledger. A missing ledger, unavailable definition, unexplained ACL difference or unreviewed elevated membership leaves the baseline unresolved. Compare the ledger to source versions and approved migration checksums. Catalog hashes support comparisons and cannot establish provenance by themselves.

## Provider evidence to compare separately

| Evidence | Read-only capture and comparison |
|---|---|
| Supabase API and Auth | Record the effective exposed schemas, extra search path, token issuer and claim conventions, session and MFA settings, and direct API reachability from authorized provider metadata. Verify session renewal and revocation, suspended accounts, account recovery and independent roles with synthetic accounts on an isolated environment. Record only relevant configuration and outcomes. |
| Supabase Storage | Compare bucket visibility and storage routing from provider metadata alongside the SQL policies, grants and role inheritance. Confirm expected anonymous, authenticated and service access on an isolated environment. Review object retention and restoration evidence through the private storage owner. |
| Cloudflare | Read current account routes, Worker deployment/version traffic, effective settings, and binding names/types/resource targets using authorized metadata GETs. Use the existing Worker baseline validator with independently reviewed metadata. Compare the observed active version ID immediately before any separately approved installation. Compare a reviewed bundle hash or source artifact to current/legacy routes and the matching Supabase RPC contract. Record the recoverable prior deployment ID and traffic allocation. Keep secret values out of the capture. |
| History and consent | Compare approved aggregate evidence for original assignments, record and revision provenance, media and enrollment generations, original notices and receipts, objections, withdrawal and rights. The privacy reviewer records approved scope per use. Retain ambiguous or unsupported cases for resolution with expanded uses disabled. |

## Restoration and containment

Use a fresh, isolated restore of the backup actually identified for rollback. Record backup identity, format, hash, capture window, owner, encryption and storage location. Verify restored schema, ledger, retained evidence, grants, counts and relevant file integrity, alongside provider and media restoration. Run the existing preflight before installing candidate migrations and postflight immediately afterward. Compare preflight inventories and synthesize access tests for public APIs and current and legacy Worker routes.

The native local runner rehearses a cold physical backup and restoration of a synthetic PostgreSQL cluster. It checks that the restored fixture and catalog inventory match the original and exercises ACL containment inside a transaction that is then rolled back. Run [the containment rehearsal](containment-rehearsal.sql) on a disposable clone and check that relevant browser roles and the Worker service role lose access to covered RPCs. Confirm the separately managed Worker delivery path and any direct Storage or PostgREST access can be contained under the approved operational plan. Verify the previous Worker/RPC contract together before restoring traffic. Preserve data, receipts, grants history and audit records throughout.

A synthetic restoration supports the tool rehearsal. Actual hosted backup recovery, current provider settings, migration compatibility and independent security acceptance require separate evidence. [Release guide](RELEASE.md)
