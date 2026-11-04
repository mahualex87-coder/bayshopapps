import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCarrierLogo } from '../src/api/carrier-assets.ts';
import { packingCarriers } from '../src/api/packing-normalize.ts';
import { checkoutCarriers } from '../src/api/checkout-normalize.ts';
import { calculatorQuotes } from '../src/api/account-operations.ts';

test('carrier logos accept explicit public HTTPS assets and BayShop relative paths', () => {
  assert.equal(normalizeCarrierLogo('https://bayshop.com/upload/shippers/16.png'), 'https://bayshop.com/upload/shippers/16.png');
  assert.equal(normalizeCarrierLogo('/upload/shippers/16.png'), 'https://bayshop.com/upload/shippers/16.png');
  for (const value of [null, 1, {}, '', '//other.example/logo.png', 'javascript:alert(1)', 'file:///logo.png', 'http://example.com/logo.png', 'https://user:secret@example.com/logo.png']) {
    assert.equal(normalizeCarrierLogo(value), null);
  }
});

test('a missing or invalid logo never removes a valid delivery option or changes its price', () => {
  const carrier = { id: '42', title: 'USPS Priority', description: 'Delivery', time: '7 days', price: '12.50', currency: 'USD', overweight: false, self_send: true, local_delivery: false, insurance: true, consolidation: true };
  const baseline = packingCarriers({ items: [carrier] }).items[0];
  for (const flag of ['https://bayshop.com/upload/shippers/16.png', 'bad image', {}, null]) {
    const { logoUrl, ...option } = packingCarriers({ items: [{ ...carrier, flag }] }).items[0];
    assert.deepEqual(option, baseline);
    assert.equal(logoUrl, normalizeCarrierLogo(flag));
  }
  assert.equal(baseline.price, 12.5);
});

test('checkout and calculator keep the server logo without altering carrier ID or quoted amounts', () => {
  const flag = 'https://bayshop.com/upload/shippers/16.png';
  const raw = { id: '16', title: 'USPS Priority', flag, price: '12.50', currency: 'USD', self_send: true, local_delivery: false, insurance: true, consolidation: true };
  const carrier = checkoutCarriers({ items: [raw] })[0];
  const quote = calculatorQuotes({ shippers: [raw] })[0];
  assert.equal(carrier.logoUrl, flag);
  assert.equal(quote.logoUrl, flag);
  assert.equal(carrier.id, '16');
  assert.equal(quote.amount, 12.5);
  assert.equal(quote.currency, 'USD');
  assert.equal(checkoutCarriers({ items: [{ ...raw, flag: 'bad' }] })[0].logoUrl, null);
  assert.equal(calculatorQuotes({ shippers: [{ ...raw, flag: 'bad' }] })[0].amount, 12.5);
});
