# SDL-000-CODEX-OVERNIGHT-20261121 | Staging functional web-app handoff

**Owner objective:** Deliver a genuinely usable staging-connected Swallows DataLab application for next-day review, on desktop and mobile. All changes must be committed and documented in GitHub. Production must remain unchanged.

**IMPORTANT:** This file is an instruction handoff, not proof of feature completion. Reinspect current repo HEAD, deployment logs and live staging state before accepting any historical claim.

## Environment and scope

- GitHub repository: `Happydogg/swallows2026`.
- Base branch: `feature/SDL-UX-002-login-redesign` (review current HEAD; do not silently overwrite concurrent commits).
- Authenticated UX Pages: `https://sdl-ux-live.pages.dev/`.
- Public synthetic UX-only preview: `https://sdl-ux-preview.pages.dev/`.
- Supabase STAGING only: `wvurolqbjhuckkkjiiiv`, project name `swallows-datalab-staging`.
- Private R2 bucket STAGING: `sdl-media-staging`, protected by Worker `sdl-r2-staging-gate`.
- Private avatars: Supabase `sdl-avatars-staging`.
- Branch builds deploy automatically to UX Pages; a successful CI step alone is not deployment acceptance.
- Production GitHub main, production Supabase, Cloudflare resources, buckets, secrets, and DNS are forbidden.
- Existing frontend: Vue 3 global build, Composition API, native ES modules, Tailwind CDN, static hosting. Preserve public exports, component props/events, bindings, existing workflows, tests.

## Evidence first: source of truth

Read these current files before editing:

1. `SDL_MASTER_INDEX.md`, `SDL_DECISION_REGISTER.md`, `SDL_ROADMAP_STATUS.md`.
2. `docs/SDL-000-20261121-STAGING-COMPLETION-SPRINT.md`.
3. `docs/SDL-004-SESSION-UX-001-CONSOLE-AUDIT.md`, `docs/SDL-UX-007-PRODUCTION-PARITY-AVATARS.md`, `docs/SDL-UX-008-PLAYER-EDIT-AND-DRILL-ANALYSIS.md`.
4. `docs/SDL-004-FINAL-PILOT.md`, `docs/SDL-004-WINDOWS-RELEASE.md`, current applied SQL migrations, Worker code and deployment baseline.
5. `index.html`, `js/app.js`, `components/{AppShell,PlayerProfile,PrivateMediaPanel,AuthorizedStatsBoard,CoachTeamRoster,ParentHome,AvatarManager}.js`, `js/{authorizedStatsService,privateMediaService,videoThumbnail,avatarService}.js`, `composables/{useAuthSession,usePrivateMedia,useAuthorizedStatsBoard,useAvatarManager}.js`, `backend/worker/*.mjs`, `tests/*.mjs`.
6. Compare `main` vs this branch for preservation of legacy production-source behavior; do not equate source main with deployed production without independent verification.

Reconcile conflicts: historical documents may say final-pilot SQL is absent/unapplied, while the actual staging migration ledger already has workflow objects. Never reapply old proposals without an exact live schema/ledger check.

## Observed current state

- 15 fictional DEMO athletes, 120 historical synthetic sessions, 15 active demo club-enrollment records. The 15 club records have recording permission **false**, not team sharing consent.
- Existing coach-safe and guardian-safe stats RPCs are used to present actual recorded history. SQL QA: one active coach session can read eight demo rows; missing JWT is denied. This is not authenticated mobile browser UAT.
- Private R2 MP4 playback previously succeeded in user testing. Video previews now use private MP4 frames decoded on demand in browser, no persistent/public thumbnail URLs.
- Player profile image editing is via the single Edit Player entry point, under private storage rules. 15 fictionally illustrated avatar placeholders exist; real photo editing still needs signed-in role acceptance.
- Video analysis requires declared pitching/batting and original FPS; automatic event and metric estimates are experimental, not approved science.
- Navigation uses five tabs and corrected SVG icons. Desktop sticky sidebar behavior has not been geometrically verified on a long page.
- **SDL-004 v2 backend and frontend gates remain off:** Worker `SUBMISSIONS_ENABLED=false`, frontend `SUBMISSION_FEATURES_ENABLED=false`. Do not claim invitations/parent submissions/review/Clubhouse are live while off.
- Earlier deployment at commit `05fc32a6` passed 128/128 focused tests plus Vue renderer smoke. Subsequent player-profile embedded-private-video commits (e.g. `f3d97fae`, `819de0b1`, `46e1f368`) had failing UX Live build(s) in the Vue renderer smoke, despite 129/129 focused tests passing. Failure was stale/unmet renderer assertion expecting `Video Room` or `Choose a player` in a limited-access route. Inspect latest logs; **do not assume the newest integration is deployed**.

