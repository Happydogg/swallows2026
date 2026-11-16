// Optional full Vue compiler + custom-renderer smoke test (no DOM/network).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { harness, user } from './helpers/appHarness.mjs';
const runtime = process.env.SDL004_VUE_RUNTIME;
test('Vue 3 compiler and renderer preserve shell, private media, player and analyzer bindings', { skip: !runtime }, async t => {
  const Vue = await import(pathToFileURL(runtime).href);
  const { compile } = createRequire(runtime)('@vue/compiler-dom');
  const h = await harness(t, user('parent'));
  const makeRender = template => {
    const render = new Function('Vue', compile(template, { hoistStatic: false }).code)(Vue);
    render._rc = true; // Match Vue's runtime compiler handling of with(_ctx).
    return render;
  };
  for (const component of Object.values(h.options.components)) component.render = makeRender(component.template);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const template = html.slice(html.indexOf('  <div id="app"'), html.indexOf('  <!-- Root Application Entry Module -->'));
  const node = (type, text = '') => ({ type, text, children: [], props: {}, parent: null, tagName: type.toUpperCase(), addEventListener() {}, removeEventListener() {},
    get options() { return this.children; },
    ...(type === 'video' ? { pause() {}, load() {}, removeAttribute() {} } : {}),
    ...(type === 'canvas' ? { getContext: () => ({ clearRect() {} }) } : {})
  });
  const renderer = Vue.createRenderer({
    createElement: type => node(type), createText: text => node('text', text), createComment: text => node('comment', text),
    setText: (n, text) => { n.text = text; }, setElementText: (n, text) => { n.text = text; n.children = []; },
    parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] ?? null,
    patchProp: (n, key, _old, value) => { n.props[key] = value; },
    insert(n, parent, anchor = null) {
      if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1);
      const i = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(i < 0 ? parent.children.length : i, 0, n); n.parent = parent;
    },
    remove(n) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null; }
  });
  const warnings = [], errors = [];
  const app = renderer.createApp({ components: h.options.components, setup: () => h.app, render: makeRender(template) });
  app.config.warnHandler = message => warnings.push(message);
  app.config.errorHandler = error => errors.push(error);
  const host = node('root'); app.mount(host); t.after(() => app.unmount());
  const flatten = n => `${n.text} ${n.children.map(flatten).join(' ')}`;
  assert.match(flatten(host), /Private player videos/);
  h.app.privateMediaController.mediaReadAllowed.value = true;
  h.app.privateMediaController.mediaPlayerId.value = '11111111-1111-4111-8111-111111111111';
  h.app.privateMediaController.mediaItems.value = [{ id: '33333333-3333-4333-8333-333333333333', byte_size: 12 }];
  await Vue.nextTick(); assert.match(flatten(host), /Play privately/);
  h.app.selectedPlayer.value = { id: 'player', preferred_name: 'Synthetic Player', jersey: '07' };
  h.app.currentView.value = 'player'; await Vue.nextTick();
  assert.match(flatten(host), /Synthetic Player/);
  h.app.openAnalyzer({ id: 'local', video_url: 'blob:synthetic', category: 'pitching', fps_mode: 60 });
  await Vue.nextTick(); assert.match(flatten(host), /Back to Profile/);
  await h.app.signOutAndClear(); await Vue.nextTick();
  assert.doesNotMatch(flatten(host), /Synthetic Player|Play privately|Back to Profile/);
  assert.equal(errors.length, 0, errors.map(String).join('\n'));
  assert.equal(warnings.length, 0, warnings.join('\n'));
});
