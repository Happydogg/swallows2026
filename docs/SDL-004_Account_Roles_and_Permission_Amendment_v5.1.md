# SDL-004 | Account Roles & Permission Amendment v5.1

Date: 2026-11-27
Status: Owner-selected P1 policy amendment; MFA conflict resolved by owner on 2026-11-27; implementation and verification pending.
Base: [v5.0 specification](SDL-004_Account_Roles_and_Permission_Specification_v5.0.md).
Authority: Eleven owner selections, approval of mandatory engineering safeguards, and subsequent owner selection B resolving the MFA conflict on 2026-11-27.
Scope: Targeted amendments only. Preserve all 38 v5.0 selections and earlier agreed requirements except where explicitly superseded. No hosted migration, deployment, privilege activation, deletion, merge or privacy release authorization follows from this amendment.

## 1. Owner decision register (original policy selections)

| ID | Owner-selected policy |
|---|---|
| P1-01A | Immediately deny all new private data requests, media playback requests, downloads and writes when an account is suspended or its session is revoked. |
| P1-02A | Yes, retain authorized own-child historical access while footage remains lawfully stored. |
| P1-02B | Allow permanent read-only access to historical records created during their assignment. |
| P1-02C | Full permanent access to all historical own-club records. |
| P1-04A | Automatically upgrade existing consent to the broader v5.0 sharing policy. |
| P1-04B | Automatically extend existing video consent to all new viewing and download uses. |
| P1-04C | Keep existing valid consent active unless the new guardian objects; any objection blocks sharing. |
| P1-04D | Every outstanding verified guardian objection must be explicitly resolved before sharing resumes. |
| P1-05A | MFA only when downloading or exporting private data. |
| P1-05B | Yes, independently scoped ordinary roles may work normally, but Platform Admin privileges require MFA. (Original selection; the blanket MFA clause is superseded by P1-05R below.) |
| P1-05C | Use a restricted, verified recovery process; never bypass MFA simply through an ordinary password reset. |
| P1-05R | Final owner selection B (2026-11-27): MFA only for private downloads and exports, with separate authentication review for sensitive administrative writes. |

The owner also approved the mandatory engineering safeguards in the P1 resolution proposal. P1-03 is a mandatory migration and release control, not a separate questionnaire choice.

## 2. Supersession and historical access

P1-02B and P1-02C supersede the departure-related portion of v5.0 F05 and the earlier rule that staff always lose routine private access when a player leaves. They do not supersede immediate denial on suspension, revoked sessions or revoked staff authority, cross-club isolation, consent withdrawal, retention controls, or the no-delete-on-roster-removal rule.

| Role and resource scope | Player remains assigned | Player leaves team, stays in club | Player leaves club |
|---|---|---|---|
| Platform Admin | Global access per v5.0, subject to authentication | Same | Same |
| Club Admin with current own-club authority | Full authorized own-club access | Full authorized own-club access | Full access to retained own-club history; not receiving club records |
| Coach / Team Manager with current qualifying staff authority | Existing v5.0 rights | Read-only history created during proven original assignment | Same bounded historical read-only access |
| Verified guardian | Own-child authorized access | Own-child authorized access | Retained own-child authorized access, including eligible video viewing/download |
| Other guardians | Eligible shared team content only | Only through another independently eligible team and applicable sharing consent | No former-club teammate access |

Implementation interpretation, conservative pending any contrary owner clarification:
- Permanent means no arbitrary time limit on eligible historical read access, not a guarantee that records will be retained forever or that revoked staff credentials remain authorized. Former assignment to the player is distinct from termination or revocation of the staff role itself.
- Require trustworthy, server-side evidence of the original club/team/player/actor assignment interval and record creation within it. Preserve provenance across transfers; do not derive a new historical grant solely from a current roster, user-supplied dates, or current ownership of an athlete. Missing or ambiguous provenance denies historical staff access pending reconciliation.
- Historical-only Coach/Manager access is read-only, including viewing eligible historical media; it does not grant new historical download/export, correction, approval, publishing, upload or profile-edit authority. Existing independent current-role permissions remain unchanged. Historical-only bulk export/download is not explicitly resolved and defaults to denied.
- Club Admin's retained own-club access includes the otherwise authorized read, download and export pathways for historical records, subject to data category, media rights, retention, and logging. It does not confer new write authority over departed athletes or access to destination-club records. This is an implementation interpretation, not a separately selected action-level decision.
- For verified guardians, separate private historical access from eligibility for new submissions, team participation and publication. Retained historical footage must meet applicable recording/storage/subject and retention requirements; do not use current enrollment as a blanket prerequisite for own-child history.
- No historical permission bypasses a lawful deletion, retention expiry, disputed identity, explicit safety restriction, or session/account revocation. Previously delivered bytes cannot be recalled.