## Target outcome: an actual usable app, not just UI mocks

**P0 build/release repair first:** Pull and inspect HEAD, run `npm ci --ignore-scripts`, `npm run build:ux-live`, `npm run build:ux-preview`, `npm test` (and `npm run check:worker` if backend modified). Fix the **test AND actual conditional rendering** to reflect role-based video component mounting. Never weaken tests only to conceal broken runtime behavior. Check Cloudflare Pages deployment to the actual Git commit and browser console/network.

**P0 connected mobile workflows:**
- Login and preserve same-user identity/session, selected player, charts and media across tab switch, 60-second background/resume, token renewal and temporary weak signal. Signout and genuine identity change must clear private data; revoked membership must fail server authorization. No recurrence of unauthorized direct `GET /rest/v1/sessions` 403.
- Coach Home and Team show the full authorized scrollable roster with portrait/name; tapping either opens the correct player profile directly. Profile shows photo hero, actual dated height/weight/velocity/speed trend, recent private videos with real visible preview frames, playback, edit-player entry and an intelligible route back. Ensure no duplicate player/video UI when switching tabs.
- Verified family can open linked children only, view their authorized history/videos and edit photos only if permitted. Admin can manage approved photos only within its authorized organization. Independent player login/photo editing is not authorized by an inferred relation.
- Stats tab shows real server-scoped historical measurements and clear units/methods, not images of charts or invented outcomes. No erroneous team aggregates or universal youth standards.
- Videos tab/player-profile video section: authorized private R2 clips have real thumbnails, responsive cards, reliable playback and correct permission failures; assess first-thumbnail network cost and fallbacks. Video upload, errors/retry, MP4 size/codec handling, and private recording/category/FPS metadata need working UI.
- Analysis opens the selected authorized MP4 with user-confirmed recording metadata and visibly labels experimental pose estimates. Do not present simulated ball speed, automatic PASS/fault, wrist-speed estimate or camera-derived approximations as validated facts.
- Navigation and layout responsive at 360, 390, 768, 1280px: bottom bar fixed, desktop sidebar remains visible while long team roster scrolls, no mobile horizontal overflow; accessible keyboard/touch.
- Ensure demo assets look coherent with approved sports dashboard; do not copy reference minors' portraits to demo storage or fabricate actual member consent.

**P0 integration and security:** run role matrix (assigned coach, verified parent, org admin, unrelated user, revoked session) at RPC/Worker/Storage layer and in UI. Test data denial, source object access, media and photo paths, owner-only official-stat writes, complete logout and request cancellation. Maintain tenant isolation; never expose service role. Confirm current Worker binding and compatible code before changing Worker.

**P1 only after P0 & rollback prerequisites:** complete staging invitation, family performance/growth correction, coach approval, enrollment admin, and opt-in Clubhouse sharing, if necessary to meet user review goal. Existing schemas may already be installed, but both gates are off. Before enabling: verify non-secret current Worker baseline, confirmed email flows, audited DB migrations, actual backup and isolated restore, and negative auth tests. If prerequisites are unavailable, document blocker explicitly and leave gates off. Do not bypass server-side consent/permissions to improve demo appearance.

