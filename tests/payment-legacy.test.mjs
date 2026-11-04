import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLegacyPaymentsData, validateLegacyPaymentSelection, legacyPaymentSelectionRevision, normalizeLegacyPaymentStart, normalizeLegacyPaymentStatus, LegacyPaymentPreparationError, legacyPreparationDiagnostic, legacyCardPaymentId } from '../src/api/payment-legacy.ts';
import { planRead, planMutation } from '../src/api/operations-contracts.ts';
import { prepareWriteBody } from '../src/api/mutations.ts';
import { LiveAccountService } from '../src/api/service.ts';
import { API_ORIGIN, ApiError, createApiTransport } from '../src/api/client.ts';

const now = Date.parse('2026-11-02T10:00:00Z');
const selected = { paymentType: 'platescro', billIds: ['11', '12'] };
function catalog() {
  const method = { name: 'Synthetic card', availableCurrency: ['USD'], max_sum: '999.00', hide_billing: '0', percent: '2.5', additionalFixedCommission: '0.10', minimalCommission: '0.20', allowedPurposes: 'supply' };
  return { unpaidInvoices: [{ currency_id: '1', currency: 'usd', currency_sign: '$', max_sum: '10.10', counter: 2, list: [{ id: '11', trid: 'SYNTH11', summ: '20.1000', comment: 'Synthetic', ceated: '2026-11-01 10:00:00' }, { id: '12', summ: '2.000' }] }], billingData: { first_name: 'Synthetic', last_name: 'Only', address1: 'Synthetic road', city: 'Test city', state: 'Test region', email: 'synthetic@example.test', phone: '12345', zip: '12345', country: '1' }, isBillingSet: true, paymentTypes: { platescro: { ...method }, paypal: { ...method }, terminals: { ...method }, 'apple-pay': { ...method }, 'google-pay': { ...method } } };
}
function form(change = {}) { return { requestUrl: 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php', returnurl: `${API_ORIGIN}/member/payments/platescro/process`, fname: 'Synthetic', lname: 'Only', company: null, amount: '9.9000', curr: 'USD', invoice_id: '81', merch_id: 'synthetic-merchant', timestamp: '20261102100000', nonce: 'synthetic-nonce', fp_hash: 'synthetic-signature', ExtraData: null, ...change }; }
const paid = { paymentId: '81', sum: '10.1000', sign: '$', text: 'Paid', isOrder: false, orderUid: null, orderId: null };
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
function command(data = catalog(), selection = selected) { return { kind: 'payments.legacy.start', input: { ...selection, billIds: [...selection.billIds], selectionRevision: legacyPaymentSelectionRevision(selection, normalizeLegacyPaymentsData(data)) } }; }
function fixture(override = () => undefined) {
  let data = catalog(); const calls = []; const writes = [];
  const service = new LiveAccountService(async (path, options = {}) => {
    calls.push(path); if (options.write) writes.push(options.write);
    const custom = override(path, options); if (custom !== undefined) return custom;
    if (options.write) return form();
    if (path === '/api/payments') return structuredClone(data);
    if (path.startsWith('/api/payments/platescro/success/')) return null;
    if (path === '/api/auth') return { id: '7', name: 'Synthetic', surname: 'Only' };
    if (path === '/api/member/me') return { member: { id: '7', email: 'synthetic@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'Synthetic', surname: 'Only', phone: '12345', phoneCode: '+373' };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-legacy-session', expiresAt: now + 3600000 }), write: async () => {}, clear: async () => {} }, () => now);
  return { service, calls, writes, setCatalog: value => { data = value; } };
}

test('existing catalog needs no v1 metadata and retains exact amounts and unknown fee metadata', () => {
  const raw = catalog(); delete raw.paymentTypes.paypal.percent;
  const data = normalizeLegacyPaymentsData(raw);
  assert.equal(data.catalog.invoiceGroups[0].invoices[0].amount, '20.1000');
  assert.equal(data.catalog.methods.find(value => value.id === 'paypal').percent, null);
  assert.equal(validateLegacyPaymentSelection(selected, data).group.currency, 'USD');
  assert.equal(data.capabilities, undefined);
});

test('selection is unique, owned, single-currency, available and limited to the three proven handlers', () => {
  const data = normalizeLegacyPaymentsData(catalog());
  for (const input of [{ ...selected, billIds: [] }, { ...selected, billIds: ['11', '11'] }, { ...selected, billIds: ['11', '999'] }, { ...selected, billIds: ['0'] }, { ...selected, paymentType: 'apple-pay' }, { ...selected, paymentType: 'cash' }]) assert.throws(() => validateLegacyPaymentSelection(input, data));
  for (const mutate of [raw => raw.unpaidInvoices.push({ currency_id: '2', currency: 'EUR', list: [{ id: '12', summ: '5.00' }] }), raw => { raw.paymentTypes.platescro.availableCurrency = ['EUR']; }, raw => { raw.paymentTypes.platescro.allowedPurposes = 'orders'; }, raw => { raw.unpaidInvoices[0].list[0].summ = '-1'; }, raw => { raw.unpaidInvoices[0].list[0].summ = '0.000'; }]) { const raw = catalog(); mutate(raw); assert.throws(() => validateLegacyPaymentSelection(selected, normalizeLegacyPaymentsData(raw))); }
  const mixed = catalog(); mixed.unpaidInvoices[0].list.pop(); mixed.unpaidInvoices.push({ currency_id: '2', currency: 'EUR', list: [{ id: '12', summ: '2.00' }] });
  assert.throws(() => validateLegacyPaymentSelection(selected, normalizeLegacyPaymentsData(mixed)));
});

test('billing mirrors stored-row handler requirements; hidden editor never bypasses card billing', () => {
  for (const key of ['address1', 'city', 'state', 'email', 'phone', 'zip', 'country']) {
    const raw = catalog(); raw.billingData[key] = ' '; raw.paymentTypes.platescro.hide_billing = '1';
    assert.throws(() => validateLegacyPaymentSelection(selected, normalizeLegacyPaymentsData(raw)), error => error.key === 'payments.billingMissing');
  }
  const raw = catalog(); raw.isBillingSet = false; raw.billingData = null;
  assert.throws(() => validateLegacyPaymentSelection(selected, normalizeLegacyPaymentsData(raw)));
  for (const paymentType of ['paypal', 'terminals']) assert.doesNotThrow(() => validateLegacyPaymentSelection({ ...selected, paymentType }, normalizeLegacyPaymentsData(raw)));
});

test('snapshot ignores list order but detects exact money, debt cap, eligibility, fees and saved billing changes', () => {
  const original = legacyPaymentSelectionRevision(selected, normalizeLegacyPaymentsData(catalog()));
  const reordered = catalog(); reordered.unpaidInvoices[0].list.reverse();
  assert.equal(legacyPaymentSelectionRevision({ ...selected, billIds: ['12', '11'] }, normalizeLegacyPaymentsData(reordered)), original);
  for (const mutate of [raw => { raw.unpaidInvoices[0].max_sum = '9.00'; }, raw => { raw.unpaidInvoices[0].list[0].summ = '20.1001'; }, raw => { raw.paymentTypes.platescro.percent = '3'; }, raw => { raw.billingData.zip = '67890'; }, raw => { raw.paymentTypes.platescro.allowedPurposes = 'all'; }]) {
    const raw = catalog(); mutate(raw); assert.notEqual(legacyPaymentSelectionRevision(selected, normalizeLegacyPaymentsData(raw)), original);
  }
});

test('method amount limit uses exact selected base after positive net-debt cap, without fee guesses', () => {
  function data(amounts, netDebt, limit) {
    const raw = catalog(); raw.unpaidInvoices[0].list = amounts.map((summ, index) => ({ id: String(11 + index), summ }));
    raw.unpaidInvoices[0].max_sum = netDebt; raw.paymentTypes.platescro.max_sum = limit;
    // Deliberately large fee metadata must not change this pre-commission gate.
    raw.paymentTypes.platescro.percent = '99'; raw.paymentTypes.platescro.additionalFixedCommission = '500';
    return normalizeLegacyPaymentsData(raw);
  }
  const validate = value => validateLegacyPaymentSelection(selected, value);
  assert.doesNotThrow(() => validate(data(['0.1', '0.20'], '0', '0.300')));
  assert.throws(() => validate(data(['0.1', '0.200000000000000001'], '0', '0.3')), error => error.key === 'payments.methodUnavailable');
  assert.doesNotThrow(() => validate(data(['20.10', '2.00'], '10.1000', '10.10')));
  assert.throws(() => validate(data(['20.10', '2.00'], '10.1001', '10.10')));
  assert.doesNotThrow(() => validate(data(['0.10', '0.20'], '10.00', '0.3'))); // Cap never increases the selected base.
  assert.throws(() => validate(data(['20.10', '2.00'], '0.00', '10.10'))); // Zero net-debt value does not erase payment base.
  assert.doesNotThrow(() => validate(data(['999999999999999999.01', '0.02'], '0', '999999999999999999.030')));
  assert.throws(() => validate(data(['999999999999999999.01', '0.020000000000000001'], '0', '999999999999999999.03')));
  assert.doesNotThrow(() => validate(data(['999999999999999999.01', '0.02'], '0', '0.000'))); // Explicit zero method limit is unlimited.
  assert.doesNotThrow(() => validate(data(['0.1', '0.2'], null, '0.3')));
  assert.equal(data(['0.1', '0.2'], '0', null).catalog.methods.find(value => value.id === 'platescro').maxSum, null);
});

test('legacy plans serialize only existing fields and never add a quote, amount, billing write or token', async () => {
  const plan = planMutation(command()); const encoded = await prepareWriteBody(plan); const body = new URLSearchParams(encoded.body);
  assert.equal(plan.path, '/api/payments'); assert.equal(plan.method, 'POST'); assert.deepEqual(plan.invalidate, []);
  assert.deepEqual(Object.keys(plan.fields).sort(), ['bills[]', 'paymentType']); assert.deepEqual(body.getAll('bills[]'), ['11', '12']);
  for (const key of ['walletToken', 'gpay_token', 'quoteId', 'idempotencyKey', 'amount', 'currency', 'orders', 'first_name']) assert.throws(() => planMutation({ ...command(), input: { ...command().input, [key]: 'not-permitted' } }));
  assert.equal(planRead({ kind: 'payments.legacy.catalog' }).path, '/api/payments');
  assert.equal(planRead({ kind: 'payments.legacy.status', paymentId: '81' }).path, '/api/payments/platescro/success/81');
  assert.throws(() => planRead({ kind: 'payments.legacy.status', paymentId: '../81' }));
});

test('signed form fields retain server values and numeric fields; null and unrelated response metadata are not forwarded', () => {
  const result = normalizeLegacyPaymentStart(form({ invoice_id: 81, arbitrary: 'not-forwarded', fname: '<Synthetic & Only>' }), 'platescro');
  assert.equal(result.paymentId, '81'); assert.equal(result.action.fields.amount, '9.9000'); assert.equal(result.action.fields.fname, '<Synthetic & Only>');
  assert.equal(result.action.fields.company, undefined); assert.equal(result.action.fields.arbitrary, undefined); assert.equal(result.action.fields.requestUrl, undefined);
  assert.equal(result.action.fields.fp_hash, 'synthetic-signature'); assert.equal(result.state, undefined);
  for (const patch of [{ requestUrl: 'https://secure.euplatesc.ro.evil.test/' }, { requestUrl: 'http://secure.euplatesc.ro/' }, { requestUrl: 'https://user:pass@secure.euplatesc.ro/' }, { returnurl: 'https://evil.test/callback' }, { returnurl: `${API_ORIGIN}/member/payments/platescro/process?redirect=evil` }, { amount: false }, { amount: '1e3' }, { curr: 'US' }, { invoice_id: '0' }, { nonce: {} }, { fp_hash: '' }]) assert.throws(() => normalizeLegacyPaymentStart(form(patch), 'platescro'));
});

test('actual requestData shape preserves signed free text including CR, LF, tab and Unicode byte-for-byte', () => {
  // Mirrors Components/Payments/Platescro/Platescro.php::requestData().
  // All values below are synthetic; no merchant keys or customer data.
  const raw = form({
    fname: '  Synthetic\tFirst  ', lname: 'Only\r\nTest', company: 'QA & Co\nTest', country: 'RO',
    city: 'Synthetic\tCity', add: 'Synthetic road\r\nSecond floor, room\t2',
    email: 'synthetic@example.test', phone: '+40123456789', curr: 'ron', invoice_id: 81,
    order_desc: 'Pay for orders\nSYNTHETIC\r\nȘțăîâ <&>', lang: 'ro',
    ExtraData: 'SYNTHETIC-1\r\nSYNTHETIC-2\tOnly',
  });
  const snapshot = structuredClone(raw); Object.freeze(raw);
  const result = normalizeLegacyPaymentStart(raw, 'platescro');
  assert.equal(result.paymentId, '81'); assert.equal(result.action.kind, 'form');
  const encoded = new URLSearchParams(result.action.fields).toString();
  const decoded = new URLSearchParams(encoded);
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === 'requestUrl') continue;
    assert.equal(result.action.fields[key], String(value), key);
    assert.equal(decoded.get(key), String(value), key);
  }
  assert.deepEqual(raw, snapshot);
});