## 3. Consent migration: owner intent and non-negotiable release boundary

P1-04A and P1-04B supersede the earlier product preference to require a new receipt in every case of expansion. The owner requests automatic migration of existing valid statistics and video consents to the broader v5.0 uses.

The request is recorded without alteration. Whether original consent actually covers those broader uses is not established by this decision. Automatic migration must not manufacture consent or silently transform a limited consent, withdrawal, or unresolved objection into permission.

Required implementation and release safeguards:
- Preserve original notices, receipts, purposes, categories, guardian identity, enrollment generation, timestamps, restrictions and withdrawal/objection evidence. Do not overwrite or relabel historical consent.
- Maintain distinct statistics-sharing, video-sharing, private staff/guardian access, download, recording/storage, and external distribution authorization. No one receipt is presumed to cover all of these.
- Provide a dry-run classification/reconciliation workflow. Only automatically enable expanded uses for records where an approved privacy review establishes the original authorization covers the specific new scope and purposes. Preserve a traceable migration event and reviewed eligibility evidence; label it migration, not a newly given guardian consent.
- If the original scope is narrower, missing, ambiguous, withdrawn, expired, disputed or otherwise insufficient, preserve only the independently valid original permissions; expanded uses remain denied until valid authorization is established. Fresh guardian authorization may be required. No bulk opt-in based on membership, silence or existence of a legacy receipt.
- Standing statistics consent covers approved classified official baseball metrics within its validated scope, not growth, medical information, family data, private notes, pending records or unvalidated metrics. New metric types/purposes require classification and privacy review.
- Parents still cannot use ordinary download endpoints for teammate videos. External distribution remains separately gated; Club Admin approval is the SDL operational approval, not evidence of permission for external use.
- New verified guardian: valid existing consent continues absent an objection. An unresolved verified guardian objection blocks relevant sharing. Every outstanding verified guardian objection must be explicitly resolved through a verified, audited process before sharing resumes; ordinary staff cannot override an objection. Preserve history and prevent automatic resurrection on rejoin, transfer or guardian changes.
- Historical objections must be reconciled before enabling expanded sharing. If evidence is incomplete, fail closed for the affected expanded use.

Status: owner intent approved; automatic expansion is a privacy release gate, not authorization to execute blanket migration. No consent receipts may be altered or expanded on hosted systems by this assignment.

## 4. Platform Admin MFA: owner resolution (P1-05R)

On 2026-11-27 the owner selected B: MFA only for private downloads and exports, with separate authentication review for sensitive administrative writes. This resolves the conflict between P1-05A and P1-05B. It supersedes the blanket MFA requirement for all Platform Admin privileges in v5.0 and the original P1-05B selection. The independent ordinary-role rule and protected recovery decision remain valid.

### Target authentication policy

| Operation | Target policy |
|---|---|
| Platform Admin private data viewing, including cross-club viewing and authorized video playback | Active authenticated session, active profile and active Platform Admin grant. MFA is not mandatory solely for viewing. |
| Platform Admin private downloads and exports | MFA (AAL2 or independently verified equivalent), current session/grant and resource authorization, and audit logging required. |
| Sensitive administrative writes | Separate authentication and security review required; no relaxation of existing stronger controls pending review. |
| Independently scoped ordinary Coach, Manager, Club Admin or Guardian operation | Existing authentication and role-specific authorization; no global privileges inherited. |
| Platform Admin MFA recovery | Restricted, verified recovery process; no ordinary password-reset bypass. |

