## Current complete local validation

```sh
npm ci --ignore-scripts
npm ci --prefix backend/worker --ignore-scripts
npm run check:worker
npm test
```

This includes the original 74 scenarios plus versioned submission backend, UI, dashboard,
consent, idempotency and packaged workerd checks. All data/services are isolated and synthetic.
No test command deploys or connects to a remote database. See `SDL-004-STAGING-RELEASE.md`
for prepared migration/API contracts and explicit deployment gates. The historical read-only
pilot instructions below do not authorize live writes or migration application.

# SDL-004-006 staging security checks

## Local authentication and Phase 3 regression tests

Run from the repository root with Node.js (tested with Node 24):

```sh
node --experimental-vm-modules --test tests/*.test.mjs
```

The suite loads the actual ES modules with synthetic Supabase responses and a minimal Vue
reactivity/lifecycle adapter. It makes no network requests or database/storage writes.
It covers session changes, delayed responses, logout failures, analyzer cleanup, pending
MediaPipe initialization, frame cancellation, chart cleanup, and the existing write/media locks.

To additionally exercise Vue 3 reactivity, set `SDL004_VUE_RUNTIME` to the absolute path of
an independently installed Vue 3 CommonJS runtime (`vue/dist/vue.cjs.js`) and run the same
command. No application dependency or bundler change is needed.

The media suite includes the downloaded Worker source with synthetic R2/Supabase responses.
Worker proposal tests mock RPC decisions. The separate SQL test runs the draft in a local
PostgreSQL/WASM fixture only when `SDL004_PGLITE_RUNTIME` points to an installed PGlite runtime.
It never connects to Supabase and does not prove deployed RLS. The real Vue compiler/renderer
test is skipped unless `SDL004_VUE_RUNTIME` is set. See `SDL-004-PHASE3-REPORT.md` for the verified
contract, changes, blockers and deployment prerequisites.

These tests do not establish deployed RLS, Worker authorization, cross-tab SDK transport,
actual GPU inference, or browser rendering. Session events are supplied by the test adapter.

## Important limitations

- SQL Editor's privileged role **bypasses RLS**. A SELECT performed in SQL Editor is not evidence of browser authorization.
- An empty dashboard alone does not establish isolation. Test direct REST requests under three separate signed-in users.
- The new RPC returns **only** team name, preferred/baseball name, jersey, position, throws and bats, plus UUIDs. Do not add legal name, DOB, family contact, HKLL number, photos, statistics or media until separately consented and approved.
- Phase 3 removes legacy production/public R2 URLs from configuration. Legacy upload/delete helpers remain locked; the new private flow uses only the verified staging Worker. No live uploads/deletes were performed during local validation.

## Run sequence

1. Verify the Supabase dashboard URL belongs to staging project `wvurolqbjhuckkkjiiiv`; ensure recoverable staging backup.
2. Run `sql/01_STAGE_TEAM_A_PLAYER_A.sql` **once**. This explicitly assigns synthetic Test Player A to Pilot Team A. Prior memberships and player/athlete UUIDs remain unchanged.
3. Run `sql/02_COACH_SAFE_ROSTER_RPC.sql` **once** to add a deny-by-default, authenticated-only RPC. Do not replace existing RLS policies.
4. Run `sql/03_VERIFY_STAGING_READ_ONLY.sql`, expecting **6 PASS**.
5. Back up local SDL staging source. Install four files from `frontend/` into staging folder using their relative paths, merging newer local changes first. Keep your working staging `js/config.js` unchanged.
6. Hard refresh `http://127.0.0.1:5500/index.html`.

## Required signed-in tests (each account, then Sign out)

Use Chrome DevTools Console, open only after signing in to a staging account. The snippet below sends requests using your **existing authenticated Supabase client**. It does not print API keys or tokens.

```js
(async () => {
  const { supabaseClient: db } = await import('/js/config.js');
  const [roster, privatePlayer, membership, attemptedWrite] = await Promise.all([
    db.rpc('sdl_004_coach_roster'),
    db.from('players').select('id, dob, hkll_reg_no').eq('id','8f6bfeaf-9bc9-4cd0-b8a2-5809cf2733e4'),
    db.from('player_team_memberships').select('id').limit(1),
    db.from('players').update({ jersey: '__SDL_SECURITY_TEST__' }).eq('id','8f6bfeaf-9bc9-4cd0-b8a2-5809cf2733e4').select('id')
  ]);
  console.table({
    roster: { rows: roster.data?.length ?? null, error: roster.error?.message || null },
    privatePlayer: { rows: privatePlayer.data?.length ?? null, error: privatePlayer.error?.message || null },
    rawMembership: { rows: membership.data?.length ?? null, error: membership.error?.message || null },
    updateDenied: { rows: attemptedWrite.data?.length ?? null, error: attemptedWrite.error?.message || null }
  });
})();
```

**Note:** `updateDenied` should return a permission error. Do not run this against production. Because the database grant is revoked, the test must not modify the jersey. Confirm with SQL Editor `SELECT jersey FROM public.players WHERE id='8f6bfeaf-9bc9-4cd0-b8a2-5809cf2733e4';` if concerned.

Expected outcomes:

| Identity | RPC roster | private player | raw team roster table | update |
|---|---|---|---|---|
| Coach A | 1 baseball-only row | 0 | denied | denied |
| Parent A | 0 | 1 linked child | denied | denied |
| Unrelated | 0 | 0 | denied | denied |
| Signed out | denied (HTTP 401/403) | no access | denied | denied |

Check the RPC response keys in DevTools. They must be a subset of `id, team_id, team_name, jersey, preferred_name, name, position, throws, bats`. **No** `dob`, `hkll_reg_no`, phone, contact, address, private notes, photo/video URLs, or other fields.

The existing guardian `players.select('*')` still exposes private fields *to the verified guardian*. That is intentional for the pilot, but production parental access should eventually use purpose-specific field grants or endpoints. The new coach roster is intentionally separate from the old TeamOverview and PlayerProfile views to avoid reusing components that display DOB/HKLL data.

## Stop conditions

Stop if migration preflight errors, if any check fails, if a non-coach can see the roster, if the coach can access `players.select('*')`, or if any write succeeds. Never disable RLS to make the test pass.
