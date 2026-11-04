import assert from 'node:assert/strict';
import test from 'node:test';
import { autoPackingDraft, autoPackingDraftKey, normalizeAutoPackingSettings, normalizeAutoPackingCarriers, normalizeAutoPackingInsurance } from '../src/api/account-auto-packing.ts';
import { planRead, planMutation } from '../src/api/operations-contracts.ts';
import { LiveAccountService } from '../src/api/service.ts';
import { API_ORIGIN } from '../src/api/client.ts';

const settings = () => ({ autoPacking: '1', autoInsurance: '1', autoDeclaration: '0', autoPackingAddressId: '21', autoPackingAddressName: '004 Exact Street', autoPackingShippingId: '88', autoPackingShippingName: 'Air Post', autoLocalDeliveryId: '7', autoLocalDeliveryAddonId: '42', autoLocalDeliveryName: 'Exact pickup address', autoPackingPrice: '4.00', additionServices: { repacking: { title: 'Repacking', description: '<b>Server description</b>', selected: '1', price: '0.00', oldPrice: '2.00' } } });
const input = () => autoPackingDraft('14', normalizeAutoPackingSettings(settings()));

test('auto shipping preserves saved route, zero prices and exact selections; never infers policy', () => {
  const raw = settings(); raw.autoPackingForced = '1'; raw.isHiddenFromParty = '1';
  const value = normalizeAutoPackingSettings(raw);
  assert.equal(value.addressName, '004 Exact Street'); assert.equal(value.serviceFee, 4);
  assert.equal(value.services[0].price, 0); assert.equal(value.services[0].oldPrice, 2);
  assert.equal(value.services[0].description, 'Server description');
  assert.equal('autoPackingForced' in value, false); assert.equal('isHiddenFromParty' in value, false);
  const empty = normalizeAutoPackingSettings({ ...raw, autoPacking: null, autoInsurance: null, autoPackingAddressId: null, autoPackingShippingId: null, autoLocalDeliveryId: '0', autoLocalDeliveryAddonId: null, additionServices: [] });
  assert.equal(empty.enabled, null); assert.equal(empty.localDeliveryId, null); assert.deepEqual(empty.services, []);
  for (const bad of [false, ' ', 'free', -1]) assert.throws(() => normalizeAutoPackingSettings({ ...raw, autoPackingPrice: bad }));
  assert.throws(() => normalizeAutoPackingSettings({ ...raw, additionServices: { repacking: { ...raw.additionServices.repacking, selected: undefined } } }));
});

test('auto shipping route metadata is its own contract, without invented shipping quotes', () => {
  const carrier = normalizeAutoPackingCarriers({ items: [{ id: 88, title: 'Road Express', flag: null, time: '5–7', self_send: false, local_delivery: true, insurance: '1' }] })[0];
  assert.equal(carrier.id, '88'); assert.equal(carrier.localDelivery, true); assert.equal('price' in carrier, false);
  assert.throws(() => normalizeAutoPackingCarriers({ items: [{ ...carrier, self_send: undefined }] }));
  const insurance = normalizeAutoPackingInsurance({ insurance_available: '1', insurance_free: '0', insurance_free_limit: '0.00', insurance_percent: '3', insurance_min: '3.00', insurance_max: '2500', currency: '€', services: [{ keyName: 'repacking', title: 'Server title', price: '0.00' }], notifications: [{ text: 'Exact &amp; notice' }] });
  assert.equal(insurance.freeLimit, 0); assert.equal(insurance.percent, 3); assert.equal(insurance.currency, '€');
  assert.equal(insurance.services[0].selected, null); assert.equal('total' in insurance, false);
  assert.deepEqual(insurance.notifications, ['Exact & notice']);
});