Sensitive writes include privileged account provisioning/revocation, global guardian unlinking, private identity corrections, permanent deletion and other high-impact administrative mutations. The review must explicitly determine authentication strength, reauthentication, approval, auditing and recovery requirements for each operation. The selection does not grant any new action permission. Existing stronger controls for these operations remain in place until the separate review and approval.

### Engineering and verification boundary

Separate active Platform Admin role eligibility from action-specific authentication. Do not globally remove the AAL2 condition from a shared helper without tracing every caller, including direct RPCs, RLS, reporting endpoints and Worker routes. Preserve MFA for private downloads and exports even when invoked through alternate routes; enforce on the server, not merely the interface. Independently scoped ordinary roles retain their legitimate permissions, but may not be used to bypass the MFA requirement for global privileged actions.

Playback and viewing may deliver private data to a client; a user who can view content may be able to save it. Distinguish explicit download/export authorization from viewing, limit and audit sensitive access, and do not claim MFA on download endpoints prevents all copying or scraping. Review route equivalence, pagination and bulk retrieval, byte ranges, token reuse and alternate export paths before release. This residual risk is acknowledged without changing the owner's selection.

Retain restricted verified MFA recovery. Ordinary password reset, Club Admin action or ordinary role membership cannot bypass the protected Platform Admin recovery process. Actual Supabase session and MFA behavior require staging acceptance.

Status: owner policy conflict resolved; implementation, separate sensitive-write authentication review and independent security verification remain pending. No hosted privilege change or deployment is authorized by this amendment.

## 5. Mandatory engineering controls (approved)

P1-01: enforce active account and valid non-revoked session at every applicable direct RLS read, RPC, Worker route, playback, download, export and mutation boundary. Recheck authorization for each new request, including range requests. Preserve independently scoped roles, and prevent bypass through historical or legacy APIs. Do not promise recall of previously delivered data.

P1-03: reconcile exact hosted migration ledger, schema, RLS, table/column grants, function ownership and EXECUTE ACLs, exposed schemas, storage policies, Worker contract/bindings, consent/enrollment history, and recoverable backup and restore. Validate a disposable clone; rehearse rollback/containment without deleting records. Unexplained security-sensitive drift blocks installation. A passing synthetic preflight alone does not establish hosted readiness.

P1-05: enforce P1-05R with action-specific MFA for Platform Admin private downloads and exports, protected provisioning and recovery, session revocation and auditable sensitive operations. Retain existing stronger authentication for sensitive writes until the separate authentication review is approved.

## 6. Acceptance and release

- Test historical access with independently authorized users, two clubs, multiple teams, assignment start/end dates, records before/during/after assignment, transfers, ended enrollments, role revocation, missing provenance, and current versus historic-only access. Include private retained media and negative download/export/mutation tests.
- Test active and revoked sessions, suspended accounts, direct PostgREST and legacy RPCs, storage access, Worker media requests and cross-role/cross-club denial.
- Test consent migration with legacy limited approvals, valid equivalent scopes, missing evidence, withdrawals, multiple guardians and conflicting preferences. Verify original receipts unchanged and expanded access fails closed without verified eligibility.
- Test active AAL1 Platform Admin authorized reads/playback and denial of privileged downloads/exports; test AAL2 allowed downloads/exports subject to resource rights, session and role revocation; test independent ordinary roles and alternate API/Worker routes. Preserve stronger gates for sensitive writes until separately reviewed and approved. Verify protected recovery and audit evidence; independently review residual copying and bulk retrieval risks before release.
- Re-run full application regression, Worker package checks, native PostgreSQL concurrency and PostgREST authorization tests. Document independent security review separately from implementation testing.
- Keep existing external distribution, permanent deletion, rejected-media retention, private avatar and historical-consent gates intact. No real parent onboarding or staging activation until applicable blockers are resolved and separately authorized.

No code or live authorization changes are made by this policy amendment. Implementation, local testing, independent review, staging verification and production release remain distinct statuses.
