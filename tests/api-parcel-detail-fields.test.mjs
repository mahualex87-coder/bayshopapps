import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiContractError, normalizeShipmentDetailData } from '../src/api/normalize.ts';
import { normalizeShipmentOperationDetail, normalizeStockDetail } from '../src/api/operations-normalize.ts';

test('selected shipment carrier description comes from shipping, safely retaining server language and paragraphs', () => {
  const detail = normalizeShipmentOperationDetail({ id: '7', status: 'sent', shipping: {
    id: '18', title: 'Road Express', description: '&lt;p&gt;Доставка из Румынии.&lt;/p&gt;&lt;p&gt;Сроки &amp;amp; условия.&lt;/p&gt;<script>hidden()</script>',
  } });
  assert.equal(detail.shippingMethod, 'Road Express');
  assert.equal(detail.shippingDescription, 'Доставка из Румынии.\n\nСроки & условия.');
  assert.equal(normalizeShipmentDetailData({ id: '8', status: 'sent', shipping: { title: 'Air Post' } }).shippingDescription, null);
  assert.equal(normalizeShipmentDetailData({ id: '9', status: 'sent' }).shippingDescription, null);
  const missingCarrier = normalizeShipmentDetailData({ id: '9', status: 'sent', shipping: [] });
  assert.equal(missingCarrier.shippingDescription, null);
  assert.equal(missingCarrier.shippingMethod, null);
  assert.throws(() => normalizeShipmentDetailData({ id: '9', status: 'sent', shipping: [{ title: 'Unexpected list' }] }), ApiContractError);
  assert.equal(normalizeShipmentDetailData({ id: '10', status: 'sent', shipping: { title: 'Air Post', description: '<p>&nbsp;</p>' } }).shippingDescription, null);
  assert.throws(() => normalizeShipmentDetailData({ id: '11', status: 'sent', shipping: { title: 'Air Post', description: { ro: 'Unexpected contract' } } }), ApiContractError);
});

test('stock detail preserves its own value, currency and both weight fields without list-unit conversion', () => {
  const stock = normalizeStockDetail({ id: '10', price: '804.76', currency: 'RON', weight: '0.85', volume_weight: '0.50', trackingNumber: 'TRACK-1', additionalTracking: '000042' });
  assert.equal(stock.amount, 804.76);
  assert.equal(stock.currency, 'RON');
  assert.equal(stock.weightKg, 0.85, 'Stock detail is kg, unlike the stock-list grams');
  assert.equal(stock.volumeWeight, 0.5);
  assert.equal(stock.additionalTracking, '000042');
  const zero = normalizeStockDetail({ id: '11', price: '0', weight: 0, volume_weight: '0' });
  assert.equal(zero.amount, 0); assert.equal(zero.weightKg, 0); assert.equal(zero.volumeWeight, 0); assert.equal(zero.currency, null);
  const absent = normalizeStockDetail({ id: '12' });
  assert.equal(absent.amount, null); assert.equal(absent.volumeWeight, null); assert.equal(absent.additionalTracking, null);
});

test('local delivery retains the actual pickup point separately from recipient and preserves opening hours', () => {
  const shipment = normalizeShipmentDetailData({ id: '7', status: 'sent', realWeight: '1440', volume_weight: '1440', address: { address: 'Recipient street', first_name: 'Recipient' }, local_delivery: {
    key: 'local-storage', type: 'storage', title: 'Pickup office', address: 'Pickup street', country: 'Moldova', phone: '+37300000000',
    address_array: { first_name: 'Office contact', address: 'Pickup entrance', zip: '0012' },
    coordinates: { lat: '0', lng: '-12.25' }, weekdaysHours: 'Mon–Fri 09:00–18:00', weekendHours: 'Sat 10:00–14:00',
    post_code: 'POINT-12', qr_code: 'ABC-001', img: '/upload/qrcode/test.png', status: 'Ready',
  } });
  assert.equal(shipment.weightKg, 1.44); assert.equal(shipment.volumeWeightKg, 1.44);
  assert.equal(shipment.recipientFields.find(field => field.labelKey === 'field.address').value, 'Recipient street');
  const destination = shipment.localDelivery;
  assert.equal(destination.address, 'Pickup street');
  assert.equal(destination.addressFields.find(field => field.labelKey === 'field.address').value, 'Pickup entrance');
  assert.equal(destination.addressFields.find(field => field.labelKey === 'field.postalCode').value, '0012');
  assert.deepEqual(destination.coordinates, { latitude: 0, longitude: -12.25 });
  assert.equal(destination.weekdaysHours, 'Mon–Fri 09:00–18:00');
  assert.equal(destination.weekendHours, 'Sat 10:00–14:00');
  assert.equal(destination.qrCode, 'ABC-001'); assert.equal(destination.qrImageUrl, '/upload/qrcode/test.png');
});