test('only approved free-text fields allow CR/LF/tab, while every other control stays rejected', () => {
  for (const key of ['fname', 'lname', 'company', 'city', 'add', 'order_desc', 'ExtraData']) {
    for (const control of ['\r', '\n', '\t']) {
      const value = `Synthetic${control}only`;
      assert.equal(normalizeLegacyPaymentStart(form({ [key]: value }), 'platescro').action.fields[key], value);
    }
    for (const control of ['\0', '\u0001', '\u000b', '\u000c', '\u001f', '\u007f']) {
      assert.throws(() => normalizeLegacyPaymentStart(form({ [key]: `Synthetic${control}only` }), 'platescro'), error => {
        assert.ok(error instanceof LegacyPaymentPreparationError); assert.equal(error.paymentId, '81'); assert.equal(error.reason, key); return true;
      });
    }
  }
  for (const key of ['requestUrl', 'returnurl', 'country', 'email', 'phone', 'amount', 'curr', 'invoice_id', 'merch_id', 'timestamp', 'lang', 'nonce', 'fp_hash']) {
    for (const control of ['\r', '\n', '\t']) {
      const raw = form({ country: 'RO', email: 'synthetic@example.test', phone: '+40123456789', lang: 'ro' });
      raw[key] = `${raw[key]}${control}`;
      assert.throws(() => normalizeLegacyPaymentStart(raw, 'platescro'), error => {
        assert.ok(error instanceof LegacyPaymentPreparationError); assert.equal(error.reason, key);
        assert.equal(error.paymentId, key === 'invoice_id' ? null : '81'); return true;
      });
    }
  }
});

