import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePaymentsData, invoicePaymentsAvailable, normalizePaymentQuote, normalizePaymentStartResult, normalizePaymentStatus, validatePaymentProviderUrl, validatePaymentSelection, validatePaymentStart, planPaymentStart } from '../src/api/payments.ts';
import { planRead, planMutation } from '../src/api/operations-contracts.ts';
import { prepareWriteBody } from '../src/api/mutations.ts';
import { LiveAccountService } from '../src/api/service.ts';
import { API_ORIGIN, ApiError } from '../src/api/client.ts';

const now = Date.parse('2026-11-02T10:00:00Z');
const attemptKey = 'aeff27ef-6cbc-4a8f-8a39-001122334455';
const quoteId = 'synthetic_quote_0123456789';
const revision = 'a'.repeat(64);
const capabilities = { version: 1, invoicePaymentV1: true, quote: true, ownedStatus: true, idempotentInitiation: true, callbackPaymentId: true, invoiceOwnershipValidated: true, walletTokenLogsRedacted: true, walletTransportTlsVerified: true };
function catalog(extra = {}) {
  const method = { name: 'Card', description: 'Secure', availableCurrency: ['USD'], max_sum: '999.00', hide_billing: '0', percent: '0', additionalFixedCommission: '0.00', minimalCommission: '0.00' };
  return { unpaidInvoices: [{ currency_id: '1', currency: 'USD', currency_sign: '$', max_sum: '10.10', counter: 2, list: [{ id: '11', trid: 'INVOICE11', summ: '20.10', comment: 'Example invoice', ceated: '2026-11-01 10:00:00' }, { id: '12', summ: '2.00' }] }], billingData: { first_name: 'Synthetic', last_name: 'Only', country: '1' }, isBillingSet: true, paymentTypes: { platescro: method, paypal: method, terminals: method, 'google-pay': method, 'apple-pay': method }, paymentCapabilities: capabilities, ...extra };
}
function quote(extra = {}) { return { version: 1, quoteId, revision, expiresAt: '2026-11-02T10:05:00Z', paymentType: 'platescro', billIds: ['11', '12'], currency: { id: '1', code: 'USD', sign: '$' }, amounts: { base: '10.10', commission: '0.00', total: '10.10', processor: '9.99', processorCurrency: 'USD' }, terminal: null, wallet: null, billingRequired: true, billingValid: true, ...extra }; }
function input(extra = {}) { return { quoteId, quoteRevision: revision, idempotencyKey: attemptKey, paymentType: 'platescro', billIds: ['11', '12'], ...extra }; }
function start(extra = {}) { return { paymentMeta: { version: 1, paymentId: '81', attemptKey, paymentType: 'platescro', state: 'pending', statusPath: '/api/payment-status/81' }, paymentAction: { kind: 'form', url: 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php', method: 'POST', fields: { amount: '9.99', curr: 'USD', invoice_id: '81', fp_hash: 'signed-synthetic-value', nonce: 'synthetic-nonce' } }, ...extra }; }
function status(extra = {}) { return { version: 1, paymentId: '81', paymentType: 'platescro', state: 'pending', rawStatus: 'sent', isPending: true, amount: '10.10', currencyId: '1', currency: 'USD', createdAt: '2026-11-02 10:00:00', updatedAt: null, ...extra }; }
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };

test('legacy catalog remains readable but absent/version-mismatched capabilities cannot enable invoice payments', () => {
  const legacy = normalizePaymentsData(catalog({ paymentCapabilities: undefined }));
  assert.equal(legacy.catalog.invoiceGroups[0].maxSum, '10.10');
  assert.equal(invoicePaymentsAvailable(legacy.capabilities), false);
  assert.equal(invoicePaymentsAvailable(normalizePaymentsData(catalog()).capabilities), true);
  for (const change of [{ version: 2 }, { invoicePaymentV1: false }, { ownedStatus: false }, { invoiceOwnershipValidated: false }]) assert.equal(invoicePaymentsAvailable(normalizePaymentsData(catalog({ paymentCapabilities: { ...capabilities, ...change } })).capabilities), false);
  for (const value of ['true', '1', 1, null]) assert.throws(() => normalizePaymentsData(catalog({ paymentCapabilities: { ...capabilities, invoicePaymentV1: value } })));
});

test('quote retains server cap, commission, processor amount and every decimal digit without recomputing', () => {
  const normalized = normalizePaymentQuote(quote({ amounts: { base: '99999999999999999999.001', commission: '0.000000000000000001', total: '99999999999999999999.001000000000000001', processor: '9.99', processorCurrency: 'EUR' } }));
  assert.equal(normalized.amounts.total, '99999999999999999999.001000000000000001');
  assert.equal(normalized.amounts.processor, '9.99');
  assert.equal(normalizePaymentQuote(quote()).amounts.base, '10.10'); // Invoice sum is 22.10; debt cap remains authoritative.
  for (const bad of [false, ' ', 10.1, '1e2', 'NaN', '-1.00']) assert.throws(() => normalizePaymentQuote(quote({ amounts: { ...quote().amounts, total: bad } })));
  for (const change of [{ version: '1' }, { billIds: ['11', '11'] }, { billIds: ['0'] }, { expiresAt: 'tomorrow' }, { revision: 'x' }, { billingRequired: '1' }, { terminal: undefined }]) assert.throws(() => normalizePaymentQuote(quote(change)));
});

test('known provider origins are exact HTTPS hosts, and signed fields remain text without HTML execution', () => {
  const normalized = normalizePaymentStartResult(start(), input());
  assert.equal(normalized.paymentAction.fields.fp_hash, 'signed-synthetic-value');
  assert.equal(normalized.paymentMeta.state, 'pending');
  assert.equal(validatePaymentProviderUrl('https://www.paypal.com/checkoutnow?token=example', 'paypal'), 'https://www.paypal.com/checkoutnow?token=example');
  assert.equal(validatePaymentProviderUrl('https://www.sandbox.paypal.com/checkoutnow?token=example', 'paypal').startsWith('https://'), true);
  for (const url of ['http://secure.euplatesc.ro/pay', 'https://secure.euplatesc.ro.evil.test/pay', 'https://evil.test/secure.euplatesc.ro', 'https://user:pass@secure.euplatesc.ro/pay', 'https://secure.euplatesc.ro:444/pay', 'javascript:alert(1)', 'https://secure.euplatesc.ro/pay#fake-paid']) assert.throws(() => validatePaymentProviderUrl(url, 'platescro'));
  assert.throws(() => validatePaymentProviderUrl('https://www.paypal.com/pay', 'platescro'));
  assert.throws(() => normalizePaymentStartResult(start({ paymentAction: { ...start().paymentAction, fields: { amount: 10 } } })));
  assert.throws(() => normalizePaymentStartResult(start({ paymentAction: { kind: 'html', html: '<script>pay()</script>' } })));
  assert.throws(() => normalizePaymentStartResult(start({ paymentMeta: { ...start().paymentMeta, statusPath: 'https://evil.test/' } })));
  assert.throws(() => normalizePaymentStartResult(start(), input({ idempotencyKey: 'beff27ef-6cbc-4a8f-8a39-001122334455' })));
});

test('terminal code and provider redirect are pending actions; only owned status can be paid', () => {
  const terminal = { kind: 'terminal', paymentCode: '81', amount: '200.00', currency: 'MDL', currencySign: 'lei', expiresAt: null };
  assert.deepEqual(normalizePaymentStartResult(start({ paymentMeta: { ...start().paymentMeta, paymentType: 'terminals' }, paymentAction: terminal })).paymentAction, terminal);
  assert.equal(normalizePaymentStatus(status()).state, 'pending');
  assert.equal(normalizePaymentStatus(status({ state: 'paid', rawStatus: 'paid', isPending: false })).state, 'paid');
  const unknown = normalizePaymentStatus({ version: 1, attemptKey, paymentId: null, state: 'unknown', retryPayment: false });
  assert.equal(unknown.amount, null); assert.equal(unknown.retryPayment, false);
  assert.throws(() => normalizePaymentStatus({ version: 1, attemptKey, paymentId: null, state: 'paid', retryPayment: false }));
  assert.throws(() => normalizePaymentStatus(status({ retryPayment: true })));
  assert.throws(() => normalizePaymentStatus(status({ amount: false })));
  const recovered = normalizePaymentStatus(status({ paymentType: 'terminals', terminal: { ...terminal, amount: null, currency: null, currencySign: null } }));
  assert.equal(recovered.terminal.paymentCode, '81'); assert.equal(recovered.terminal.amount, null); assert.equal(recovered.terminal.currency, null);
  assert.throws(() => normalizePaymentStatus(status({ paymentType: 'terminals', terminal: { ...terminal, paymentCode: '82' } })));
  assert.throws(() => normalizePaymentStartResult(start({ paymentMeta: { ...start().paymentMeta, paymentType: 'terminals' }, paymentAction: { ...terminal, amount: null } })));
  assert.equal(normalizePaymentStatus(status({ paymentType: 'terminals', state: 'expired', terminal })).state, 'expired');
  assert.throws(() => normalizePaymentStatus(status({ state: 'expired' })));
  const initiating = normalizePaymentStartResult(start({ paymentMeta: { ...start().paymentMeta, paymentId: null, state: 'initiating', statusPath: null }, paymentAction: { kind: 'pending' } }));
  assert.equal(initiating.paymentMeta.paymentId, null); assert.equal(initiating.paymentAction.kind, 'pending');
  assert.throws(() => normalizePaymentStartResult(start({ paymentMeta: { ...start().paymentMeta, paymentId: null, state: 'initiating', statusPath: null } })));
  assert.throws(() => normalizePaymentStartResult(start({ paymentMeta: { ...start().paymentMeta, state: 'paid' } })));
});

test('exact invoice set, one currency, eligible method and quoted identity are required', () => {
  const data = normalizePaymentsData(catalog());
  validatePaymentSelection(input(), data);
  validatePaymentStart(input(), normalizePaymentQuote(quote()), data, now);
  for (const change of [{ billIds: ['11', '11'] }, { billIds: ['11', '999'] }, { paymentType: 'cash' }, { quoteRevision: 'b'.repeat(64) }]) assert.throws(() => validatePaymentStart(input(change), normalizePaymentQuote(quote()), data, now));
  assert.throws(() => validatePaymentStart(input(), normalizePaymentQuote(quote()), data, now + 300000));
  const mixed = catalog(); mixed.unpaidInvoices.push({ currency_id: '2', currency: 'EUR', list: [{ id: '21', summ: '1.00' }] });
  assert.throws(() => validatePaymentSelection(input({ billIds: ['11', '21'] }), normalizePaymentsData(mixed)));
  assert.throws(() => validatePaymentStart(input(), normalizePaymentQuote(quote()), normalizePaymentsData(catalog({ isBillingSet: false })), now));
});

test('plans use only versioned invoice fields and never send a client amount, currency, order or legacy billing write', async () => {
  const plan = planMutation({ kind: 'payments.start', input: { ...input(), amount: '0.01', currency: 'EUR', orders: ['unexpected'] } });
  assert.equal(plan.path, '/api/payments'); assert.equal(plan.responseMode, undefined); assert.deepEqual(plan.invalidate, []);
  assert.deepEqual(Object.keys(plan.fields).sort(), ['paymentApiVersion', 'quoteId', 'quoteRevision', 'idempotencyKey', 'paymentType', 'bills[]'].sort());
  const encoded = await prepareWriteBody(plan); const body = new URLSearchParams(encoded.body);
  assert.deepEqual(body.getAll('bills[]'), ['11', '12']); assert.equal(body.get('paymentApiVersion'), '1');
  assert.equal(planRead({ kind: 'payments.catalog' }).path, '/api/payments');
  const path = new URL(planRead({ kind: 'payments.quote', paymentType: 'platescro', billIds: ['11', '12'] }).path, API_ORIGIN);
  assert.deepEqual(path.searchParams.getAll('bills[]'), ['11', '12']);
  const manyIds = Array.from({ length: 600 }, (_, index) => String(index + 1));
  const many = new URL(planRead({ kind: 'payments.quote', paymentType: 'platescro', billIds: manyIds }).path, API_ORIGIN);
  assert.deepEqual(many.searchParams.getAll('bills[]'), manyIds);
  assert.equal(planRead({ kind: 'payments.status', paymentId: '81' }).path, '/api/payment-status/81');
  assert.equal(planRead({ kind: 'payments.status', attemptKey }).normalize({ version: 1, attemptKey, paymentId: null, state: 'initiating', retryPayment: false }).state, 'initiating');
  for (const query of [{ kind: 'payments.status', paymentId: '81', attemptKey }, { kind: 'payments.status' }, { kind: 'payments.status', paymentId: '../81' }]) assert.throws(() => planRead(query));
  assert.throws(() => planRead({ kind: 'payments.status', paymentId: '81' }).normalize(status({ paymentId: '82' })));
});

test('wallet token remains in request fields only and requires explicit quote plus security capabilities', () => {
  const secret = Buffer.from('synthetic encrypted wallet token').toString('base64');
  const values = input({ paymentType: 'google-pay', walletToken: secret });
  const plan = planPaymentStart(values); assert.equal(plan.fields.gpay_token, secret); assert.equal(plan.fields.apay_token, undefined);
  assert.throws(() => planPaymentStart(input({ walletToken: secret })));
  for (const token of ['', 'raw unencoded', '%%%']) assert.throws(() => planPaymentStart(input({ paymentType: 'apple-pay', walletToken: token })));
  assert.throws(() => validatePaymentStart(values, normalizePaymentQuote(quote({ paymentType: 'google-pay' })), normalizePaymentsData(catalog()), now));
  const quoted = normalizePaymentQuote(quote({ paymentType: 'google-pay', wallet: { method: 'google-pay', authorizationTotal: '10.10', currency: 'USD', acquirerCountryCode: 'RO', merchantName: 'Synthetic merchant', google: { gatewayMerchantId: 'synthetic123', environment: 'TEST', networks: ['VISA'] } } }));
  validatePaymentStart(values, quoted, normalizePaymentsData(catalog()), now);
  assert.throws(() => validatePaymentStart(values, quoted, normalizePaymentsData(catalog({ paymentCapabilities: { ...capabilities, walletTokenLogsRedacted: false } })), now));
  const result = plan.normalize(start({ paymentMeta: { ...start().paymentMeta, paymentType: 'google-pay' }, paymentAction: { kind: 'pending' }, walletToken: secret }));
  assert.equal(JSON.stringify(result).includes(secret), false);
});

function fixture(override = () => undefined) {
  let current = catalog(); let quoted = quote(); let time = now; const calls = []; const writes = [];
  const service = new LiveAccountService(async (path, options = {}) => {
    calls.push(path); const custom = override(path, options); if (custom !== undefined) return custom;
    if (options.write) { writes.push(options.write); return start(); }
    if (path === '/api/payments') return structuredClone(current);
    if (path.startsWith('/api/payment-quote?')) return structuredClone(quoted);
    if (path.startsWith('/api/payment-status')) return status(path.includes('attemptKey') ? { attemptKey, retryPayment: false } : {});
    if (path === '/api/auth') return { id: '7', name: 'First', surname: 'Last' };
    if (path === '/api/member/me') return { member: { id: '7', email: 'synthetic@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'First', surname: 'Last', phone: '60000000', phoneCode: '+373' };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-payment-session', expiresAt: now + 3600000 }), write: async () => {}, clear: async () => {} }, () => time);
  return { service, calls, writes, setCatalog: value => current = value, setQuote: value => quoted = value, setTime: value => time = value };
}
const obtainQuote = service => service.readView({ kind: 'payments.quote', paymentType: 'platescro', billIds: ['11', '12'] });
const command = () => ({ kind: 'payments.start', input: input() });

test('service reads fresh capability/catalog before quote and start, then returns an ephemeral action from a single POST', async () => {
  const f = fixture(); await f.service.start(); await flush();
  assert.equal((await f.service.mutate(command())).ok, false); assert.equal(f.writes.length, 0);
  await obtainQuote(f.service); const result = await f.service.mutate(command());
  assert.equal(result.ok, true); assert.equal(f.writes.length, 1);
  assert.equal(f.calls.filter(path => path === '/api/payments').length, 3); // Two GET preflights and one POST.
  assert.equal(JSON.stringify(f.service.getSnapshot()).includes('signed-synthetic-value'), false);
  assert.equal(JSON.stringify(f.service.getSnapshot()).includes(quoteId), false);
  assert.equal((await f.service.readView({ kind: 'payments.status', paymentId: '81' })).state, 'pending');
});

test('legacy capability, missing bill, changed sum, currency, billing or expiry never dispatch', async () => {
  for (const change of [data => { delete data.paymentCapabilities; }, data => { data.unpaidInvoices[0].list.pop(); }, data => { data.unpaidInvoices[0].list[0].summ = '21.00'; }, data => { data.unpaidInvoices[0].currency_id = '2'; }, data => { data.billingData.first_name = 'Changed'; }, data => { data.paymentTypes.platescro.availableCurrency = ['EUR']; }]) {
    const f = fixture(); await f.service.start(); await flush(); await obtainQuote(f.service);
    const changed = catalog(); change(changed); f.setCatalog(changed);
    assert.equal((await f.service.mutate(command())).outcome, 'rejected'); assert.equal(f.writes.length, 0);
  }
  const f = fixture(); await f.service.start(); await flush(); await obtainQuote(f.service); f.setTime(now + 300001);
  assert.equal((await f.service.mutate(command())).error, 'payments.quoteExpired'); assert.equal(f.writes.length, 0);
});

test('quote response mismatch and capability absence prevent caching or requesting a versioned quote', async () => {
  const f = fixture(); await f.service.start(); await flush(); f.setCatalog(catalog({ paymentCapabilities: undefined }));
  await assert.rejects(obtainQuote(f.service)); assert.equal(f.calls.some(path => path.startsWith('/api/payment-quote')), false);
  f.setCatalog(catalog()); f.setQuote(quote({ billIds: ['11'] })); await assert.rejects(obtainQuote(f.service));
  assert.equal((await f.service.mutate(command())).outcome, 'rejected'); assert.equal(f.writes.length, 0);
});

test('logout/abort during preflight and duplicate taps cannot initiate a payment', async () => {
  let block = false; const pending = deferred();
  const f = fixture((path, options) => block && path === '/api/payments' && !options.write ? pending.promise : undefined);
  await f.service.start(); await flush(); await obtainQuote(f.service); block = true;
  const started = f.service.mutate(command()); await flush();
  assert.equal((await f.service.mutate(command())).error, 'errors.mutationInProgress');
  await f.service.logout(); pending.resolve(catalog()); assert.equal((await started).outcome, 'rejected'); assert.equal(f.writes.length, 0);
});

test('unknown POST is never replayed, even if the same quote is read again or an attempt key is reused', async () => {
  let attempts = 0;
  const f = fixture((_path, options) => { if (options.write) { attempts++; throw new ApiError(0, 'errors.timeout', {}, { outcome: 'unknown' }); } });
  await f.service.start(); await flush(); await obtainQuote(f.service);
  assert.equal((await f.service.mutate(command())).outcome, 'unknown'); await flush(); assert.equal(attempts, 1);
  await f.service.readView({ kind: 'payments.status', attemptKey }); assert.equal(attempts, 1);
  await obtainQuote(f.service); assert.equal((await f.service.mutate(command())).outcome, 'rejected'); assert.equal(attempts, 1);
  f.setQuote(quote({ quoteId: 'another_synthetic_quote_0123456789' })); await obtainQuote(f.service);
  assert.equal((await f.service.mutate({ kind: 'payments.start', input: input({ quoteId: 'another_synthetic_quote_0123456789' }) })).outcome, 'rejected'); assert.equal(attempts, 1);
});

test('caller edits cannot change cached quote, request fields or authorization while preflight is pending', async () => {
  let block = false; const pending = deferred();
  const f = fixture((path, options) => block && path === '/api/payments' && !options.write ? pending.promise : undefined);
  await f.service.start(); await flush(); const received = await obtainQuote(f.service);
  received.billIds.push('999'); received.revision = 'b'.repeat(64);
  const cmd = command(); block = true; const result = f.service.mutate(cmd); await flush();
  cmd.input.billIds.push('999'); cmd.input.paymentType = 'cash'; pending.resolve(catalog());
  assert.equal((await result).ok, true); assert.deepEqual(f.writes[0].fields['bills[]'], ['11', '12']); assert.equal(f.writes[0].fields.paymentType, 'platescro');
});

test('locale change clears quotes, late results do not leak into another session, and status 401 logs out', async () => {
  const f = fixture(); await f.service.start(); await flush(); await obtainQuote(f.service); f.service.setLanguage('en');
  assert.equal((await f.service.mutate(command())).outcome, 'rejected'); assert.equal(f.writes.length, 0);
  const denied = fixture(path => path.startsWith('/api/payment-status') ? Promise.reject(new ApiError(401, 'errors.sessionExpired')) : undefined);
  await denied.service.start(); await flush(); await assert.rejects(denied.service.readView({ kind: 'payments.status', paymentId: '81' })); assert.equal(denied.service.getSnapshot().authenticated, false);
});

test('already-cancelled mutation has no effects, while cancelling payment preflight aborts the read before POST', async () => {
  let block = false; const pending = deferred(); let upstreamSignal;
  const f = fixture((path, options) => {
    if (block && path === '/api/payments' && !options.write) { upstreamSignal = options.signal; return pending.promise; }
  });
  await f.service.start(); await flush(); await obtainQuote(f.service);
  const already = new AbortController(); already.abort(); const before = f.service.getSnapshot(); const calls = f.calls.length;
  assert.deepEqual(await f.service.mutate(command(), { signal: already.signal }), { ok: false, error: 'errors.cancelled', outcome: 'rejected' });
  assert.equal(f.calls.length, calls); assert.equal(f.service.getSnapshot(), before);
  block = true; const controller = new AbortController(); const result = f.service.mutate(command(), { signal: controller.signal }); await flush();
  controller.abort(); assert.equal(upstreamSignal.aborted, true); pending.resolve(catalog());
  assert.equal((await result).outcome, 'rejected'); assert.equal(f.writes.length, 0); assert.equal(f.service.getSnapshot().mutation.pending, false);
  block = false; assert.equal((await f.service.mutate(command())).ok, true); // No dispatched attempt was consumed by cancelling the read.
});

test('external cancellation after POST is unknown even when a late success arrives, and cannot replay', async () => {
  const pending = deferred(); let writes = 0; let upstreamSignal;
  const f = fixture((_path, options) => { if (options.write) { writes++; upstreamSignal = options.signal; return pending.promise; } });
  await f.service.start(); await flush(); await obtainQuote(f.service);
  const controller = new AbortController(); let added = 0; let removed = 0;
  const add = controller.signal.addEventListener.bind(controller.signal); const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => { added++; return add(...args); };
  controller.signal.removeEventListener = (...args) => { removed++; return remove(...args); };
  const result = f.service.mutate(command(), { signal: controller.signal }); await flush(); assert.equal(writes, 1);
  controller.abort(); assert.equal(upstreamSignal.aborted, true); pending.resolve(start());
  const settled = await result; assert.equal(settled.outcome, 'unknown'); assert.equal(settled.data, undefined); assert.equal(f.service.getSnapshot().mutation.pending, false);
  assert.equal(added, 1); assert.equal(removed, 1);
  assert.equal((await f.service.mutate(command())).outcome, 'rejected'); assert.equal(writes, 1);
});
