import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInvoicePaymentRecord, normalizeInvoicePaymentHistory, reconcilePaymentInvoices } from '../src/api/payment-reconciliation.ts';
import { planRead } from '../src/api/operations-contracts.ts';
import { LiveAccountService } from '../src/api/service.ts';
import { API_ORIGIN } from '../src/api/client.ts';

const now = Date.parse('2026-11-03T12:00:00Z');
const scope = { currency: 'USD', invoices: [{ id: '101', reference: 'SYNTH101', amount: '1.0000' }] };
const raw = { trid: 'SYNTH101', summ: '1.00', type: 'minus', status: 'paid', payment_id: '202', created: '2026-11-02 10:00:00', sign: '$' };
const record = () => normalizeInvoicePaymentRecord(raw);
const history = (row = raw, currency = 'usd') => normalizeInvoicePaymentHistory({ balanceList: { [currency]: [row] } });

test('owned transaction plus unique ISO-grouped history proves exact invoices, never which attempt paid', async () => {
  const calls = [];
  assert.equal(await reconcilePaymentInvoices(scope, async query => { calls.push(query); return query.kind === 'payments.invoice.read' ? record() : history(); }, now), true);
  assert.deepEqual(calls, [{ kind: 'payments.invoice.read', id: '101' }, { kind: 'payments.invoice.history', days: 7 }]);
  assert.equal(record().id, null); assert.equal(record().currency, undefined);
  assert.equal(planRead(calls[0]).path, '/api/balance?transaction=101');
  assert.equal(planRead(calls[1]).path, '/api/balance?period=7');
});

test('missing, stale, duplicate, foreign-currency or unequal records never resolve an attempt', async () => {
  for (const altered of [null, { ...record(), reference: 'OTHER' }, { ...record(), id: '999' }, { ...record(), amount: '1.000000000000000001' }, { ...record(), type: 'plus' }, { ...record(), status: 'pending' }, { ...record(), created: '2026-02-30 00:00:00' }]) {
    let calls = 0;
    assert.equal(await reconcilePaymentInvoices(scope, async query => { calls++; return query.kind === 'payments.invoice.read' ? altered : history(); }, now), false);
    assert.equal(calls, 1);
  }
  for (const rows of [[], history(raw, 'CAD'), [...history(), ...history()], history({ ...raw, payment_id: '999' }), history({ ...raw, status: 'unpaid' }), history({ ...raw, summ: '2.00' }), history({ ...raw, created: '2026-11-01 10:00:00' })]) {
    assert.equal(await reconcilePaymentInvoices(scope, async query => query.kind === 'payments.invoice.read' ? record() : rows, now), false);
  }
});

test('reconciliation reads use authenticated transport and discard late data after logout, without writes or snapshots', async () => {
  let release; const deferred = new Promise(resolve => { release = resolve; }); const calls = [];
  const service = new LiveAccountService(async (path, options) => {
    calls.push({ path, options });
    if (path === '/api/balance?transaction=101') return deferred;
    if (path === '/api/balance?period=7') return { balanceList: { usd: [raw] } };
    if (path === '/api/auth') return { id: '7', name: 'Synthetic', surname: 'Only' };
    if (path === '/api/member/me') return { member: { id: '7', email: 'synthetic@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'Synthetic', surname: 'Only', phone: '12345', phoneCode: '+373' };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-only-session', expiresAt: now + 3600000 }), write: async () => {}, clear: async () => {} }, () => now);
  await service.start(); await new Promise(resolve => setImmediate(resolve));
  const historyResult = await service.readView({ kind: 'payments.invoice.history', days: 7 });
  assert.equal(historyResult[0].currency, 'USD'); assert.equal(JSON.stringify(service.getSnapshot()).includes('SYNTH101'), false);
  const pending = service.readView({ kind: 'payments.invoice.read', id: '101' });
  const rejection = assert.rejects(pending, error => error.key === 'errors.cancelled');
  await service.logout(); release(raw); await rejection;
  const invoiceCalls = calls.filter(call => call.path.startsWith('/api/balance?'));
  assert.equal(invoiceCalls.length, 2); assert.ok(invoiceCalls.every(call => call.options.token === 'synthetic-only-session' && call.options.write === undefined));
  assert.equal(invoiceCalls[1].options.signal.aborted, true);
});

test('all IDs must match; null legacy references, numeric coercion and symbols never establish currency', async () => {
  const multi = { ...scope, invoices: [...scope.invoices, { id: '102', reference: 'SYNTH102', amount: '2' }] };
  assert.equal(await reconcilePaymentInvoices(multi, async query => query.kind === 'payments.invoice.read' ? record() : history(), now), false);
  assert.equal(await reconcilePaymentInvoices({ ...scope, invoices: [{ ...scope.invoices[0], reference: '' }] }, async () => { throw Error('must not read'); }, now), false);
  for (const summ of [false, '', ' ', '1e0', -1, 0.1]) assert.throws(() => normalizeInvoicePaymentRecord({ ...raw, summ }));
  assert.deepEqual(normalizeInvoicePaymentHistory({ balanceList: [] }), []);
  assert.equal(normalizeInvoicePaymentRecord([]), null);
  assert.equal(await reconcilePaymentInvoices(scope, async query => query.kind === 'payments.invoice.read' ? record() : history({ ...raw, sign: '€' }, 'USD'), now), true); // ISO, not sign, is the currency proof.
});

test('bounded history covers older invoice date and rejects unsupported or injected queries', async () => {
  let days;
  const older = { ...raw, created: '2026-01-01 00:00:00' };
  assert.equal(await reconcilePaymentInvoices(scope, async query => query.kind === 'payments.invoice.read' ? normalizeInvoicePaymentRecord(older) : (days = query.days, history(older)), now), true);
  assert.ok(days > 300 && days < 320);
  for (const query of [{ kind: 'payments.invoice.read', id: '101&member=2' }, { kind: 'payments.invoice.history', days: 1 }, { kind: 'payments.invoice.history', days: 36501 }, { kind: 'payments.invoice.history', days: 7.5 }]) assert.throws(() => planRead(query));
});