test('auto shipping reads encode only explicit depot/recipient/page and dependent route values', () => {
  const url = new URL(planRead({ kind: 'autoPacking.addresses', storageId: '14', page: 2, search: 'A + B', localDeliveryId: '7' }).path, 'https://example.test');
  assert.equal(url.pathname, '/api/profile-auto-packing/address');
  assert.deepEqual(Object.fromEntries(url.searchParams), { storage_id: '14', page: '2', perPage: '10', search: 'A + B', local_delivery_id: '7' });
  for (const kind of ['autoPacking.shipping', 'autoPacking.localShipping', 'autoPacking.insurance']) {
    const path = planRead({ kind, storageId: '14', addressId: '21', shipperId: '88' }).path;
    const params = new URL(path, 'https://example.test').searchParams;
    assert.equal(params.get('storage_id'), '14'); assert.equal(params.get('address_id'), '21');
    assert.equal(params.has('price'), false); assert.equal(params.has('currency_id'), false);
  }
  assert.throws(() => planRead({ kind: 'autoPacking.settings', storageId: 'us' }));
});

test('explicit auto shipping save retains preferences when disabled and never submits staff flags', () => {
  const original = input(); const disabled = { ...original, enabled: false, autoPackingForced: true, isHiddenFromParty: true };
  const plan = planMutation({ kind: 'autoPacking.save', input: disabled });
  assert.equal(plan.path, '/api/member/auto-packaging?storage_id=14'); assert.equal(plan.method, 'POST');
  assert.deepEqual(plan.fields, { autoPacking: '0', autoInsurance: '1', autoDeclaration: '0', autoPackingAddressId: '21', autoPackingShippingId: '88', autoLocalDeliveryId: '7', autoLocalDeliveryAddonId: '42', 'additionService[]': ['repacking'] });
  assert.deepEqual(plan.normalize({ code: 200, error: false, message: 'Ok' }), { saved: true });
  for (const response of [{ code: 200, error: true }, { code: 200, error: false, data: { success: false } }, { code: 200 }]) assert.throws(() => plan.normalize(response));
  for (const change of [{ addressId: null }, { localAddonId: null }, { serviceKeys: ['x', 'x'] }, { serviceKeys: ['../../x'] }]) assert.throws(() => planMutation({ kind: 'autoPacking.save', input: { ...original, ...change } }));
  const left = { ...original, serviceKeys: ['repacking', 'protection'] }, right = { ...original, serviceKeys: ['protection', 'repacking'] };
  assert.equal(autoPackingDraftKey(left), autoPackingDraftKey(right)); assert.deepEqual(left.serviceKeys, ['repacking', 'protection']);
});

test('auto shipping save always checks fresh preservation capability and never dispatches to an old backend', async () => {
  const NOW = 1790000000000; let supported = false; const calls = [];
  const service = new LiveAccountService(async (path, options) => {
    calls.push({ path, write: !!options.write });
    if (path === '/api/member-settings') return { capabilities: { autoPackingPolicyPreserved: supported }, birthday: { value: null, editable: true }, language: { id: null, options: [] }, billing: { fields: {}, countries: [] }, identity: { revision: '0'.repeat(64), files: [], maxFiles: 3, maxBytes: 26214400, allowedMimeTypes: ['application/pdf'] } };
    if (options.write) return { code: 200, error: false, message: 'Ok' };
    if (path === '/api/auth') return { id: '7', name: 'Test', surname: 'Test', access_token: 'synthetic-auto', expires_in: 3600, token_type: 'Bearer' };
    if (path === '/api/member/me') return { member: { id: '7', email: 'test@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'Test', surname: 'Test' };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-auto', expiresAt: NOW + 3600000 }), write: async () => {}, clear: async () => {} }, () => NOW);
  await service.start(); await new Promise(resolve => setImmediate(resolve));
  const command = { kind: 'autoPacking.save', input: input() };
  assert.equal((await service.mutate(command)).error, 'accountSettings.serverUpdateRequired');
  assert.equal(calls.some(call => call.write), false);
  supported = true;
  assert.equal((await service.mutate(command)).ok, true);
  assert.deepEqual(calls.slice(-2), [{ path: '/api/member-settings', write: false }, { path: '/api/member/auto-packaging?storage_id=14', write: true }]);
});