test('outgoing volumetric grams convert to Vkg while stock volumetric weight keeps its kilogram scale', () => {
  const outgoing = normalizeShipmentDetailData({ id: '7', status: 'sent', volume_weight: '1440' });
  const stock = normalizeStockDetail({ id: '10', volume_weight: '4.7' });
  assert.equal(outgoing.volumeWeightKg, 1.44);
  assert.equal(stock.volumeWeight, 4.7);
  assert.equal(normalizeShipmentDetailData({ id: '8', status: 'received', volume_weight: 750 }).volumeWeightKg, 0.75);
});

test('absent local-delivery fields are never replaced with the recipient address or invented opening hours', () => {
  const absent = normalizeShipmentDetailData({ id: '7', status: 'received', address: { address: 'Recipient street' } });
  assert.equal(absent.localDelivery, null); assert.equal(absent.volumeWeightKg, null);
  const partial = normalizeShipmentDetailData({ id: '7', status: 'received', volume_weight: '0', address: { address: 'Recipient street' }, local_delivery: { title: 'Pickup', coordinates: { lat: '47.2' } } });
  assert.equal(partial.localDelivery.address, null);
  assert.deepEqual(partial.localDelivery.addressFields, []);
  assert.equal(partial.localDelivery.weekendHours, null);
  assert.deepEqual(partial.localDelivery.coordinates, { latitude: 47.2, longitude: null });
  assert.equal(partial.volumeWeightKg, 0);
});

test('embedded boxes convert source-confirmed grams and preserve quantities, tracking and independent item currency', () => {
  const shipment = normalizeShipmentOperationDetail({ id: '7', status: 'sent', currency: '$', boxes: [{
    id: '10', uid: 'MF-10', quantity: '2', weight: '2180', tracking: '00001', additionalTracking: '00002',
    isHeldByDamage: true, heldByDamageComment: 'Corner damaged', heldByDamageTime: '2026-10-02 10:11:12',
    isHeldByProhibition: false, heldByProhibitionComment: null, heldByProhibitionTime: null,
    declarationItems: [{ title: 'Unknown currency item', quantity: 2, price: 35 }, { title: 'Explicit currency item', price: '12.50', currency: 'EUR' }],
  }] });
  const box = shipment.boxes[0];
  assert.equal(box.quantity, 2); assert.equal(box.weightKg, 2.18);
  assert.equal(box.tracking, '00001'); assert.equal(box.additionalTracking, '00002');
  assert.equal(box.heldByDamage, true); assert.equal(box.damageComment, 'Corner damaged');
  assert.equal(box.damageHeldAt, '2026-10-02 10:11:12'); assert.equal(box.heldByProhibition, false);
  assert.equal(box.declarationItems[0].currency, null, 'Shipment $ does not establish currency for embedded product prices');
  assert.equal(box.declarationItems[1].currency, 'EUR');
  const unknown = normalizeShipmentOperationDetail({ id: '7', status: 'sent', boxes: [{ id: '10' }] }).boxes[0];
  assert.equal(unknown.quantity, null); assert.equal(unknown.weightKg, null); assert.equal(unknown.heldByDamage, null);
  const zero = normalizeShipmentOperationDetail({ id: '7', status: 'sent', boxes: [{ id: '10', weight: '0' }] }).boxes[0];
  assert.equal(zero.weightKg, 0);
  for (const weight of [-1, false, {}, ' ']) assert.throws(() => normalizeShipmentOperationDetail({ id: '7', status: 'sent', boxes: [{ id: '10', weight }] }), ApiContractError);
});

test('malformed optional weights, quantities and coordinates cannot masquerade as zero or display object text', () => {
  for (const bad of [false, true, ' ', {}, -1, 'NaN']) {
    assert.throws(() => normalizeStockDetail({ id: '1', volume_weight: bad }), ApiContractError);
    assert.throws(() => normalizeShipmentDetailData({ id: '1', status: 'sent', volume_weight: bad }), ApiContractError);
  }
  for (const bad of [false, ' ', -1, 1.5]) assert.throws(() => normalizeShipmentOperationDetail({ id: '1', status: 'sent', boxes: [{ id: '2', quantity: bad }] }), ApiContractError);
  assert.throws(() => normalizeShipmentDetailData({ id: '1', status: 'sent', local_delivery: { coordinates: { lat: '91', lng: 0 } } }), ApiContractError);
});
