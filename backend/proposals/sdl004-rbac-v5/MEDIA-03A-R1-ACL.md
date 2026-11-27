# MEDIA-03A-R1: proposed private playback-only ACL rehearsal

Status: proposal plus unexecuted disposable regression test. Not a hosted activation authorization.
Baseline: bfba1e20e0f596a9e3b0f9757a0ea268a3adf041. Preserve the failed QA candidate and all eighteen hosted holds.

## Initial synthetic verification scope

The Worker playback gate covers GET /v2/submissions, GET /v2/clubhouse, and GET /v2/submissions/{id}/playback.
For the first restricted private-only check, propose only two authenticated RPCs:
- public.sdl_004_list_submissions(uuid)
- public.sdl_v5_authorize_playback(uuid)

Keep public.sdl_004_clubhouse_videos(uuid) held, along with all other held signatures.
Clubhouse list requests may fail unavailable/denied in this phase; do not present that as a team media acceptance. Do not seed published or retained historical media for this restricted check. No upload, review, publication, confirmation, download, legacy media or expanded shared-session execution grant. Existing session/contract calls and non-media permissions are not changed. No new anon, PUBLIC or service_role RPC grants. The existing privileged Worker metadata lookup is a separate server-only trust boundary; never expose its key or direct table access.

Review the list function's internal can_review/can_publish computations: these are eligibility data, not execution rights. Verify frontend gate enforcement and direct database denial. Revoked helper ACLs do not prevent definer-owned internal calls. Check all effective grants including inherited privileges, function owner, search_path, private schema and table/column ACLs, reachable definer call paths, RLS, and direct PostgREST behavior on a restored clone before any hosted grant proposal.

## Rehearsal and containment

tests/media-playback-isolation.test.mjs seeds a fresh synthetic clip in a disposable fixture before applying the eighteen-RPC hold. It checks the proposed two-RPC allowlist, positive/negative object reads, direct mutation denials, recording withdrawal and renewed containment without deleting submissions. Run with the existing full regression suite; also reproduce via native PostgreSQL and direct PostgREST on a disposable restore. Test is not evidence until executed. No hosted SQL activation script is supplied.

Before any separate staging authorization: reconcile effective schema and definitions including the versionless clean-start proposal, later roster/performance/staff migrations, full provider baseline, synthetic identities, backup/restore and exact Worker package. If no approved fresh synthetic clip exists, prepare a separately authorized fixture process; never revive legacy rows. All hosted gates remain off until separately approved.

Rollback: close Worker playback first, restore held EXECUTE privileges to deny-only using a reviewed ACL snapshot/plan, verify direct API denial and preserve objects, submissions and audit history. Never restore legacy authorization.

## Historical provenance

Existing mock media migration remains cancelled. Future real media provenance remains a release requirement. Current clean-start source records reservation marker and enrollment generation, and uses private historical_assignment_evidence and retained_media_rights. Those structures alone do not prove recording-time permission, immutable subject evidence or reviewed retained rights. Obtain the original independent QA finding before modifying provenance schema. Verify record-level recording authorization evidence, time-bounded assignment, subject verification, enrollment generation, revocation and retained rights; keep unsupported historical access denied. This rehearsal is not historical-media acceptance.

## Remaining gates

Packaged R2/workerd regression, complete native and PostgREST tests, full catalog equivalence, original QA report review, historical provenance correction/containment, independent QA-R1 and separate staging approval remain pending. No hosted change is authorized by this document.
