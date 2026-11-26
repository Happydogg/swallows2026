# SDL-004 | Account Roles & Permission Specification v5.0

**Date:** 2026-11-26  
**Status:** Owner-selected product requirements; engineering and privacy release gates outstanding  
**Scope:** MVP authorization baseline; public policy copy; engineering candidate, not deployed  
**Supersedes:** v4.0 and earlier conflicting permission proposals  
**Authority:** Project owner selections in the 26-item questionnaire and subsequent 12-item questionnaire, plus previously agreed decisions not superseded.  
**Implementation / deployment:** Not authorized by this document. No source, database, Cloudflare configuration, or project register was modified in preparing it.

## 1. Roles and scope

| Role | Scope |
|---|---|
| Platform Admin (PA) | Global platform administration; reads/downloads/exports across all clubs; audited administrative private-information corrections. |
| Club Admin (CA) | Own club, its teams and eligible player records. |
| Team Manager (TM) | Actively assigned teams and their active players. |
| Coach (CO) | Actively assigned teams and players. |
| Parent / verified Guardian (GU) | Linked children; shared content of eligible teams. |
| Player | Guardian-supervised access during MVP; no independent account. |

Multiple roles per account are allowed, including across clubs and teams. Authorization is evaluated per action, resource and scope, not by a global role rank. Platform Admin's global data access does not imply every specialized write, approval, or family-consent permission. Staff access to private records ends when the qualifying assignment or enrollment ends, unless another valid role independently authorizes access. Historical records remain preserved. A guardian retains own-child historical access while the verified relationship remains valid.

## 2. Permission matrix

**Legend:** Y = allowed in role scope; C = conditional on the named safeguards or workflow; N = not granted by this role alone; O = own verified child/family; S = eligible shared content; R = request/authorize only; D = ungranted by default pending a specific decision. Y and O never bypass account/session checks. Media permissions always depend on applicable media authorization and retention. The PA global-read policy includes private athlete and family data. Routine administrative powers carried over from earlier proposals (e.g., create teams as PA, suspend clubs, manage quotas) are recommended defaults, not separately approved questionnaire items. Unspecified operations are denied until explicitly authorized. This matrix is a target, not a claim of current implementation.

### A. Administration, staff and roster

| Permission | PA | CA | TM | CO | GU |
|---|---|---|---|---|---|
| Create/suspend/archive clubs | Y | N | N | N | N |
| Assign/remove Club Admin | Y | N | N | N | N |
| Create teams | Y | Y | N | N | N |
| Edit team settings | C (support) | Y | Y | N | N |
| Archive teams | C (support) | Y | N | N | N |
| Assign/remove Team Manager | N | Y | N | N | N |
| Assign/remove Coach | N | Y | Y | N | N |
| View administrative roster | Y | Y | Y | Y | N |
| Register new player | N | Y | Y | N | N |
| Add/remove player from team roster | N | Y | Y | N | N |
| Internal team transfer | N | Y | C (request + destination approval) | N | N |
| Cross-club transfer | C (support) | C (both clubs + guardian) | N | N | R (authorize) |
| Edit baseball profile fields | Y (audited) | Y | Y | Y | O |
| Update player photo | C (audited correction) | Y | Y | Y | O |
| Permanently delete player records | C (restricted workflow) | N | N | N | R |

Roster removal ends membership, not athlete identity or historical data. A Manager may approve a transfer into their assigned destination team, not grant themselves authority in another team. Cross-club transfers require both clubs and verified guardian authorization. Recommended distinction: a club cannot use transfer approval to block withdrawal; historical record transfer must be separately scoped and authorized. No automatic cross-club disclosure of private records.

### B. Family, guardian and registration

| Permission | PA | CA | TM | CO | GU |
|---|---|---|---|---|---|
| Issue guardian invitations | N | Y | Y | N | N |
| Revoke pending guardian invitation | N | Y | Y | N | N |
| Revoke local club/team guardian access | C (administrative support) | Y | Y | N | R |
| Globally unlink verified guardian | C (verified workflow) | N | N | N | R |
| Read parent contacts | Y | Y | Y | C (explicit grant) | O |
| Read legal name, exact DOB, registration number | Y | Y | C (registration grant) | C (exceptional grant) | O |
| Edit guardian-owned contact fields | C (audited correction) | D | D | N | O |
| Maintain verified registration fields | C (audited correction) | Y | C (authorized) | N | R |
| Grant scoped staff contact/registration permissions | D | C (own club) | N | N | N |

