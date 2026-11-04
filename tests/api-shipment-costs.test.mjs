import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiContractError, normalizeShipmentDetailData, normalizeShipmentsData } from '../src/api/normalize.ts';

test('shipment separates actual and declared goods values from fees and authoritative total', () => {
  const parcel = normalizeShipmentDetailData({ id: '1', status: 'sent', currency: 'RON', price_boxes: '12.25', price_declarations: '0.00', price_delivery: '8.50', price_total: '19.75', totalPrice: '100', price_insurance: null });
  assert.deepEqual(parcel.costs.map(({ labelKey, amount, currency }) => ({ labelKey, amount, currency })), [
    { labelKey: 'parcel.cost.delivery', amount: 8.5, currency: 'RON' },
  ]);
  assert.equal(parcel.goodsValue, 12.25);
  assert.equal(parcel.declaredValue, 0);
  assert.equal(parcel.shippingTotal, 19.75, 'Do not recalculate a total which may include discounts or other server adjustments');
  assert.equal(parcel.amount, 19.75);
  const missing = normalizeShipmentDetailData({ id: '2', status: 'sent', price_boxes: null, price_declarations: '', totalPrice: '100' });
  assert.deepEqual(missing.costs, []);
  assert.equal(missing.goodsValue, 100);
  assert.equal(missing.declaredValue, null);
  assert.equal(missing.shippingTotal, null, 'A missing shipping total cannot fall back to goods value');
  assert.equal(missing.amount, null);
});

test('received list goods value never claims a shipping charge for an old zero-charge shipment', () => {
  for (const value of ['11', '22', '0']) {
    const [row] = normalizeShipmentsData([{ id: '1', codeNumber: 'RTEST1', status: 'received', totalPrice: value, currency: 'USD' }], 'received');
    const detail = normalizeShipmentDetailData({ id: '1', status: 'received', totalPrice: value, price_boxes: value, price_delivery: '0', price_total: '0', currency: 'USD' });
    assert.equal(row.amount, Number(value));
    assert.equal(row.amountKind, 'productValue');
    assert.equal(detail.goodsValue, Number(value));
    assert.equal(detail.shippingTotal, 0);
    assert.equal(detail.costs.find(cost => cost.labelKey === 'parcel.cost.delivery').amount, 0);
  }
});

test('tax breakdown preserves server explanations and currency without double-counting or inventing a rate', () => {
  const parcel = normalizeShipmentDetailData({ id: '1', status: 'sent', currency: '$', price_boxes: '35', price_declarations: '35', price_delivery: '0', price_import_taxes: '7.28', price_total: '7.28', import_taxes: { total: '7.28', currency: 'USD', lines: [
    { title: 'TVA Moldova', amount: '7', description: '20% din 35 USD' },
    { title: 'Procesare TVA', amount: '0.28', description: '0.8% din 35 USD' },
  ] } });
  assert.equal(parcel.goodsValue, 35);
  assert.equal(parcel.shippingTotal, 7.28);
  assert.equal(parcel.importTaxes.total, 7.28);
  assert.equal(parcel.importTaxes.currency, 'USD', 'Use tax currency from the server, not a guessed code from $');
  assert.deepEqual(parcel.importTaxes.lines[1], { title: 'Procesare TVA', amount: 0.28, description: '0.8% din 35 USD' });
  assert.equal(parcel.importTaxes.estimated, false);
  assert.deepEqual(parcel.costs.map(cost => cost.amount), [0, 7.28]);
});

test('missing tax estimate stays unknown, explicit zero remains zero, and malformed tax data fails', () => {
  const absent = normalizeShipmentDetailData({ id: '1', status: 'processing', import_taxes: null });
  assert.equal(absent.importTaxes, null);
  assert.equal(absent.costs.length, 0);
  const zero = normalizeShipmentDetailData({ id: '1', status: 'processing', price_import_taxes: '0.00', import_taxes: { total: '0.00', currency: 'EUR', lines: [] } });
  assert.equal(zero.importTaxes.total, 0);
  assert.equal(zero.importTaxes.estimated, true);
  assert.equal(zero.costs[0].amount, 0);
  assert.throws(() => normalizeShipmentDetailData({ id: '1', status: 'sent', import_taxes: { total: '7', currency: 'USD', lines: [{ title: 'VAT', amount: null }] } }), ApiContractError);
});

test('damage and restriction milestones preserve their exact server timestamps and translation keys', () => {
  const parcel = normalizeShipmentDetailData({ id: '1', status: 'sent', heldByDamageTime: '2026-02-02 10:15:30', heldByProhibitionTime: '2026-02-03 11:45:00', receivedTime: null });
  assert.deepEqual(parcel.events.map(({ labelKey, date }) => ({ labelKey, date })), [
    { labelKey: 'parcel.event.damageHeld', date: '2026-02-02 10:15:30' },
    { labelKey: 'parcel.event.prohibitionHeld', date: '2026-02-03 11:45:00' },
  ]);
});
