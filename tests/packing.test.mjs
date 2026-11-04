import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiContractError } from '../src/api/normalize.ts';
import { packingAddresses, packingCarriers, packingEligibility, packingInsurance, packingLocal, packingLocalFields, packingSelectedAddress } from '../src/api/packing-normalize.ts';
import { planRead, planMutation } from '../src/api/operations-contracts.ts';

const carrier = { id: '188', title: 'Synthetic carrier', time: '5–7', description: '<p>Exact server description</p>', price: '0.00', overweight: false, self_send: false, local_delivery: true, insurance: true, consolidation: true };
const address = { id: '24', complete_name: 'Synthetic Recipient', address: 'Exact 004 postal road', city: 'Town', country: 'Country', phone: '+000123', address_completed: true, localDeliveryRegionPrice: '0.00', currency: 'EUR' };

test('packing address pages preserve exact address values and actual zero regional price', () => {
  const result = packingAddresses({ items: [address], page: 2, pagesCount: 3, itemsCount: 9, notifications: [{ text: '<b>Server notice</b>' }] });
  assert.equal(result.page, 2); assert.equal(result.pages, 3);
  assert.equal(result.items[0].address, 'Exact 004 postal road');
  assert.equal(result.items[0].price, 0);
  assert.deepEqual(result.notifications, ['Server notice']);
  assert.throws(() => packingAddresses({ items: [], page: 1 }), ApiContractError);
});

test('shipping eligibility preserves server restrictions and never assumes missing flags', () => {
  const result = packingCarriers({ items: [carrier] }).items[0];
  assert.equal(result.price, 0);
  assert.equal(result.currency, null, 'the carrier contract omits currency; do not invent USD');
  assert.equal(result.description, 'Exact server description');
  assert.equal(packingCarriers({ items: [{ ...carrier, overweight: '1' }] }).items[0].overweight, true);
  assert.throws(() => packingCarriers({ items: [{ ...carrier, local_delivery: undefined }] }), ApiContractError);
  const parcel = { stage: 'warehouse', storageId: '14', declared: true, restrictions: { packingDenied: false, heldByDamage: false, heldByProhibition: false } };
  assert.equal(packingEligibility(parcel), null);
  assert.equal(packingEligibility({ ...parcel, declared: false }), 'packing.declarationRequired');
  assert.equal(packingEligibility({ ...parcel, restrictions: { ...parcel.restrictions, heldByDamage: true } }), 'packing.restricted');
  assert.equal(packingEligibility({ ...parcel, restrictions: { ...parcel.restrictions, packingDenied: null } }), 'packing.availabilityUnknown');
});

test('local delivery uses returned IDs and explicit option mapping, never label-derived IDs', () => {
  const locals = packingLocal({ items: [
    { id: '2', title: 'Warehouse label can change', price: '0.00', currency: 'EUR', options_key: 'localStorage-storage', options: [{ id: '11', address: 'Exact pickup address', price: '0.00', currency: 'EUR' }] },
    { id: '1', title: 'Terminal', price: '1.00', options_key: 'terminal', options: [{ id: '22', address: 'Terminal address' }] },
    { id: '3', title: 'Courier', price: '2.00', options_key: 'localAddressId', options: [] },
  ] });
  assert.deepEqual(packingLocalFields(locals[0], '11', null), { local_delivery: '2', localStorage: '11' });
  assert.deepEqual(packingLocalFields(locals[1], '22', null), { local_delivery: '1', terminal: '22' });
  assert.deepEqual(packingLocalFields(locals[2], '', { id: '24', completed: true }), { local_delivery: '3', localAddressId: '24' });
  assert.throws(() => packingLocalFields(locals[0], 'invented', null), ApiContractError);
  assert.throws(() => packingLocalFields({ ...locals[0], optionsKey: 'unknown-server-option' }, '11', null), ApiContractError);
  assert.throws(() => packingLocalFields(locals[2], '', { id: '24', completed: false }), ApiContractError);
});

