import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const audience = 'synthetic-web.apps.googleusercontent.com';
const caps = { version: 1, providers: { google: { enabled: true, clientId: audience }, apple: { enabled: true, clientId: 'com.example.ios' } } };
const challenge = { provider: 'google', flowId: 'a'.repeat(64), nonce: 'b'.repeat(64), state: 'c'.repeat(64), expiresAt: '2030-01-01T00:00:00Z' };
const pending = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function adapter(overrides = {}) {
  const calls = []; const env = { os: 'android', clientId: audience, native: true, protocolVersion: 1, now: Date.parse('2026-11-02T00:00:00Z'), result: async () => ({ status: 'success', idToken: 'synthetic.id.token', email: 'must-not-forward', accessToken: 'must-not-forward' }), clear: async () => true, ...overrides };
  const bridge = { protocolVersion: env.protocolVersion, signInAsync: async (...args) => { calls.push(['signIn', ...args]); return env.result(); }, cancelAsync: async id => { calls.push(['cancel', id]); }, clearSessionAsync: async force => { calls.push(['clear', force]); return env.clear(); } };
  const modules = { 'react-native': { Platform: { OS: env.os } }, 'expo-constants': { expoConfig: { extra: { nativeSocial: { googleAndroidWebClientId: env.clientId } } } }, expo: { requireOptionalNativeModule: name => { calls.push(['load', name]); return env.native ? bridge : null; } } };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/auth/android-google-auth.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  class FakeDate extends Date { static now() { return env.now; } }
  vm.runInNewContext(code, { exports, require: key => { assert(key in modules, `Unexpected import ${key}`); return modules[key]; }, Date: FakeDate });
  return { ...exports, calls, env };
}

