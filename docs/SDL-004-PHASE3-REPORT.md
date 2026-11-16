# SDL-004 R2 Phase 3 implementation checkpoint

## Outcome and limits

The frontend now integrates the **verified deployed Phase 2 private-media contract**.
It supports permitted coach uploads, per-player listing, private playback and AR analysis.
Verified guardians can select linked children and read their permitted private clips.
Media permissions never enable player/statistics editing. Legacy media/avatar write locks remain intact.

**Parent submissions, approval workflows and Team Clubhouse are not enabled in the app.**
Their required backend is not deployed. Review-only SQL and Worker route drafts are provided;
these do not establish that the proposed policies work. UI wiring for submission categories,
status filters, review actions, consent and Clubhouse must follow backend review/deployment/verification.
No pending clip is represented as approved; existing pilot clips have no review status.

No Worker was deployed, live SQL executed to change data/schema/policies, secrets/bindings changed,
stored objects deleted, production resources accessed, or changes pushed. A local checkpoint
commit is created only after checks pass. The implementation starts from `f600cd1` on `codex-SDL-004`.

## Verified staging configuration

Inspection used Cloudflare management GETs and read-only Supabase catalog queries only.

- Worker: `sdl-r2-staging-gate`, compatibility date `2026-11-16`.
- Base URL: `https://sdl-r2-staging-gate.sampson-ho.workers.dev`.
- Binding: `MEDIA_BUCKET` -> **`sdl-media-staging`**.
- Bucket's managed `r2.dev` access: **disabled**; custom domains: **none**.
- Worker `SUPABASE_URL`: `https://wvurolqbjhuckkkjiiiv.supabase.co`.
- Supabase project name: **swallows-datalab-staging**, status ACTIVE_HEALTHY.
- Publishable and secret keys are Worker secret bindings. Their values were not read or copied.
- Allowed browser origins are exactly `http://localhost:5500` and `http://127.0.0.1:5500`.
  Other staging hosting origins need a separately approved Worker update before browser use.
- `backend/verified/staging-worker.phase2.mjs` is the retrieved source snapshot, with multipart
  transport removed and line endings normalized. It is evidence/test input, not a deployment configuration.

## Verified API contract

All media routes require `Authorization: Bearer <Supabase access token>`.
The Worker verifies identity against staging `/auth/v1/user`, and calls
`sdl_004_media_can_access` under that user's bearer token. Only after that check does it use
its server-side secret for metadata. No secret or storage key is exposed to the frontend.

| Route | Request | Response / behavior |
| --- | --- | --- |
| `GET /health` | No authentication | Service health, Phase 2 pilot; not proof of successful auth or storage access |
| `OPTIONS` | Allowed Origin | GET/POST/OPTIONS, headers Authorization/Content-Type/Range |
| `POST /v1/authorize` | JSON `{player_id, action: 'read'|'upload'}` | 200 `{allowed:true,media_enabled:true}` or 403 `{allowed:false,...}`; 503 if check unavailable |
| `POST /v1/media?player_id=<uuid>` | Raw MP4 body, Content-Type video/mp4, Content-Length | 201 `{id,player_id,byte_size,content_type}` after object and metadata saved |
| `GET /v1/media?player_id=<uuid>` | Player UUID | `{items:[{id,player_id,byte_size,content_type,created_at}]}`, newest 30, no pagination cursor |
| `GET /v1/media/<uuid>` | Media UUID, optional Range `bytes=N-M` | Authorized MP4 bytes; 200/206, private/no-store; 404 missing file/metadata |
| PUT or DELETE | Any route | 405; no supported deletion route |

Uploads accept **non-empty MP4, at most 20 MiB**. Server checks the `ftyp` container signature,
not complete decoding, malware scanning or duration. IDs/keys are server-generated:
`pilot/<player UUID>/<new media UUID>.mp4`. Failed metadata save attempts removal of only the
newly written object. Frontend does not implement quota deletion or deletion at all.

Browser uploads use XHR with the existing raw POST contract for progress. File/Blob bodies let
the browser determine Content-Length (a forbidden request header for JavaScript to set).
Progress reaches 100 only on a validated 201 receipt, not merely when the last byte is sent.
Network/timeout errors warn that an upload may already have saved; no automatic duplicate retry.
A real browser smoke test must verify Content-Length behavior against this Worker.

Native video elements cannot set the bearer header. The client fetches the authorized MP4,
checks type/size, and creates a **local Blob URL**. This bounds each download to the pilot's
20 MiB contract and supports playback/seeking after download without leaking bearer tokens into
URLs. Logout, account changes, player changes, permission failures and playback replacement
abort/discard pending work and release Blob/analyzer resources. No media is persisted in
localStorage, and private playback does not use public R2 links.

