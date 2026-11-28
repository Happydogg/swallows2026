# Swallows DataLab | Videos UX Design Freeze

**Version:** 1.0 (public documentation edition)  
**Owner approval:** 28 November 2026 (Hong Kong time)  
**Workstream:** SDL-UX / SDL-UX-002 (record association; no new task ID assigned)  
**Dependencies:** SDL-004B, SDL-004D, SDL-004E, SDL-005  
**Status:** Owner-approved UX direction, frozen. Implementation, security acceptance and device testing remain pending.

This public edition preserves the approved UX decisions. The complete internal handoff and reference renderings are retained separately; internal audit observations are intentionally excluded. The written decisions govern where illustrative mockups differ.

## 1. Objective

One consistent, mobile-first Videos experience for guardians, coaches, team staff and administrators, with actions adapted to independently verified permissions. Watching and player development are distinct from content approval. Multiple roles do not require manual Family/Coaching mode switching. Reopen the design only for demonstrated usability, accessibility, implementation or security issues, or owner-authorized change control.

## 2. Navigation and roles

Tapping Videos in the main navigation exposes only eligible destinations.

| Role | My Videos | Team Videos (guardian) | My Team Videos (staff) | Review Videos |
|---|---|---|---|---|
| Guardian | Linked children | Eligible approved shared content | No by guardian role alone | No |
| Coach | If also guardian | Eligible guardian scope | Authorized team/player scope | Authorized submissions |
| Team Manager | If also guardian | Eligible guardian scope | Assigned scope, limited actions | Not shown solely by manager role in frozen UX; confirm authoritative capabilities before implementation |
| Club Admin | If also guardian | Eligible guardian scope | Authorized club team scope | Authorized submissions |
| Platform Admin | If also guardian | Eligible guardian scope | Restricted independently authorized administrative access only | Not a default operational review role |

A coach who is also a guardian sees the approved three destinations: **My Videos, My Team Videos, Review Videos**. Guardian-only users retain My Videos and Team Videos. Staff without guardian relationships do not get a family gallery. Preserve legitimate guardian access outside staff scope; the exact presentation for this exceptional dual-role case is an implementation follow-up. Role labels do not independently grant access.

- One authorized staff team: open its roster directly.
- Multiple authorized staff teams: select a team inside My Team Videos.
- Changing staff teams never changes My Videos.
- Review Videos combines eligible pending submissions across authorized teams/players, without mandatory team preselection; optional team filter.

## 3. Player galleries

### My Videos

Multiple linked children: select a child from the photo-first grid. Single linked child: open that child's gallery directly. After selection, show a compact hero card with photo, name, jersey number, team and authorized + Upload Video beside the player identity. A discreet Switch Player link returns multi-child guardians to the selection grid. No upload action before selection or where upload is unauthorized.

### Team Videos / My Team Videos

Photo-first roster, jersey-number ordering and search by name or number. Selecting a player opens the same hero-card and gallery pattern. Guardian Team Videos shows eligible shared teammate content, without teammate upload actions. Staff My Team Videos adds authorized upload and management actions to the same interface. Player visibility and actions remain scope-limited.

### Gallery and responsive layout

- Retain the four approved activity filters. Batting, Pitching and Throwing were identified in discussion; verify the fourth label against the original approved UX reference and category schema before implementation.
- Emphasize the latest accessible video; older clips appear in a thumbnail grid.
- Phone portrait-first: featured video full width, older videos two columns.
- iPad landscape-first, portrait fully supported: portrait featured full width and older clips three columns; landscape featured video left and older clips right.
- Desktop/laptop: wide layout. Do not force orientation.
- Preserve original clip framing in playback. Back restores the prior gallery, team/player, filters and scroll position where practical.

## 4. Dedicated video player

Opening a thumbnail navigates to one dedicated video page. Watch is the default; begin normal playback when the browser permits, otherwise expose Play. Watch, Analyze and Fullscreen are states of the same selected video, not separate destinations.

**Watch:** Familiar YouTube-style video-first presentation, then title/player/date and action bar. Play/pause, replay, scrub, speed controls and fullscreen. No advertising, recommended-video feed or popularity rankings. Keep advanced analysis controls out of the initial presentation. Reserve locations for future coach feedback, comments and reactions.