**Performance and polish:** no eager GPU/media initialization at login, no repeated auth reset on focus, no duplicate media mounts, clear loading and offline handling, production-compatible static assets if safely feasible. Pin/compile Tailwind for UX Live if it does not threaten existing behavior; preserve fallback. Keep CDN dependencies pinned or audited.

## Operational rules

- Staging-only changes are owner-approved, but no destructive database operation, source data deletion, production route/secret modification or privilege broadening is authorized. Require additional explicit consent for such actions.
- Before any staging DB/Worker deployment, capture a rollback baseline and verify recoverable backup where the change warrants it. No automatic SQL DROP/TRUNCATE/restore. No production merge.
- Do not mutate applied migration files. Add a new ordered migration when necessary; save SQL and postflight verification.
- Never log/publish secrets, live access tokens or personal data. Prefer synthetic data; user says staging players are mock, but this is not proof all accounts/storage content are synthetic.
- Commit focused tested changes to the existing feature branch or a task-specific branch with a reviewed PR into the feature branch. Keep latest GitHub HEAD coordinated and avoid overwriting parallel work.
- Cloudflare Pages auto-builds upon GitHub push. Verify result of **latest** hash; a GitHub commit is not proof of deployed app.
- Preserve all existing exports, Vue bindings, RLS and Worker v1 media behavior. Keep synthetic no-backend UX preview isolated.

## Mandatory objective verification

1. `npm run build:ux-live` green; `npm run build:ux-preview` green; full `npm test` green. No skipped security-critical failures.
2. Cloudflare authenticated UX Live deploy latest intended tested hash and responds with real mounted Vue login (not raw placeholders), with no relevant console errors.
3. Signed-in coach completes Home → full Team roster → each sampled DEMO player profile → 8 time-series sessions → photo hero → authorized R2 thumbnail/playback → Stats → return to same profile → signout.
4. A verified family account sees only linked player(s). Admin photo edit and guardian photo edit work if authorized. Unrelated/revoked user receives server denial. Preserve official-stat edit privileges.
5. Actual uploaded MP4 has a real frame preview on phone; play/pause, clip switching, analyzer open and error messages work. No unrelated stock artwork.
6. Desktop and phone behavior at sizes above; side navigation sticky and bottom navigation correct.
7. If v2 gates enabled, prove invite from known email, verified acceptance, parent input, coach approval, consent opt-in, Clubhouse sharing and revocation end-to-end; otherwise mark blocked, not done.
8. Every DB/Worker/Pages operation documented with target, timestamp, before/after, commit/version/deployment ID, verification and rollback.

## GitHub deliverables

Update `SDL_MASTER_INDEX.md`, `SDL_DECISION_REGISTER.md`, `SDL_ROADMAP_STATUS.md` and add or update `docs/SDL-000-CODEX-OVERNIGHT-RESULT-20261121.md` including:
- Feature status matrix with Proposed/Approved/Implemented/Tested/Staging-verified/Production-verified;
- Files touched and direct comparison to original main production-source modules;
- Test commands with counts and traceable CI result;
- Exact Pages deployment hashes/URLs and Worker version/bindings (names only);
- Staging SQL migrations/row-count/authorization QA;
- Device/browser screenshots or test traces and role matrix;
- Bugs fixed, known failures, blockers, rollover plan and reversible rollback instructions.

Final Codex response must contain a short handoff for a nontechnical owner: working review URL, latest deployed commit, what to click to verify, what is still blocked, and whether production was untouched. **Do not say 'fully functional' without the actual end-to-end evidence.**

## Autonomous execution model

Begin with a short plan but do the implementation, CI, fixes and staging verification without awaiting routine design approvals. If you hit a missing connector, credentials, inability to access staging or migration/backup blocker: do all safe unblocked work, record exact required owner action, never fabricate completion. A cloud task should remain inspectable and push source results to GitHub before completion; do not leave only uncommitted workspace edits. Use strong reasoning for RLS, auth, storage and deployment; independent QA review where feasible.