test('insurance exposes the server policy and service prices without inventing a total', () => {
  const result = packingInsurance({ insurance_available: true, insurance_free: false, insurance_percent: '3', insurance_min: '3.00', insurance_max: '2500', currency: 'EUR', currency_price: '80.00', services: [{ keyName: 'repacking', title: 'Server service title', description: null, price: '0.00' }] });
  assert.equal(result.percent, 3); assert.equal(result.minimum, 3); assert.equal(result.maximum, 2500);
  assert.equal(result.services[0].price, 0);
  assert.equal(result.services[0].key, 'repacking');
  assert.equal('total' in result, false);
  assert.throws(() => packingInsurance({ insurance_available: true, insurance_free: false, services: null }), ApiContractError);
});

test('packing read steps encode chosen boxes and pagination; only explicit final command creates shipment', () => {
  const read = planRead({ kind: 'packing.addresses', boxes: ['11', '12'], localDeliveryId: '3', page: 2, search: 'Two + names' });
  const query = new URL(read.path, 'https://example.test').searchParams;
  assert.deepEqual(query.getAll('boxes[]'), ['11', '12']);
  assert.equal(query.has('boxes'), false);
  assert.equal(query.get('local_delivery_id'), '3');
  assert.equal(query.get('page'), '2');
  assert.equal(query.get('search'), 'Two + names');
  const plan = planMutation({ kind: 'packing.create', input: { boxes: ['11', '12'], addressId: '24', shipperId: '188', local_delivery: '2', localStorage: '11', insurance: false, sentOnUserAlert: true, additionServices: ['repacking'] } });
  assert.equal(plan.method, 'PUT'); assert.equal(plan.path, '/api/parcel-create');
  assert.equal(plan.fields.insurance, '0'); assert.equal(plan.fields.sentOnUserAlert, '1');
  assert.deepEqual(plan.fields['additionServices[]'], ['repacking']);
  assert.deepEqual(plan.normalize({ code: 200, error: false, message: 'Ok', data: [{ id: 999, codeNumber: 'R-SYNTHETIC' }] }), [{ id: '999', codeNumber: 'R-SYNTHETIC' }]);
  assert.throws(() => plan.normalize({ code: 200, error: false, message: 'Ok', data: [] }), ApiContractError);
});

test('every packing GET step uses PHP arrays while final PUT keeps its documented JSON field', () => {
  for (const kind of ['packing.addresses', 'packing.shipping', 'packing.localShipping', 'packing.insurance']) {
    const read = planRead({ kind, boxes: ['11', '12'], addressId: '24', shipperId: '188' });
    const params = new URL(read.path, 'https://example.test').searchParams;
    assert.deepEqual(params.getAll('boxes[]'), ['11', '12']);
    assert.equal(params.has('boxes'), false);
  }
  const write = planMutation({ kind: 'packing.create', input: { boxes: ['11', '12'], addressId: '24', shipperId: '188', insurance: false, sentOnUserAlert: false } });
  assert.deepEqual(JSON.parse(write.fields.boxes), [11, 12]);
});

test('refreshed recipient selection uses current permission and address values without selecting a different recipient', () => {
  const selected = Object.freeze({ id: '24', completed: true, address: 'Old street' });
  const latest = { id: '24', completed: false, address: 'Changed street' };
  const resource = { data: { items: [latest], page: 1, pages: 1, total: 1, notifications: [] }, loading: false, error: null };
  assert.equal(packingSelectedAddress(selected, resource), latest);
  assert.equal(packingSelectedAddress(selected, resource).completed, false);
  assert.equal(selected.address, 'Old street');
  assert.equal(packingSelectedAddress(selected, { ...resource, loading: true }), null);
  assert.equal(packingSelectedAddress(selected, { ...resource, error: 'errors.loadFailed' }), null);
  assert.equal(packingSelectedAddress(selected, { ...resource, data: { ...resource.data, items: [{ id: '99', completed: true }] } }), null);
  assert.equal(packingSelectedAddress(null, resource), null);
});

test('partial restriction objects never silently authorize packing', () => {
  assert.equal(packingEligibility({ stage: 'warehouse', storageId: '14', declared: true, restrictions: {} }), 'packing.availabilityUnknown');
});
