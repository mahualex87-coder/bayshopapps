import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../src/features/payments/payment-attempt.ts';

const origin = 'https://bayshop.com';
const account = '4493';
const old = { version: 1, attemptKey: '11111111-2222-4333-8444-555555555555', paymentId: null, createdAt: 12345 };
const oldKey = model.paymentAttemptStorageKey(origin, account);
const newKey = model.paymentLedgerStorageKey(origin, account);
const migration = { version: 2, activeAttemptKey: old.attemptKey, attempts: [old] };

function harness({ os = 'ios', entries = [], failedReadKey = null, failWrite = false, failedDeleteKey = null } = {}) {
  const disk = new Map(entries), calls = [];
  const secure = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
    async getItemAsync(key, options) { calls.push(['get', key, options]); if (key === failedReadKey) throw new Error('native read failure'); return disk.get(key) ?? null; },
    async setItemAsync(key, value, options) { calls.push(['set', key, value, options]); if (failWrite) throw new Error('native write failure'); disk.set(key, value); },
    async deleteItemAsync(key, options) { calls.push(['delete', key, options]); if (key === failedDeleteKey) throw new Error('native delete failure'); disk.delete(key); },
  };
  const imports = { 'expo-secure-store': secure, 'react-native': { Platform: { OS: os } }, '@/api/client': { API_ORIGIN: origin }, './payment-attempt': model };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/payments/payment-attempt-store.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { assert(name in imports, name); return imports[name]; }, Error });
  return { store: exports.paymentAttemptStore, disk, calls };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('legacy migration retains exact record and writes one authoritative v2 value without deleting v1', async () => {
  const h = harness({ entries: [[oldKey, JSON.stringify(old)]] });
  const ledger = await h.store.readLedger(account);
  assert.deepEqual(plain(ledger), migration);
  assert.equal(h.calls.filter(call => call[0] === 'set').length, 0);
  await h.store.writeLedger(account, ledger);
  assert.deepEqual(model.parsePaymentLedger(h.disk.get(newKey)), migration);
  assert.equal(h.disk.get(oldKey), JSON.stringify(old));
  const writes = h.calls.filter(call => call[0] === 'set');
  assert.equal(writes.length, 1); assert.equal(writes[0][1], newKey);
  assert.deepEqual(plain(writes[0][3]), { keychainAccessible: 'device-only' });
});

test('empty authoritative v2 ledger never resurrects legacy state after restart', async () => {
  const h = harness({ entries: [[oldKey, JSON.stringify(old)], [newKey, JSON.stringify(model.emptyPaymentLedger())]] });
  assert.deepEqual(plain(await h.store.readLedger(account)), model.emptyPaymentLedger());
  assert.deepEqual(h.calls.map(call => call.slice(0, 2)), [['get', newKey]]);
  await h.store.writeLedger(account, model.emptyPaymentLedger());
  assert.equal(h.disk.get(oldKey), JSON.stringify(old));
  assert.deepEqual(plain(await h.store.readLedger(account)), model.emptyPaymentLedger());
});

test('corrupt or unreadable v2 fails closed rather than silently choosing older legacy state', async () => {
  for (const value of ['', 'null', 'invalid', JSON.stringify({ version: 2, attempts: [] })]) {
    const h = harness({ entries: [[oldKey, JSON.stringify(old)], [newKey, value]] });
    await assert.rejects(h.store.readLedger(account));
    assert.deepEqual(h.calls.map(call => call.slice(0, 2)), [['get', newKey]]);
  }
  const failed = harness({ failedReadKey: newKey, entries: [[oldKey, JSON.stringify(old)]] });
  await assert.rejects(failed.store.readLedger(account), /native read failure/);
  assert.deepEqual(failed.calls.map(call => call.slice(0, 2)), [['get', newKey]]);
});

test('legacy read errors or invalid records do not become an empty ready ledger', async () => {
  const failed = harness({ failedReadKey: oldKey });
  await assert.rejects(failed.store.readLedger(account), /native read failure/);
  const invalid = harness({ entries: [[oldKey, JSON.stringify({ ...old, token: 'forbidden' })]] });
  await assert.rejects(invalid.store.readLedger(account), /payments.recoveryFailed/);
  const none = harness();
  assert.deepEqual(plain(await none.store.readLedger(account)), model.emptyPaymentLedger());
});

