import assert from 'node:assert/strict';
import test from 'node:test';
import { findCreatedRefund, normalizeFinancialAcknowledgement, normalizeOrderCancellation, normalizeRefundOverview, planFinancialMutation, planFinancialRead, quoteRefund, refundAmount, validateFinancialMutation } from '../src/api/account-financial-actions.ts';
import { API_ORIGIN, ApiError } from '../src/api/client.ts';
import { LiveAccountService } from '../src/api/service.ts';

const fixture = () => ({
  guardedRefundWrites: true,
  memberBalance: [
    { currency_id: '4', currency_code: 'gbp', amount: '19.99' },
    { currency_id: '2', currency_code: 'eur', amount: '-1.00' },
    { currency_id: '1', currency_code: 'usd', amount: '100.00' },
    { currency_id: '5', currency_code: 'ron', amount: '25.00' },
  ],
  refundTypes: [
    { id: '8', title: '<b>Card</b>', commissionPercent: '0', minimalCommission: '0.00', availableCurrency: ['1', '2', '4', '5'] },
    { id: '9', title: 'PayPal', commissionPercent: '3.5', minimalCommission: '0.50', availableCurrency: ['1', '2', '4'] },
  ],
  requestsList: [{ id: '20', currency_id: '1', refundType_id: '8', sum: '1.00', created: '2026-11-04 01:02:03', status: 'awaiting', canCancel: true }],
});
const order = (change = {}) => [{ id: '123', uid: 'TEST-123', canCancelSafely: true, paymentStatus: 'paid', processingStatus: 'new', totalPrice: '19.99', currency: 'usd', ...change }];
const create = (data, change = {}) => {
  const input = { currencyId: '1', refundTypeId: '8', amount: '1.00', ...change };
  return { kind: 'refund.create', ...input, reviewRevision: quoteRefund(data, input).revision };
};

test('catalog keeps real currency IDs and signed balances; guarded awaiting requests are cancelable', () => {
  const data = normalizeRefundOverview(fixture());
  assert.deepEqual(data.balances.map(row => [row.id, row.currency, row.amount]), [['1', 'USD', 100], ['2', 'EUR', -1], ['5', 'RON', 25], ['4', 'GBP', 19.99]]);
  assert.equal(data.methods[0].title, 'Card');
  assert.equal(data.requests[0].status, 'awaiting'); assert.equal(data.requests[0].canCancel, true);
  assert.equal(data.requests[0].currency, 'USD');
});

test('explicit server state prevents cancellation; past inactive method/currency stay readable', () => {
  const original = fixture();
  for (const [state, capability] of [['approved', true], ['declined', true], ['processing', true], ['awaiting', false]]) {
    const data = normalizeRefundOverview({ ...original, requestsList: [{ ...original.requestsList[0], status: state, canCancel: capability }] });
    assert.equal(data.requests[0].canCancel, false);
    assert.throws(() => validateFinancialMutation({ kind: 'refund.cancel', id: '20' }, data), { key: 'refunds.notCancelable' });
  }
  const data = normalizeRefundOverview({ ...original, requestsList: [{ ...original.requestsList[0], status: 'approved', currency_id: '99', currency_code: 'chf', refundType_id: '77', methodTitle: 'Previous method' }] });
  assert.equal(data.requests[0].currency, 'CHF'); assert.equal(data.requests[0].methodTitle, 'Previous method');
  assert.throws(() => validateFinancialMutation({ kind: 'refund.cancel', id: '21' }, data));
});

