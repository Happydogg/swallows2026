# Coverage of the 38 owner selections

**Locally Tested** refers to a synthetic scenario at the database, Worker or application boundary. **Implemented** means there is code for the stated behavior with remaining independent or role-specific acceptance work. **Proposed** applies to operations lacking an approved operational workflow. All rows await staging verification. No row has reached Production Deployed or Production Verified.

| Decision | Stage | Current coverage and remaining acceptance work |
|---|---|---|
| Q01 | Locally Tested | AAL2 platform grant, independent scopes, global history, audit and export branches. Verify real MFA, session revocation, reauthentication and recovery. |
| Q02 | Locally Tested | Club-scoped performance and object-level media authorization. Reconcile historical objects and consent before rollout. |
| Q03 | Implemented | Scoped name changes, Club Admin archival and case-bound platform support. Exercise real settings and downstream archive workflows. |
| Q04 | Locally Tested | Club Admin or assigned Manager registers a new player, team assignment and enrollment atomically with request-key protection. |
| Q05 | Locally Tested | Authorized baseball edits require expected old values. Revisions survive and a changed shared profile loses approval. |
| Q06 | Implemented | Photo role eligibility is available. The existing avatar storage lock remains active pending isolated private storage and delivery verification. |
| Q07 | Locally Tested | Within-club transfer requires destination authority. The four-team test checks source Manager denial and loss of player access. |
| Q08 | Locally Tested | Source club, verified guardian and destination club authorize a new destination registration for the same athlete. Source history stays separate. Existing destination registrations need reconciliation. |
| Q09 | Proposed | Permanent deletion awaits verified grounds, retention rules, dispute handling and separate execution approval. Ordinary roster removal ends a membership. |
| Q10 | Locally Tested | Authorized family contact reads use a dedicated projection. Coaches require explicit permission. |
| Q11 | Locally Tested | Registration reads have a separate purpose, current scope and explicit grants for Manager and Coach. Complete role-by-role staging acceptance. |
| Q12 | Locally Tested | A guardian owns their new contact entry. Club Admin and registration-authorized Manager can maintain verified registration fields. Legacy unowned phone values remain separate. |
| Q13 | Locally Tested | Team or club restrictions affect guardian participation independently of family history or an additional staff role. Validate local scope and recovery procedures. |
| Q14 | Implemented | Active Manager official entry uses the same scoped protocol/validation pipeline as Club Admin. Verify the Manager flow in the deployed client. |
| Q15 | Locally Tested | Club Admin and Coach can enter validated official values directly. Evidence, units, protocol and author are retained. |
| Q16 | Locally Tested | Growth is private, separate and revision-checked. Guardian writes and exports and legacy growth regressions pass. Confirm staff attribution end to end. |
| Q17 | Locally Tested | Paginated approved session results require current team access, active enrollment, content classification, profile approval and matching consent. |
| Q18 | Locally Tested | Official export supports platform, club, team and player scope. Private session export is per player. Bounded rows support CSV retrieval. |
| Q19 | Locally Tested | Club Admin download decisions require object, recording, subject and lifecycle checks. |
| Q20 | Implemented | Assigned staff can obtain download authorization within their active scope. Verify independent recording and subject evidence for every media class. |
| Q21 | Locally Tested | Own-child download and published teammate playback have distinct checks. Attachment delivery requires a fresh object-specific decision. |
| Q22 | Locally Tested | Reservation and finish recheck role and recording permission. Non-coach uploads remain pending. |
| Q23 | Locally Tested | Rejected media requires an unexpired, explicitly authorized retention deadline. Missing deadlines deny access. Retention policy and deadline administration await approval. |
| Q24 | Implemented | Staff unpublish and guardians withdraw consent. External distribution and permanent video deletion require privacy and retention review. |
| Q25 | Locally Tested | Scope is captured on new audit events. Guardian history exposes own-child download authorizations with a minimal projection. Old events need separate scope reconciliation. |
| Q26 | Locally Tested | Existing guardian-supervised frontend paths pass regression. V5 adds no independent player-account privilege. |
| F01 | Locally Tested | MFA platform grant authorizes cross-club export and eligible downloads with per-request audit. Live safeguards require acceptance. |
| F02 | Implemented | Platform identity corrections require AAL2, a separately verified single-use case and an audit event. Operational case verification and recovery need review. |
| F03 | Locally Tested | Multi-role tests keep family and staff permissions independent across teams and clubs. |
| F04 | Locally Tested | Global unlink consumes a verified case under AAL2. Local restriction retains history. No live grants or cases were created. |
| F05 | Locally Tested | Transfers preserve records and end the source assignment. A verified guardian retains own-child history following departure. |
| F06 | Locally Tested | Category-specific guardian preferences block inconsistent sharing after another guardian opts in. Agreement restores eligibility. Historical objections require review before rollout. |
| F07 | Locally Tested | Official corrections preserve prior values, reason, audit, protocol and idempotency, and invalidate the prior official projection. Competing native writers yield one winner. |
| F08 | Locally Tested | Only an independent assigned Coach reviews a parent measurement. Direct official entry cannot supersede a pending submission. |
| F09 | Locally Tested | A fresh versioned receipt covers classified protocols in its approved category. Older receipts cannot authorize the new session projection. Material changes require privacy review. |
| F10 | Locally Tested | Rejected-video access is bounded by the retention deadline and recording and subject requirements. |
| F11 | Proposed | Club Admin is the sole SDL operational approver. The external distribution workflow stays closed pending privacy review and verified rights. |
| F12 | Implemented | Club Admin, Manager or Coach can independently review and publish within their scope. Publication requires recording permission, single-subject confirmation, standing consent and current enrollment. Verify the full role matrix on staging. |
