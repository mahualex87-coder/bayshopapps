import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryReviewKey, deliverySelection, normalizeDeliveryMethods, supportedDeliveryMethod } from '../src/api/local-delivery.ts';
import { OperationValidationError, planMutation, planRead } from '../src/api/operations-contracts.ts';
import { normalizeWaitingDetail } from '../src/api/operations-normalize.ts';

const method = (changes = {}) => ({ id: '13', title: 'Pickup', description: '<p>Choose a branch</p>', price: '2.7', currency: 'EUR', options_key: 'localStorage-np-storage', addition_service: { title: 'Change delivery', price: 1.5 }, options: [{ id: '74', address: 'Test branch', price: '3.7', currency: 'EUR', allowConsolidation: '0', consolidationMessage: 'Separate waybills are charged separately.' }], ...changes });

test('delivery options preserve selected-point cost, switching fee and consolidation warning separately', () => {
  const [value] = normalizeDeliveryMethods({ items: [method()] });
  assert.equal(value.price, 2.7);
  assert.equal(value.options[0].price, 3.7);
  assert.deepEqual(value.additionalService, { title: 'Change delivery', price: 1.5 });
  assert.equal(value.options[0].allowConsolidation, false);
  assert.equal(value.options[0].consolidationMessage, 'Separate waybills are charged separately.');
  assert.equal(value.description, 'Choose a branch');
  assert.equal(normalizeDeliveryMethods({ items: [method({ price: null, addition_service: null })] })[0].price, null);
  assert.equal(normalizeDeliveryMethods({ items: [method({ price: '0' })] })[0].price, 0);
  assert.throws(() => normalizeDeliveryMethods({ items: [method({ price: 'unknown' })] }));
  assert.throws(() => normalizeDeliveryMethods({ items: [method(), method()] }));
});

test('delivery save uses only documented fields and selected parcel options', () => {
  const [pickup] = normalizeDeliveryMethods({ items: [method()] });
  const selection = deliverySelection(pickup, '74', null);
  assert.deepEqual(selection, { local_delivery: '13', localStorage: '74' });
  const plan = planMutation({ kind: 'shipment.localDelivery.save', id: '7', input: selection });
  assert.equal(plan.path, '/api/parcel-local-delivery/7'); assert.equal(plan.method, 'POST'); assert.equal(plan.encoding, 'form');
  assert.deepEqual(plan.fields, selection); assert.deepEqual(plan.invalidate, ['sent', 'received', 'balance']);
  assert.deepEqual(plan.normalize({ code: 200, error: false, message: 'Ok' }), { success: true });
  assert.throws(() => plan.normalize({ code: 200, error: true, message: 'Ok' }));
  assert.throws(() => deliverySelection(pickup, '99', null));
  const [terminal] = normalizeDeliveryMethods({ items: [method({ options_key: 'terminal' })] });
  assert.deepEqual(deliverySelection(terminal, '74', null), { local_delivery: '13', terminal: '74' });
  const [courier] = normalizeDeliveryMethods({ items: [method({ options_key: 'localAddressId', options: [] })] });
  assert.throws(() => deliverySelection(courier, '', { id: '8', completed: false }));
  assert.deepEqual(deliverySelection(courier, '', { id: '8', completed: true }), { local_delivery: '13', localAddressId: '8' });
  const [unsupported] = normalizeDeliveryMethods({ items: [method({ options_key: 'unknown' })] });
  assert.equal(supportedDeliveryMethod(unsupported), false); assert.throws(() => deliverySelection(unsupported, '74', null));
  for (const input of [{ local_delivery: '13' }, { ...selection, terminal: '2' }, { ...selection, addition_service: '1' }, { ...selection, localStorage: '../auth' }]) assert.throws(() => planMutation({ kind: 'shipment.localDelivery.save', id: '7', input }), OperationValidationError);
});

test('a changed option price, surcharge, destination or warning invalidates the reviewed selection', () => {
  const [original] = normalizeDeliveryMethods({ items: [method()] });
  const key = deliveryReviewKey(original, '74', null);
  for (const changed of [
    { ...original, additionalService: { ...original.additionalService, price: 2 } },
    { ...original, options: [{ ...original.options[0], price: 4 }] },
    { ...original, options: [{ ...original.options[0], address: 'Another address' }] },
    { ...original, options: [{ ...original.options[0], consolidationMessage: 'Changed conditions' }] },
  ]) assert.notEqual(deliveryReviewKey(changed, '74', null), key);
});

test('delivery reads keep parcel identity and encode paginated address searches', () => {
  assert.equal(planRead({ kind: 'shipment.localDelivery.read', id: '7' }).path, '/api/parcel-local-delivery/7');
  const plan = planRead({ kind: 'shipment.localDelivery.addresses', id: '7', localDeliveryId: '3', page: 2, search: 'A & B' });
  const url = new URL(plan.path, 'https://bayshop.com');
  assert.equal(url.pathname, '/api/parcel-local-delivery/7/address');
  assert.deepEqual(Object.fromEntries(url.searchParams), { local_delivery_id: '3', perPage: '20', page: '2', search: 'A & B' });
  assert.throws(() => planRead({ kind: 'shipment.localDelivery.addresses', id: '7', localDeliveryId: '3', page: 0, search: '' }));
  assert.throws(() => planRead({ kind: 'shipment.localDelivery.read', id: '../auth' }));
});

test('waiting passcode preserves its literal value in the source-confirmed form operation', () => {
  const base = { id: '1', declarations: [], invoices: [], customsDocs: [], passcodeAllowed: true };
  assert.equal(normalizeWaitingDetail({ ...base, passcode: '00125' }).passcode, '00125');
  assert.equal(normalizeWaitingDetail({ ...base, passcode: null }).passcode, null);
  const plan = planMutation({ kind: 'waiting.passcode.save', id: '1', passcode: '00125' });
  assert.equal(plan.path, '/api/waiting-mf-passcode/1');
  assert.equal(plan.method, 'POST'); assert.equal(plan.encoding, 'form');
  assert.deepEqual(plan.fields, { passcode: '00125' });
  assert.deepEqual(planMutation({ kind: 'waiting.passcode.save', id: '1', passcode: '' }).fields, { passcode: '' });
  assert.throws(() => planMutation({ kind: 'waiting.passcode.save', id: '1', passcode: '0' }), OperationValidationError);
});
