import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyPaymentDisplayBase } from '../src/api/payment-legacy.ts';
import { paymentFeeConditions } from '../src/features/payments/payment-display.ts';
import { eligibleInvoiceIds, invoiceSelectionKey, selectedInvoiceIds, toggleInvoice } from '../src/features/payments/invoice-selection.ts';

test('informational payment base keeps every decimal digit and only applies a positive server debt cap', () => {
  assert.equal(legacyPaymentDisplayBase(['0.10', '0.20'], '0'), '0.30');
  assert.equal(legacyPaymentDisplayBase(['200.123400', '2'], '12.3400'), '12.3400');
  assert.equal(legacyPaymentDisplayBase(['0.10', '0.20'], '0.00'), '0.30');
  assert.equal(legacyPaymentDisplayBase(['0.10', '0.20'], '50'), '0.30');
  assert.equal(legacyPaymentDisplayBase(['999999999999999999999.000000000001', '0.000000000002'], '0'), '999999999999999999999.000000000003');
  assert.equal(legacyPaymentDisplayBase([], '10'), null);
  assert.equal(legacyPaymentDisplayBase(['1.00'], null), null);
  for (const bad of ['-1', 'NaN', '0.000', '1e2', '0,01']) assert.equal(legacyPaymentDisplayBase([bad], '0'), null);
  assert.equal(legacyPaymentDisplayBase(['1'], '-2'), null);
});

test('zero or unknown customer fees are not replaced by a minimum left over in merchant-paid metadata', () => {
  assert.equal(paymentFeeConditions(undefined), null);
  assert.equal(paymentFeeConditions({ percent: '0.00', additionalFixedCommission: '0', minimalCommission: '2.00' }), null);
  assert.equal(paymentFeeConditions({ percent: null, additionalFixedCommission: null, minimalCommission: '2.00' }), null);
  assert.deepEqual(paymentFeeConditions({ percent: '2.500', additionalFixedCommission: '0.250', minimalCommission: '0.10' }), { percent: '2.5', fixed: '0.25', minimum: '0.1' });
  assert.deepEqual(paymentFeeConditions({ percent: '0', additionalFixedCommission: '0.3500', minimalCommission: '0' }), { percent: null, fixed: '0.35', minimum: null });
  assert.deepEqual(paymentFeeConditions({ percent: '0.0000000000001', additionalFixedCommission: null, minimalCommission: null }), { percent: '0.0000000000001', fixed: null, minimum: null });
});

test('eligibility is based on current owned invoice rows, unique IDs and an identified currency group', () => {
  const usd = { currencyId: '1', currency: 'USD', invoices: [{ id: '1', amount: '0.0000000000001' }, { id: '2', amount: '1.00' }] };
  const eur = { currencyId: '2', currency: 'EUR', invoices: [{ id: '2', amount: '9' }, { id: '3', amount: '2' }] };
  const groups = [usd, eur];
  assert.deepEqual(eligibleInvoiceIds(groups, usd), ['1']);
  const intent = toggleInvoice({}, invoiceSelectionKey(usd), ['1'], '1');
  assert.deepEqual(selectedInvoiceIds(eligibleInvoiceIds(groups, usd), intent, invoiceSelectionKey(usd)), []);
  assert.deepEqual(selectedInvoiceIds(eligibleInvoiceIds(groups, eur), intent, invoiceSelectionKey(eur)), ['3']);
  assert.deepEqual(eligibleInvoiceIds(groups, { ...usd }), []);
  usd.currencyId = null;
  assert.deepEqual(eligibleInvoiceIds(groups, usd), []);
});