## Verified database and authorization

`drill_videos`, `sdl_media_objects` and `sessions` have RLS enabled, no applicable policies,
and no direct anon/authenticated table grants. Browser access is denied; the Worker uses
server-only metadata privileges after authorization. No raw media SELECT grant is needed.

- `drill_videos` is the legacy model: video_url (NOT NULL), snapshot URLs, keys, date/category,
  camera angle, FPS, coach feedback, analysis metrics and archived state. It has no pending/
  approved/rejected state, reviewer/history, parent submission or team-sharing consent fields.
- `sdl_media_objects` is the deployed private model: id, player_id, uploaded_by, object_key,
  content_type, byte_size, created_at. It has no review/sharing/category metadata.
- `sdl_004_media_can_access(p_player_id uuid,p_action text)` is a SECURITY DEFINER boolean RPC
  with empty search_path and execution granted to authenticated/service_role, not PUBLIC/anon.
- Upload/read: active team coach AND active organization staff/admin, with consistent player,
  team and organization membership, active player assignment and no end_date.
- Read only: verified guardian linked through players.athlete_id and athlete_guardians.user_id.
- Parent uploads, teammate reads, review/consent APIs: **not implemented in the deployed backend**.
- No additional media/video/approval RPCs were found in the inspected public schema.

The existing RPC does not explicitly test profile, organization or team suspension, and the
Worker does not independently check auth.sessions for immediate session revocation. Identity
verification/expired-token failures and membership revocation are handled, but immediate JWT
revocation must not be claimed from these checks alone. These require explicit backend review.

Official statistics remain locked for all browser users in this pilot. This work does not grant
coaches/admins new statistics-write capabilities; parents cannot gain them via media permissions.
The existing sessions query may still log an expected permission error; that separate loading
issue is not resolved by this media change.

## Review-only submission backend

`backend/proposals/submissions.sql` is deliberately a SQL **review draft**, not an applied or
CLI-generated migration. A future approved implementation should use `supabase migration new`,
review project identity, apply only to staging, and test under real user roles before enabling UI.
The Supabase CLI was not available. The draft was subsequently executed in an isolated
PostgreSQL/WASM engine (PGlite 0.5.16), using synthetic roles, tables, users and the inspected
media authorization function. Those tests validate local syntax and exercised access rules,
not migration compatibility or complete Supabase staging behavior. It has never been applied
to Supabase. Existing live tables/policies have not changed.

The draft adds:

- `sdl_video_submissions`, referencing the existing private media ID: pitching/batting/throwing,
  pending/approved/rejected, explicit team-sharing consent, server-recorded review/history.
- Deny-by-default RLS; no direct browser table writes/reads; purpose-specific authenticated RPCs.
- Parent/coach submission eligibility, guardian-only consent, team-coach review checks,
  row-locked pending-to-reviewed transitions, audit history and atomic media+submission metadata.
- Team access limited to approved, consented media with current team membership and, for parents,
  a verified child in that team. Current guardian/profile status is rechecked for sharing.
- Private family/review information excluded from the Clubhouse listing projection.

`backend/proposals/submissionRoutes.mjs` is an **undeployed handler factory** that reuses the
verified Worker's helpers, MEDIA_BUCKET and Supabase bindings. It is not imported by the frontend.
Proposed routes, **not existing endpoints**:

| Proposed route | Purpose |
| --- | --- |
| `POST /v2/submissions?player_id=...&category=...&share_with_team=true|false` | Parent/coach MP4 submission, defaults to pending; guardian check before consenting |
| `GET /v2/submissions?player_id=...` | Own/coach-authorized submissions and status/history |
| `POST /v2/submissions/<id>/review` | Team-coach approve/reject via caller-authenticated RPC |
| `POST /v2/submissions/<id>/consent` | Submitting verified guardian grants/withdraws consent |
| `GET /v2/clubhouse?team_id=...` | Approved, consented, team-authorized metadata only |
| `GET /v2/submissions/<id>/playback` | Recheck current private/team authorization before fetching bytes |

Before adoption: review PL/pgSQL and cross-role security, suspension/revocation semantics,
consent/history retention, peer access scope, duplicate-upload/idempotency policy, pending-list
pagination, explicit review-conflict error mapping, and rate limiting. The prototype currently
maps non-401/403 RPC errors to 503; distinguishing a concurrent review conflict needs hardening.
Integrate its /v2 dispatch before the existing Worker's route allowlist, preserve OPTIONS, and
verify exports/deployment packaging. Do not upload the draft as a replacement Worker by itself.

## Automated verification

Command without dependencies:

```sh
node --experimental-vm-modules --test tests/*.test.mjs
```