Local revocation must not delete the global athlete-guardian relationship or remove unrelated team/club permissions. Recommended conservative interpretation: remove the applicable local Clubhouse/membership and club-specific participation privileges, retain linked-child private historical access, and explicitly define any restrictions on new local submissions. This exact local revocation behavior is an engineering design decision to validate before implementation. Global unlinking is reserved to Platform Admin; require verified grounds, reason, audit and dispute/recovery process. Guardian invitations must remain verified, expiring and single-use; a staff role must not permit arbitrary self-linking. Baseball fields (preferred/display name, jersey, position, handedness) are not legal identity fields. Validate edits, keep revision history, revalidate shared profiles when material changes occur.

### C. Performance and statistics

| Permission | PA | CA | TM | CO | GU |
|---|---|---|---|---|---|
| Read full private statistics/history | Y | Y | Y | Y | O |
| Read pending performance submissions | Y | Y | Y | Y | O |
| Read height/weight and biomechanics | Y | Y | Y | Y | O; shared approved analysis only if separately authorized |
| Enter official performance measurements | N | Y | Y | Y | N |
| Correct existing official records | N | Y | Y | Y | N |
| Submit unofficial measurements | N | Y | Y | Y | O (pending) |
| Approve/reject/request correction of parent-submitted statistics | N | N | N | Y (assigned Coach) | N |
| Record/correct growth measurements | N | Y | Y | Y | O |
| Export private statistics (CSV/Excel) | Y | Y | Y | Y | O |
| View shared official session statistics | Y | Y | Y | Y | S |
| Export teammate statistics as guardian | N/A | N/A | N/A | N/A | N |

Official entry and correction are now allowed for CA, TM and CO. TM is an authorized team administrator for this purpose, not an automatic Coach. Parent performance submissions remain pending until assigned Coach review. Direct official entry is distinct from approval of another person's pending performance submission. Preserve measurement protocol, unit, source/evidence, actor, timestamp, revision history, correction reason, and invalidation/recalculation of affected shared results. Recommended safeguard: disallow self-approval of pending submissions even for multi-role accounts; existing direct official entry is a separate pathway. Growth entry is direct with revision history; growth is not automatically shared baseball performance data. Export excludes unrelated family/identity fields unless a separate authorized administrative export explicitly requires them.

### D. Video and media

| Permission | PA | CA | TM | CO | GU |
|---|---|---|---|---|---|
| View approved/private/pending videos | Y | Y | Y | Y | O; S for published teammate videos |
| View rejected videos during authorized retention | C | C | C | C | O (retention) |
| Download approved/private/pending videos | C (global) | C | C | C | O (authorized) |
| Download rejected videos during authorized retention | C | C | C | C | O (authorized) |
| Upload video | N | Y | Y | Y | O |
| Approve/reject pending video | N | Y | Y | Y | N |
| Publish approved video to Clubhouse | N | C | C | C | N |
| Unpublish Clubhouse video | D (incident/support procedure to define) | Y | Y | Y | R (withdraw consent) |
| Approve external distribution | N | Y (sole SDL product approver) | N | N | N |
| Request external distribution | D | R | R | R | R |
| Permanently delete video | C (restricted workflow) | N | N | N | R |
| Download teammate video as guardian | N/A | N/A | N/A | N/A | N |

Non-Coach uploads enter a pending workflow; Coach uploads may use existing approved-private workflow subject to authorization and validation. CA, TM and CO can now review and publish pending videos within their scope. Recommended independent-review safeguard: the same account cannot approve its own pending non-Coach upload; a separate authorized staff reviewer is required. Publication to Clubhouse requires approval, active applicable guardian sharing consent, recording/storage authorization, current membership, and subject-safety checks. The existing single-identifiable-athlete publication rule should be preserved unless separately changed and validated. Multi-child recording/review/download requires appropriate permission for all identifiable subjects; do not infer permissions from the uploader alone.

External distribution: the owner's final decision makes CA approval alone sufficient as the SDL product approval rule. This supersedes the earlier proposal requiring separate guardian approval per external distribution. It does not establish that distribution has a lawful basis, satisfies existing recording/usage restrictions, or can ignore child privacy obligations. External distribution is a release-gated capability pending privacy/legal review of applicable jurisdiction, consent scope, purpose, recipients and child-identification controls. Do not enable a public distribution path until this is cleared. Recommended safer fallback: obtain applicable guardian authorization for all identifiable children in addition to CA approval, or rely on a specifically validated existing authorization covering the proposed external use. This fallback is a recommendation, not an approved change to the owner decision.

### E. Clubhouse, consent and audit

| Permission | PA | CA | TM | CO | GU |
|---|---|---|---|---|---|
| View shared roster/leaderboards | Y | Y | Y | Y | S |
| View all consented official teammate sessions | Y | Y | Y | Y | S |
| View other children's nonshared stats/video | Y | Y | Y | Y | N |
| View other clubs' data without a separate role | Y | N | N | N | O only |
| Grant/withdraw own child's sharing consent | N | N | N | N | O |
| Set club recording permissions | N | Y | N | N | N |
| Bypass Clubhouse consent | N | N | N | N | N |
| Read platform security logs | Y | N | N | N | N |
| Read scoped administrative/download audit history | Y | Y | Y | Own activity | Own-child download history only |
| Individual parent download notification | Disabled | Disabled | Disabled | Disabled | Disabled |

