import assert from 'node:assert/strict';
import test from 'node:test';
import { API_ORIGIN, ApiError } from '../src/api/client.ts';
import { LiveAccountService, readSession } from '../src/api/service.ts';

const NOW = 1_790_000_000_000;
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const auth = (id = 'A') => ({ id, uid: `M-${id}`, name: `Name ${id}`, surname: 'Client', access_token: `test-token-${id}`, expires_in: 3600, token_type: 'Bearer' });
const stored = (token = 'test-token-A') => JSON.stringify({ origin: API_ORIGIN, token, expiresAt: NOW + 3600000 });
function memoryStorage(initial = null) {
  let value = initial;
  const operations = [];
  return {
    read: async () => value,
    write: async next => { operations.push('write'); value = next; },
    clear: async () => { operations.push('clear'); value = null; },
    value: () => value,
    operations,
  };
}
function baseline(path, options) {
  if (options?.login) return auth(options.login.email.startsWith('b@') ? 'B' : 'A');
  if (path === '/api/auth') return { id: options?.token === 'test-token-B' ? 'B' : 'A', name: options?.token === 'test-token-B' ? 'Name B' : 'Name A' };
  if (path === '/api/member/personal-data') return { phoneCode: '+373', phone: '00000000' };
  if (path.startsWith('/api/balance')) return { balanceList: {} };
  return [];
}

test('stored sessions reject expired, malformed and different-origin values', async () => {
  assert.equal(readSession(stored(), NOW)?.token, 'test-token-A');
  for (const value of [null, '{bad json', '[]', JSON.stringify({ origin: API_ORIGIN, token: 'token', expiresAt: NOW }), JSON.stringify({ origin: 'https://dev.bayshop.com', token: 'token', expiresAt: NOW + 1 }), JSON.stringify({ origin: API_ORIGIN, token: 'token\nheader', expiresAt: NOW + 1 })]) assert.equal(readSession(value, NOW), null);
  const storage = memoryStorage(JSON.stringify({ origin: API_ORIGIN, token: 'expired', expiresAt: NOW - 1 }));
  let requests = 0;
  const service = new LiveAccountService(async () => { requests++; }, storage, () => NOW);
  await service.start();
  assert.equal(service.getSnapshot().ready, true);
  assert.equal(service.getSnapshot().authenticated, false);
  assert.equal(storage.value(), null);
  assert.equal(requests, 0);
});

test('logout cancels a pending login and discards its eventual token and data', async () => {
  const loginResponse = deferred();
  let signal;
  const storage = memoryStorage();
  const service = new LiveAccountService(async (_path, options) => { signal = options.signal; return loginResponse.promise; }, storage, () => NOW);
  await service.start();
  const login = service.login('a@example.test', 'test-password');
  await flush();
  assert.equal(service.getSnapshot().signingIn, true);
  await service.logout();
  assert.equal(signal.aborted, true);
  loginResponse.resolve(auth());
  assert.deepEqual(await login, { ok: false });
  assert.equal(service.getSnapshot().authenticated, false);
  assert.equal(service.getSnapshot().resources.profile.data, null);
  assert.equal(storage.value(), null);
});

test('failed account switch cannot leave the old account persisted for next launch', async () => {
  const storage = memoryStorage(stored());
  const service = new LiveAccountService(async (path, options) => {
    if (options?.login) throw new ApiError(401, 'Emailul sau parola nu sunt corecte.');
    return baseline(path, options);
  }, storage, () => NOW);
  await service.start();
  await flush();
  assert.equal(service.getSnapshot().authenticated, true);
  const result = await service.login('b@example.test', 'test-password');
  assert.equal(result.ok, false);
  assert.equal(service.getSnapshot().authenticated, false);
  assert.equal(storage.value(), null, 'old secure token must be cleared before a new account attempt');
});

test('late reads from an old account never overwrite the newly logged-in account', async () => {
  const oldProfile = deferred();
  let oldSignal;
  const storage = memoryStorage();
  const service = new LiveAccountService(async (path, options) => {
    if (!options?.login && path === '/api/auth' && options.token === 'test-token-A') { oldSignal = options.signal; return oldProfile.promise; }
    return baseline(path, options);
  }, storage, () => NOW);
  await service.start();
  assert.equal((await service.login('a@example.test', 'test-password')).ok, true);
  await flush();
  await service.logout();
  assert.equal(oldSignal.aborted, true);
  assert.equal((await service.login('b@example.test', 'test-password')).ok, true);
  await flush();
  oldProfile.resolve({ id: 'A', name: 'Late old account' });
  await flush();
  assert.equal(service.getSnapshot().resources.profile.data.id, 'B');
  assert.equal(service.getSnapshot().resources.profile.data.firstName, 'Name B');
  assert.equal(JSON.parse(storage.value()).token, 'test-token-B');
});

test('a newer refresh wins and an older response cannot roll the screen backwards', async () => {
  const pending = [];
  let deferProfiles = false;
  const service = new LiveAccountService(async (path, options) => {
    if (deferProfiles && path === '/api/auth' && !options?.login) { const response = deferred(); pending.push(response); return response.promise; }
    return baseline(path, options);
  }, memoryStorage(), () => NOW);
  await service.start();
  await service.login('a@example.test', 'test-password');
  await flush();
  deferProfiles = true;
  const first = service.refresh(['profile']);
  const second = service.refresh(['profile']);
  pending[1].resolve({ id: 'A', name: 'Latest' });
  await second;
  pending[0].resolve({ id: 'A', name: 'Outdated' });
  await first;
  assert.equal(service.getSnapshot().resources.profile.data.firstName, 'Latest');
});