**Analyze:** Activate MediaPipe on the same clip without forcing fullscreen. Preserve position where technically feasible; returning to Watch hides analysis overlays/tools. Place analysis controls immediately below or beside the video; comments move down or into a collapsible panel. Preserve existing ±1-frame and ±5-frame stepping, timestamps/frame indices, slow motion (0.1×, 0.25×, 0.5× and 1×), checkpoint navigation and authorized stamping, reference guides and pose/biomechanics overlays. Distinguish detected/estimated and coach-confirmed checkpoints; do not imply unsupported measurement precision.

Fullscreen is available in both modes. Phone users can rotate to landscape; hide comments in fullscreen and prioritize the video and applicable controls. Preserve clip and position across transitions where supported. Verify iPhone Safari fullscreen/orientation, custom overlay visibility, actual frame timing and alignment during device testing.

## 5. Review Videos

Purpose: efficient content suitability approval, not biomechanical evaluation.

1. Show pending count where available; one queue across authorized teams/players with optional team filter. Each item shows thumbnail, player, team, activity, submission date and status.
2. Open a simple player: regular play/pause, timeline scrub, fullscreen, optional 1.5×/2× faster playback. No MediaPipe, frame controls, biomechanics checkpoints or comments.
3. Show Approve, Reject and Next Video. Check player identity, categorization, suitability and applicable sharing constraints.
4. Successful approval removes the pending item and advances to the next eligible submission. Next Video without a decision leaves it pending. Rejection reason handling remains a narrow implementation decision. Failed decisions must not be treated as successful.
5. Approval is not publication, consent, sharing, download or external distribution. Verify authorization when opening a submission and recording a decision; retain an appropriate decision audit record.

Detailed mechanics analysis belongs in My Team Videos.

## 6. Deferred enhancements

These are reserved design positions, not implementation authorization:

- Positive thumbs-up only; no thumbs-down, public popularity rankings or prominent per-thumbnail reaction counts.
- Coach feedback and eligible parent/teammate comments, including timestamped comments that jump to the associated video moment. On phone, comments are visible below Watch and lower down in Analyze; on wider layouts use a collapsible side panel. Hide comments in fullscreen.
- Child-appropriate moderation, audience controls, consent and reporting before any engagement release.
- SDL-005: seamless capture, batch upload, multi-clip player/activity assignment, in-app recording and trimming/preparation. The current design reserves the player-specific upload entry point.

## 7. Implementation acceptance criteria

| Area | Acceptance criterion |
|---|---|
| Navigation | All relevant single/multiple-role cases show permitted destinations without manual role switching. |
| Multi-team | Staff team changes affect only staff context; pending review includes only eligible submissions and counts. |
| Gallery | Hero card, upload placement, search, sorting and responsive grids follow approved direction. |
| Playback | Thumbnail opens Watch; Analyze uses same clip; transitions preserve position where supported; original framing retained. |
| Analysis | Existing frame controls, speed, timestamps, checkpoints, reference guides and overlays remain functional; verify frame alignment. |
| Review | Simple playback, authorized pending list, decisions, next-item flow and failure handling operate without detailed analysis. Approval is distinct from publication. |
| Authorization | Verify server-side access and consent enforcement, team/club isolation, applicable delegation and review restrictions, including direct API/media access tests. |
| Devices | Test iPhone Safari, Android Chrome, iPad both orientations and desktop; include touch, fullscreen, overlay and accessibility checks. |

## 8. Implementation gates and follow-ups

Confirm the current authoritative role/capability matrix, particularly Team Manager approval/delegation, before implementing affected navigation. The frozen UX does not silently change backend authority. Resolve the fourth filter label, rejection reason requirement and exceptional guardian-only team navigation; verify existing upload and analysis integration, browser behavior and device tests. These checks do not reopen the approved visual direction.

## 9. Approval history and handoff

- 28 November 2026 HKT: owner accepted guardian hero card/gallery, responsive orientation approach, dedicated Watch/Analyze player, combined coach/guardian navigation and cross-team review queue.
- Same date: owner approved the simplified content-review rendering and explicitly froze the design.
- Same date: owner accepted the staff/admin navigation correction.
- Same date: documentation-only branch approved, separate from deployment-connected development branches.

The earlier navigation rendering's detailed review player is superseded by the final simplified review rendering. Illustrations are not functioning software or authority specifications.

**Handoff:** SDL-000 should record the freeze in the master project records, retain implementation/security/testing gates, and route capability reconciliation to SDL-004B. No application changes, permission changes, migrations or deployments are authorized by this record.