test('native migration/write failure preserves old state and never evicts attempts or reports success', async () => {
  const h = harness({ entries: [[oldKey, JSON.stringify(old)]], failWrite: true });
  const ledger = await h.store.readLedger(account);
  await assert.rejects(h.store.writeLedger(account, ledger), /native write failure/);
  assert.equal(h.disk.has(newKey), false); assert.equal(h.disk.get(oldKey), JSON.stringify(old));
  assert.deepEqual(plain(await h.store.readLedger(account)), migration);
  const existing = harness({ entries: [[newKey, JSON.stringify(migration)]], failWrite: true });
  await assert.rejects(existing.store.writeLedger(account, model.emptyPaymentLedger()), /native write failure/);
  assert.deepEqual(model.parsePaymentLedger(existing.disk.get(newKey)), migration);
});

test('large scoped state is passed as one value and native size rejection never truncates recovery history', async () => {
  const h = harness({ entries: [[newKey, JSON.stringify(migration)]], failWrite: true });
  const next = { version: 2, attemptKey: '22222222-3333-4444-8555-666666666666', paymentId: null, createdAt: 12346, paymentType: 'platescro', phase: 'preparing', scope: { currency: 'USD', invoices: Array.from({ length: 80 }, (_, index) => ({ id: String(index + 1), reference: `TEST-INVOICE-${index + 1}`, amount: '1.0000' })) } };
  const value = { version: 2, activeAttemptKey: next.attemptKey, attempts: [old, next] };
  assert.ok(JSON.stringify(value).length > 2048);
  await assert.rejects(h.store.writeLedger(account, value), /native write failure/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][2], JSON.stringify(value));
  assert.deepEqual(model.parsePaymentLedger(h.disk.get(newKey)), migration);
});

test('invalid ledger never reaches native storage and environments/accounts use independent keys', async () => {
  const h = harness({ entries: [[newKey, JSON.stringify(migration)]] });
  await assert.rejects(h.store.writeLedger(account, { ...migration, token: 'forbidden' }), /payments.recoveryFailed/);
  assert.equal(h.calls.length, 0);
  await h.store.writeLedger('4494', model.emptyPaymentLedger());
  assert.equal(h.disk.get(newKey), JSON.stringify(migration));
  assert.ok(h.disk.has(model.paymentLedgerStorageKey(origin, '4494')));
  assert.notEqual(model.paymentLedgerStorageKey(origin, account), model.paymentLedgerStorageKey('https://dev.bayshop.com', account));
});

test('web cannot persist a payment handoff or access native account state', async () => {
  const h = harness({ os: 'web', entries: [[newKey, JSON.stringify(migration)]] });
  assert.deepEqual(plain(await h.store.readLedger(account)), model.emptyPaymentLedger());
  await assert.rejects(h.store.writeLedger(account, migration), /payments.nativeOnly/);
  assert.equal(h.calls.length, 0);
});

test('explicit transient-flow cleanup deletes corrupt legacy keys only for the active account and origin', async () => {
  const otherAccount = model.paymentLedgerStorageKey(origin, '4494');
  const otherOrigin = model.paymentAttemptStorageKey('https://dev.bayshop.com', account);
  const h = harness({ entries: [[oldKey, '{corrupt'], [newKey, '{corrupt'], [otherAccount, 'other-account'], [otherOrigin, 'other-origin']] });
  await h.store.clearLegacyAttempts(account);
  assert.equal(h.disk.has(oldKey), false); assert.equal(h.disk.has(newKey), false);
  assert.equal(h.disk.get(otherAccount), 'other-account'); assert.equal(h.disk.get(otherOrigin), 'other-origin');
  assert.deepEqual(h.calls.map(call => call.slice(0, 2)), [['delete', newKey], ['delete', oldKey]]);
  assert.ok(h.calls.every(call => JSON.stringify(call[2]) === JSON.stringify({ keychainAccessible: 'device-only' })));
});

test('cleanup surfaces native deletion failure without reading, recreating, or writing payment state', async () => {
  const h = harness({ entries: [[oldKey, '{corrupt'], [newKey, '{corrupt']], failedDeleteKey: newKey });
  await assert.rejects(h.store.clearLegacyAttempts(account), /native delete failure/);
  assert.equal(h.disk.get(newKey), '{corrupt'); assert.equal(h.disk.has(oldKey), false);
  assert.ok(h.calls.every(call => call[0] === 'delete'));
  const web = harness({ os: 'web', entries: [[newKey, 'unchanged']] });
  await web.store.clearLegacyAttempts(account);
  assert.equal(web.calls.length, 0); assert.equal(web.disk.get(newKey), 'unchanged');
});
