import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePaymentCatalogData, paymentBillingFields } from '../src/api/payments-catalog.ts';

const full = () => ({
  unpaidInvoices: [{ currency_id: '5', currency: 'ron', currency_sign: 'RON', max_sum: '8.25', counter: '7', list: [
    { id: '101', trid: 'BILL-B', summ: '12.5000', comment: '<p>Transport&nbsp;&amp; servicii</p>', ceated: '2026-11-02 09:03:04' },
    { id: '102', trid: 'BILL-A', summ: '-4.25', comment: '', ceated: '2026-11-01 08:02:03' },
  ] }],
  billingData: { first_name: 'Test', last_name: 'Client', company_name: 'A & B', address1: 'Strada <Exactă> 1', city: 'Chișinău', state: '', email: 'synthetic@example.test', phone: '060000000', zip: '0010', country: '143' },
  isBillingSet: true,
  paymentTypes: { provider: { img: '/images/payments/provider.png', name: 'Card&nbsp;&amp; cont', description: '&lt;p&gt;Comision &amp; condiții&lt;/p&gt;', availableCurrency: ['gbp', 'ron', 'eur', 'usd', 'mdl', 'chf'], max_sum: '9999999.9900', hide_billing: '1', percent: '1.2500', additionalFixedCommission: '0.050', minimalCommission: '0.99', allowedPurposes: 'supply' } },
});
const contractError = error => error?.key === 'errors.contract';

test('complete payments catalog preserves exact invoice, billing and fee metadata', () => {
  const result = normalizePaymentCatalogData(full()); const group = result.invoiceGroups[0]; const method = result.methods[0];
  assert.equal(group.currencyId, '5'); assert.equal(group.currency, 'RON'); assert.equal(group.currencySign, 'RON');
  assert.equal(group.maxSum, '8.25'); assert.equal(group.counter, 7, 'Never replace server counter with list length');
  assert.deepEqual(group.invoices.map(item => item.id), ['101', '102'], 'Preserve invoice chronology');
  assert.equal(group.invoices[0].amount, '12.5000'); assert.equal(group.invoices[1].amount, '-4.25');
  assert.equal(group.invoices[0].description, 'Transport & servicii'); assert.equal(group.invoices[0].createdAt, '2026-11-02 09:03:04');
  assert.deepEqual(result.billing.fields, full().billingData, 'Billing identity/postal values remain exact'); assert.equal(result.billing.isSet, true);
  assert.equal(method.id, 'provider'); assert.equal(method.title, 'Card & cont'); assert.equal(method.description, 'Comision & condiții');
  assert.equal(method.logoUrl, 'https://bayshop.com/images/payments/provider.png');
  assert.deepEqual(method.currencies, ['USD', 'EUR', 'RON', 'GBP', 'CHF', 'MDL']);
  assert.equal(method.maxSum, '9999999.9900'); assert.equal(method.hideBilling, true);
  assert.equal(method.percent, '1.2500'); assert.equal(method.additionalFixedCommission, '0.050'); assert.equal(method.minimalCommission, '0.99'); assert.equal(method.allowedPurposes, 'supply');
  assert.equal('active' in method, false); assert.equal('canPay' in result, false);
});

test('legacy rows remain readable with unknown metadata null and no invented fees or methods', () => {
  const result = normalizePaymentCatalogData({ unpaidInvoices: [{ currency: 'usd', list: [{ id: 7, summ: '42.70', created: '2026-10-31' }] }], paymentTypes: { legacy: { name: 'Legacy', availableCurrency: ['usd'] } } });
  assert.equal(result.invoiceGroups[0].invoices[0].amount, '42.70');
  for (const key of ['currencyId', 'currencySign', 'maxSum', 'counter']) assert.equal(result.invoiceGroups[0][key], null);
  for (const key of ['logoUrl', 'maxSum', 'hideBilling', 'percent', 'additionalFixedCommission', 'minimalCommission', 'allowedPurposes']) assert.equal(result.methods[0][key], null);
  assert.deepEqual(result.billing, { fields: null, isSet: null });
  assert.deepEqual(result.methods.map(method => method.id), ['legacy']);
  assert.deepEqual(normalizePaymentCatalogData({}), { invoiceGroups: null, billing: { fields: null, isSet: null }, methods: null });
});

