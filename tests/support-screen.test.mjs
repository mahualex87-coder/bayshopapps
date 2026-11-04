import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const identity = { userId: 'TEST-UID', jwt: 'synthetic-private-identity', expiresInSeconds: 300 };
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const walk = node => Array.isArray(node) ? node.flatMap(walk) : !node || typeof node !== 'object' ? [] : [node, ...walk(node.props?.children)];
function load(file, imports) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: key => { assert(key in imports, key); return imports[key]; }, JSON, AbortController, Set, Symbol });
  return exports;
}
function harness(overrides = {}) {
  const state = { authenticated: true, accountId: '1', authRevision: 1, uid: 'TEST-UID', pathname: '/warehouse', available: true, mode: 'system', readResult: identity, nativeResult: { ok: true }, ...overrides };
  const navigated = [], reads = [], opened = [], keyboard = [], slots = [], pendingEffects = [];
  let cursor = 0, dirty = false, tree;
  const changed = (previous, deps) => !previous || !deps || deps.length !== previous.length || deps.some((value, index) => !Object.is(value, previous[index]));
  const effect = (fn, deps) => { const index = cursor++; if (changed(slots[index]?.deps, deps)) pendingEffects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; }); };
  const memo = (fn, deps) => { const index = cursor++; if (changed(slots[index]?.deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; };
  const react = {
    createContext(value) { const context = { value }; context.Provider = { context }; return context; }, useContext: context => context.value,
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { const value = typeof next === 'function' ? next(slots[index]) : next; if (!Object.is(slots[index], value)) dirty = true; slots[index] = value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps), useEffect: effect, useLayoutEffect: effect,
  };
  const jsx = (type, props) => { if (type?.context) type.context.value = props.value; return { type: type?.context ? 'SupportContext' : type, props: props || {} }; };
  const readView = async (input, options) => { reads.push({ input, options }); return typeof state.readResult === 'function' ? state.readResult() : state.readResult; };
  class ApiError extends Error { constructor(status, key) { super(key); this.status = status; this.key = key; } }
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'expo-router': { router: { push: path => navigated.push(path) }, usePathname: () => state.pathname },
    'react-native': { View: 'View', Text: 'Text', Modal: 'Modal', Keyboard: { dismiss: () => keyboard.push('dismiss') } },
    '@/api/context': { useLiveAccount: () => ({ ...state, resources: { profile: { data: state.uid ? { clientCode: state.uid } : null } }, readView }) },
    '@/api/client': { ApiError, errorMessage: () => 'errors.loadFailed' },
    '@/i18n/context': { useI18n: () => ({ t: key => key }) }, '@/theme/context': { useTheme: () => ({ mode: state.mode }) },
    '@/ui': { Button: 'Button', useUi: () => ({ s: {}, colors: {} }) },
    './native-support': { nativeSupportAvailable: () => state.available, openNativeSupport: async (...args) => { opened.push(args); return typeof state.nativeResult === 'function' ? state.nativeResult() : state.nativeResult; } },
  };
  const exports = load('../src/features/support/SupportChatProvider.tsx', imports);
  function render() { let turns = 0; do { dirty = false; cursor = 0; tree = exports.SupportChatProvider({ children: 'Retained screen' }); while (pendingEffects.length) pendingEffects.shift()(); assert(++turns < 10); } while (dirty); }
  render();
  return { state, render, navigated, reads, opened, keyboard, ApiError, value: () => exports.useSupportChat(), nodes: () => walk(tree), modal: () => walk(tree).find(node => node.type === 'Modal'), unmount: () => { for (const slot of slots) slot?.cleanup?.(); } };
}

test('support starts idle and a deliberate press opens native chat without changing the current route', async () => {
  const h = harness({ mode: 'dark' });
  assert.equal(h.reads.length, 0); assert.equal(h.opened.length, 0);
  assert.equal(h.value().busy, false); assert.equal(h.modal().props.visible, false);
  await h.value().open(); h.render();
  assert.equal(h.reads.length, 1); assert.equal(h.reads[0].input.kind, 'support.identity');
  assert.equal(h.opened.length, 1); assert.equal(h.opened[0][0], identity);
  const options = h.opened[0][1];
  assert.equal(options.expectedUserId, 'TEST-UID'); assert.equal(options.theme, 'dark'); assert.equal(options.isCurrent(), true);
  assert.equal(options.signal, h.reads[0].options.signal);
  assert.deepEqual(h.navigated, []); assert.deepEqual(h.keyboard, ['dismiss']); assert.equal(h.value().busy, false);
  assert(!JSON.stringify(h.nodes()).includes(identity.jwt), 'Identity must not be placed in UI state');
});

