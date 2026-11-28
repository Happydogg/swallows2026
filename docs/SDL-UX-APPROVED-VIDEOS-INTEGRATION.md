# SDL-UX approved Videos integration acceptance record
Status: release candidate; not equivalent to authenticated/device acceptance.
Base: 570b4bc8e31613c26b3f46dc84959ddddcc85f4c (UX Live only).
Design authority: docs/SDL-UX-002-videos-freeze, plus subsequent owner-approved separate landing cards, large photo hero, and 50-file Batch Upload.
- Hero: shared photo-forward component on coach/family Home, Profile, Stats and private Videos. Existing permitted profile fields retained.
- Roster: scoped players only; searchable name and jersey, numeric ordering, responsive photo grid, team filter, switch player.
- Private gallery: existing authorized media, actual thumbnails, latest accessible item emphasized, All/Batting/Pitching/Throwing; no invented fourth category.
- Playback: selected clip replaces gallery; Watch, Analyze entry, native fullscreen; existing AR HUD retained. Exact playback-position/overlay fullscreen behavior requires physical-device verification.
- Review: existing review-inbox contract, optional team filter, exact row recheck, existing controller handles private playback and review, next without deciding leaves pending. No automatic publication. Queue thumbnails remain placeholders until a safe authorized thumbnail contract exists (contract prohibits background playback downloads).
- Batch Upload and four-card role-aware landing preserved. No backend, permission, consent, media or measurement data changes.
- Remaining parity dependencies: shared Clubhouse feed returns anonymous labels, not authorized teammate identity/photo projection; retain existing safe feed, do not fabricate identities. Exceptional combined staff/guardian scopes and global workspace switching remain to be reconciled. Fullscreen and analysis transition/device acceptance, authenticated review/upload tests, and demo video imports outstanding.
- Rollback: previous UX Live deployment 016d817b-2601-4169-b0cf-4cbfcbc722da.