test('preparation failure keeps only a bounded validated numeric reference and a constant reason', () => {
  for (const [value, expected] of [[81, '81'], ['81', '81'], ['9'.repeat(31), '9'.repeat(31)],
    [0, null], [-1, null], [1.5, null], [NaN, null], [Infinity, null], [Number.MAX_SAFE_INTEGER + 1, null],
    ['', null], ['0', null], ['01', null], [' 81', null], ['81\n', null], ['+81', null], ['1e3', null], ['9'.repeat(32), null], [true, null], [{ id: 81 }, null]]) {
    assert.equal(legacyCardPaymentId({ invoice_id: value }), expected);
  }
  for (const raw of [null, undefined, [], '81', 81, {}, { paymentCode: '81' }]) assert.equal(legacyCardPaymentId(raw), null);
  const untrustedError = new LegacyPaymentPreparationError('81-secret', 'https://private.invalid/secret');
  assert.equal(untrustedError.paymentId, null); assert.equal(untrustedError.reason, 'payload');
  assert.equal(JSON.stringify(untrustedError).includes('secret'), false);
  for (const [key, value] of [['requestUrl', 'https://evil.test/private-url'], ['fp_hash', { secret: 'do-not-retain' }], ['amount', 'invalid-amount'], ['fname', '\0private-name']]) {
    assert.throws(() => normalizeLegacyPaymentStart(form({ [key]: value, nonce: 'private-nonce', ExtraData: 'private-extra' }), 'platescro'), error => {
      assert.ok(error instanceof LegacyPaymentPreparationError); assert.equal(error.paymentId, '81'); assert.equal(error.reason, key);
      assert.match(error.reason, /^[A-Za-z0-9_]{1,64}$/);
      const printable = `${error.message}\n${error.stack}\n${JSON.stringify(error)}`;
      for (const sensitive of ['evil.test', 'private-url', 'do-not-retain', 'invalid-amount', 'private-name', 'private-nonce', 'private-extra']) assert.equal(printable.includes(sensitive), false);
      assert.equal(error.cause, undefined); assert.equal(error.fields, undefined); return true;
    });
  }
  assert.throws(() => normalizeLegacyPaymentStart(form({ invoice_id: 'invalid-id', requestUrl: 'invalid-url' }), 'platescro'), error => {
    assert.equal(error.reason, 'invoice_id'); assert.equal(error.paymentId, null); return true;
  });
  for (const raw of [null, [], 'not-a-response']) assert.throws(() => normalizeLegacyPaymentStart(raw, 'platescro'), error => {
    assert.ok(error instanceof LegacyPaymentPreparationError); assert.equal(error.reason, 'payload'); assert.equal(error.paymentId, null); return true;
  });
});