test('malformed financial fields, duplicate identities and contradictory IDs are rejected', () => {
  const base = fixture();
  for (const value of ['', 'NaN', '10USD', '1e5', Infinity, {}]) assert.throws(() => normalizeRefundOverview({ ...base, memberBalance: [{ ...base.memberBalance[0], amount: value }] }));
  assert.throws(() => normalizeRefundOverview({ ...base, refundTypes: [{ ...base.refundTypes[0], availableCurrency: [0, 1] }] }));
  assert.throws(() => normalizeRefundOverview({ ...base, requestsList: [...base.requestsList, ...base.requestsList] }));
  assert.throws(() => normalizeRefundOverview({ ...base, requestsList: [{ ...base.requestsList[0], canCancel: 'false' }] }));
  assert.throws(() => normalizeOrderCancellation(order(), '124'));
  assert.throws(() => normalizeOrderCancellation([], '123'));
  assert.throws(() => normalizeOrderCancellation([...order(), ...order()], '123'));
});

test('refund preview and submission round decimal amounts half up as the server does', () => {
  assert.equal(refundAmount(' 001,20 '), '1.20'); assert.equal(refundAmount('0.01'), '0.01');
  for (const [input, expected] of [['76.98999999999999', '76.99'], ['1,005', '1.01'], ['1.001', '1.00'], ['0.005', '0.01'], ['9.999', '10.00']]) {
    assert.equal(refundAmount(input), expected);
    const data = normalizeRefundOverview(fixture());
    const cmd = create(data, { amount: input });
    const quote = quoteRefund(data, cmd);
    assert.equal(quote.amount, expected);
    assert.equal(planFinancialMutation(cmd).fields.amount, expected);
    validateFinancialMutation(cmd, data);
  }
  for (const value of ['0', '0.004', '-1', '1e2', '1,2.3', '1 000', 'Infinity', '1000000000.005', '']) assert.throws(() => refundAmount(value));
  const base = fixture();
  const balance = normalizeRefundOverview({ ...base, memberBalance: [{ ...base.memberBalance[2], amount: '76.98999999999999' }] });
  assert.equal(quoteRefund(balance, { currencyId: '1', refundTypeId: '8', amount: '76.98999999999999' }).amount, '76.99');
  const data = normalizeRefundOverview(fixture());
  assert.throws(() => quoteRefund(data, { currencyId: '4', refundTypeId: '8', amount: '20' }), { key: 'refunds.insufficientFunds' });
  assert.throws(() => quoteRefund(data, { currencyId: '2', refundTypeId: '8', amount: '0.01' }), { key: 'refunds.insufficientFunds' });
  assert.equal(quoteRefund(data, { currencyId: '4', refundTypeId: '8', amount: '19.99' }).reservedAmount, 19.99);
});

test('commission is estimated with model truncation and is not silently added to reserved amount', () => {
  const data = normalizeRefundOverview(fixture());
  let quote = quoteRefund(data, { currencyId: '1', refundTypeId: '9', amount: '19.99' });
  assert.equal(quote.estimatedFee, 0.69); assert.equal(quote.reservedAmount, 19.99);
  quote = quoteRefund(data, { currencyId: '1', refundTypeId: '9', amount: '1.00' });
  assert.equal(quote.estimatedFee, 0.5); assert.equal(quote.amount, '1.00');
  assert.throws(() => quoteRefund(data, { currencyId: '5', refundTypeId: '9', amount: '1' }), { key: 'refunds.methodUnavailable' });
});

test('fresh preflight rejects changed balance, fee, active method, currency eligibility or order state', () => {
  const data = normalizeRefundOverview(fixture()); const command = create(data);
  validateFinancialMutation(command, data);
  for (const changed of [
    { ...data, balances: data.balances.map(row => row.id === '1' ? { ...row, amount: 99 } : row) },
    { ...data, methods: data.methods.map(row => row.id === '8' ? { ...row, commissionPercent: '1' } : row) },
    { ...data, methods: data.methods.filter(row => row.id !== '8') },
    { ...data, methods: data.methods.map(row => row.id === '8' ? { ...row, currencyIds: ['2'] } : row) },
  ]) assert.throws(() => validateFinancialMutation(command, changed));
  const current = normalizeOrderCancellation(order(), '123');
  const cancel = { kind: 'order.cancel', id: '123', revision: current.revision };
  validateFinancialMutation(cancel, current);
  for (const processingStatus of ['bought', 'semi-bought', 'inside', 'canceled']) assert.throws(() => validateFinancialMutation(cancel, normalizeOrderCancellation(order({ processingStatus }), '123')));
  assert.throws(() => validateFinancialMutation(cancel, normalizeOrderCancellation(order({ totalPrice: '20.00' }), '123')));
});

