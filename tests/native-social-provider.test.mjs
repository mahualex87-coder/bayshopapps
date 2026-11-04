import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const id = 'synthetic.apps.googleusercontent.com';
const challenge = { provider: 'apple', flowId: 'a'.repeat(64), nonce: 'b'.repeat(64), state: 'c'.repeat(64), expiresAt: '2035-01-01T00:00:00Z' };
const capabilities = { version: 1, providers: { apple: { enabled: true, clientId: 'com.example.test' }, google: { enabled: true, clientId: id } } };
function adapter(overrides = {}) {
  const calls = [];
  const env = { os: 'ios', available: async () => true, apple: async () => ({ identityToken: 'synthetic.apple.jwt', state: challenge.state, fullName: { givenName: 'Test', familyName: 'Person' } }), prompt: async () => ({ type: 'success', params: { code: 'synthetic-code', state: challenge.state } }), exchange: async () => ({ idToken: 'synthetic.google.jwt', accessToken: 'never-forward-access-token' }), ...overrides };
  class AuthRequest { constructor(options) { this.codeVerifier = 'synthetic-verifier'; calls.push(['request', options]); } async promptAsync(discovery) { calls.push(['prompt', discovery]); return env.prompt(); } }
  const modules = {
    './android-google-auth': { androidGoogleAvailable: () => env.androidAvailable === true, getAndroidGoogleIdentity: async (...args) => { calls.push(['android', ...args]); return { status: 'success', proof: { idToken: 'synthetic.android.jwt' } }; } },
    'react-native': { Platform: { OS: env.os } },
    'expo-constants': { expoConfig: { ios: { bundleIdentifier: 'com.example.test', usesAppleSignIn: true }, extra: { nativeSocial: { googleIosClientId: id } } } },
    'expo-apple-authentication': { isAvailableAsync: env.available, AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 }, signInAsync: async options => { calls.push(['apple', options]); return env.apple(); } },
    'expo-auth-session': { AuthRequest, ResponseType: { Code: 'code' }, exchangeCodeAsync: async (...args) => { calls.push(['exchange', ...args]); return env.exchange(); } },
    'expo-web-browser': { dismissAuthSession: () => { calls.push(['dismiss']); } },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/auth/social-provider.native.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: key => { assert(key in modules, `Unexpected import ${key}`); return modules[key]; }, Date, AbortController });
  return { ...exports, calls };
}
test('native provider buttons require server capability, exact audience and available iOS bridge', async () => {
  assert.deepEqual(Array.from(await adapter().availableSocialProviders(capabilities)), ['apple', 'google']);
  assert.deepEqual(Array.from(await adapter({ os: 'android' }).availableSocialProviders(capabilities)), []);
  assert.deepEqual(Array.from(await adapter().availableSocialProviders({ ...capabilities, providers: { apple: { enabled: true, clientId: 'other.bundle' }, google: { enabled: true, clientId: 'other.apps.googleusercontent.com' } } })), []);
});
test('Apple identity uses challenge nonce/state, preserves one-time hints, rejects wrong returned state', async () => {
  const good = adapter(); const result = await good.getSocialIdentity('apple', challenge, capabilities);
  assert.equal(result.status, 'success'); assert.equal(result.proof.idToken, 'synthetic.apple.jwt'); assert.equal(good.calls[0][1].nonce, challenge.nonce); assert.equal(good.calls[0][1].state, challenge.state);
  const bad = adapter({ apple: async () => ({ identityToken: 'synthetic', state: 'wrong' }) }); assert.equal((await bad.getSocialIdentity('apple', challenge, capabilities)).errorCode, 'invalid_identity');
});
test('Google code exchange uses PKCE/state/nonce and never forwards access token', async () => {
  const mock = adapter(); const result = await mock.getSocialIdentity('google', { ...challenge, provider: 'google' }, capabilities);
  assert.equal(result.status, 'success'); assert.deepEqual(Object.keys(result.proof), ['idToken']);
  const request = mock.calls.find(x => x[0] === 'request')[1]; assert.equal(request.usePKCE, true); assert.equal(request.responseType, 'code'); assert.equal(request.extraParams.nonce, challenge.nonce); assert.equal(request.state, challenge.state); assert.equal(request.redirectUri, 'com.googleusercontent.apps.synthetic:/oauthredirect');
  const exchange = mock.calls.find(x => x[0] === 'exchange')[1]; assert.equal(exchange.extraParams.code_verifier, 'synthetic-verifier'); assert.equal(exchange.clientSecret, undefined);
  const mismatch = adapter({ prompt: async () => ({ type: 'success', params: { code: 'x', state: 'wrong' } }) }); assert.equal((await mismatch.getSocialIdentity('google', { ...challenge, provider: 'google' }, capabilities)).errorCode, 'invalid_identity'); assert(!mismatch.calls.some(x => x[0] === 'exchange'));
});
test('cancellation while checking native availability never opens a provider sheet', async () => {
  const aborter = new AbortController(); const mock = adapter({ available: async () => { aborter.abort(); return true; } });
  assert.equal((await mock.getSocialIdentity('apple', challenge, capabilities, aborter.signal)).status, 'cancelled'); assert.equal(mock.calls.length, 0);
});
test('Android dispatch uses only the gated Credential Manager adapter and never an Apple web fallback', async () => {
  const mock = adapter({ os: 'android', androidAvailable: true });
  assert.deepEqual(Array.from(await mock.availableSocialProviders(capabilities)), ['google']);
  const googleChallenge = { ...challenge, provider: 'google' };
  assert.equal((await mock.getSocialIdentity('google', googleChallenge, capabilities)).proof.idToken, 'synthetic.android.jwt');
  assert.equal(mock.calls[0][0], 'android'); assert.equal(mock.calls[0][1], googleChallenge);
  assert.equal((await mock.getSocialIdentity('apple', challenge, capabilities)).errorCode, 'provider_unavailable');
  assert.equal(mock.calls.length, 1);
});