test('callbacks stay on the exact source-backed API route and malicious provider URLs cannot discard the invoice reference', () => {
  const path = '/member/payments/platescro/process';
  for (const returnurl of [
    `http://bayshop.com${path}`, `https://bayshop.com.evil.test${path}`, `https://user:pass@bayshop.com${path}`,
    `${API_ORIGIN}${path}/`, `${API_ORIGIN}${path}?redirect=https://evil.test`, `${API_ORIGIN}${path}#fragment`,
    `${API_ORIGIN}${path}?`, `${API_ORIGIN}${path}#`, `${API_ORIGIN}/member/payments/other/../platescro/process`,
    `${API_ORIGIN}/member/payments/%2e%2e/payments/platescro/process`, `${API_ORIGIN}:444${path}`,
    `//bayshop.com${path}`, `javascript:alert(1)`, `${API_ORIGIN}${path}\\suffix`,
  ]) assert.throws(() => normalizeLegacyPaymentStart(form({ returnurl }), 'platescro'), error => {
    assert.ok(error instanceof LegacyPaymentPreparationError); assert.equal(error.reason, 'returnurl'); assert.equal(error.paymentId, '81'); return true;
  });
  for (const requestUrl of ['https://secure.euplatesc.ro.evil.test/', 'http://secure.euplatesc.ro/', 'https://user:pass@secure.euplatesc.ro/', 'https://secure.euplatesc.ro:444/', 'https://secure.euplatesc.ro/#secret', 'https://secure.euplatesc.ro/\n']) {
    assert.throws(() => normalizeLegacyPaymentStart(form({ requestUrl }), 'platescro'), error => {
      assert.ok(error instanceof LegacyPaymentPreparationError); assert.equal(error.reason, 'requestUrl'); assert.equal(error.paymentId, '81'); return true;
    });
  }
});

test('field/body bounds still fail closed without losing the already-created payment ID', () => {
  assert.throws(() => normalizeLegacyPaymentStart(form({ add: 'x'.repeat(16385) }), 'platescro'), error => {
    assert.equal(error.reason, 'add'); assert.equal(error.paymentId, '81'); return true;
  });
  assert.throws(() => normalizeLegacyPaymentStart(form({ fname: 'x'.repeat(16384), lname: 'x'.repeat(16384), company: 'x'.repeat(16384), add: 'x'.repeat(16384) }), 'platescro'), error => {
    assert.equal(error.reason, 'form_size'); assert.equal(error.paymentId, '81'); return true;
  });
  assert.throws(() => normalizeLegacyPaymentStart({ paymentCode: '81', convertedAmount: false }, 'terminals'), error => {
    assert.equal(error.reason, 'convertedAmount'); assert.equal(error.paymentId, '81'); return true;
  });
  assert.throws(() => normalizeLegacyPaymentStart({ redirect: 'https://evil.test/', invoice_id: '81' }, 'paypal'), error => {
    assert.equal(error.reason, 'redirect'); assert.equal(error.paymentId, null); return true;
  });
});

