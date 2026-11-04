import assert from 'node:assert/strict';
import test from 'node:test';
import { API_ORIGIN, ApiError } from '../src/api/client.ts';
import { ApiContractError } from '../src/api/normalize.ts';
import { OperationValidationError } from '../src/api/operations-contracts.ts';
import { LiveAccountService } from '../src/api/service.ts';

const NOW = 1_790_000_000_000;
const auth = id => ({ id, name: `Name ${id}`, surname: 'Client', uid: `M-${id}`, access_token: `test-token-${id}`, token_type: 'Bearer', expires_in: 3600 });
const current = { memberBalance: [{ currency_id: '1', currency_code: 'usd', currency_sign: '$', amount: '14.25' }] };
const history = { balanceList: { usd: [{ trid: 'T1', type: 'plus', summ: '10.00', total_amount: '999.99' }] } };
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
async function account({ restore = false, balanceResponse = current, historyResponse = history } = {}) {
  let saved = restore ? JSON.stringify({ origin: API_ORIGIN, token: auth('A').access_token, expiresAt: NOW + 3600000 }) : null;
  const calls = [];
  const response = (value, path, options) => { if (value instanceof Error) throw value; return typeof value === 'function' ? value(path, options) : value; };
  const service = new LiveAccountService(async (path, options) => {
    calls.push({ path, options });
    if (options.login) return auth(options.login.email.startsWith('b@') ? 'B' : 'A');
    if (path === '/api/auth') return { id: options.token === 'test-token-B' ? 'B' : 'A', name: 'Client' };
    if (path === '/api/member/personal-data') return {};
    if (path === '/api/member/counters') return { awaiting: '0', incoming: '0', outgoing: '0', received: '0' };
    if (path === '/api/member/counters?parcelType=received') return {};
    if (path === '/api/refund-request') return response(balanceResponse, path, options);
    if (path.startsWith('/api/balance?')) return response(historyResponse, path, options);
    return [];
  }, { read: async () => saved, write: async value => { saved = value; }, clear: async () => { saved = null; } }, () => NOW);
  await service.start();
  if (!restore) assert.equal((await service.login('a@example.test', 'test-password')).ok, true);
  await flush();
  return { service, calls, stored: () => saved };
}
const historyCalls = calls => calls.filter(call => call.path.startsWith('/api/balance?'));

test('login and restored sessions load current balance without loading transaction history', async () => {
  for (const restore of [false, true]) {
    const { service, calls } = await account({ restore });
    const result = service.getSnapshot().resources.balance;
    assert.equal(result.loading, false);
    assert.equal(result.error, null);
    assert.deepEqual(result.data, { balances: [{ currency: 'USD', amount: 14.25 }], transactions: [] });
    assert.equal(calls.filter(call => call.path === '/api/refund-request').length, 1);
    assert.equal(historyCalls(calls).length, 0);
  }
});

test('lazy history uses only exact server period and extends timeout only for all, never changing current balance', async () => {
  const { service, calls } = await account();
  const balance = service.getSnapshot().resources.balance;
  for (const period of ['one', '7', '1', '3', '6', 'all']) {
    const result = await service.readView({ kind: 'balance.history', period });
    assert.equal(result.balances, null);
    assert.equal(result.transactions[0].balanceAfter, 999.99);
  }
  assert.deepEqual(historyCalls(calls).map(call => call.path), ['/api/balance?period=one', '/api/balance?period=7', '/api/balance?period=1', '/api/balance?period=3', '/api/balance?period=6', '/api/balance?period=all']);
  assert.deepEqual(historyCalls(calls).map(call => call.options.timeoutMs), [undefined, undefined, undefined, undefined, undefined, 60000]);
  assert.ok(historyCalls(calls).every(call => call.options.token === 'test-token-A' && !call.options.write && !call.options.login));
  assert.equal(service.getSnapshot().resources.balance, balance, 'historical closing amounts cannot overwrite current balance');
});

test('history reads preserve debits, credits, zero and repeated references in the same currency', async () => {
  const records = Array.from({ length: 31 }, (_, index) => ({
    trid: index < 2 ? 'T-SAME' : index === 2 ? null : `T-${index}`,
    type: index % 2 ? 'minus' : 'plus',
    summ: index === 2 ? '0.00' : (index + 0.25).toFixed(2),
    total_amount: index % 2 ? '-10.00' : '10.00',
    status: index % 3 ? 'paid' : 'unpaid',
    created: `2026-11-03 10:00:${String(59 - index).padStart(2, '0')}`,
    comment: `Ledger row ${index}`,
  }));
  const { service, calls } = await account({ historyResponse: { balanceList: { usd: records } } });
  const result = await service.readView({ kind: 'balance.history', period: '1' });
  assert.equal(result.transactions.length, 31);
  assert.deepEqual(result.transactions.map(row => row.amount), records.map(row => (row.type === 'minus' ? -1 : 1) * Number(row.summ)));
  assert.equal(result.transactions.filter(row => row.amount < 0).length, 15);
  assert.equal(result.transactions.filter(row => row.id === 'T-SAME').length, 2, 'Repeated references must not merge a credit and its debit');
  assert.equal(result.transactions[2].amount, 0);
  assert.equal(result.transactions[2].id, null);
  assert.deepEqual(result.transactions.map(row => row.status), records.map(row => row.status));
  assert.ok(result.transactions.every(row => row.currency === 'USD'));
  assert.equal(historyCalls(calls)[0].path, '/api/balance?period=1', 'No type or payment-status filter is sent to the history endpoint');
});

