import assert from 'node:assert/strict';
import test from 'node:test';
import { API_ORIGIN, ApiError } from '../src/api/client.ts';
import { LiveAccountService } from '../src/api/service.ts';

const NOW = 1790000000000;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const command = { kind: 'waiting.create', input: { storage: 'usa', tracking: 'TRACK123', declarations: [{ title: 'Synthetic test item', url: 'https://example.test/item', quantity: 1, price: '1.00' }] } };
const accepted = { code: 200, error: false, message: 'Ok', data: { id: '123', uid: 'WMF123' } };
const parcel = title => [{ id: '123', storageId: '14', uid: 'WMF123', tracking: 'TRACK123', title, status: 'not-taken' }];
function baseline(path) {
  if (path === '/api/auth') return { id: '1', name: 'Synthetic name' };
  if (path === '/api/member/personal-data') return { phoneCode: '+373', phone: '00000000' };
  if (path === '/api/member/counters') return { awaiting: '0', cart: '0', orders: '0', incoming: '0', outgoing: '0', received: '0' };
  if (path.startsWith('/api/balance?')) return { balanceList: {} };
  if (path === '/api/refund-request') return { memberBalance: [] };
  return [];
}
function storage() {
  let value = JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-private-token', expiresAt: NOW + 3600000 });
  const events = [];
  return { read: async () => value, write: async next => { value = next; events.push('write'); }, clear: async () => { value = null; events.push('clear'); }, value: () => value, events };
}

test('one explicit write locks duplicates and locale, then invalidates lists only on acknowledgement', async () => {
  const pending = deferred(); const calls = []; const saved = storage(); let persisted = false;
  const service = new LiveAccountService(async (path, options) => {
    calls.push({ path, options });
    if (options.write) return pending.promise;
    if (path === '/api/waiting-mf-list') return persisted ? parcel('Confirmed server value') : [];
    return baseline(path);
  }, saved, () => NOW);
  await service.start(); await flush();
  const before = saved.value();
  const saving = service.mutate(command);
  assert.equal(service.getSnapshot().mutation.pending, true);
  assert.equal(service.setLanguage('ru'), false);
  assert.deepEqual(await service.mutate(command), { ok: false, error: 'errors.mutationInProgress', outcome: 'rejected' });
  assert.deepEqual(service.getSnapshot().resources.waiting.data, [], 'no optimistic fake parcel');
  persisted = true; pending.resolve(accepted);
  const result = await saving;
  assert.equal(result.ok, true);
  assert.equal(calls.filter(call => call.options.write).length, 1);
  assert.equal(service.getSnapshot().resources.waiting.data[0].title, 'Confirmed server value');
  assert.equal(service.getSnapshot().mutation.pending, false);
  assert.equal(saved.value(), before);
  assert.deepEqual(saved.events, []);
  assert.equal(JSON.stringify(service.getSnapshot()).includes('synthetic-private-token'), false);
});

test('logout aborts a dispatched write and ignores its late success for the closed account', async () => {
  const pending = deferred(); let signal; let writes = 0;
  const saved = storage();
  const service = new LiveAccountService(async (path, options) => {
    if (options.write) { writes++; signal = options.signal; return pending.promise; }
    return baseline(path);
  }, saved, () => NOW);
  await service.start(); await flush();
  const saving = service.mutate(command);
  await service.logout();
  assert.equal(signal.aborted, true);
  assert.equal(service.getSnapshot().notice, 'errors.mutationUnknown');
  pending.resolve(accepted);
  assert.deepEqual(await saving, { ok: false, error: 'errors.mutationUnknown', outcome: 'unknown' });
  assert.equal(service.getSnapshot().authenticated, false);
  assert.equal(service.getSnapshot().resources.waiting.data, null);
  assert.equal(saved.value(), null);
  assert.equal(writes, 1);
});

test('uncertain network writes refresh data without replay and never claim success', async () => {
  let writes = 0; let waitingReads = 0;
  const service = new LiveAccountService(async (path, options) => {
    if (options.write) { writes++; throw new ApiError(0, 'errors.timeout', {}, { outcome: 'unknown' }); }
    if (path === '/api/waiting-mf-list') waitingReads++;
    return baseline(path);
  }, storage(), () => NOW);
  await service.start(); await flush();
  const result = await service.mutate(command); await flush();
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.error, 'errors.mutationUnknown');
  assert.equal(writes, 1);
  assert.equal(waitingReads, 2);
  assert.equal(service.getSnapshot().mutation.pending, false);
});

test('invalid commands cannot reach transport and return stable validation fields', async () => {
  let writes = 0;
  const service = new LiveAccountService(async (path, options) => { if (options.write) writes++; return baseline(path); }, storage(), () => NOW);
  await service.start(); await flush();
  const result = await service.mutate({ ...command, input: { ...command.input, tracking: 'INVALID / TRACKING' } });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.fieldErrors.tracking, 'errors.invalidField');
  assert.equal(writes, 0);
  assert.equal(service.getSnapshot().mutation.pending, false);
});

test('detail reads are aborted on locale changes and stale responses never escape to forms', async () => {
  const pending = deferred(); let signal;
  const service = new LiveAccountService(async (path, options) => {
    if (path === '/api/waiting-mf/123') { signal = options.signal; return pending.promise; }
    return baseline(path);
  }, storage(), () => NOW);
  await service.start(); await flush();
  const detail = service.readView({ kind: 'waiting.detail', id: '123' });
  service.setLanguage('ru');
  assert.equal(signal.aborted, true);
  pending.resolve({ private: 'old-language-account-data' });
  await assert.rejects(detail, error => error.key === 'errors.cancelled');
});

test('an unmounted form abort signal discards even an ignoring transport response', async () => {
  const pending = deferred(); let signal;
  const service = new LiveAccountService(async (path, options) => {
    if (path === '/api/waiting-mf/123') { signal = options.signal; return pending.promise; }
    return baseline(path);
  }, storage(), () => NOW);
  await service.start(); await flush();
  const controller = new AbortController();
  const detail = service.readView({ kind: 'waiting.detail', id: '123' }, { signal: controller.signal });
  controller.abort();
  assert.equal(signal.aborted, true);
  pending.resolve({ private: 'old-form-data' });
  await assert.rejects(detail, error => error.key === 'errors.cancelled');
});