test('PayPal redirect and bPay code are preparation only; no invented terminal ISO/expiry or PayPal internal ID', () => {
  const paypal = normalizeLegacyPaymentStart({ redirect: 'https://www.paypal.com/checkoutnow?token=SYNTHETIC' }, 'paypal');
  assert.equal(paypal.paymentId, null); assert.equal(paypal.action.kind, 'redirect');
  assert.throws(() => normalizeLegacyPaymentStart({ redirect: 'https://www.paypal.com.evil.test/' }, 'paypal'));
  const terminal = normalizeLegacyPaymentStart({ paymentCode: 81, convertedAmount: '200.001000000000000001', currency_sign: 'lei' }, 'terminals');
  assert.equal(terminal.paymentId, '81'); assert.equal(terminal.action.amount, '200.001000000000000001'); assert.equal(terminal.action.currency, null); assert.equal(terminal.action.expiresAt, null);
});

test('only matching owned success payload is paid; null remains unconfirmed through real transport decoding', async () => {
  assert.deepEqual(normalizeLegacyPaymentStatus(null, '81'), { paymentId: '81', state: 'unconfirmed', amount: null, currencySign: null });
  assert.equal(normalizeLegacyPaymentStatus(paid, '81').state, 'paid'); assert.equal(normalizeLegacyPaymentStatus(paid, '81').amount, '10.1000');
  for (const raw of [undefined, {}, [], { ...paid, paymentId: '82' }, { ...paid, sum: false }, { ...paid, sum: ' ' }]) assert.throws(() => normalizeLegacyPaymentStatus(raw, '81'));
  const transport = createApiTransport(async () => new Response(JSON.stringify({ error: false, data: null }), { headers: { 'content-type': 'application/json' } }));
  const plan = planRead({ kind: 'payments.legacy.status', paymentId: '81' });
  assert.equal(plan.normalize(await transport(plan.path, { token: 'synthetic' })).state, 'unconfirmed');
});

test('service fresh preflight sends a single legacy POST and keeps signed data out of snapshots', async () => {
  const f = fixture(); await f.service.start(); await flush();
  const data = await f.service.readView({ kind: 'payments.legacy.catalog' });
  const result = await f.service.mutate({ kind: 'payments.legacy.start', input: { ...selected, selectionRevision: legacyPaymentSelectionRevision(selected, data) } });
  assert.equal(result.ok, true); assert.equal(result.data.paymentId, '81'); assert.equal(f.writes.length, 1);
  assert.equal(f.calls.filter(path => path === '/api/payments').length, 3);
  assert.equal(JSON.stringify(f.service.getSnapshot()).includes('synthetic-signature'), false);
  assert.equal((await f.service.readView({ kind: 'payments.legacy.status', paymentId: '81' })).state, 'unconfirmed');
  assert.equal(f.calls.some(path => /payment-(?:quote|status)/.test(path)), false);
});

test('changed ownership, money, billing or eligible method prevents dispatch', async () => {
  for (const modify of [raw => raw.unpaidInvoices[0].list.pop(), raw => { raw.unpaidInvoices[0].list[0].summ = '50.00'; }, raw => { raw.billingData.city = 'Changed'; }, raw => { raw.paymentTypes.platescro.availableCurrency = ['EUR']; }, raw => { raw.paymentTypes.platescro.allowedPurposes = 'order'; }]) {
    const f = fixture(); await f.service.start(); await flush(); const cmd = command(); const changed = catalog(); modify(changed); f.setCatalog(changed);
    const result = await f.service.mutate(cmd); assert.equal(result.outcome, 'rejected'); assert.equal(f.writes.length, 0);
  }
});

test('fresh method-limit failure never POSTs even when the caller supplies the current matching snapshot', async () => {
  const f = fixture(); await f.service.start(); await flush(); const cmd = command();
  const changed = catalog(); changed.unpaidInvoices[0].max_sum = '0'; changed.paymentTypes.platescro.max_sum = '10.10'; f.setCatalog(changed);
  // A forged local comparison marker cannot bypass eligibility checks.
  const parsed = JSON.parse(cmd.input.selectionRevision); parsed.maxSum = '0'; parsed.method.maxSum = '10.10'; cmd.input.selectionRevision = JSON.stringify(parsed);
  const result = await f.service.mutate(cmd);
  assert.equal(result.outcome, 'rejected'); assert.equal(result.error, 'payments.methodUnavailable'); assert.equal(f.writes.length, 0);
});

test('preflight abort/logout and duplicate tap cannot dispatch; caller mutation cannot change planned invoice IDs', async () => {
  for (const mode of ['abort', 'logout']) {
    const deferredRead = deferred(); let block = false;
    const f = fixture((path, options) => block && path === '/api/payments' && !options.write ? deferredRead.promise : undefined);
    await f.service.start(); await flush(); block = true; const controller = new AbortController(); const cmd = command();
    const pending = f.service.mutate(cmd, { signal: controller.signal }); await flush();
    assert.equal((await f.service.mutate(command())).error, 'errors.mutationInProgress');
    if (mode === 'abort') controller.abort(); else await f.service.logout();
    deferredRead.resolve(catalog()); assert.equal((await pending).outcome, 'rejected'); assert.equal(f.writes.length, 0);
  }
  const deferredRead = deferred(); let block = false; const f = fixture((path, options) => block && path === '/api/payments' && !options.write ? deferredRead.promise : undefined);
  await f.service.start(); await flush(); block = true; const cmd = command(); const result = f.service.mutate(cmd); await flush();
  cmd.input.billIds.push('999'); cmd.input.paymentType = 'paypal'; cmd.input.selectionRevision = 'edited'; deferredRead.resolve(catalog());
  assert.equal((await result).ok, true); assert.deepEqual(f.writes[0].fields['bills[]'], ['11', '12']); assert.equal(f.writes[0].fields.paymentType, 'platescro');
});

