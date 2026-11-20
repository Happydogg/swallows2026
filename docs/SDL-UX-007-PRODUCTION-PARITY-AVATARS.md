# SDL-UX-007 / SDL-004-AVATAR-001 | Desktop Sticky Navigation, Private Profile Photos and Production Parity

**Date:** 2026-11-20
**Owner instruction:** Keep the desktop navigation visible while scrolling, allow parents/coaches/club administrators to change player profile pictures, preserve features in the original production application, and continue frontend development.
**Source inspected:** GitHub `main` source compared with `feature/SDL-UX-002-login-redesign`. The GitHub branch is **not independently proven identical to the currently deployed production artifact**.

## Changes actually implemented

### Desktop sidebar
- Updated `components/AppShell.js` to use `md:sticky md:top-4`, viewport-height constraints, internal overflow, and `md:self-start`.
- Mobile fixed bottom navigation remains unchanged.
- Cloudflare Pages successfully deployed the source. A headless **scrolled desktop browser geometry check timed out** and is not recorded as verified. The owner should test a long roster in a 1280px+ desktop window.

### Private profile picture editing
- Created **private** Supabase staging bucket `sdl-avatars-staging`, configured for JPEG only, <= 1 MiB.
- Applied `supabase/migrations/20261120150000_sdl004_private_staging_avatars.sql` to **staging project `wvurolqbjhuckkkjiiiv` only**.
- Added storage RLS policies for authenticated SELECT and **new-object INSERT only**. No UPDATE, DELETE, anonymous photo access, or broader `public.players` UPDATE RLS was added.
- Added server-side `sdl_ux_avatar_can_manage`, `sdl_ux_avatar_managed_players`, `sdl_ux_avatar_save`. Rights are checked against existing active session, verified guardian relation, active authorized coach membership, or club administrator membership.
- `sdl_ux_avatar_save` validates the exact player-ID-scoped storage path, checks that the uploaded image belongs to the active session user, updates **only `photo_url`**, and writes a non-public `sdl_ux_avatar_audit` entry.
- Existing avatar upload via public Supabase `avatars` bucket remains **staging-disabled**. The new flow uses a separate private bucket and short-lived signed read URLs.
- Added `js/avatarService.js`, `composables/useAvatarManager.js`, `components/AvatarManager.js` and integrated into app session lifecycle, Team/coach roster, detailed Player Profile, verified Parent Home and Me/account administration.
- Existing DEMO portrait SVGs remain fallbacks, not user-uploaded photos.
- Signout/session change clears the authorized avatar list; account identity is rechecked before asynchronous UI results are accepted.

**Important identity limit:** A *separate child/player sign-in account* is not yet mapped to a verified athlete identity in the inspected architecture. The authorized actors implemented here are **verified guardians, coaches and club admins**, acting on player profiles. Do not invent player self-service permissions.

## Direct database verification
- Staging private bucket exists with `public=false`, 1 MiB limit and `allowed_mime_types={image/jpeg}`.
- SELECT/INSERT policies were read from the deployed `storage.objects` catalog and both restrict to the exact new bucket and validated player path.
- Required RPCs exist; anonymous execute permissions are denied, authenticated role execute permissions exist, and unauthenticated `sdl_ux_avatar_can_manage` returns false.
- SQL path validator accepts well-formed player/filename paths and rejects traversal paths.
- Staging audit table starts with zero records. **No real signed-in photo upload or parent/admin session acceptance test has yet been performed.**
- Existing staging players, stats, R2 Worker and production project were not changed by this migration.

## Original production source preservation
Compared `main` source with current UX branch:
- **28/28 original core files** under `components`, `composables`, `js`, and `utils` are still present.
- 19 of those files were unchanged at comparison time; 9 had modified source.
- All **25 original named exports** extracted from the changed modules remain present.
- Automated `tests/productionParity.test.mjs` checks the 28 module paths, named exports and presence of original major Vue workspaces/modals.
- This **does not prove feature parity**: changed execution paths, role-specific behavior, hidden routes, gated backend services and browser workflow compatibility still need targeted testing.

## Open production parity gaps (not falsely marked complete)
1. Legacy player add/edit/delete and official session edit/log workflows still have staging authorization gates; do not bypass them through UI flags.
2. Legacy public avatar uploader remains intentionally disabled; the new **separate private** avatar editor is the staging replacement. Old modal uploads must later be routed to the same private service or removed after reviewed parity acceptance.
3. The original R2 upload/signing helper is staging locked. The existing authenticated private-media viewer has user-reported playback success; video submission/upload capabilities require their own acceptance tests.
4. Some pilot/parent statistics and Clubhouse v2 workflows remain deliberately gated. User request for frontend parity does not authorize silently switching off their access controls.
5. Real separate player-account editing and full coach/parent/admin role UAT remain pending.

## Test and deployment status
- GitHub UX branch commit `7cbc0443355960f09e320140cf05fc718947089b`: `sdl-ux-live` deployed successfully.
- Cloudflare UX Live build: **117/117 focused tests plus 1/1 Vue 3 renderer test** passed.
- `sdl-ux-preview` build: **6/6 safe synthetic-preview tests** passed.
- These are automated source/unit/render tests, **not** signed-in guardian/coach/admin photo-upload acceptance tests.
- No change to original `sdl-staging` Pages deployment or production environment.

## Owner UAT
1. Desktop: open `https://sdl-ux-live.pages.dev/`, sign in and scroll through all 15 DEMO players. Confirm the sidebar stays visible.
2. Coach: open a player profile; use **Change profile picture** on the Hero Card, upload a small JPEG/PNG and verify it persists after refresh.
3. Guardian: sign in to a verified family test account; use the family card's photo button and confirm **other unrelated athletes never appear**.
4. Club admin: open **Me → Profile pictures**, select an authorized athlete and verify photo upload.
5. Confirm updated photo appears on the Hero Card, Team roster, and coach Home without changing statistics or videos.
6. Check sign-out and sign-in as another account do not leak previous avatar thumbnails.

## Rollback and governance
- Frontend rollback: Cloudflare Pages revert to the preceding successful deployment and revert the scoped UX commits.
- Database rollback is **not automatic** and must not delete newly uploaded private objects or audit evidence. A safe fail-closed rollback would revoke frontend availability and/or remove only the new avatar policies/functions after a reviewed data/access inventory.
- No production migration, backend Worker expansion, service-role exposure, existing policy changes, or destructive changes occurred.
- Next recommended workstream: SDL-004 credentialed role acceptance testing and SDL-GOV production-feature acceptance matrix, then additional feature parity fixes in SDL-UX.

**Approval:** Owner approved frontend changes and the functional profile-picture capability in this conversation. Production deployment, destructive migrations and unrelated authorization expansions still need explicit approval.