test('a pending history cannot delay current balance or trigger another history read on global refresh', async () => {
  const pending = deferred();
  const { service, calls } = await account({ historyResponse: pending.promise });
  const read = service.readView({ kind: 'balance.history', period: 'all' });
  await service.refresh();
  const result = service.getSnapshot().resources.balance;
  assert.equal(result.loading, false);
  assert.equal(result.error, null);
  assert.equal(result.data.balances[0].amount, 14.25);
  assert.equal(historyCalls(calls).length, 1);
  pending.resolve(history);
  assert.equal((await read).transactions.length, 1);
});

test('failed and unknown history reject explicitly while preserving usable current balance', async () => {
  for (const historyResponse of [new ApiError(503, 'History unavailable'), { unexpected: [] }]) {
    const { service } = await account({ historyResponse });
    const before = service.getSnapshot().resources.balance;
    await assert.rejects(service.readView({ kind: 'balance.history', period: '1' }), historyResponse instanceof ApiError ? ApiError : ApiContractError);
    assert.equal(service.getSnapshot().resources.balance, before);
    assert.equal(before.data.balances[0].amount, 14.25);
    assert.equal(service.getSnapshot().authenticated, true);
  }
});

test('current balance failure is unavailable rather than zero and does not block separate history', async () => {
  const { service } = await account({ balanceResponse: new ApiError(503, 'Balance unavailable') });
  const result = service.getSnapshot().resources.balance;
  assert.equal(result.data, null);
  assert.equal(result.loading, false);
  assert.equal(result.error, 'Balance unavailable');
  const read = await service.readView({ kind: 'balance.history', period: '1' });
  assert.equal(read.transactions[0].amount, 10);
  assert.equal(service.getSnapshot().resources.balance.data, null);
});

test('401 from current balance or lazy history clears session and account data', async () => {
  const balanceExpired = await account({ balanceResponse: new ApiError(401, 'Expired') });
  assert.equal(balanceExpired.service.getSnapshot().authenticated, false);
  assert.equal(balanceExpired.service.getSnapshot().resources.balance.data, null);
  assert.equal(balanceExpired.stored(), null);
  const historyExpired = await account({ historyResponse: new ApiError(401, 'Expired') });
  await assert.rejects(historyExpired.service.readView({ kind: 'balance.history', period: '1' }), error => error instanceof ApiError && error.status === 401);
  assert.equal(historyExpired.service.getSnapshot().authenticated, false);
  assert.equal(historyExpired.service.getSnapshot().resources.balance.data, null);
  assert.equal(historyExpired.stored(), null);
});

test('invalid history periods are rejected before any request', async () => {
  const { service, calls } = await account();
  for (const period of [undefined, null, '', 1, '2', '0', '8', 'ALL', '1&transaction=other']) await assert.rejects(service.readView({ kind: 'balance.history', period }), OperationValidationError);
  assert.equal(historyCalls(calls).length, 0);
});

test('abort discards a late period response without losing the current session or balance', async () => {
  const pending = deferred();
  const { service, calls } = await account({ historyResponse: pending.promise });
  const controller = new AbortController();
  const read = service.readView({ kind: 'balance.history', period: 'all' }, { signal: controller.signal });
  const rejected = assert.rejects(read, error => error instanceof ApiError && error.key === 'errors.cancelled');
  controller.abort();
  assert.equal(historyCalls(calls)[0].options.signal.aborted, true);
  pending.resolve(history);
  await rejected;
  assert.equal(service.getSnapshot().authenticated, true);
  assert.equal(service.getSnapshot().resources.balance.data.balances[0].amount, 14.25);
});

test('a late old-account history cannot become data for the next account', async () => {
  const old = deferred();
  const { service, calls } = await account({ historyResponse: (_path, options) => options.token === 'test-token-A' ? old.promise : { balanceList: [] } });
  const read = service.readView({ kind: 'balance.history', period: 'all' });
  const rejected = assert.rejects(read, error => error instanceof ApiError && error.key === 'errors.cancelled');
  await service.logout();
  assert.equal((await service.login('b@example.test', 'test-password')).ok, true);
  await flush();
  const next = await service.readView({ kind: 'balance.history', period: '1' });
  assert.deepEqual(next.transactions, []);
  old.resolve(history);
  await rejected;
  assert.equal(historyCalls(calls)[0].options.signal.aborted, true);
  assert.equal(service.getSnapshot().resources.profile.data.id, 'B');
  assert.equal(service.getSnapshot().authenticated, true);
});

test('language changes discard stale history and stale401 cannot sign out the newer language', async () => {
  const old = deferred();
  const { service, calls, stored } = await account({ historyResponse: (_path, options) => options.language === 'ro' ? old.promise : { balanceList: [] } });
  const token = stored();
  const read = service.readView({ kind: 'balance.history', period: '1' });
  const rejected = assert.rejects(read, error => error instanceof ApiError && error.key === 'errors.cancelled');
  assert.equal(service.setLanguage('ru'), true);
  await flush();
  const next = await service.readView({ kind: 'balance.history', period: '1' });
  old.reject(new ApiError(401, 'Expired old request'));
  await rejected;
  assert.deepEqual(next.transactions, []);
  assert.deepEqual(historyCalls(calls).map(call => call.options.language), ['ro', 'ru']);
  assert.equal(service.getSnapshot().authenticated, true);
  assert.equal(stored(), token);
});