test('failed card preparation never retries automatically, but a later explicit action performs a fresh preflight', async () => {
  for (const error of [new ApiError(0, 'errors.timeout', {}, { outcome: 'unknown' }), new ApiError(422, 'errors.validation', {}, { outcome: 'rejected' }), new Error('network')]) {
    const f = fixture((_path, options) => { if (options.write) throw error; }); await f.service.start(); await flush();
    const first = await f.service.mutate(command());
    assert.equal(first.outcome, 'unknown'); assert.equal(first.error, 'payments.checkoutFailed'); assert.equal(first.paymentPreparation.paymentId, null);
    assert.match(first.paymentPreparation.reason, /^[A-Za-z0-9_]{1,64}$/);
    await flush(); await flush();
    assert.equal(f.writes.length, 1);
    assert.equal(f.calls.filter(path => path === '/api/payments').length, 2); // One GET + one POST only.
    assert.equal((await f.service.mutate(command())).outcome, 'unknown'); // A new explicit action, never an automatic retry.
    assert.equal(f.writes.length, 2);
    assert.equal(f.calls.filter(path => path === '/api/payments').length, 4); // Another fresh GET must precede it.
  }
});

test('malformed prepared card form retains safe invoice diagnostics and the next explicit start rechecks current invoices', async () => {
  let malformed = true;
  const f = fixture((_path, options) => options.write ? form(malformed ? { fname: '\0private-name', fp_hash: 'private-signature' } : {}) : undefined);
  await f.service.start(); await flush();
  const first = await f.service.mutate(command());
  assert.equal(first.outcome, 'unknown'); assert.equal(first.data, undefined);
  assert.deepEqual(first.paymentPreparation, { paymentId: '81', reason: 'fname' });
  assert.equal(JSON.stringify(first).includes('private-'), false);
  await flush(); assert.equal(f.writes.length, 1);

  const changed = catalog(); changed.unpaidInvoices[0].list[0].summ = '50.00'; f.setCatalog(changed); malformed = false;
  const stale = await f.service.mutate(command());
  assert.equal(stale.outcome, 'rejected'); assert.equal(stale.error, 'payments.quoteChanged'); assert.equal(f.writes.length, 1);
  const next = await f.service.mutate(command(changed));
  assert.equal(next.ok, true); assert.equal(next.data.paymentId, '81'); assert.equal(next.data.action.kind, 'form'); assert.equal(f.writes.length, 2);
  assert.equal(f.calls.filter(path => path === '/api/payments').length, 5); // Failed start GET/POST + stale GET + current GET/POST.
});

test('every later manual method initiation rechecks the catalog after an ambiguous response', async () => {
  const successful = fixture(); await successful.service.start(); await flush();
  assert.equal((await successful.service.mutate(command())).ok, true);
  await flush(); assert.equal(successful.writes.length, 1); // No automatic replay.
  // No automatic retry. Each explicit service call rechecks current invoices.
  assert.equal((await successful.service.mutate(command())).ok, true);
  assert.equal(successful.writes.length, 2);
  assert.equal(successful.calls.filter(path => path === '/api/payments').length, 4);

  for (const paymentType of ['paypal', 'terminals']) {
    const f = fixture((_path, options) => { if (options.write) throw new ApiError(0, 'errors.timeout', {}, { outcome: 'unknown' }); });
    await f.service.start(); await flush();
    const cmd = command(catalog(), { paymentType, billIds: ['11', '12'] });
    const first = await f.service.mutate(cmd);
    assert.equal(first.outcome, 'unknown'); assert.equal(first.paymentPreparation, undefined);
    await flush(); assert.equal(f.writes.length, 1);
    assert.equal((await f.service.mutate(cmd)).outcome, 'unknown');
    const otherNonCardMethod = paymentType === 'paypal' ? 'terminals' : 'paypal';
    // User-requested later manual actions are allowed for the same or another
    // method, each with a new catalog preflight. This fixture fails after POST.
    assert.equal((await f.service.mutate(command(catalog(), { paymentType: otherNonCardMethod, billIds: ['12'] }))).outcome, 'unknown');
    assert.equal(f.writes.length, 3);
  }
});

