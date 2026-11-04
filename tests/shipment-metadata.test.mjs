import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiContractError, normalizeLocalDeliveryData, normalizeParcelDimensions, normalizeShipmentDetailData } from '../src/api/normalize.ts';

test('shipment service rows retain their source state without changing the authoritative total', () => {
  const value = normalizeShipmentDetailData({ id: '31', status: 'customs-held', currency: 'EUR', price_total: '12.50', price_additional_services: '2.50', customsCause: 'Document verification', addition_services_list: [
    { keyName: 'repack', title: 'Repacking', description: '<p>New box</p>', price: '2.50', active: '1' },
    { keyName: 'photo', title: 'Photos', price: '8', active: '0' },
    { title: 'Free service', price: '0', active: true },
  ] });
  assert.equal(value.customsCause, 'Document verification');
  assert.equal(value.shippingTotal, 12.5);
  assert.equal(value.costs.find(row => row.labelKey === 'parcel.cost.services').amount, 2.5);
  assert.deepEqual(value.additionalServices.map(row => [row.amount, row.active]), [[2.5, true], [8, false], [0, true]]);
  assert.equal(value.additionalServices[0].description, '<p>New box</p>');
});

test('dimension values preserve partial source data and never turn missing measurements into zero', () => {
  assert.equal(normalizeParcelDimensions({}), null);
  assert.equal(normalizeParcelDimensions({ x: null, y: '', z: undefined }), null);
  assert.deepEqual(normalizeParcelDimensions({ x: '30.5', y: '20', z: '10' }), { x: 30.5, y: 20, z: 10 });
  assert.deepEqual(normalizeParcelDimensions({ x: '0', y: 12 }), { x: 0, y: 12, z: null });
  for (const value of [-1, 'NaN', '20cm', Infinity, false]) assert.throws(() => normalizeParcelDimensions({ x: value }), ApiContractError);
  const parcel = normalizeShipmentDetailData({ id: '31', status: 'sent', x: '30.5', y: '20', z: '10', realWeight: '1440' });
  assert.deepEqual(parcel.dimensionsCm, { x: 30.5, y: 20, z: 10 });
  assert.equal(parcel.weightKg, 1.44);
});

test('absent service metadata stays absent and malformed active flags are rejected', () => {
  const parcel = normalizeShipmentDetailData({ id: '31', status: 'received' });
  assert.equal(parcel.customsCause, null);
  assert.equal(parcel.dimensionsCm, null);
  assert.deepEqual(parcel.additionalServices, []);
  const unknown = normalizeShipmentDetailData({ id: '31', status: 'sent', addition_services_list: [{ price: null }] });
  assert.deepEqual(unknown.additionalServices, [{ key: null, title: null, description: null, amount: null, active: null }]);
  for (const active of ['yes', 2, {}, []]) assert.throws(() => normalizeShipmentDetailData({ id: '31', status: 'sent', addition_services_list: [{ active }] }), ApiContractError);
});

test('shared delivery normalization keeps the selected pickup data separate from a recipient', () => {
  assert.equal(normalizeLocalDeliveryData(null), null);
  const destination = normalizeLocalDeliveryData({ title: 'Pickup point', address: 'Warehouse', address_array: { first_name: 'Bay', last_name: 'Shop' }, coordinates: { lat: '47.01', lng: '28.85' } });
  assert.equal(destination.address, 'Warehouse');
  assert.deepEqual(destination.coordinates, { latitude: 47.01, longitude: 28.85 });
  assert.equal(destination.addressFields[0].value, 'Bay');
  assert.throws(() => normalizeLocalDeliveryData({ coordinates: { lng: '190' } }), ApiContractError);
});