test('known empty collections and explicit zero stay distinct from missing information', () => {
  for (const paymentTypes of [{}, []]) {
    const empty = normalizePaymentCatalogData({ unpaidInvoices: [], paymentTypes, isBillingSet: false });
    assert.deepEqual(empty.invoiceGroups, []); assert.deepEqual(empty.methods, []); assert.equal(empty.billing.isSet, false);
  }
  const result = normalizePaymentCatalogData({ unpaidInvoices: [{ currency: 'eur', max_sum: '0.00', counter: 0, list: [] }], paymentTypes: { known: { availableCurrency: [], max_sum: 0, hide_billing: '0', percent: 0, additionalFixedCommission: '0.00', minimalCommission: 0 } } });
  assert.equal(result.invoiceGroups[0].maxSum, '0.00'); assert.equal(result.invoiceGroups[0].counter, 0);
  assert.deepEqual(result.methods[0].currencies, []); assert.equal(result.methods[0].percent, '0'); assert.equal(result.methods[0].maxSum, '0'); assert.equal(result.methods[0].additionalFixedCommission, '0.00'); assert.equal(result.methods[0].hideBilling, false);
  const missing = normalizePaymentCatalogData({ unpaidInvoices: [{ currency: 'usd' }], paymentTypes: { unknown: {} }, billingData: {} });
  assert.equal(missing.invoiceGroups[0].invoices, null); assert.equal(missing.methods[0].currencies, null);
  assert.deepEqual(Object.keys(missing.billing.fields), paymentBillingFields); assert.ok(Object.values(missing.billing.fields).every(value => value === null));
});

test('decimal strings retain large amounts, scale and tiny fractions without Number conversion', () => {
  for (const amount of ['9007199254740993123456789.12345678901234567890', '0.000000000000000000000123', '-0.0000010', '00012.5000']) {
    const input = full(); input.unpaidInvoices[0].list[0].summ = amount; input.paymentTypes.provider.percent = amount;
    const result = normalizePaymentCatalogData(input);
    assert.equal(result.invoiceGroups[0].invoices[0].amount, amount); assert.equal(result.methods[0].percent, amount);
  }
  const input = full(); input.unpaidInvoices[0].list[0].summ = 0.0000001; input.paymentTypes.provider.additionalFixedCommission = -0.00000012;
  const result = normalizePaymentCatalogData(input);
  assert.equal(result.invoiceGroups[0].invoices[0].amount, '0.0000001'); assert.equal(result.methods[0].additionalFixedCommission, '-0.00000012');
});

test('coercible invalid financial values and unsafe numeric JSON never become zero', () => {
  for (const value of [false, true, ' ', '\t', ' 0 ', [], {}, NaN, Infinity, 'NaN', '0x10', '1e2', '12,50', 9007199254740992]) {
    const invoice = full(); invoice.unpaidInvoices[0].list[0].summ = value;
    assert.throws(() => normalizePaymentCatalogData(invoice), contractError, `invoice ${String(value)}`);
    const method = full(); method.paymentTypes.provider.percent = value;
    assert.throws(() => normalizePaymentCatalogData(method), contractError, `fee ${String(value)}`);
  }
  for (const value of [null, undefined, '']) {
    const input = full(); input.unpaidInvoices[0].list[0].summ = value;
    assert.throws(() => normalizePaymentCatalogData(input), contractError);
  }
});

test('currency ordering uses presentation copies and never reorders invoice rows or method priorities', () => {
  const input = { unpaidInvoices: ['mdl', 'gbp', 'usd', 'ron', 'eur'].map((currency, index) => ({ currency, list: [{ id: String(index + 1), summ: '1.00' }] })), paymentTypes: { first: { availableCurrency: ['ron', 'usd', 'usd'] }, second: {} } };
  const before = structuredClone(input);
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }; freeze(input);
  const result = normalizePaymentCatalogData(input);
  assert.deepEqual(result.invoiceGroups.map(group => group.currency), ['USD', 'EUR', 'RON', 'GBP', 'MDL']);
  assert.deepEqual(result.methods.map(method => method.id), ['first', 'second']);
  assert.deepEqual(result.methods[0].currencies, ['USD', 'USD', 'RON']); assert.deepEqual(input, before);
});

test('unsafe optional logos do not hide otherwise usable payment methods', () => {
  for (const img of ['javascript:alert(1)', 'http://example.test/logo.png', 'https://user:password@example.test/logo.png', '//example.test/logo.png', 'data:image/png;base64,test', null]) {
    const result = normalizePaymentCatalogData({ paymentTypes: { existing: { name: '<b>Card</b><script>bad()</script>', img } } });
    assert.equal(result.methods[0].logoUrl, null); assert.equal(result.methods[0].title, 'Card'); assert.equal(result.methods[0].id, 'existing');
  }
});

test('malformed flags, counts, identities and collections fail explicitly instead of enabling a payment', () => {
  for (const patch of [{ isBillingSet: 'false' }, { paymentTypes: [{ name: 'No stable key' }] }, { unpaidInvoices: {} }, { billingData: [] }]) assert.throws(() => normalizePaymentCatalogData({ ...full(), ...patch }), contractError);
  for (const counter of [-1, false, '1.5', ' ', 9007199254740992]) { const input = full(); input.unpaidInvoices[0].counter = counter; assert.throws(() => normalizePaymentCatalogData(input), contractError); }
  for (const field of ['id', 'trid']) { const input = full(); input.unpaidInvoices[0].list[0][field] = 9007199254740992; assert.throws(() => normalizePaymentCatalogData(input), contractError); }
  const invalidCurrency = full(); invalidCurrency.unpaidInvoices[0].currency = 'not-a-code'; assert.throws(() => normalizePaymentCatalogData(invalidCurrency), contractError);
});