test('simultaneous support presses share one identity request and one native presentation', async () => {
  const pending = deferred(); const h = harness({ readResult: pending.promise });
  const first = h.value().open(); h.render();
  assert.equal(h.value().busy, true); assert.equal(h.value().disabled, true);
  await h.value().open(); assert.equal(h.reads.length, 1);
  pending.resolve(identity); await first; h.render();
  assert.equal(h.opened.length, 1); assert.equal(h.value().busy, false);
});

test('signed-out and unavailable support never fetch or send an anonymous identity', async () => {
  const signedOut = harness({ authenticated: false, uid: null, accountId: null });
  await signedOut.value().open(); assert.deepEqual(signedOut.navigated, ['/login']);
  assert.equal(signedOut.reads.length, 0); assert.equal(signedOut.opened.length, 0);
  for (const overrides of [{ available: false }, { uid: null }]) {
    const h = harness(overrides); await h.value().open(); h.render();
    assert.equal(h.modal().props.visible, true); assert.equal(h.reads.length, 0); assert.equal(h.opened.length, 0);
  }
});

test('account, signout, path changes and unmount cancel identity work before native presentation', async () => {
  for (const change of ['account', 'signout', 'path', 'unmount']) {
    const pending = deferred(); const h = harness({ readResult: pending.promise });
    const opening = h.value().open(); h.render();
    if (change === 'unmount') h.unmount();
    else {
      if (change === 'account') Object.assign(h.state, { accountId: '2', uid: 'OTHER-UID', authRevision: 2 });
      if (change === 'signout') Object.assign(h.state, { authenticated: false, accountId: null, uid: null, authRevision: 2 });
      if (change === 'path') h.state.pathname = '/payments';
      h.render();
    }
    assert.equal(h.reads[0].options.signal.aborted, true, change);
    pending.resolve(identity); await opening; assert.equal(h.opened.length, 0, change);
  }
});

test('identity and native failures allow another deliberate attempt without automatic retries', async () => {
  for (const nativeFailure of [false, true]) {
    const h = harness();
    if (nativeFailure) h.state.nativeResult = { ok: false, error: 'failed' };
    else h.state.readResult = () => { throw new h.ApiError(503, 'support.identityUnavailable'); };
    await h.value().open(); h.render();
    assert.equal(h.modal().props.visible, true); assert.equal(h.value().busy, false); assert.equal(h.reads.length, 1);
    h.modal().props.onRequestClose(); h.render(); assert.equal(h.modal().props.visible, false);
    h.state.readResult = identity; h.state.nativeResult = { ok: true };
    await h.value().open(); h.render(); assert.equal(h.reads.length, 2); assert.equal(h.modal().props.visible, false);
  }
});

test('payment blockers prevent every launcher and cancel pending support until all blockers are released', async () => {
  const pending = deferred(); const h = harness({ readResult: pending.promise });
  const opening = h.value().open(); h.render();
  const releaseOne = h.value().block(); const releaseTwo = h.value().block(); h.render();
  assert.equal(h.reads[0].options.signal.aborted, true);
  pending.resolve(identity); await opening; h.render();
  assert.equal(h.opened.length, 0); assert.equal(h.value().busy, false); assert.equal(h.value().disabled, true);
  releaseOne(); h.render(); await h.value().open(); assert.equal(h.reads.length, 1);
  releaseTwo(); h.render(); assert.equal(h.value().disabled, false);
  h.state.readResult = identity; await h.value().open(); assert.equal(h.reads.length, 2); assert.equal(h.opened.length, 1);
});

test('native adapter presents the message composer without sending a message or opening the Messenger home', async () => {
  const calls = []; let bridge;
  const intercom = { presentMessageComposer: async (...args) => { calls.push(['composer', ...args]); return true; }, present: async () => { calls.push(['home']); return true; } };
  const exports = load('../src/features/support/native-support.native.ts', {
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { intercom: { appId: 'synthetic', region: 'EU', iosApiKey: `ios_sdk-${'x'.repeat(64)}` } } } } },
    'react-native': { Platform: { OS: 'ios' } },
    '@intercom/intercom-react-native': { __esModule: true, default: intercom, ProactiveContentType: { Carousel: 'Carousel', Survey: 'Survey' } },
    './session-controller': { createSupportSessionController: value => { bridge = value; return { open: async () => bridge.present(), clear: async () => true }; } },
  });
  assert.equal(exports.nativeSupportAvailable(), true); await exports.openNativeSupport(identity, {});
  assert.deepEqual(calls, [['composer']]);
});