Sharing consent: owner selected one consent covering all current and future baseball metrics, with official session-level teammate statistics visible to eligible team members. This is not an individual-session approval or a metric-by-metric selection. Recommended implementation boundary: only validated, classified official baseball performance metrics may enter this sharing category; exclude growth, medical data, family data, private notes, pending records and unvalidated scientific measures. Blanket future consent is a privacy risk; version notice text and the eligible metric catalog, require review before introducing materially different or sensitive data, and obtain fresh authorization where required. Do not treat newly introduced sensitive categories or purposes as automatically covered. This is a recommended release safeguard, not a switch to metric-by-metric consent.

Any verified guardian can withdraw sharing. Conflicting guardian preferences block sharing until resolved; a later opt-in cannot silently override an unresolved objection. Proposed implementation: keep guardian-specific consent and objection history, scope to enrollment and relevant sharing category, and implement reviewed resolution. Private authorized family access is distinct from shared content. Video and statistics sharing permissions remain separate. Clubhouse sharing requires applicable active consent; role rank cannot override it.

## 3. Required security and privacy controls (proposed technical safeguards)

- Require MFA and protected administrative sessions for PA; reauthenticate for sensitive operations; audit global access, exports, edits and unlinking. Global access is a role scope, not anonymous access or client-side service-role credentials.
- Enforce active account, session, role, resource membership and operation-specific authorization server-side. Use Supabase RLS/controlled RPCs and Cloudflare media authorization; frontend visibility is not authorization.
- Deny cross-tenant access except PA or a separately valid scoped role; check revocation on new requests and bound short-lived token exposure. Do not promise to recall prior downloads or already-delivered bytes.
- Keep R2 private; distinguish streaming, download, publication and external distribution. Audit downloads and exports; no individual guardian notifications. Expose own-child download history with only necessary metadata. Define staff-held copy retention/deletion obligations; browser playback cannot completely prevent copying.
- Use explicit actor, target, scope, timestamp, reason and decision records for high-risk actions; protect logs from ordinary tampering. Do not log credentials or unnecessary personal data.
- Retain historical records on ordinary roster removal; restricted deletion follows verified request, retention review and authorized execution. Do not hard-delete merely because a player or guardian leaves a team.
- Preserve current features, existing compatible structures, and prior scientific governance. New baseball metrics must satisfy scientific/measurement requirements before official use or sharing.
- No production deployment, privilege expansion, destructive migration or deletion without explicit owner approval.

## 4. Conflicts and release gates

| Risk | Owner decision retained | Required design/release consideration |
|---|---|---|
| External distribution of minors' footage | CA approval alone | High-risk release gate: verify lawful basis and existing consent/usage restrictions, subject identities, recipients and purpose before enabling. No assumption that product approval supplies legal authority. |
| Blanket future-metric sharing | One consent for all current/future baseball metrics | Classify validated baseball metrics, exclude sensitive/private data, version notices/catalog, review material changes and obtain fresh consent when required. |
| Global administrator exposure | PA global view/download/export and audited corrections | MFA, least privileged credentials, audit, reauthentication and secure recovery; no automatic publication or specialized writes. |
| Multiple official writers and video approvers | CA/TM/CO official entry and correction; all three video review/publish | Protocol validation, revision history, actor auditing, independent pending review recommended. Parent statistics approval remains assigned Coach only. |
| Guardian relationship scope | CA/TM direct local revocation; PA global unlinking | Model distinct local and global lifecycle; preserve own-child history and unrelated scopes. Verify revocation against both database and media. |
| Historical and multi-club data | Guardian retains history; former staff lose routine access | Prevent new club access to prior club private data by default; preserve independent withdrawal and transfer processes. |
| Offline copies | Authorized staff and guardian downloads | Audit and retention obligations; revocation affects future access, not previously saved copies. |

## 5. Decision traceability

### Earlier agreed requirements (retained except explicit supersession)

Platform Admin exists. CA assigns TM and CO; TM assigns CO within own team. CA/TM add/remove players and issue guardian invitations; CO and PA do not issue them by role alone. TM full assigned-team stats and private/pending media viewing/downloads allowed. No per-download parent notification. Assigned Coach approves parent-submitted performance. Roster removal is not permanent deletion. Video/statistics sharing consent separate; private R2 and server-side authorization maintained as design requirements.

### Questionnaire 1 (26 selections)

