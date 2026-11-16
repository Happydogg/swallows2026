// SDL-004-007 STAGING ONLY - Paste into Chrome DevTools Console after login.
// READ ONLY: makes no INSERT, UPDATE, DELETE, or upload requests.
(async () => {
  const STAGING = 'https://wvurolqbjhuckkkjiiiv.supabase.co';
  const ACCOUNTS = {
    'c1743541-2701-441a-9ddb-d7443dce004d': 'coach',
    '9102eafe-6f79-4220-9844-e8601fc15cca': 'parent',
    'c7b64036-3aed-4f2f-af3e-8a5e17d17f7c': 'unrelated'
  };
  const PLAYER_ID = '8f6bfeaf-9bc9-4cd0-b8a2-5809cf2733e4';
  const cfg = await import('/js/config.js');
  if (cfg.SUPABASE_URL !== STAGING) {
    console.error('STOP: Supabase URL is not the expected staging project.');
    return;
  }
  const db = cfg.supabaseClient;
  const { data: auth, error: authError } = await db.auth.getUser();
  const userId = auth?.user?.id;
  const role = ACCOUNTS[userId];
  if (authError || !role) {
    console.error('STOP: sign in with one of the three known staging test users.', authError?.message ?? 'Unknown user');
    return;
  }
  const [roster, player, orgs, teams, rawMembership, sessions, videos] = await Promise.all([
    db.rpc('sdl_004_coach_roster'),
    db.from('players').select('id').eq('id', PLAYER_ID),
    db.from('organizations').select('id'),
    db.from('teams').select('id'),
    db.from('player_team_memberships').select('id').limit(1),
    db.from('sessions').select('id').limit(1),
    db.from('drill_videos').select('id').limit(1)
  ]);
  const isDenied = r => Boolean(r.error) && ([401, 403, 404].includes(r.status) || /permission|denied|not allowed|unauthorized|not found/i.test(r.error.message || ''));
  const allowedRosterKeys = new Set(['id','team_id','team_name','jersey','preferred_name','name','position','throws','bats']);
  const actualKeys = [...new Set((roster.data ?? []).flatMap(row => Object.keys(row)))];
  const tests = [
    ['Coach roster count', !roster.error && (roster.data?.length ?? -1) === (role === 'coach' ? 1 : 0), roster.error?.message ?? `rows=${roster.data?.length}`],
    ['Coach roster field allowlist', !roster.error && actualKeys.every(k => allowedRosterKeys.has(k)), `fields=${actualKeys.join(',')}`],
    ['Private Test Player A visibility', !player.error && (player.data?.length ?? -1) === (role === 'parent' ? 1 : 0), player.error?.message ?? `rows=${player.data?.length}`],
    ['Organizations visibility', !orgs.error && (orgs.data?.length ?? -1) === (role === 'coach' ? 1 : 0), orgs.error?.message ?? `rows=${orgs.data?.length}`],
    ['Teams visibility', !teams.error && (teams.data?.length ?? -1) === (role === 'coach' ? 1 : 0), teams.error?.message ?? `rows=${teams.data?.length}`],
    ['Raw player_team_memberships denied', isDenied(rawMembership), rawMembership.error?.message ?? 'unexpected success'],
    ['Sessions table denied', isDenied(sessions), sessions.error?.message ?? 'unexpected success'],
    ['Video metadata table denied', isDenied(videos), videos.error?.message ?? 'unexpected success']
  ];
  console.log(`SDL-004-007 read-only security test | identity=${role} | ${tests.filter(t => t[1]).length}/${tests.length} PASS`);
  console.table(tests.map(([test, pass, detail]) => ({ test, result: pass ? 'PASS' : 'FAIL', detail })));
  if (tests.some(t => !t[1])) console.warn('STOP: One or more checks failed. Do not enable edits or media.');
})();