test('plans use the existing owner-scoped endpoints without member IDs or write retries', () => {
  assert.equal(planFinancialRead({ kind: 'order.cancellation', id: '123' }).path, '/api/order/123');
  assert.equal(planFinancialRead({ kind: 'refunds.read' }).path, '/api/refund-request?includeHistory=1');
  const command = create(normalizeRefundOverview(fixture()));
  const plan = planFinancialMutation(command);
  assert.equal(plan.method, 'POST'); assert.equal(plan.responseMode, 'envelope');
  assert.deepEqual(plan.fields, { currency_id: '1', refundType_id: '8', amount: '1.00' });
  assert.deepEqual(plan.invalidate, ['balance', 'profile']);
  assert.equal(planFinancialMutation({ kind: 'refund.cancel', id: '20' }).path, '/api/refund-request/20');
  assert.equal(planFinancialMutation({ kind: 'order.cancel', id: '123', revision: 'reviewed' }).method, 'DELETE');
  for (const id of ['0', '-1', '1?memberId=9', '../1']) assert.throws(() => planFinancialMutation({ kind: 'refund.cancel', id }));
});

test('HTTP 200 is not acknowledgement; create readback cannot confuse preexisting or ambiguous rows', () => {
  assert.deepEqual(normalizeFinancialAcknowledgement({ code: 200, error: false, message: 'Ok' }), { accepted: true, id: null });
  assert.equal(normalizeFinancialAcknowledgement({ error: false, data: { id: '21' } }).id, '21');
  for (const response of [{ code: 200, error: true }, { code: 500, error: false }, {}, { error: 'false' }, { error: false, data: { id: 'bad' } }]) assert.throws(() => normalizeFinancialAcknowledgement(response));
  const data = normalizeRefundOverview(fixture()); const quote = quoteRefund(data, { currencyId: '1', refundTypeId: '8', amount: '1' });
  assert.equal(findCreatedRefund(data, ['20'], quote, null), null);
  const plus = { ...data, requests: [...data.requests, { ...data.requests[0], id: '21' }] };
  assert.equal(findCreatedRefund(plus, ['20'], quote, null), null);
  assert.equal(findCreatedRefund(plus, ['20'], quote, '22'), null);
  const ambiguous = { ...plus, requests: [...plus.requests, { ...plus.requests[0], id: '22' }] };
  assert.equal(findCreatedRefund(ambiguous, ['20'], quote, null), null);
  assert.equal(findCreatedRefund(ambiguous, ['20'], quote, '21')?.id, '21');
});

const NOW = 1790000000000;
function mockService(override = () => undefined) {
  const writes = []; const reads = [];
  const service = new LiveAccountService(async (path, options = {}) => {
    if (options.write) writes.push({ path, write: options.write }); else reads.push(path);
    const result = override(path, options); if (result !== undefined) return result;
    if (options.write) return { code: 200, error: false, data: { id: '21' } };
    if (path === '/api/refund-request?includeHistory=1') return fixture();
    if (path === '/api/order/123') return order();
    if (path === '/api/member/me') return { member: { id: '7', email: 'synthetic@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'Synthetic', surname: 'Member', countryId: '143', countries: [{ id: '143', title: 'Moldova' }], phoneCode: '+373', phone: '60000000' };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-financial', expiresAt: NOW + 3600000 }), write: async () => {}, clear: async () => {} }, () => NOW);
  return { service, writes, reads };
}

