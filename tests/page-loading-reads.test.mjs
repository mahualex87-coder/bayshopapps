import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(initialQuery = { kind: 'dashboard.counters' }, options = {}) {
  const slots = [], effects = [], cleanups = [], requests = [], loads = [];
  let cursor = 0, query = initialQuery;
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((value, n) => value !== slots[i].deps[n])) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((value, n) => value !== slots[i][n])) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  const account = {
    authenticated: true, accountId: 'synthetic-a', accountRevision: 1,
    readView(command, { signal }) { return new Promise((resolve, reject) => requests.push({ command, signal, resolve, reject })); },
  };
  const locale = { language: 'ro' };
  const imports = {
    react,
    '@/api/context': { useLiveAccount: () => account },
    '@/api/client': { errorMessage: error => error.message },
    '@/i18n/context': { useI18n: () => locale },
    '@/navigation/PageLoading': { usePageLoad: (pending, blocking = pending) => loads.push({ pending, blocking }) },
  };
  const exports = {};
  const source = readFileSync(new URL('../src/features/live/forms/useOperationView.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { exports, require: name => { assert(name in imports, name); return imports[name]; }, AbortController, Date });
  const runEffects = () => { while (effects.length) effects.shift()(); };
  const render = (flushEffects = true) => { cursor = 0; const value = exports.useOperationView(query, options); if (flushEffects) runEffects(); return value; };
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); return render(); };
  return { account, locale, requests, loads, render, flush, runEffects, setQuery: next => { query = next; }, unmount: () => cleanups.forEach(fn => fn?.()) };
}

test('the first read blocks before effects; refresh with retained data is progress only', async () => {
  const h = harness();
  h.render(false);
  assert.deepEqual(h.loads.at(-1), { pending: true, blocking: true });
  assert.equal(h.requests.length, 0);
  h.runEffects(); h.requests[0].resolve({ received: 42 });
  const view = await h.flush();
  assert.equal(view.resource.data.received, 42);
  assert.deepEqual(h.loads.at(-1), { pending: false, blocking: false });
  const refreshing = view.refresh(); h.render();
  assert.deepEqual(h.loads.at(-1), { pending: true, blocking: false });
  h.requests[1].resolve({ received: 43 }); await refreshing; await h.flush();
  assert.deepEqual(h.loads.at(-1), { pending: false, blocking: false });
  h.unmount();
});

test('account and query changes mask old data immediately, and failure releases the page', async () => {
  const h = harness(); h.render(); h.requests[0].resolve({ received: 42 }); await h.flush();
  h.account.accountId = 'synthetic-b';
  const switched = h.render(false);
  assert.equal(switched.resource.data, null);
  assert.deepEqual(h.loads.at(-1), { pending: true, blocking: true });
  h.runEffects();
  h.setQuery({ kind: 'purchases.list', page: 2, perPage: 20 }); h.render();
  assert.equal(h.requests[1].signal.aborted, true);
  h.requests[1].resolve({ received: 999 }); await h.flush();
  assert.deepEqual(h.loads.at(-1), { pending: true, blocking: true });
  h.requests[2].reject(new Error('unavailable')); const failed = await h.flush();
  assert.equal(failed.resource.error, 'unavailable');
  assert.deepEqual(h.loads.at(-1), { pending: false, blocking: false });
  h.unmount();
});

test('disabled queries and signed-out reads never block; manual QR reads keep their own loading UI', () => {
  const disabled = harness(null); disabled.render();
  assert.deepEqual(disabled.loads.at(-1), { pending: false, blocking: false });
  assert.equal(disabled.requests.length, 0); disabled.unmount();
  const signedOut = harness(); signedOut.account.authenticated = false; signedOut.render();
  assert.deepEqual(signedOut.loads.at(-1), { pending: false, blocking: false });
  assert.equal(signedOut.requests.length, 0); signedOut.unmount();
  const qr = harness({ kind: 'account.qr' }, { pageLoad: false }); qr.render();
  assert.equal(qr.requests.length, 1);
  assert.deepEqual(qr.loads.at(-1), { pending: false, blocking: false }); qr.unmount();
});
