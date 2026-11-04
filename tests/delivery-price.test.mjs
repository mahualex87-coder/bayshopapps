import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryPriceLabel } from '../src/domain/delivery-price.ts';
import { packingLocal, packingAddresses } from '../src/api/packing-normalize.ts';
import { normalizeDeliveryMethods } from '../src/api/local-delivery.ts';
const fmt = value => value.toFixed(2);
test('delivery quotes preserve zero, uppercase codes and literal server symbols', () => {
  assert.equal(deliveryPriceLabel({ price: 0, currency: 'eur' }, fmt), '0.00 EUR');
  assert.equal(deliveryPriceLabel({ price: 5.2, currency: '€' }, fmt), '5.20 €');
  for (const price of [null, NaN, Infinity, -1]) assert.equal(deliveryPriceLabel({ price, currency: 'RON' }, fmt), null);
  assert.equal(deliveryPriceLabel({ price: 3, currency: null }, fmt), null);
});
test('server method range is preselection only; missing selected price remains unknown', () => {
  const quote = { price: null, minPrice: 0, maxPrice: 15, currency: 'ron' };
  assert.equal(deliveryPriceLabel(quote, fmt, true), '0.00–15.00 RON');
  assert.equal(deliveryPriceLabel(quote, fmt), null);
  assert.equal(deliveryPriceLabel({ ...quote, maxPrice: 0 }, fmt, true), '0.00 RON');
  assert.equal(deliveryPriceLabel({ ...quote, minPrice: 20, maxPrice: 15 }, fmt, true), null);
});
test('both delivery read contracts retain exact zero ranges and address quotes', () => {
  const raw = { items: [{ id: '13', title: 'Nova Post', price: 12, currency: 'EUR', min_price: '0.00', max_price: '15.50', options_key: 'terminal', options: [{ id: '5', address: 'Point', price: '0.00', currency: null }] }] };
  for (const normalize of [packingLocal, normalizeDeliveryMethods]) {
    const result = normalize(raw)[0];
    assert.equal(result.minPrice, 0); assert.equal(result.maxPrice, 15.5);
    assert.equal(result.options[0].price, 0); assert.equal(result.options[0].currency, null);
    assert.equal(deliveryPriceLabel({ price: result.options[0].price, currency: result.options[0].currency ?? result.currency }, fmt), '0.00 EUR');
  }
  const addr = packingAddresses({ page: 1, pagesCount: 1, itemsCount: 1, items: [{ id: '1', address_completed: true, localDeliveryRegionPrice: 0, currency: 'RON' }] }).items[0];
  assert.equal(deliveryPriceLabel(addr, fmt), '0.00 RON');
});