test('service reads current catalog before one refund write and returns only explicit acknowledgement', async () => {
  const { service, writes, reads } = mockService(); await service.start();
  const result = await service.mutate(create(normalizeRefundOverview(fixture())));
  assert.equal(result.ok, true); assert.equal(result.data.id, '21'); assert.equal(writes.length, 1);
  assert.equal(writes[0].path, '/api/refund-request'); assert.equal(writes[0].write.fields.amount, '1.00');
  assert.ok(reads.includes('/api/refund-request?includeHistory=1'));
});

test('service rejects stale order/refund eligibility without a write', async () => {
  const original = normalizeOrderCancellation(order(), '123');
  const commands = [
    { kind: 'order.cancel', id: '123', revision: original.revision },
    create(normalizeRefundOverview(fixture())),
    { kind: 'refund.cancel', id: '20' },
  ];
  const { service, writes } = mockService((path, options) => {
    if (!options.write && path === '/api/order/123') return order({ processingStatus: 'bought' });
    if (!options.write && path === '/api/refund-request?includeHistory=1') return { ...fixture(), memberBalance: fixture().memberBalance.map(row => row.currency_id === '1' ? { ...row, amount: '0.00' } : row), requestsList: [] };
  }); await service.start();
  for (const command of commands) { const result = await service.mutate(command); assert.equal(result.ok, false); assert.equal(result.outcome, 'rejected'); }
  assert.equal(writes.length, 0);
});

test('network uncertainty after dispatch never automatically replays the refund or cancellation', async () => {
  for (const command of [create(normalizeRefundOverview(fixture())), { kind: 'refund.cancel', id: '20' }, { kind: 'order.cancel', id: '123', revision: normalizeOrderCancellation(order(), '123').revision }]) {
    const { service, writes } = mockService((_path, options) => { if (options.write) throw new ApiError(0, 'errors.network', {}, { outcome: 'unknown' }); });
    await service.start(); const result = await service.mutate(command);
    assert.equal(result.ok, false); assert.equal(result.outcome, 'unknown');
    await new Promise(resolve => setImmediate(resolve)); assert.equal(writes.length, 1);
  }
});

test('logout during financial preflight prevents any account-scoped write', async () => {
  let release; const delayed = new Promise(resolve => { release = resolve; });
  const { service, writes } = mockService((path, options) => { if (!options.write && path === '/api/refund-request?includeHistory=1') return delayed; });
  await service.start(); const pending = service.mutate(create(normalizeRefundOverview(fixture())));
  await new Promise(resolve => setImmediate(resolve)); await service.logout(); release(fixture());
  const result = await pending; assert.equal(result.ok, false); assert.equal(result.outcome, 'rejected'); assert.equal(writes.length, 0);
});

test('legacy servers remain readable and cannot receive financial writes from the app', async () => {
  const legacy = { ...fixture(), guardedRefundWrites: undefined, refundTypes: [{ ...fixture().refundTypes[0], availableCurrency: [0, 1] }], requestsList: [{ ...fixture().requestsList[0], status: undefined, canCancel: undefined }] };
  const readOnly = normalizeRefundOverview(legacy);
  assert.equal(readOnly.requests[0].status, 'awaiting');
  assert.equal(readOnly.requests[0].canCancel, false);
  assert.deepEqual(readOnly.methods[0].currencyIds, []);
  assert.equal(normalizeOrderCancellation(order({ canCancelSafely: undefined }), '123').canCancel, false);
  const commands = [create(normalizeRefundOverview(fixture())), { kind: 'refund.cancel', id: '20' }, { kind: 'order.cancel', id: '123', revision: normalizeOrderCancellation(order(), '123').revision }];
  const { service, writes } = mockService((path) => {
    if (path === '/api/refund-request?includeHistory=1') return legacy;
    if (path === '/api/order/123') return order({ canCancelSafely: undefined });
  });
  await service.start();
  for (const command of commands) assert.equal((await service.mutate(command)).ok, false);
  assert.equal(writes.length, 0);
});