test('provider gate requires Android + native protocol + exact server and build Web audience', async () => {
  assert.equal(adapter().androidGoogleAvailable(caps), true);
  for (const override of [{ os: 'ios' }, { os: 'web' }, { clientId: null }, { clientId: 'bad' }, { native: false }, { protocolVersion: 2 }]) assert.equal(adapter(override).androidGoogleAvailable(caps), false);
  for (const google of [{ enabled: false, clientId: audience }, { enabled: true, clientId: 'different.apps.googleusercontent.com' }]) assert.equal(adapter().androidGoogleAvailable({ ...caps, providers: { ...caps.providers, google } }), false);
  const web = adapter({ os: 'web' }); await web.clearAndroidGoogleCredentialState(); assert.deepEqual(web.calls, []);
});
test('explicit request forwards exact nonce and Web audience, returns only ID token', async () => {
  const a = adapter(); const result = await a.getAndroidGoogleIdentity(challenge, caps);
  assert.equal(result.status, 'success'); assert.deepEqual(Object.keys(result.proof), ['idToken']);
  assert.deepEqual(a.calls.find(c => c[0] === 'signIn'), ['signIn', challenge.flowId, audience, challenge.nonce]);
});
test('expired/malformed/provider mismatch challenge never opens native UI', async () => {
  for (const patch of [{ expiresAt: '2020-01-01T00:00:00Z' }, { expiresAt: 'invalid' }, { provider: 'apple' }, { nonce: 'not-server-nonce' }, { flowId: 'wrong' }]) {
    const a = adapter(); assert.equal((await a.getAndroidGoogleIdentity({ ...challenge, ...patch }, caps)).status, 'error'); assert(!a.calls.some(c => c[0] === 'signIn'));
  }
});
test('duplicate taps cannot start a second native chooser', async () => {
  const deferred = pending(); const a = adapter({ result: () => deferred.promise });
  const first = a.getAndroidGoogleIdentity(challenge, caps);
  assert.equal((await a.getAndroidGoogleIdentity({ ...challenge, flowId: 'd'.repeat(64) }, caps)).errorCode, 'request_pending');
  deferred.resolve({ status: 'cancelled' }); await first;
  assert.equal(a.calls.filter(c => c[0] === 'signIn').length, 1);
});
test('abort before call does nothing; abort in flight cancels exact request and discards late identity', async () => {
  const aborted = new AbortController(); aborted.abort(); const a = adapter();
  assert.equal((await a.getAndroidGoogleIdentity(challenge, caps, aborted.signal)).status, 'cancelled'); assert.deepEqual(a.calls, []);
  const deferred = pending(); const b = adapter({ result: () => deferred.promise }); const signal = new AbortController();
  const first = b.getAndroidGoogleIdentity(challenge, caps, signal.signal); signal.abort();
  deferred.resolve({ status: 'success', idToken: 'late.identity' });
  assert.equal((await first).status, 'cancelled'); assert.deepEqual(b.calls.find(c => c[0] === 'cancel'), ['cancel', challenge.flowId]);
});
test('logout/account boundary invalidates in-flight proof and clears OS state without initialization on startup', async () => {
  const unused = adapter(); await unused.clearAndroidGoogleCredentialState(); assert.deepEqual(unused.calls, []);
  const deferred = pending(); const a = adapter({ result: () => deferred.promise });
  const first = a.getAndroidGoogleIdentity(challenge, caps); await a.clearAndroidGoogleCredentialState();
  deferred.resolve({ status: 'success', idToken: 'late.identity' }); assert.equal((await first).status, 'cancelled');
  assert(a.calls.some(c => c[0] === 'cancel')); assert(a.calls.some(c => c[0] === 'clear'));
});
test('challenge expiring during chooser is not sent to the API', async () => {
  const a = adapter(); a.env.result = async () => { a.env.now = Date.parse(challenge.expiresAt) + 1; return { status: 'success', idToken: 'expired.identity' }; };
  assert.equal((await a.getAndroidGoogleIdentity(challenge, caps)).errorCode, 'invalid_identity');
});
test('native errors never leak exception strings and failure does not retry', async () => {
  for (const result of [{ status: 'error', errorCode: 'sensitive-raw-native-message' }, { status: 'success', idToken: '' }, { status: 'success', idToken: 'x'.repeat(16385) }, null]) {
    const a = adapter({ result: async () => result }); assert.equal((await a.getAndroidGoogleIdentity(challenge, caps)).errorCode, 'provider_failed'); assert.equal(a.calls.filter(c => c[0] === 'signIn').length, 1);
  }
  const a = adapter({ result: async () => { throw new Error('private provider body'); } }); assert.equal((await a.getAndroidGoogleIdentity(challenge, caps)).errorCode, 'provider_failed');
});
test('real logout after process restart force-clears provider state without a prior Google call', async () => {
  const a = adapter(); await a.clearAndroidGoogleCredentialState(true);
  assert.deepEqual(a.calls, [['load', 'BayShopGoogleAuth'], ['clear', true]]);
  assert(!a.calls.some(c => c[0] === 'signIn'));
  for (const os of ['ios', 'web']) { const b = adapter({ os }); await b.clearAndroidGoogleCredentialState(true); assert.deepEqual(b.calls, []); }
  const failure = adapter({ clear: async () => false }); await failure.clearAndroidGoogleCredentialState(true); await failure.clearAndroidGoogleCredentialState();
  assert.deepEqual(failure.calls.filter(c => c[0] === 'clear'), [['clear', true], ['clear', false]]);
});
test('cleanup failures retain retryable cleanup state; older cleanup cannot mark a newer operation clean', async () => {
  const a = adapter({ clear: async () => false }); await a.getAndroidGoogleIdentity(challenge, caps); await a.clearAndroidGoogleCredentialState(); await a.clearAndroidGoogleCredentialState(); assert.equal(a.calls.filter(c => c[0] === 'clear').length, 2);
  const delayed = pending(); const b = adapter({ clear: () => delayed.promise });
  await b.getAndroidGoogleIdentity(challenge, caps); const oldCleanup = b.clearAndroidGoogleCredentialState();
  await b.getAndroidGoogleIdentity({ ...challenge, flowId: 'd'.repeat(64) }, caps);
  delayed.resolve(true); await oldCleanup; await b.clearAndroidGoogleCredentialState();
  assert.equal(b.calls.filter(c => c[0] === 'clear').length, 2);
});
