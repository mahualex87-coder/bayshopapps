import assert from 'node:assert/strict';
import test from 'node:test';
import { pickupCoordinates, nearestPickup, pickupDirectionsUrl, distanceMetres, findNearestPickup, pickupCameraTarget, pickupLocationScope, canAutomaticallyLocatePickup } from '../src/domain/pickup-points.ts';
import { createPickupLocationController } from '../src/domain/pickup-location-controller.ts';
import { packingLocal } from '../src/api/packing-normalize.ts';
import { normalizeDeliveryMethods } from '../src/api/local-delivery.ts';

test('pickup coordinates accept valid zero/negative decimals, reject missing and out-of-range without inventing location', () => {
  assert.deepEqual(pickupCoordinates('0', '-180'), { latitude: 0, longitude: -180 });
  assert.deepEqual(pickupCoordinates(47.01, '28.84'), { latitude: 47.01, longitude: 28.84 });
  for (const pair of [[91, 20], [45, -181], [false, '28.8'], ['', '28.8'], [' ', 28], [null, 28], ['NaN', 28], [45, undefined]]) assert.equal(pickupCoordinates(...pair), null);
});

test('packing and delivery change preserve point IDs, missing coords and server consolidation policy', () => {
  const raw = { items: [{ id: '13', title: 'Nova Post', price: '0.00', currency: 'MDL', options_key: 'localStorage-novaposhta', options: [
    { id: '401', address: 'Exact point A', latitude: '47.02', longitude: '28.84', price: '10.00', currency: 'MDL', allowConsolidation: '0', consolidationMessage: 'Exact server restriction' },
    { id: '402', address: 'Exact point B', latitude: null, longitude: null, price: '0.00', currency: 'MDL', allowConsolidation: '1' },
  ] }] };
  for (const normalize of [packingLocal, normalizeDeliveryMethods]) {
    const rows = normalize(raw)[0].options;
    assert.equal(rows.length, 2); assert.equal(rows[0].id, '401'); assert.equal(rows[0].address, 'Exact point A');
    assert.deepEqual(rows[0].coordinates, { latitude: 47.02, longitude: 28.84 });
    assert.equal(rows[0].allowConsolidation, false); assert.equal(rows[0].consolidationMessage, 'Exact server restriction');
    assert.equal(rows[1].coordinates, null); assert.equal(rows[1].price, 0);
  }
});