test('abort after dispatch, stale account and wrong returned currency cannot expose a usable action', async () => {
  for (const mode of ['abort', 'logout', 'currency']) {
    const deferredWrite = deferred(); const f = fixture((_path, options) => options.write ? deferredWrite.promise : undefined);
    await f.service.start(); await flush(); const controller = new AbortController(); const pending = f.service.mutate(command(), { signal: controller.signal }); await flush();
    if (mode === 'abort') controller.abort(); if (mode === 'logout') await f.service.logout();
    deferredWrite.resolve(form(mode === 'currency' ? { curr: 'EUR' } : {}));
    const result = await pending; assert.equal(result.outcome, 'unknown'); assert.equal(result.data, undefined); assert.equal(f.writes.length, 1);
  }
});

test('401 after dispatch logs out but does not label the financial result rejected', async () => {
  const f = fixture((_path, options) => { if (options.write) throw new ApiError(401, 'errors.sessionExpired', {}, { outcome: 'rejected' }); });
  await f.service.start(); await flush(); assert.equal((await f.service.mutate(command())).outcome, 'unknown'); assert.equal(f.service.getSnapshot().authenticated, false);
});

test('hosted wallets require both card and wallet catalog eligibility without changing the settlement method', () => {
  for (const [hostedChannel, walletId] of [['APAY', 'apple-pay'], ['GPAY', 'google-pay']]) {
    const choice = { ...selected, hostedChannel };
    const valid = validateLegacyPaymentSelection(choice, normalizeLegacyPaymentsData(catalog()));
    assert.equal(valid.method.id, 'platescro'); assert.equal(valid.hostedMethod.id, walletId);
    for (const modify of [
      raw => { delete raw.paymentTypes[walletId]; },
      raw => { delete raw.paymentTypes.platescro; },
      raw => { raw.paymentTypes[walletId].availableCurrency = ['EUR']; },
      raw => { raw.paymentTypes[walletId].availableCurrency = []; },
      raw => { raw.paymentTypes[walletId].allowedPurposes = 'orders'; },
      raw => { raw.paymentTypes[walletId].max_sum = '10.09'; },
      raw => { raw.paymentTypes.platescro.max_sum = '10.09'; },
    ]) {
      const raw = catalog(); modify(raw);
      assert.throws(() => validateLegacyPaymentSelection(choice, normalizeLegacyPaymentsData(raw)), error => error.key === 'payments.methodUnavailable');
    }
    const duplicate = normalizeLegacyPaymentsData(catalog()); duplicate.catalog.methods.push(duplicate.catalog.methods.find(item => item.id === walletId));
    assert.throws(() => validateLegacyPaymentSelection(choice, duplicate));
  }
  const noWallets = catalog(); delete noWallets.paymentTypes['apple-pay']; delete noWallets.paymentTypes['google-pay'];
  assert.equal(validateLegacyPaymentSelection({ ...selected, hostedChannel: 'CC' }, normalizeLegacyPaymentsData(noWallets)).hostedMethod, null);
  for (const hostedChannel of [null, '', 'apay', 'APAY,GPAY', 'CC&amount=1', {}, true]) {
    assert.throws(() => validateLegacyPaymentSelection({ ...selected, hostedChannel }, normalizeLegacyPaymentsData(catalog())));
  }
  for (const paymentType of ['paypal', 'terminals']) assert.throws(() => validateLegacyPaymentSelection({ ...selected, paymentType, hostedChannel: 'CC' }, normalizeLegacyPaymentsData(catalog())));
});

test('hosted channel snapshots bind the channel and both methods while never calculating a wallet amount', () => {
  const raw = catalog(); raw.paymentTypes['apple-pay'].percent = '99'; raw.paymentTypes['apple-pay'].additionalFixedCommission = '50';
  const choice = { ...selected, hostedChannel: 'APAY' };
  const original = legacyPaymentSelectionRevision(choice, normalizeLegacyPaymentsData(raw));
  const snapshot = JSON.parse(original);
  assert.equal(snapshot.hostedChannel, 'APAY'); assert.equal(snapshot.method.id, 'platescro'); assert.equal(snapshot.method.percent, '2.5');
  assert.equal(snapshot.hostedMethod.id, 'apple-pay'); assert.equal(snapshot.hostedMethod.percent, '99'); assert.equal(snapshot.authorizationTotal, undefined);
  for (const hostedChannel of [undefined, 'CC', 'GPAY']) assert.notEqual(legacyPaymentSelectionRevision({ ...selected, hostedChannel }, normalizeLegacyPaymentsData(raw)), original);
  for (const mutate of [data => { data.paymentTypes['apple-pay'].percent = '98'; }, data => { data.paymentTypes['apple-pay'].max_sum = '998'; }, data => { data.paymentTypes['apple-pay'].availableCurrency.push('RON'); }, data => { data.paymentTypes.platescro.percent = '3'; }]) {
    const changed = structuredClone(raw); mutate(changed);
    assert.notEqual(legacyPaymentSelectionRevision(choice, normalizeLegacyPaymentsData(changed)), original);
  }
});

