import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
const realVue = process.env.SDL004_VUE_RUNTIME
  ? await import(pathToFileURL(process.env.SDL004_VUE_RUNTIME).href) : null;
const root = fileURLToPath(new URL('../../', import.meta.url));
export const user = id => ({ id, email: `${id}@example.invalid` });
export const ok = data => ({ data, error: null });
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
export async function harness(t, initialUser = null) {
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
      h.calls.push({ table, userId: h.user?.id });
      const response = result(table, ok(h.rows[table] ?? []));
      const q = { select() { return q; }, order() { return q; }, eq() { return q; },
        then(yes, no) { return Promise.resolve(response).then(yes, no); } };
      return q;
    },
    rpc(name) { h.calls.push({ rpc: name }); return Promise.resolve(result('roster', ok(h.rows.roster ?? []))); }
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
  const context = vm.createContext({ Vue, AbortController, DOMException, Blob, window: {
    supabase: { createClient: () => db },
    initMediaPipe: async () => {
      h.poseCalls++;
      return result('tracker', { close() { h.closedTrackers++; }, detectForVideo: () => ({ landmarks: [] }) });
    }
  }, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'en' },
  document: { getElementById: () => h.chartCanvas ?? null },
  Chart: class { constructor(_ctx, config) { h.chartConfig = config; } destroy() { h.chartDestroyed = (h.chartDestroyed ?? 0) + 1; } },
  URL: { createObjectURL: () => 'blob:synthetic', revokeObjectURL: url => h.revoked.push(url) },
  console: { error() {}, warn() {}, log() {} },
  setTimeout, clearTimeout, performance, requestAnimationFrame: fn => h.frames.push(fn), cancelAnimationFrame: id => { h.cancelledFrame = id; },
  alert() {}, fetch(...args) {
    if (h.fetchImpl) return h.fetchImpl(...args);
    assert.fail('Network access forbidden in lifecycle tests');
  } });
  const modules = new Map();
  function load(file) {
    if (!modules.has(file)) modules.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
    return modules.get(file);
  }
  const app = load(path.join(root, 'js/app.js'));
  await app.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier)));
  await app.evaluate();
  h.module = name => modules.get(path.join(root, name)).namespace;
  t.after(() => h.unmount());
  await h.mount();
  return h;
}
