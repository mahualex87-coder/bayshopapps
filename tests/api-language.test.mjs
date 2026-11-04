import assert from 'node:assert/strict';
import test from 'node:test';
import { API_ORIGIN, ApiError, createApiTransport } from '../src/api/client.ts';
import { LiveAccountService } from '../src/api/service.ts';

const NOW = 1790000000000;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const auth = { id: 'A', name: 'Original name', access_token: 'synthetic-test-token', expires_in: 3600, token_type: 'Bearer' };
const counters = { awaiting: '0', cart: '0', orders: '0', incoming: '0', outgoing: '0', received: '0' };
function storage(initial = true) {
  let value = initial ? JSON.stringify({ origin: API_ORIGIN, token: auth.access_token, expiresAt: NOW + 3600000 }) : null;
  const writes = [];
  return { read: async () => value, write: async next => { value = next; writes.push('write'); }, clear: async () => { value = null; writes.push('clear'); }, value: () => value, writes };
}
function baseline(path, options) {
  if (options.login) return auth;
  if (path === '/api/auth') return { id: 'A', name: 'Original name' };
  if (path === '/api/member/personal-data') return { phoneCode: '+373', phone: '00000000' };
  if (path === '/api/member/me') return { member: { id: 'A', email: 'user@example.test' } };
  if (path === '/api/member/counters') return counters;
  if (path.startsWith('/api/balance?')) return { balanceList: {} };
  if (path === '/api/refund-request') return { memberBalance: [] };
  return [];
}
const waiting = title => [{ id: 'W1', storageId: '14', uid: 'TEST-W1', tracking: 'KEEP-TRACKING-EXACT', title, status: 'not-taken' }];

test('transport sends the selected language on both login and account reads', async () => {
  const calls = [];
  const transport = createApiTransport(async (_url, options) => { calls.push(options); return new Response(JSON.stringify({ data: [] }), { headers: { 'content-type': 'application/json' } }); });
  for (const language of ['ro', 'ru', 'en']) {
    await transport('/api/auth', { language, login: { email: 'user@example.test', password: 'synthetic-password' } });
    await transport('/api/member-storage-address', { language, token: 'synthetic-token' });
  }
  assert.deepEqual(calls.map(call => call.headers['Accept-Language']), ['ro', 'ro', 'ru', 'ru', 'en', 'en']);
  assert.equal(calls.filter(call => call.method === 'POST').length, 3);
});

test('language switching clears old text, cancels reads and cannot accept a late old-language result', async () => {
  const old = deferred(); const calls = []; let oldSignal;
  const saved = storage();
  const service = new LiveAccountService(async (path, options) => {
    calls.push({ path, options });
    if (path === '/api/waiting-mf-list' && options.language === 'ru') { oldSignal = options.signal; return old.promise; }
    if (path === '/api/waiting-mf-list') return waiting(`Untranslated API caption ${options.language}`);
    return baseline(path, options);
  }, saved, () => NOW);
  await service.start(); await flush();
  const tokenBefore = saved.value();
  assert.equal(service.setLanguage('ru'), true);
  assert.equal(service.getSnapshot().resources.waiting.data, null);
  assert.equal(service.setLanguage('en'), true);
  assert.equal(oldSignal.aborted, true);
  await flush(); old.resolve(waiting('LATE OLD TEXT')); await flush();
  const current = service.getSnapshot();
  assert.equal(current.language, 'en');
  assert.equal(current.resources.waiting.data[0].title, 'Untranslated API caption en');
  assert.equal(current.resources.waiting.data[0].tracking, 'KEEP-TRACKING-EXACT');
  assert.equal(current.authenticated, true);
  assert.equal(saved.value(), tokenBefore);
  assert.deepEqual(saved.writes, [], 'changing language must not clear/rewrite the token');
  assert(calls.every(call => !call.options.login), 'changing language must not replay credentials');
});

