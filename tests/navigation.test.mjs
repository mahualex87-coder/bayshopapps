import test from 'node:test';
import assert from 'node:assert/strict';
import { activeLiveParcelSection, activeParcelSection, isDetailPath } from '../src/navigation/routes.ts';
import { drawerGroups, parcelTabs } from '../src/navigation/menu.ts';
import { makeInitialState, transition } from '../src/state/demo.ts';

test('an incoming parcel stays in Așteptare until reception opens its stock detail', () => {
  const state = makeInitialState();
  assert.equal(activeParcelSection('/incoming/new', state.shipments), 'waiting');
  assert.equal(isDetailPath('/incoming/new'), true);

  const received = transition(state, { type: 'receiveIncoming', id: state.incoming[0].id });
  assert.equal(received.result.ok, true);
  const detail = `/warehouse/${received.result.id}`;
  assert.equal(activeParcelSection(detail, received.state.shipments), 'warehouse');
  assert.equal(isDetailPath(detail), true);
  assert.equal(activeParcelSection('/shipment/new', received.state.shipments), 'warehouse');
});

test('a shipment detail moves from Trimise to Primite without changing its URL', () => {
  const created = transition(makeInitialState(), {
    type: 'createShipment',
    input: { warehouseItemIds: ['WH-1001', 'WH-1002'], addressId: 'ADDR-1', method: 'Avion', localDelivery: 'Depozitul nostru', services: [] },
  });
  assert.equal(created.result.ok, true);
  const id = created.result.id;
  const detail = `/shipment/${id}`;
  let state = created.state;
  assert.equal(activeParcelSection(detail, state.shipments), 'shipments', 'preparation is visible under Trimise');
  assert.equal(isDetailPath(detail), true);

  const blocked = transition(state, { type: 'advanceShipment', id });
  assert.equal(blocked.result.ok, false);
  assert.equal(activeParcelSection(detail, blocked.state.shipments), 'shipments', 'an unpaid attempt must not move the selected section');
  const invoice = state.invoices.find(item => item.shipmentId === id);
  const paid = transition(state, { type: 'payInvoice', id: invoice.id });
  assert.equal(paid.result.ok, true);
  state = paid.state;

  for (const [expectedStatus, expectedSection] of [['Trimise', 'shipments'], ['Reținere vamală', 'shipments'], ['Primit', 'received']]) {
    const next = transition(state, { type: 'advanceShipment', id });
    assert.equal(next.result.ok, true);
    state = next.state;
    assert.equal(state.shipments.find(item => item.id === id).status, expectedStatus);
    assert.equal(activeParcelSection(detail, state.shipments), expectedSection);
  }
  assert.equal(activeParcelSection('/shipments', state.shipments), 'shipments', 'the active list remains a distinct destination');
  assert.equal(activeParcelSection('/received', state.shipments), 'received');
});

test('sidebar destinations do not select a parcel tab or show a detail back affordance', () => {
  const state = makeInitialState();
  for (const path of ['/', '/shopping', '/account', '/cart', '/balance', '/payments', '/loyalty', '/warehouse-addresses', '/address-book', '/calculator', '/notifications', '/settings', '/support']) {
    assert.equal(activeParcelSection(path, state.shipments), null, path);
    assert.equal(isDetailPath(path), false, path);
  }
  assert.equal(activeParcelSection('/order/ORDER-TEST', state.shipments), null);
  assert.equal(isDetailPath('/order/ORDER-TEST'), true);
});

test('a live account has one clear invoice destination independent of balance and warehouse addresses', () => {
  const items = drawerGroups(true).flatMap(group => group.items);
  assert.equal(items.filter(item => item.href === '/payments').length, 1);
  assert.equal(items.find(item => item.href === '/payments').label, 'accountOps.payments');
  assert.equal(items.filter(item => item.href === '/balance').length, 1);
  assert.equal(items.filter(item => item.href === '/warehouse-addresses').length, 1);
  assert.equal(new Set(items.map(item => item.href)).size, items.length, 'drawer destinations must not be duplicated across groups');

  for (const item of items) {
    assert.equal(isDetailPath(item.href), false, `Drawer destination ${item.href} must open as a normal primary page`);
    assert.equal(activeLiveParcelSection(item.href, []), item.href === '/received' ? 'received' : null, `Drawer destination ${item.href} must not select an unrelated parcel stage`);
  }
});

