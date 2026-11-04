import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function boundary(initial) {
  const refs = [], effects = [], calls = []; let cursor = 0, state = initial;
  const react = {
    useRef(value) { const index = cursor++; return refs[index] ??= { current: value }; },
    useLayoutEffect(fn, deps) {
      const index = cursor++; const old = effects[index];
      if (!old || deps.some((v, i) => !Object.is(v, old.deps[i]))) {
        old?.cleanup?.(); effects[index] = { deps, cleanup: fn() };
      }
    },
  };
  const imports = { react, '@/api/context': { useLiveAccount: () => state }, './android-google-auth': { clearAndroidGoogleCredentialState: async (force = false) => { calls.push(force); } } };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/auth/GoogleCredentialSessionBoundary.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: key => { assert(key in imports); return imports[key]; } });
  const render = next => { state = next; cursor = 0; exports.GoogleCredentialSessionBoundary(); };
  render(initial);
  return { calls, render, unmount: () => effects.forEach(effect => effect?.cleanup?.()) };
}
test('restored authenticated session does not force-clear at mount but logout clears persisted OS state', () => {
  const current = { authenticated: true, authRevision: 1, accountId: 'own-account' };
  const b = boundary(current); assert.deepEqual(b.calls, [false]);
  b.render({ ...current }); assert.deepEqual(b.calls, [false]);
  b.render({ authenticated: false, authRevision: 2, accountId: null }); assert.deepEqual(b.calls, [false, true]);
  b.unmount(); assert.deepEqual(b.calls, [false, true, false]);
});
test('account and auth generation changes clear; initial restore/profile loading does not trigger forced init', () => {
  const b = boundary({ authenticated: false, authRevision: 0, accountId: null });
  b.render({ authenticated: true, authRevision: 1, accountId: null });
  b.render({ authenticated: true, authRevision: 1, accountId: 'first' });
  assert.deepEqual(b.calls, [false, false, false]);
  b.render({ authenticated: true, authRevision: 1, accountId: 'second' });
  b.render({ authenticated: true, authRevision: 2, accountId: 'second' });
  assert.deepEqual(b.calls, [false, false, false, true, true]);
});