test('an old warehouse chain cannot start its stock requests after the locale changed', async () => {
  const oldWarehouses = deferred(); const calls = [];
  const service = new LiveAccountService(async (path, options) => {
    calls.push({ path, language: options.language });
    if (path === '/api/warehouse-list' && options.language === 'ru') return oldWarehouses.promise;
    return baseline(path, options);
  }, storage(), () => NOW);
  await service.start(); await flush();
  service.setLanguage('ru'); service.setLanguage('en');
  oldWarehouses.resolve([{ id: '14', title: 'USA', countryTitle: 'USA', countryCode: 'US' }]);
  await flush();
  assert.equal(calls.filter(call => call.path.startsWith('/api/mf-list/in-stock/')).length, 0);
  assert.deepEqual(service.getSnapshot().resources.warehouse.data, []);
});

test('old counter results cannot start an old-language pagination chain', async () => {
  const oldCounters = deferred(); const calls = [];
  const service = new LiveAccountService(async (path, options) => {
    calls.push({ path, language: options.language });
    if (path === '/api/member/counters' && options.language === 'ru') return oldCounters.promise;
    return baseline(path, options);
  }, storage(), () => NOW);
  await service.start(); await flush();
  service.setLanguage('ru'); service.setLanguage('en');
  oldCounters.resolve({ ...counters, outgoing: '1' }); await flush();
  assert.equal(calls.filter(call => call.path.startsWith('/api/parcels/')).length, 0);
  assert.deepEqual(service.getSnapshot().resources.sent.data, []);
});

test('a stale 401 after switching language cannot sign out the newer request generation', async () => {
  const oldAddresses = deferred(); const saved = storage();
  const service = new LiveAccountService(async (path, options) => path === '/api/member-storage-address' && options.language === 'ru' ? oldAddresses.promise : baseline(path, options), saved, () => NOW);
  await service.start(); await flush();
  service.setLanguage('ru'); service.setLanguage('en'); await flush();
  oldAddresses.reject(new ApiError(401, 'errors.sessionExpired')); await flush();
  assert.equal(service.getSnapshot().authenticated, true);
  assert.equal(service.getSnapshot().resources.addresses.error, null);
  assert.deepEqual(saved.writes, []);
});

test('language cannot change during an active sign-in and no credentials are replayed afterwards', async () => {
  const login = deferred(); let loginRequests = 0;
  const saved = storage(false);
  const service = new LiveAccountService(async (path, options) => { if (options.login) { loginRequests++; return login.promise; } return baseline(path, options); }, saved, () => NOW);
  await service.start();
  const pending = service.login('user@example.test', 'synthetic-password'); await flush();
  assert.equal(service.setLanguage('en'), false);
  assert.equal(service.getSnapshot().language, 'ro');
  login.resolve(auth); assert.equal((await pending).ok, true); await flush();
  const prior = saved.value(); const writeCount = saved.writes.length;
  assert.equal(service.setLanguage('en'), true); await flush();
  assert.equal(loginRequests, 1);
  assert.equal(saved.value(), prior);
  assert.equal(saved.writes.length, writeCount);
  assert.equal(service.getSnapshot().resources.profile.data.email, 'user@example.test');
});

test('a language choice during session restoration does not strand the service or erase the session', async () => {
  const pendingRead = deferred(); const saved = storage(); const calls = [];
  const service = new LiveAccountService(async (path, options) => { calls.push(options.language); return baseline(path, options); }, { ...saved, read: () => pendingRead.promise }, () => NOW);
  const start = service.start();
  assert.equal(service.setLanguage('en'), true);
  pendingRead.resolve(saved.value()); await start; await flush();
  assert.equal(service.getSnapshot().ready, true);
  assert.equal(service.getSnapshot().authenticated, true);
  assert(calls.length > 0 && calls.every(language => language === 'en'));
});

test('switching language cannot suppress a failed secure-session cleanup notice', async () => {
  const cleanup = deferred(); const saved = storage();
  const service = new LiveAccountService(async (path, options) => baseline(path, options), { ...saved, clear: () => cleanup.promise }, () => NOW);
  await service.start(); await flush();
  const logout = service.logout();
  service.setLanguage('en');
  cleanup.reject(new Error('keychain unavailable')); await logout;
  assert.equal(service.getSnapshot().language, 'en');
  assert.equal(service.getSnapshot().authenticated, false);
  assert.equal(service.getSnapshot().notice, 'errors.sessionCleanup');
});