test('invoice and address deep links retain their normal-page classification', () => {
  for (const path of ['/payments', '/warehouse-addresses', '/loyalty']) {
    for (const suffix of ['', '/', '?source=overview', '/?source=drawer', '#details']) {
      assert.equal(isDetailPath(`${path}${suffix}`), false, `${path}${suffix}`);
      assert.equal(activeLiveParcelSection(`${path}${suffix}`, [], 'received'), null, `${path}${suffix}`);
    }
  }
  assert.equal(isDetailPath('/recipient/new'), true, 'recipient editing is still a detail flow');
  assert.equal(isDetailPath('/warehouse-addresses/unknown'), true, 'unknown nested routes are not promoted to primary pages');
});

test('the permanent bar shows active parcel stages and support; received history remains in the drawer', () => {
  assert.deepEqual(parcelTabs.map(tab => tab.key), ['waiting', 'warehouse', 'shipments', 'support']);
  for (const tab of parcelTabs) {
    assert.ok(tab.icon && tab.activeIcon, `${tab.key} retains its visible icon in both states`);
    assert.equal(activeLiveParcelSection(`/${tab.key}`, []), tab.key === 'support' ? null : tab.key);
  }
  const tabPaths = new Set(parcelTabs.map(tab => `/${tab.key}`));
  for (const authenticated of [false, true]) {
    assert.equal(drawerGroups(authenticated).flatMap(group => group.items).some(item => tabPaths.has(item.href)), false, 'parcel tabs are not duplicated in the drawer');
  }
  const demoPaths = drawerGroups(false).flatMap(group => group.items).map(item => item.href);
  assert.ok(demoPaths.includes('/received'), 'received parcels remain reachable');
  assert.equal(demoPaths.includes('/payments'), false, 'payments is protected by live authentication');
  assert.equal(demoPaths.includes('/loyalty'), false, 'loyalty is protected by live authentication');
  assert.ok(demoPaths.includes('/balance') && demoPaths.includes('/warehouse-addresses'));
});

test('deep-link query strings and trailing slashes preserve the same navigation destination', () => {
  const state = makeInitialState();
  for (const [path, section] of [['/waiting', 'waiting'], ['/warehouse', 'warehouse'], ['/shipments', 'shipments'], ['/received', 'received']]) {
    for (const suffix of ['/', '?focus=demo', '/?focus=demo']) {
      assert.equal(activeParcelSection(`${path}${suffix}`, state.shipments), section);
      assert.equal(isDetailPath(`${path}${suffix}`), false, `${path}${suffix}`);
    }
  }
  const delivered = state.shipments.find(item => item.status === 'Primit');
  assert.equal(activeParcelSection(`/shipment/${encodeURIComponent(delivered.id)}/?source=notification`, state.shipments), 'received');
});

test('an unknown or malformed shipment link cannot crash or select an unrelated section', () => {
  const state = makeInitialState();
  for (const path of ['/shipment/MISSING', '/shipment/%', '/shipment/%ZZ', '/shipment/%E0%A4%A', '/unknown', '/shipment-history', '/warehouse-addresses/unknown', '/shipments/unknown']) {
    let active;
    assert.doesNotThrow(() => { active = activeParcelSection(path, state.shipments); }, path);
    assert.equal(active, null, path);
    assert.equal(isDetailPath(path), true, path);
  }
});

test('restored shipment records resolve encoded deep links without modifying persisted data', () => {
  const shipment = Object.freeze({ id: 'SHIP DEMO 42', status: 'Primit' });
  const shipments = Object.freeze([shipment]);
  assert.equal(activeParcelSection('/shipment/SHIP%20DEMO%2042', shipments), 'received');
  assert.deepEqual(shipments, [{ id: 'SHIP DEMO 42', status: 'Primit' }]);
  assert.equal(activeParcelSection('/shipment/SHIP%20DEMO%2042', []), null, 'a stale link after resetting the demo has no selected section');
});

test('a live detail section survives country-cache changes and overrides an older list status', () => {
  assert.equal(activeLiveParcelSection('/shipment/123', [], 'received'), 'received');
  assert.equal(activeLiveParcelSection('/shipment/123', [{ id: '123', status: 'Trimise' }], 'received'), 'received');
  assert.equal(activeLiveParcelSection('/shipment/123', [{ id: '123', status: 'Primit' }], 'shipments'), 'shipments');
  assert.equal(activeLiveParcelSection('/shipment/123', [{ id: '123', status: 'Primit' }], 'invalid'), 'received');
  assert.equal(activeLiveParcelSection('/shipment/new', [], 'received'), 'warehouse');
  assert.equal(activeLiveParcelSection('/shipment/%zz', [], 'received'), null);
});