| ID | Selection |
|---|---|
| Q01 | B: PA unrestricted access to all clubs' private player data. |
| Q02 | A: CA full read-only analytics and authorized videos across own club (official writing later authorized separately). |
| Q03 | A: TM edits settings, CA archives teams, PA support intervention. |
| Q04 | A: CA/TM register new players. |
| Q05 | C: All authorized staff and parents directly edit baseball profiles. |
| Q06 | A: CA/TM/CO/guardian update photo. |
| Q07 | A: CA internal transfers directly; TM requests with destination TM or CA approval. |
| Q08 | A: Both clubs plus verified guardian authorize cross-club transfers; preserve identity. |
| Q09 | A: Restricted PA permanent player deletion process. |
| Q10 | A: CA/TM family contacts; CO explicit grant. |
| Q11 | A: CA registration details; authorized TM; exceptional CO. |
| Q12 | A: Guardian edits permitted contact fields; CA/authorized TM maintain verified registration fields. |
| Q13 | B: CA/TM revoke existing guardian relationship directly; refined by F04 to local access only. |
| Q14 | C: TM directly enters official measurements. |
| Q15 | C: CA and CO directly enter official measurements. |
| Q16 | A: Guardian/CA/TM/CO directly record scoped growth with revisions. |
| Q17 | C: All consented official session-level teammate statistics. |
| Q18 | A: Scoped staff exports; guardian own-child exports; PA expanded by F01. |
| Q19 | A: CA downloads all authorized own-club videos including pending. |
| Q20 | A: CO downloads all authorized assigned-player videos including pending. |
| Q21 | A: Guardian own-child authorized downloads; teammate streaming only. |
| Q22 | A: CA/TM/CO/guardian uploads; non-Coach review. |
| Q23 | A: Scoped staff/own-child guardian rejected-video access during authorized retention. |
| Q24 | A: Scoped staff unpublish, guardians withdraw consent, separate external authorization, restricted deletion; external approval refined by F11. |
| Q25 | A: PA/CA/TM scoped audit history, guardian own-child download history, CO own activity. |
| Q26 | A: Independent player accounts deferred until after MVP. |

### Final questionnaire (12 selections)

| ID | Selection |
|---|---|
| F01 | PA global private-player downloads and exports, audited. |
| F02 | PA private-information correction through audited administrative workflow. |
| F03 | Multiple scoped roles across clubs and teams. |
| F04 | CA/TM directly revoke local access; global guardian unlinking requires PA. |
| F05 | Guardian retains own-child history; former staff lose routine private access; preserve records. |
| F06 | Any verified guardian can withdraw sharing; conflicts block sharing until resolved. |
| F07 | CA/TM/CO correct scoped official statistics, reason and revisions required. |
| F08 | Assigned Coach only approves parent-submitted statistics. |
| F09 | One sharing consent covers every current and future baseball metric. |
| F10 | Authorized staff and own-child guardians download rejected video during permitted retention. |
| F11 | CA approval alone is sufficient for external distribution as product policy; privacy release gate remains. |
| F12 | CA/TM/CO approve and publish pending videos. |

## 6. Existing implementation versus v5.0

Internal environment-specific security findings and implementation-gap evidence are retained in the owner-controlled original specification and are not reproduced in this public repository. The product requirements and release gates are unchanged.

## 7. Engineering handoff and acceptance criteria

1. Register v5.0 and reconcile task identifiers/workstream ownership with SDL Master Directory; preserve v4.0 and decision history. Update SDL_MASTER_INDEX.md, SDL_DECISION_REGISTER.md and SDL_ROADMAP_STATUS.md only through an authorized follow-up.
2. Conduct a read-only source, Supabase staging and Cloudflare media gap analysis before proposing changes. Verify grants, RLS, RPC bodies, role constraints, media routes, frontend bindings and existing migrations; no assumptions of deployment.
3. Propose staged, reversible changes for identity/role delegation, roster/family lifecycle, performance, media, consent/Clubhouse, exports/audit. Resolve privacy release gates before enabling relevant capabilities. Obtain explicit approval before implementation or privilege expansion.
4. Test with synthetic fixtures across two or more independent clubs, multiple teams, multiple guardians and multi-role accounts. Include positive/negative role checks, cross-tenant IDs, scope transitions, suspended/revoked sessions, local vs global guardian revocation, historical record access, withdrawal conflicts, pending review, corrections and source-hash invalidation, consented session results, secure streaming/download, expired tokens and audit records. Test external distribution remains blocked until cleared. Validate existing features and rollback.
5. Require independent security review and staging verification before production pilot approval. Document unresolved issues, migrations, tests and deployed versions separately.

**Next action:** Freeze owner-selected v5.0 as the MVP product baseline, preserve release gates and ungranted-by-default details, and obtain approval for a read-only engineering gap analysis. Do not begin coding or deploy from this document alone.