test('partial resource errors stay distinct from empty data and current balances remain unknown', async () => {
  const service = new LiveAccountService(async (path, options) => {
    if (path === '/api/member-storage-address') throw new ApiError(503, 'Adresele nu sunt disponibile momentan.');
    if (path === '/api/refund-request') throw new ApiError(503, 'Soldul nu este disponibil momentan.');
    if (path.startsWith('/api/balance')) return { balanceList: { usd: [{ trid: 'test-trx', type: 'minus', summ: '4.50', total_amount: '95.50' }] } };
    return baseline(path, options);
  }, memoryStorage(), () => NOW);
  await service.start();
  await service.login('a@example.test', 'test-password');
  await flush();
  await service.refresh(['addresses', 'balance']);
  const snapshot = service.getSnapshot();
  assert.equal(snapshot.authenticated, true);
  assert.equal(snapshot.resources.addresses.data, null);
  assert.equal(snapshot.resources.addresses.loading, false);
  assert.match(snapshot.resources.addresses.error, /nu sunt disponibile/);
  assert.equal(snapshot.resources.balance.data, null);
  assert.equal(snapshot.resources.balance.loading, false);
  assert.match(snapshot.resources.balance.error, /nu este disponibil/);
  const history = await service.readView({ kind: 'balance.history', period: '1' });
  assert.equal(history.balances, null);
  assert.equal(history.transactions[0].amount, -4.5);
  assert.equal(history.transactions[0].balanceAfter, 95.5);
  assert.equal(service.getSnapshot().resources.balance.data, null, 'a historical closing balance is not the current balance');
});

test('temporary refresh failure retains the last successful data with an explicit error', async () => {
  let failing = false;
  const service = new LiveAccountService(async (path, options) => {
    if (failing && path === '/api/auth' && !options?.login) throw new ApiError(503, 'Temporar indisponibil.');
    return baseline(path, options);
  }, memoryStorage(), () => NOW);
  await service.start();
  await service.login('a@example.test', 'test-password');
  await flush();
  const previous = service.getSnapshot().resources.profile.data;
  failing = true;
  await service.refresh(['profile']);
  assert.equal(service.getSnapshot().resources.profile.data, previous);
  assert.equal(service.getSnapshot().resources.profile.error, 'Temporar indisponibil.');
  assert.equal(service.getSnapshot().resources.profile.updatedAt, NOW);
  assert.equal(service.getSnapshot().resources.profile.loading, false);
});

test('a locally expired session signs out before sending any new authenticated requests', async () => {
  let now = NOW;
  const calls = [];
  const storage = memoryStorage();
  const service = new LiveAccountService(async (path, options) => { calls.push(path); return baseline(path, options); }, storage, () => now);
  await service.start();
  await service.login('a@example.test', 'test-password');
  await flush();
  const callCount = calls.length;
  now += 3600000;
  await service.refresh(['profile']);
  assert.equal(calls.length, callCount);
  assert.equal(service.getSnapshot().authenticated, false);
  assert.equal(storage.value(), null);
});

test('a late secure-storage read cannot restore a session after the user logs out', async () => {
  const read = deferred();
  let calls = 0;
  const storage = memoryStorage();
  const service = new LiveAccountService(async () => { calls++; return []; }, { ...storage, read: () => read.promise }, () => NOW);
  const start = service.start();
  await service.logout();
  read.resolve(stored());
  await start;
  assert.equal(service.getSnapshot().ready, true);
  assert.equal(service.getSnapshot().authenticated, false);
  assert.equal(calls, 0);
});

test('401 from a resource removes the account and all previously loaded account data', async () => {
  let expired = false;
  const storage = memoryStorage();
  const service = new LiveAccountService(async (path, options) => {
    if (expired && path === '/api/member-storage-address') throw new ApiError(401, 'Expired');
    return baseline(path, options);
  }, storage, () => NOW);
  await service.start();
  await service.login('a@example.test', 'test-password');
  await flush();
  expired = true;
  await service.refresh(['addresses']);
  assert.equal(service.getSnapshot().authenticated, false);
  assert.equal(Object.values(service.getSnapshot().resources).every(resource => resource.data === null), true);
  assert.equal(storage.value(), null);
});

test('logout is queued after a pending secure write so the token cannot reappear', async () => {
  const writeStarted = deferred();
  const allowWrite = deferred();
  const storage = memoryStorage();
  const slowStorage = {
    read: storage.read,
    clear: storage.clear,
    write: async value => { writeStarted.resolve(); await allowWrite.promise; await storage.write(value); },
  };
  const service = new LiveAccountService(async (path, options) => baseline(path, options), slowStorage, () => NOW);
  await service.start();
  const login = service.login('a@example.test', 'test-password');
  await writeStarted.promise;
  const logout = service.logout();
  allowWrite.resolve();
  await Promise.all([login, logout]);
  assert.equal(service.getSnapshot().authenticated, false);
  assert.equal(storage.value(), null);
  assert.deepEqual(storage.operations.slice(-2), ['write', 'clear']);
});