test('hosted channel is local only: BayShop receives its original fields and the provider receives the explicit filter', async () => {
  for (const hostedChannel of ['CC', 'APAY', 'GPAY']) {
    const cmd = command(catalog(), { ...selected, hostedChannel });
    const plan = planMutation(cmd); const encoded = await prepareWriteBody(plan); const body = new URLSearchParams(encoded.body);
    assert.deepEqual([...body.keys()].sort(), ['bills[]', 'bills[]', 'paymentType']);
    assert.equal(body.get('paymentType'), 'platescro'); assert.equal(body.has('hostedChannel'), false);
    const raw = form({ ExtraData: 'SYNTH-11\r\nSYNTH-12\tȘ' }); Object.freeze(raw);
    const result = plan.normalize(raw);
    assert.equal(result.paymentId, '81'); assert.equal(result.paymentType, 'platescro');
    assert.equal(result.action.fields['ExtraData[ep_channel]'], hostedChannel);
    assert.equal(result.action.fields.ExtraData, undefined);
    assert.equal(result.action.fields['ExtraData[bayshop_invoice_codes]'], raw.ExtraData);
    for (const key of ['amount', 'curr', 'invoice_id', 'order_desc', 'merch_id', 'timestamp', 'nonce', 'fp_hash', 'returnurl']) assert.equal(result.action.fields[key], raw[key]);
    assert.equal(raw.ExtraData, 'SYNTH-11\r\nSYNTH-12\tȘ');
    assert.equal(JSON.stringify(result).includes('gpay_token'), false); assert.equal(JSON.stringify(result).includes('apay_token'), false);
  }
});

test('hosted form conflicts fail closed and retain the already-created reference without leaking provider metadata', () => {
  for (const key of ['ExtraData[ep_channel]', 'ExtraData[bayshop_invoice_codes]', 'ExtraData[successurl]', 'ExtraData[']) {
    assert.throws(() => normalizeLegacyPaymentStart(form({ [key]: 'private-provider-value' }), 'platescro', 'APAY'), error => {
      assert.ok(error instanceof LegacyPaymentPreparationError); assert.equal(error.paymentId, '81'); assert.equal(error.reason, 'ExtraData');
      assert.equal(JSON.stringify(error).includes('private-provider-value'), false); return true;
    });
  }
  assert.throws(() => normalizeLegacyPaymentStart(form({ ExtraData: { ep_channel: 'GPAY' } }), 'platescro', 'APAY'));
  assert.throws(() => normalizeLegacyPaymentStart(form(), 'platescro', 'APAY,GPAY'));
  assert.throws(() => normalizeLegacyPaymentStart({ redirect: 'https://www.paypal.com/checkoutnow?token=SYNTHETIC' }, 'paypal', 'GPAY'));
});

test('service preserves the selected hosted channel through fresh preflight and one card preparation', async () => {
  const f = fixture(); await f.service.start(); await flush();
  const choice = { ...selected, hostedChannel: 'APAY' };
  const result = await f.service.mutate(command(catalog(), choice));
  assert.equal(result.ok, true); assert.equal(result.data.action.fields['ExtraData[ep_channel]'], 'APAY'); assert.equal(f.writes.length, 1);
  assert.deepEqual(f.writes[0].fields, { paymentType: 'platescro', 'bills[]': ['11', '12'] });
  assert.equal(JSON.stringify(f.service.getSnapshot()).includes('synthetic-signature'), false);
});

test('changed hosted channel or wallet eligibility cannot dispatch after review', async () => {
  for (const change of ['channel', 'walletCurrency', 'walletFee', 'walletMissing']) {
    const f = fixture(); await f.service.start(); await flush();
    const cmd = command(catalog(), { ...selected, hostedChannel: 'APAY' });
    const changed = catalog();
    if (change === 'channel') cmd.input.hostedChannel = 'GPAY';
    if (change === 'walletCurrency') changed.paymentTypes['apple-pay'].availableCurrency = ['EUR'];
    if (change === 'walletFee') changed.paymentTypes['apple-pay'].percent = '8';
    if (change === 'walletMissing') delete changed.paymentTypes['apple-pay'];
    f.setCatalog(changed);
    const result = await f.service.mutate(cmd);
    assert.equal(result.outcome, 'rejected'); assert.equal(f.writes.length, 0);
  }
});

test('caller changes during hosted preflight do not alter the captured channel', async () => {
  const pendingRead = deferred(); let block = false;
  const f = fixture((path, options) => block && path === '/api/payments' && !options.write ? pendingRead.promise : undefined);
  await f.service.start(); await flush(); block = true;
  const cmd = command(catalog(), { ...selected, hostedChannel: 'APAY' }); const pending = f.service.mutate(cmd); await flush();
  cmd.input.hostedChannel = 'GPAY'; pendingRead.resolve(catalog());
  const result = await pending;
  assert.equal(result.ok, true); assert.equal(result.data.action.fields['ExtraData[ep_channel]'], 'APAY'); assert.equal(f.writes.length, 1);
});


test('preparation diagnostics accept only known fields and transport codes, never raw messages', () => {
  assert.equal(legacyPreparationDiagnostic('requestUrl'),'PREPARATION_REQUESTURL');
  assert.equal(legacyPreparationDiagnostic('errors_network'),'PREPARATION_NETWORK');
  assert.equal(legacyPreparationDiagnostic('http_502'),'PREPARATION_HTTP_502');
  for (const unknown of [undefined,null,{},'response with private token','https://example.test/?token=secret','http_502_private','errors_private_secret','http_999']) {
    assert.equal(legacyPreparationDiagnostic(unknown),'PREPARATION_RESPONSE');
  }
});
