# SDL-UX-008 | One Edit Player Entry + Drill Analysis Source Review

**Date:** 2026-11-20
**Reviewed sources:** current UX feature branch, including `PlayerProfile.js`, `PlayerHeroCard.js`, `ParentHome.js`, `AvatarManager.js`, `js/app.js`, `arAnalyzer.js`, `pitchBiometrics.js`, `pitchAnchorDetector.js`, `pitchOverlayRenderer.js`, `ArAnalyzerModal.js`, and `usePrivateMedia.js`.

## Owner acceptance evidence

Owner reports that after leaving Chrome for 60 seconds and returning, the same player profile remained visible. Mark **user-verified for this 60-second test only**; this does not establish offline reliability or session persistence across arbitrary browser restarts.

## SDL-UX-008: Implemented editing simplification

- The **dedicated Player Profile** has one mobile-aware **Edit Player** entry point.
- Authorized guardian, coach and club-admin picture editing goes through the existing `avatarManager.choose(playerId)` dialog. The dialog is titled **Edit Player**, with a **Profile picture** section. Other player identity/official-stat fields remain read-only under staging pilot permissions.
- Retains the existing legacy full coach editor path only where `isCoach` permits that mode. No coach-stat write privileges expanded.
- Removed duplicate **Change profile picture** calls to action from the player Hero Card and Parent Home.
- Parent Home has **View player profile**, using the existing verified-guardian `submissionWorkspace.showProfile` authorization path.
- The admin-only account directory is a **Manage players** list with **View profile** rather than photo-edit buttons. Profile selection is checked against the server-filtered avatar-managed players list before opening the same profile.
- My/Me photo-directory cards no longer occupy space for ordinary family and coach accounts.
- Synthetic preview has matching parent/player routing and a clearly nonfunctional sample Edit Player dialog. It remains disconnected from Supabase and cannot save photos.

## Existing drill-analysis implementation, NOT scientific validation

1. **Clip selection:** Existing historical drill-video cards may open the analyzer; separate private video viewer fetches an authorized MP4/blob through its Worker then opens `analyzePrivateMedia`. **Current private-video analyzer hardcodes `category:'batting'`, `fps_mode:60`** rather than reading stored metadata. Pitching videos could be processed with the wrong event set.
2. **Tracking:** `index.html` initializes MediaPipe Tasks Vision pose landmark model in VIDEO mode; `arAnalyzer.js` requests decoded frames from the browser with `requestVideoFrameCallback` (animation-frame fallback) and calls `detectForVideo`. This is **not verified full-frame 120/240 fps offline extraction**.
3. **Visual measurements:** 2D joint angles (lead knee and pitching elbow), shoulder line, hip line, upper-body tilt, head displacement in pixels, and overlay trajectories/guides are calculated or drawn from pose landmarks. MediaPipe world landmarks are used for an approximate hip/shoulder separation angle. These values have not been independently calibrated or verified for single-view youth-video measurement accuracy.
4. **Event timing:** Pitching event heuristics estimate leg lift, hip drift, front foot landing, hip/shoulder separation and a **release proxy based on throwing-wrist speed**. Batting estimates stride, launch and a **contact proxy based on hand speed**. Neither detector directly tracks the baseball or bat-ball collision. The UI initially seeds checkpoints as simple fractions of clip duration, before sufficient pose frames are processed. Coach can navigate and manually stamp a checkpoint.
5. **Review labels:** `evaluateBauerPhases` currently uses fixed thresholds for pelvis tilt, lead knee and separation. `arAnalyzer.js` feeds **hard-coded** `driftCoMDelta:0.08` and `headDisplacementRatio:0.09` into this evaluation, so portions of **PASS / FIRST_FAULT / SECONDARY_BLOCKED** cannot be interpreted as evidence-based athlete assessment. Initial seeded checkpoints also default to PASS. A prior phrase **60+ km/h club** is present in the Hero Card; no validated universal youth standard has been established for that badge.
6. **Velocity:** The analyzer HUD `currentCalculatedSpeed` estimates **pixel wrist displacement divided by an assumed torso scale (0.45 m)** and elapsed browser video time. It is **not measured pitched-ball speed or bat exit velocity** and should not be used to evaluate youth performance without validation. There are initialized display placeholders (e.g. 19.9) before successful pose tracking.
7. **Outputs:** Overlay lines, approximate numeric HUD, checkpoint buttons, manual coaching frame stamping, and video playback. There is **no evidenced automated per-athlete validated AI Coach diagnosis** or scientifically accepted injury-risk prediction.

## Scientific QA required before an AI Coach release

Assign the code's output definitions, camera/fps validity, thresholds, release/contact proxies, missing-data behavior, and wrist-speed labeling to **SDL-006-01 integration**, with independently reviewed research from **SDL-006-QA-001**. Do not change the primary GEM-006-A research source or assert the numerical thresholds are validated. Recommend a clear **Experimental / Pose estimate** distinction in the analyzer UX and suppress automatic PASS/fault claims until scientific QA approves measurement-specific logic.

## Verification and remaining acceptance

- GitHub implementation is on `feature/SDL-UX-002-login-redesign`.
- Cloudflare authenticated UX Live CI passed **120/120 focused tests and 1/1 Vue renderer smoke test** on source commit `04c0f406840ce53e451f89066d6aadba4c19b030`.
- Cloudflare synthetic preview CI passed **7/7** allowlist/safety tests on the same source.
- Both Pages projects successfully deployed that commit.
- **Not browser-verified:** One attempted Cloudflare mobile scripted Editor click test timed out (HTTP 422); requires real phone/desktop UAT.
- **Not yet tested with actual identities:** verified parent, coach and club-admin photo update through the revised profile route. Server policies are unchanged; only navigation and presentation changed.

## Suggested owner UAT

1. In the authenticated SDL UX Live **Team → selected player profile**, check that **Edit Player** is the only photo-edit entry point.
2. Tap **Edit Player** and confirm private photo selection/saving is accessible only on a permitted player.
3. As verified parent, **Home → View player profile → Edit Player**; other children must remain inaccessible.
4. As organization admin, **Me → Manage players → View profile → Edit Player**.
5. Confirm mobile portrait view has no extra photo-edit card button, and existing charts/videos/back navigation still work.
6. In video analysis, distinguish the actual pose-derived values from assumed/default thresholds before applying coaching advice.

**No Supabase RLS change, migration, Worker change or production deployment was made in this UX task.**