This runs the real application modules with synthetic Supabase/R2/XHR responses. The Vue
renderer test is skipped unless an independent Vue 3 runtime is supplied:

```sh
SDL004_VUE_RUNTIME=/absolute/path/to/vue/dist/vue.cjs.js \
  node --experimental-vm-modules --test tests/*.test.mjs
```

For the optional local SQL checks, also set `SDL004_PGLITE_RUNTIME` to the absolute path of
an independently installed `@electric-sql/pglite/dist/index.js` (tested at 0.5.16). This creates
an ephemeral local database, never a Supabase connection. Without the optional runtimes,
the renderer and SQL tests are skipped; all transport/lifecycle/Worker tests still run.

Final run with Vue 3.5.13 and PGlite 0.5.16: **74 tests pass, 0 fail, 0 skipped**.

- 24 existing authentication/analyzer regressions.
- 30 private-media transport, authorization, upload/progress/cancellation, failure, timeout,
  playback, cleanup and account-isolation checks.
- 11 exact deployed-source Worker contract checks using fake Supabase/R2.
- 7 undeployed proposal checks using mocked SQL decisions (including parent success and approved/
  consented teammate playback). They do **not** verify the SQL/RLS authorization logic.
- 1 SQL integration test in local PostgreSQL/WASM: role grants, own/other child submission,
  raw table denial, parent review denial, coach review/history, duplicate review, approved team
  visibility, private-field projection, consent revocation and suspended/revoked identities.
  The fixture is a reduced reference schema, not the complete deployed Supabase schema.
- 1 Vue compiler/custom-renderer test: shell, private-media panel, profile, analyzer, logout;
  no render errors or binding warnings.

The test harness remains reusable and dependency-free by default; optional Vue validation uses
a runtime installed outside the application. All 43 JS/ES modules also pass parser validation.
No bundler or production dependency was added. No native browser/GPU inference test was run.

Live health, unauthenticated listing and preflight HTTP attempts failed at this environment's
network proxy (`Tunnel connection failed: 403 Forbidden`). This is **not a Worker 403 result**.
No live authorized media upload/playback, production data access, or storage mutation occurred.
Management API inspection confirms source/configuration, not complete runtime behavior.

## Changed files

| File | Change |
| --- | --- |
| index.html | Mount the private-media panel inside the existing verified-auth gate |
| js/app.js | Register panel/composable and connect identity cleanup, preserving root refs/exports |
| js/config.js | Add exact staging Worker URL; retain inert legacy exports without production/public URLs |
| js/supabaseService.js | Stop raw legacy drill_videos fetching and public-video hydration; other CRUD exports unchanged |
| js/privateMediaService.js | Staging-only bearer transport, validation, listing, Blob playback, XHR upload/progress/errors |
| composables/usePrivateMedia.js | Per-player media permissions, requests/state, cancellation, revocation and analyzer integration |
| components/PrivateMediaPanel.js | Mobile-friendly authorized player picker, private clip upload/list/playback, explicit unavailable features |
| tests/authLifecycle.test.mjs | Preserve original 24 cases; extract shared harness |
| tests/helpers/appHarness.mjs | Reusable synthetic application harness with session/media support |
| tests/privateMedia.test.mjs | Media regression suite |
| tests/workerContracts.test.mjs | Exact deployed-source and review-proposal Worker tests |
| tests/vueBindings.test.mjs | Optional real Vue compiler/render smoke test |
| tests/proposalSql.test.mjs | Optional isolated PostgreSQL/WASM integration test of the review draft |
| tests/fixtures/deployedMediaAuthorization.sql | Inspected deployed authorization function used only as a local fixture |
| backend/verified/staging-worker.phase2.mjs | Inspected deployed Worker source snapshot for evidence/tests |
| backend/proposals/submissions.sql | Undeployed schema/RPC review draft |
| backend/proposals/submissionRoutes.mjs | Undeployed, unconnected submission/review/Clubhouse route draft |
| docs/SECURITY_TESTS.md | Updated local test instructions and distinction between local and live checks |
| docs/SDL-004-PHASE3-REPORT.md | This consolidated implementation and review report |

## Recommended next milestone

First run the private pilot frontend on an allowed localhost origin with synthetic staging
coach/parent/unrelated accounts. Verify browser upload length/progress, every access-denial path,
revocation, MP4 decoding, account switching and resource cleanup. Obtain explicit approval for
any backend deployment. Then review/generate/apply staging-only submission migrations, package
and deploy the Worker extension, verify real cross-user authorization, and wire the parent status,
coach review and consented Clubhouse UI to that verified contract. Keep legacy writes, statistics
editing and unapproved team sharing disabled throughout.
