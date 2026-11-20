# SDL-004-FIXTURE-001 | Verified 15-player staging demo dataset

**Task:** Populate the existing Supabase staging project with 15 fictional team players and measurable 14-month growth histories, then make a safe mobile review of the trends.

**Project:** `swallows-datalab-staging` (`wvurolqbjhuckkkjiiiv`). Do not run this seed in the separate `Swallows2026` project.
**Seed source:** `backend/seeds/SDL-004-fixture-15-players.sql`.
**Read-only snapshot:** `js/demoGrowthFixture.js`, extracted from the staging SQL rows on 2026-11-20.
**UI:** `components/DemoGrowthLab.js`, integrated in `components/StatsHub.js`.

## Implemented database changes (2026-11-20)

- Inserted **15 new DEMO-prefixed players**, each with a fictional athlete row, in **SDL Pilot Organization A**, assigned to **SDL Pilot Team A** through 15 active team-player links.
- Inserted **8 dated sessions per player** covering **2025-08-15 through 2026-10-15**, total **120 measurements**.
- Every session contains height (cm), weight (kg), exit velocity (km/h), throwing velocity (km/h), 18.29 m sprint time (seconds), broad jump (cm), dominant grip, pinch and attack angle. No shoulder safety judgement was generated.
- Existing four non-demo player records were preserved.
- All player IDs, athlete IDs, team-player links and sessions use a reproducible deterministic seed key, with `ON CONFLICT(id) DO NOTHING`, guarded by the correct staging organization/team context and a transaction.
- SQL insertion initially failed due to an ambiguous PL/pgSQL identifier. Transaction rolled back with **zero** new rows; the source was fixed before a successful run.

## Independent read-only verification

- Total staging players: **19**; DEMO players: **15**; preexisting players retained: **4**.
- Total session rows: **120** for **15** distinct demo players.
- **8** checkpoint dates; all six core metrics present on all 120 rows.
- Active assigned team links: **15**; newly created guardian links: **0**.
- Database object schema, RLS policies, authorization roles, auth users, Worker and R2 bindings: **unchanged**.

## Why the initial charts are a snapshot, not live Supabase queries

The staging `public.sessions` relation has RLS enabled but **no authenticated SELECT policy**. The authenticated coach roster is available through the existing `sdl_004_coach_roster` RPC, but that function deliberately returns roster fields, not raw sessions. The parent-safe statistics service and pilot v2 endpoints remain gated.

To respect the SDL security and release-governance requirements, **no RLS policy was added, no new SECURITY DEFINER routine was created, and no session permission was broadened**. The new `DemoGrowthLab` shows an accurately labeled, static copy of the **actual newly seeded synthetic rows**. It does not pretend to dynamically read Supabase.

The owner can select any of the 15 players and inspect trends for height, weight, throwing velocity, batting exit velocity, 18.29 m sprint time and standing broad jump, including all eight raw checkpoints. The demonstration is never presented as validated youth thresholds or as authentic athlete data.

## Approved frontend deployment boundary

- **Authenticated design and player roster:** `https://sdl-ux-live.pages.dev/`; select the **Stats** tab to see the staging snapshot dashboard and **Team** for the authorized coach roster.
- **Synthetic design preview:** `https://sdl-ux-preview.pages.dev/?tab=stats`; entirely offline fixture assets with no live backend connection.
- Neither site needs a database schema change for the snapshot display.
- No production release or `sdl-staging` Pages deployment was changed.

## Verification / acceptance

The database counts above were directly queried after insertion. Hosted build tests are independent and must be recorded against the final committed version before declaring deployed.

**Pending owner UAT:** Sign into UX Live with the account that already has active coach/staff membership on SDL Pilot Team A, open Team to see the DEMO-prefixed roster, and select Stats to inspect growth trends.

**Future live-data dependency:** To make graphs refresh automatically when new staging sessions are recorded, SDL-004 must separately approve and implement a narrow, authorization-enforced **read-only coach statistics API or RLS policy**, with independent security tests and an appropriate approved parent-safe path. Do not change permissions solely to speed up mock-data review.

**Rollback:** Keep the seed script for audit. Any later cleanup should be a separately approved, exact deterministic-ID deletion plan that verifies no newly attached media, enrollments or downstream rows first. Never bulk-delete by a name prefix without a preview and confirmation.
