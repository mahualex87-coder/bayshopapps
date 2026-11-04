import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutItems, checkoutItemFingerprint, checkoutPaymentIssue, checkoutInsurance, checkoutPayments, checkoutLocal, checkoutLocalMethodKey, checkoutLocalSelection } from '../src/api/checkout-normalize.ts';
import { planMutation } from '../src/api/operations-contracts.ts';
import { ApiContractError } from '../src/api/normalize.ts';
const item = { id: '1', title: 'Requested product', quantity: 2, price: 5, shipping: 1, color: 'blue', size: 'M', comment: null, url: 'https://example.test/item', currency: 'EUR' };
test('checkout local delivery preserves server keys and never mistakes a numeric ID for a method key', () => {
  const base = { id: '31', title: 'Point', price: '0', currency: 'USD', options: [{ id: '41', address: 'Test point', price: '0', currency: 'USD' }] };
  const decode = extra => checkoutLocal({ items: [{ ...base, ...extra }] })[0];
  const storage = decode({ options_key: 'localStorage-pickup', key: 'pickup', type: 'storage' });
  assert.deepEqual(checkoutLocalSelection(storage, '41', null), { methodKey: 'pickup', optionKey: 'localStorage-pickup', optionId: '41' });
  assert.equal(checkoutLocalMethodKey(decode({ options_key: 'localStorage-storage' })), 'storage', 'legacy storage suffix is an exact key');
  assert.equal(checkoutLocalMethodKey(decode({ options_key: 'terminal' })), null, 'legacy terminal does not reveal a method key');
  assert.equal(checkoutLocalMethodKey(decode({ options_key: 'localAddressId', key: 'delivery', type: 'storage' })), null);
  assert.equal(checkoutLocalMethodKey(decode({ options_key: 'localStorage-pickup', key: 'another', type: 'storage' })), null);
  const terminal = decode({ options_key: 'terminal', key: 'novaTerminal', type: 'terminal' });
  assert.deepEqual(checkoutLocalSelection(terminal, '41', null), { methodKey: 'novaTerminal', optionKey: 'terminal', optionId: '41' });
  assert.equal(checkoutLocalSelection(terminal, '42', null), null);
  const courier = decode({ options_key: 'localAddressId', key: 'courier', type: 'courier' });
  assert.equal(checkoutLocalSelection(courier, '41', null), null);
  assert.equal(checkoutLocalSelection(courier, '', { id: '9', completed: false }), null);
  assert.deepEqual(checkoutLocalSelection(courier, '', { id: '9', completed: true }), { methodKey: 'courier', optionKey: 'localAddressId', optionId: '9' });
  const input = { carts: ['1'], addressId: '3', shipperId: '4', additionServices: [], waitAllItems: true, allowLowerQuantity: false, allowOverpricing: false, insurance: false, paymentType: 'balance' };
  const fields = planMutation({ kind: 'order.create', input: { ...input, localPickup: checkoutLocalSelection(terminal, '41', null) } }).fields;
  assert.equal(fields.local_delivery, 'novaTerminal'); assert.equal(fields.terminal, '41');
  for (const localPickup of [{ optionKey: 'terminal', optionId: '41' }, { methodKey: 'other', optionKey: 'localStorage-pickup', optionId: '41' }, { methodKey: 'courier', optionKey: 'carts', optionId: '41' }]) assert.throws(() => planMutation({ kind: 'order.create', input: { ...input, localPickup } }));
});
test('checkout item reads must contain exactly the selected cart IDs and preserve selection order', () => {
  const second = { ...item, id: '2', title: 'Second product' };
  assert.deepEqual(checkoutItems(['1', '2'], [second, item]), [item, second]);
  assert.throws(() => checkoutItems(['1', '2'], [item]), ApiContractError);
  assert.throws(() => checkoutItems(['1'], [second]), ApiContractError);
  assert.throws(() => checkoutItems(['1', '2'], [item, item]), ApiContractError);
  assert.throws(() => checkoutItems(['1'], [{ ...item, status: 'paid' }]), ApiContractError);
  assert.throws(() => checkoutItems(['1', '2'], [{ ...item, shopId: '3' }, { ...second, shopId: '4' }]), ApiContractError);
});
test('same-total product and variant changes invalidate checkout approval', () => {
  const original = checkoutItemFingerprint([item]);
  assert.notEqual(checkoutItemFingerprint([{ ...item, title: 'Different product' }]), original);
  assert.notEqual(checkoutItemFingerprint([{ ...item, quantity: 1, price: 10 }]), original);
  assert.notEqual(checkoutItemFingerprint([{ ...item, size: 'XL' }]), original);
  assert.notEqual(checkoutItemFingerprint([{ ...item, shopId: '2' }]), original);
  assert.equal(checkoutItemFingerprint([{ ...item, createdAt: 'unrelated display metadata' }]), original);
});
test('legacy checkout preserves the server-filtered payment method when its currency list is omitted', () => {
  const method = { name: 'Balance', description: 'From account', percent: '0', max_sum: '0', hide_billing: '1', amounts: { totalToPay: '15', comission: '0', fullOrderPrice: '15' } };
  const raw = { general: { itemsPrice: '10', localDelivery: '2', serviceComission: '3', currencyCode: 'EUR', countCommission: '0', fromBalance: '0' }, paymentData: { balance: method } };
  const quote = checkoutPayments(raw);
  assert.equal(quote.methods[0].availableCurrencies, null);
  assert.equal(checkoutPaymentIssue(quote.methods[0], quote.currency), null);
  assert.throws(() => checkoutPayments({ ...raw, paymentData: { balance: { ...method, availableCurrency: 'EUR' } } }), ApiContractError);
});
test('checkout enforces server payment currency, billing requirement and positive amount limit', () => {
  const payment = { availableCurrencies: ['eur'], hideBilling: true, maxAmount: 100, totalToPay: 100 };
  assert.equal(checkoutPaymentIssue(payment, 'EUR'), null);
  assert.equal(checkoutPaymentIssue({ ...payment, totalToPay: 100.01 }, 'eur'), 'commerce.paymentLimitExceeded');
  assert.equal(checkoutPaymentIssue({ ...payment, hideBilling: false }, 'eur'), 'commerce.billingUnsupported');
  assert.equal(checkoutPaymentIssue(payment, 'ron'), 'commerce.paymentCurrencyUnavailable');
  assert.equal(checkoutPaymentIssue({ ...payment, maxAmount: 0 }, 'eur'), null);
});
test('free insurance threshold remains separate from insurance percentage and monetary minimum', () => {
  const raw = { insurance_available: true, insurance_free: true, insurance_free_limit: '60', insurance_percent: '3', insurance_min: '3', insurance_max: '2500', currency: '$', currency_price: '50', services: [] };
  const quote = checkoutInsurance(raw);
  assert.equal(quote.freeLimit, 60); assert.equal(quote.percent, 3); assert.equal(quote.minimum, 3); assert.equal(quote.currency, '$');
  assert.equal(checkoutInsurance({ ...raw, insurance_free_limit: undefined }).freeLimit, null);
  assert.throws(() => checkoutInsurance({ ...raw, insurance_free_limit: true }), ApiContractError);
});
