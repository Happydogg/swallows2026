# SDL-UX-003 | Mobile Preview & Feedback

## Purpose
Phone/tablet review of the actual in-progress SDL frontend design, without VS Code and without connecting to staging or production data.

## Hosting
- Separate Cloudflare Pages project: `sdl-ux-preview`
- GitHub branch: `feature/SDL-UX-002-login-redesign`
- Build command: `npm run build:ux-preview`
- Output: `dist-ux-preview`
- Deployment: only successful builds from the approved redesign branch
- This project is separate from `sdl-staging`; it must never be used for real sign-in or child data.

## Deliberate safety restrictions
- Build has a **strict file allowlist**: preview entry + AppShell, CoachHome, ParentHome, LoginLanding, InviteOnboarding, logo + disabled configuration shim.
- There is no Supabase client, R2/Worker endpoint, signed URL, private player media, or privileged credential in the deployment output.
- Preview login is a visual-only mock, not real authentication. Invitation acceptance is disabled.
- All sample players are fictional ("Sample Player A", etc.).
- CSP restricts `connect-src` to `'none'`; forms are non-submitting previews.
- Public URL is not protected by Cloudflare Access; **never add real player data**. Do not send real children's names/media in issue reports.
- Print "DEMO ONLY" and source commit on every screen.

## Feedback from a phone
1. Open and bookmark the Cloudflare preview site.
2. Switch between Parent and Coach or select Login / Invitation.
3. Open the app tabs; incomplete screens explicitly say Under construction.
4. Tap **Report issue**, describe the problem, and tap **Copy report**.
5. Paste the report into the SDL UX ChatGPT conversation and attach a screenshot.
6. The copied report records preview commit, screen, role, tab, and viewport size.

## Local validation
Run `npm run build:ux-preview` to validate the strict public package. To test with Live Server, open `dist-ux-preview/index.html`, not the staging `index.html`.

## Implementation evidence
The build runs `tests/uxPreview.test.mjs`, which checks the full exported-file allowlist, forbidden API/secret patterns, ES module resolution, and response headers. Cloudflare build success must be verified independently; GitHub source commits alone do not prove deployment.

## Release and rollback
This Pages project is only for synthetic UX review. It does not approve final-pilot feature flags, real authentication/invitations, any RLS/Worker change, or production deployment. Stop the Pages project's automatic deployments or roll back the preview deployment to suspend review without touching staging/production.

## Next
Connect Pages GitHub builds, verify the URL and CSP, then iterate on Player Profile, Team, Stats, Videos and Me. Keep the preview script updated to use real redesigned components as they are completed.

## Cloudflare Pages project configuration

Project `sdl-ux-preview` is GitHub-connected to this exact redesign branch. The build output is strictly `dist-ux-preview`. The initial public preview deployment must still be independently verified before the URL is advertised as live.

## Verified initial deployment (2026-11-20)
- GitHub-connected separate Cloudflare Pages project `sdl-ux-preview` created.
- Published URL: `https://sdl-ux-preview.pages.dev/`.
- Verified successful production deployment of source commit `709b09df9728f8ff1180f990b994bb51549e905e` on the preview project (not on SDL staging or production).
- Cloudflare build logs confirm **4/4 preview package tests passed**, strict 12-file allowlist, and **1 valid Cloudflare security-header rule**.
- Cloudflare Browser Rendering verified an iPhone-sized (390 × 844) page executes the Vue application and renders `ParentHome`, synthetic "Sample Player A", and the `SDL UX PREVIEW` banner. No uncompiled `<parent-home>` tag remained.
- Automatic deployment on GitHub commits is enabled for the exact redesign branch; other preview branches are disabled.
- **Runtime functional user-acceptance testing remains outstanding:** login and invitation are visual mocks, other tabs are explicitly under construction, and live staging/backend access is intentionally absent.
