import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
const realVue = process.env.SDL004_VUE_RUNTIME
  ? await import(pathToFileURL(process.env.SDL004_VUE_RUNTIME).href) : null;
const root = fileURLToPath(new URL('../../', import.meta.url));
export const user = id => ({ id, email: `${id}@example.invalid` });
export const ok = data => ({ data, error: null });
// Test-only translation of old fixture inputs to the v1 account contract.
// Production code never derives effective scopes from direct memberships.
function fixtureContext(h, explicitRoles) {
  const organizations=(h.rows.organization_memberships || []).filter(m=>m.status==='active').map(m=>({...m,organization_id:m.organization_id || 'synthetic-org'}));
  const teams=(h.rows.team_memberships || []).filter(m=>m.status==='active').map(m=>({...m,team_id:m.team_id || 'synthetic-team'}));
  const guardianLinks=(h.rows.athlete_guardians || []).filter(m=>m.status==='verified').length;
  const roles=explicitRoles || [...new Set([...organizations.filter(m=>m.role==='admin').map(()=> 'club_admin'),...teams.filter(m=>['coach','manager'].includes(m.role)).map(m=>m.role),...(guardianLinks?['guardian']:[])])];
  const orgs=new Map();
  const add=(id,role)=>{if(!orgs.has(id))orgs.set(id,{id,name:id,roles:[]});const row=orgs.get(id);if(!row.roles.includes(role))row.roles.push(role);};
  for(const m of organizations)if(m.role==='admin')add(m.organization_id,'club_admin');
  const teamRows=teams.filter(m=>roles.includes(m.role)).map(m=>{
    const organization_id=organizations[0]?.organization_id || 'synthetic-org';add(organization_id,m.role);
    return {id:m.team_id,organization_id,name:m.team_id,roles:[m.role]};
  });
  return {version:1,user_id:h.user?.id,roles,organizations:[...orgs.values()],teams:teamRows,direct_memberships:{organizations,teams,guardian_links:guardianLinks},platform:{view:false,export:false,sensitive_write:false}};
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export async function until(predicate) {
  for (let n = 0; n < 200; n++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.fail('Timed out waiting for application state');
}
export async function harness(t, initialUser = null, options = {}) {
  const h = { inAuthCallback: false, user: initialUser, rows: {}, queues: {}, calls: [], poseCalls: 0,
    closedTrackers: 0, revoked: [], emitLogin: false, unsubscribed: 0, frames: [] };
  const result = (key, fallback) => h.queues[key]?.length ? h.queues[key].shift() : fallback;
  h.queue = (key, value) => (h.queues[key] ??= []).push(value);
  const db = {
    auth: {
      getUser: () => Promise.resolve(result('getUser', { data: { user: h.user }, error: null })),
      getSession: async () => ({ data: { session: h.user ? { user: h.user, access_token: 'synthetic-token', expires_at: Date.now() / 1000 + 3600 } : null }, error: null }),
      async signInWithPassword(credentials) {
        h.credentials = credentials;
        if (h.loginError) return { error: h.loginError };
        h.user = h.loginUser ?? user('parent');
        if (h.emitLogin) h.emit('SIGNED_IN', h.user);
        return { error: null };
      },
      async signUp(credentials){h.signupCredentials=credentials;return {data:{user:null},error:h.signupError??null};},
      async signOut() {
        if (h.logoutError) return { error: h.logoutError };
        h.emit('SIGNED_OUT', null);
        return { error: null };
      },
      onAuthStateChange(callback) {
        h.authCallback = callback;
        return { data: { subscription: { unsubscribe() { h.unsubscribed++; } } } };
      }
    },
    from(table) {
      const entry = { table, userId: h.user?.id, columns: null, filters: [] };
      h.calls.push(entry);
      const response = result(table, ok(h.rows[table] ?? []));
      const q = {
        select(cols) { entry.columns = cols; return q; },
        order() { return q; },
        eq(col, val) { entry.filters.push({ op: 'eq', col, val }); return q; },
        in(col, vals) { entry.filters.push({ op: 'in', col, vals }); return q; },
        then(yes, no) { return Promise.resolve(response).then(yes, no); }
      };
      return q;
    },
    rpc(name, args) {
      h.calls.push({ rpc: name, args, userId: h.user?.id });
      const key = name === 'sdl_004_coach_roster' ? 'roster' : name;
      const fallback = name==='sdl_v5_account_context' ? fixtureContext(h)
        : name==='sdl_v5_authorized_roster' ? {version:1,role:args.p_role,rows:[],next_after:null} : [];
      return Promise.resolve(result(key, ok(h.rows[key] ?? fallback)));
    }
  };
  h.emit = (event, identity) => {
    h.user = identity;
    h.inAuthCallback = true;
    try { h.authCallback(event, identity ? { user: identity } : null); }
    finally { h.inAuthCallback = false; }
  };
  const originalGetUser = db.auth.getUser;
  db.auth.getUser = () => {
    assert.equal(h.inAuthCallback, false, 'Supabase work must not run inside the auth callback');
    return originalGetUser();
  };
  const Vue = {
    ref: value => ({ value }), reactive: value => value,
    computed: fn => ({ get value() { return fn(); } }), watch() {},
    nextTick: fn => fn?.(), markRaw: value => value,
    ...(realVue ?? {}),
    onMounted: fn => { h.mount = fn; }, onUnmounted: fn => { h.unmount = fn; },
    createApp: options => ({ mount() { h.options = options; h.app = options.setup(); } })
  };
  class BrowserURL extends URL{}
  BrowserURL.createObjectURL=()=> 'blob:synthetic';BrowserURL.revokeObjectURL=url=>h.revoked.push(url);
  const context = vm.createContext({ Vue, AbortController, DOMException, Blob, crypto:webcrypto, window: {
    supabase: { createClient: () => db },
    location:{href:'https://synthetic.invalid/',origin:options.origin,pathname:'/',search:'',hash:options.invitationHash??''},
    history:{replaceState(_a,_b,url){h.replacedUrl=url;}},
    initMediaPipe: async () => {
      h.poseCalls++;
      return result('tracker', { close() { h.closedTrackers++; }, detectForVideo: () => ({ landmarks: [] }) });
    }
  }, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'en' },
  document: { getElementById: () => h.chartCanvas ?? null },
  Chart: class { constructor(_ctx, config) { h.chartConfig = config; } destroy() { h.chartDestroyed = (h.chartDestroyed ?? 0) + 1; } },
  URL: BrowserURL,
  console: { error() {}, warn() {}, log() {} },
  setTimeout, clearTimeout, setInterval, clearInterval, performance, requestAnimationFrame: fn => h.frames.push(fn), cancelAnimationFrame: id => { h.cancelledFrame = id; },
  alert() {}, fetch(...args) {
    if (h.fetchImpl) return h.fetchImpl(...args);
    assert.fail('Network access forbidden in lifecycle tests');
  } });
  const modules = new Map();
  function load(file) {
    if (!modules.has(file)) {
      let source=fs.readFileSync(file,'utf8');
      if(options.submissionsEnabled===true&&file===path.join(root,'js/config.js'))source=source.replace('SUBMISSION_FEATURES_ENABLED = false','SUBMISSION_FEATURES_ENABLED = true');
      modules.set(file,new vm.SourceTextModule(source,{context,identifier:file}));
    }
    return modules.get(file);
  }
  const app = load(path.join(root, 'js/app.js'));
  await app.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier)));
  await app.evaluate();
  h.setFixtureRoles = roles => { h.app.accountContext.value={...(h.app.accountContext.value || fixtureContext(h)),roles}; };
  h.module = name => modules.get(path.join(root, name)).namespace;
  t.after(() => h.unmount());
  await h.mount();
  return h;
}