test('nearest selection only uses eligible returned points; ties are stable and input never changes', () => {
  const points = Object.freeze([
    Object.freeze({ id: 'blocked', address: 'Closest but unavailable', eligible: false, coordinates: { latitude: 47, longitude: 28 } }),
    Object.freeze({ id: 'missing', address: 'No coordinates', coordinates: null }),
    Object.freeze({ id: 'first', address: 'First valid', coordinates: { latitude: 47.01, longitude: 28 } }),
    Object.freeze({ id: 'equal', address: 'Same distance', coordinates: { latitude: 47.01, longitude: 28 } }),
    Object.freeze({ id: 'farther', address: 'Farther', coordinates: { latitude: 48, longitude: 28 } }),
  ]);
  const selected = nearestPickup(points, { latitude: 47, longitude: 28 });
  assert.equal(selected.point.id, 'first'); assert.ok(selected.distance > 1100 && selected.distance < 1120);
  assert.equal(nearestPickup(points.slice(0, 2), { latitude: 47, longitude: 28 }), null);
  assert.equal(distanceMetres({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
});

test('Google directions include only the chosen destination, no user coordinates or credential parameters', () => {
  const url = new URL(pickupDirectionsUrl({ id: '401', address: 'Street', coordinates: { latitude: 47.02, longitude: 28.84 } }));
  assert.equal(url.origin, 'https://www.google.com'); assert.equal(url.pathname, '/maps/dir/');
  assert.deepEqual(Object.fromEntries(url.searchParams), { api: '1', destination: '47.02,28.84' });
  const fallback = new URL(pickupDirectionsUrl({ id: '402', address: 'Strada A & B #12, Chișinău' }));
  assert.equal(fallback.searchParams.get('destination'), 'Strada A & B #12, Chișinău');
});

test('nearest device flow never reads position before consent and discards stale route/permission results', async () => {
  const points = [{ id: '401', address: 'Point', coordinates: { latitude: 47, longitude: 28 } }];
  let calls = [], current = true;
  const device = { requestPermission: async () => { calls.push('permission'); return false; }, getPosition: async () => { calls.push('position'); return { latitude: 47.01, longitude: 28.01 }; }, isCurrent: () => current };
  assert.deepEqual(await findNearestPickup(points, device), { kind: 'denied' }); assert.deepEqual(calls, ['permission']);
  calls = []; device.requestPermission = async () => { calls.push('permission'); current = false; return true; };
  assert.deepEqual(await findNearestPickup(points, device), { kind: 'cancelled' }); assert.deepEqual(calls, ['permission']);
  current = true; calls = []; device.requestPermission = async () => { calls.push('permission'); return true; };
  device.getPosition = async () => { calls.push('position'); current = false; return { latitude: 47.01, longitude: 28.01 }; };
  assert.deepEqual(await findNearestPickup(points, device), { kind: 'cancelled' }); assert.deepEqual(calls, ['permission','position']);
});

const origin = { latitude: 47, longitude: 28 };
const points = [
  { id: '401', address: 'Nearest point', coordinates: { latitude: 47.001, longitude: 28 }, allowConsolidation: false, consolidationMessage: 'Exact warning, selectable' },
  { id: '402', address: 'Further point', coordinates: { latitude: 47.02, longitude: 28 } },
  { id: '403', address: 'Unavailable', coordinates: origin, eligible: false, consolidationMessage: 'Exact unavailable reason' },
  { id: '404', address: 'No coordinates', coordinates: null },
];
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const configuration = onSelect => ({ points, selectedId: '', disabled: false, focused: true, foreground: true, onSelect });
function locationController(overrides = {}) {
  const calls = [];
  const controller = createPickupLocationController({
    requestPermission: async () => { calls.push('permission'); return true; },
    getPosition: async () => { calls.push('position'); return origin; },
    ...overrides,
  });
  return { controller, calls };
}

test('automatic nearest requires visible foreground empty picker; saved selections and inaccessible points remain intact', () => {
  const valid = { ...configuration(() => {}), attempted: false };
  assert.equal(canAutomaticallyLocatePickup(valid), true);
  for (const patch of [{ selectedId: 'saved-even-if-not-listed' }, { disabled: true }, { focused: false }, { foreground: false }, { attempted: true }, { points: points.slice(2) }]) assert.equal(canAutomaticallyLocatePickup({ ...valid, ...patch }), false);
  assert.equal(nearestPickup(points, origin).point.id, '401'); // A consolidation warning is not an eligibility ban.
  assert.equal(pickupLocationScope(points), pickupLocationScope(points.toReversed().map(point => ({ ...point, address: `Translated ${point.id}` }))));
});

test('entering an empty picker selects nearest once, retains only ephemeral origin and supports manual reselection', async () => {
  const { controller, calls } = locationController(); const selected = [];
  const config = configuration(id => selected.push(id));
  controller.configure(config); await tick();
  assert.deepEqual(calls, ['permission', 'position']); assert.deepEqual(selected, ['401']);
  assert.deepEqual(controller.getSnapshot().origin, origin); assert.equal(controller.getSnapshot().locating, false);
  controller.configure({ ...config, points: points.toReversed().map(point => ({ ...point, address: 'Перевод' })) }); await tick();
  assert.equal(calls.length, 2); // neither rerender, translated labels nor array order asks again
  controller.choose('404'); assert.equal(selected.at(-1), '404'); // no coordinates never removes the list option
  controller.choose('403'); assert.equal(selected.at(-1), '404'); assert.equal(controller.getSnapshot().error, 'Exact unavailable reason');
  controller.dispose(); assert.equal(controller.getSnapshot().origin, null);
});

test('a saved setting never prompts or auto-overwrites; explicit nearest remains available', async () => {
  const { controller, calls } = locationController(); const selected = [];
  const config = { ...configuration(id => selected.push(id)), selectedId: '402' };
  controller.configure(config); await tick(); assert.deepEqual(calls, []); assert.deepEqual(selected, []);
  controller.configure({ ...config, selectedId: '' }); await tick(); assert.deepEqual(calls, []);
  await controller.nearest(); assert.deepEqual(selected, ['401']); assert.equal(controller.getSnapshot().recenterKey, 1);
});

test('denied permission stays manual and does not reprompt on rerender or read GPS', async () => {
  let permissions = 0, positions = 0;
  const { controller } = locationController({ requestPermission: async () => { permissions++; return false; }, getPosition: async () => { positions++; return origin; } });
  const selected = []; const config = configuration(id => selected.push(id));
  controller.configure(config); await tick(); controller.configure(config); await tick();
  assert.equal(permissions, 1); assert.equal(positions, 0); assert.deepEqual(selected, []);
  assert.equal(controller.getSnapshot().error, 'pickup.locationDenied');
  controller.choose('402'); assert.deepEqual(selected, ['402']);
});

test('late GPS cannot replace manual choice, another carrier, unfocused/background screen or disposed picker', async () => {
  for (const action of ['manual', 'scope', 'blur', 'background', 'dispose']) {
    const gps = deferred(); const selected = [];
    const { controller } = locationController({ getPosition: () => gps.promise });
    const config = configuration(id => selected.push(id)); controller.configure(config); await tick();
    if (action === 'manual') controller.choose('402');
    if (action === 'scope') controller.configure({ ...config, points: [], selectedId: '' });
    if (action === 'blur') controller.configure({ ...config, focused: false });
    if (action === 'background') { controller.pause(); controller.configure({ ...config, foreground: false }); }
    if (action === 'dispose') controller.dispose();
    gps.resolve(origin); await tick();
    assert.deepEqual(selected, action === 'manual' ? ['402'] : [], action);
    assert.equal(controller.getSnapshot().origin, null, action);
    assert.equal(controller.getSnapshot().locating, false, action);
  }
});

test('Strict Mode setup/dispose/setup requests foreground permission only once', async () => {
  const { controller, calls } = locationController(); const selected = []; const config = configuration(id => selected.push(id));
  controller.configure(config); controller.dispose(); controller.configure(config); await tick();
  assert.deepEqual(calls, ['permission', 'position']); assert.deepEqual(selected, ['401']);
});

test('hidden modal does not request GPS; shown modal locates and closing discards its pending result', async () => {
  const gps = deferred(); const selected = [];
  const { controller, calls } = locationController({ getPosition: () => gps.promise });
  const config = configuration(id => selected.push(id));
  controller.configure({ ...config, focused: false }); await tick();
  assert.deepEqual(calls, []); // route focus alone is insufficient before Modal.onShow
  controller.configure(config); await tick(); assert.deepEqual(calls, ['permission']);
  controller.pause(); controller.configure({ ...config, focused: false });
  gps.resolve(origin); await tick();
  assert.deepEqual(selected, []); assert.equal(controller.getSnapshot().origin, null);
  controller.configure(config); await tick(); assert.equal(calls.length, 1); // no surprise reprompt on reopening
});

test('closing and reopening preserves selected point; display-only server prices never change its identity or GPS scope', async () => {
  const { controller, calls } = locationController(); const selected = [];
  const priced = points.map(point => ({ ...point, priceLabel: '0 MDL' }));
  const config = { ...configuration(id => selected.push(id)), points: priced, selectedId: '401', focused: false };
  controller.configure(config); await tick(); controller.configure({ ...config, focused: true }); await tick();
  assert.deepEqual(calls, []); assert.deepEqual(selected, []);
  controller.pause(); controller.configure(config); await tick();
  controller.configure({ ...config, focused: true, points: priced.map(point => ({ ...point, priceLabel: '12,50 MDL' })) }); await tick();
  assert.deepEqual(calls, []); assert.deepEqual(selected, []);
  assert.equal(pickupLocationScope(priced), pickupLocationScope(points));
});

test('map camera fits user plus chosen point only, keeps near points readable and never fits the whole network', () => {
  const many = Array.from({ length: 10005 }, (_, i) => ({ id: `remote-${i}`, address: 'Remote', coordinates: { latitude: -40 + i / 1000, longitude: 100 } }));
  const rows = [...points, ...many];
  assert.deepEqual(pickupCameraTarget(rows, '402', origin), { kind: 'fit', coordinates: [origin, points[1].coordinates] });
  const close = { latitude: 47.00101, longitude: 28 };
  assert.deepEqual(pickupCameraTarget(rows, '401', close), { kind: 'region', center: points[0].coordinates, delta: 0.008 });
  assert.deepEqual(pickupCameraTarget(rows, '', null), { kind: 'region', center: points[0].coordinates, delta: 0.05 });
  assert.deepEqual(pickupCameraTarget(rows, '404', origin), { kind: 'region', center: origin, delta: 0.008 });
  assert.equal(pickupCameraTarget([{ id: 'bad', address: '', coordinates: { latitude: 200, longitude: 0 } }], '', null), null);
});

test('a recent cached fix selects immediately and its parent echo does not cancel the current fix', async () => {
  const gps = deferred(); const selected = [];
  const { controller } = locationController({ getLastKnownPosition: async () => origin, getPosition: () => gps.promise });
  const config = configuration(id => { selected.push(id); controller.configure({ ...config, selectedId: id }); });
  controller.configure(config); await tick();
  assert.deepEqual(selected, ['401']);
  assert.deepEqual(controller.getSnapshot().origin, origin);
  assert.equal(controller.getSnapshot().locating, true);
  const currentOrigin = { latitude: 47.019, longitude: 28 };
  gps.resolve(currentOrigin); await tick();
  assert.deepEqual(selected, ['401', '402']);
  assert.deepEqual(controller.getSnapshot().origin, currentOrigin);
  assert.equal(controller.getSnapshot().locating, false);
});

test('manual choice and modal closure abort refinement and ignore both late cache and GPS', async () => {
  for (const action of ['manual', 'close']) {
    const gps = deferred(); let signal; const selected = [];
    const { controller } = locationController({ getLastKnownPosition: async () => origin, getPosition: value => { signal = value; return gps.promise; } });
    const config = configuration(id => { selected.push(id); controller.configure({ ...config, selectedId: id }); });
    controller.configure(config); await tick();
    if (action === 'manual') controller.choose('404'); else controller.pause();
    assert.equal(signal.aborted, true);
    gps.resolve({ latitude: 47.019, longitude: 28 }); await tick();
    assert.deepEqual(selected, action === 'manual' ? ['401', '404'] : ['401']);
    assert.equal(controller.getSnapshot().locating, false);
  }
});

test('fast current location is not delayed or overwritten by a slow cache', async () => {
  const cache = deferred(); const selected = [];
  const currentOrigin = { latitude: 47.019, longitude: 28 };
  const { controller } = locationController({ getLastKnownPosition: () => cache.promise, getPosition: async () => currentOrigin });
  controller.configure(configuration(id => selected.push(id))); await tick();
  assert.deepEqual(selected, ['402']); assert.equal(controller.getSnapshot().locating, false);
  cache.resolve(origin); await tick();
  assert.deepEqual(selected, ['402']); assert.deepEqual(controller.getSnapshot().origin, currentOrigin);
});

test('failed refresh retains the useful cached choice without a duplicate callback or error', async () => {
  let fail; const gps = new Promise((_, reject) => { fail = reject; }); const selected = [];
  const { controller } = locationController({ getLastKnownPosition: async () => origin, getPosition: () => gps });
  const config = configuration(id => { selected.push(id); controller.configure({ ...config, selectedId: id }); });
  controller.configure(config); await tick(); fail(new Error('No new GPS fix')); await tick();
  assert.deepEqual(selected, ['401']); assert.equal(controller.getSnapshot().error, null); assert.equal(controller.getSnapshot().locating, false);
});

test('permission denial never starts a cached or current position read', async () => {
  const calls = [];
  const { controller } = locationController({ requestPermission: async () => false, getLastKnownPosition: async () => { calls.push('cache'); return origin; }, getPosition: async () => { calls.push('current'); return origin; } });
  controller.configure(configuration(() => {})); await tick();
  assert.deepEqual(calls, []); assert.equal(controller.getSnapshot().error, 'pickup.locationDenied');
});
