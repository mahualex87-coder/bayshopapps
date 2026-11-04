import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateDemo, cartTotal, makeInitialState, restoreDemoState, shipmentQuote, transition, validateRegistration } from '../src/state/demo.ts';

const clone = value => JSON.parse(JSON.stringify(value));
const deepFreeze = obj => { Object.values(obj).forEach(value => { if (value && typeof value === 'object') deepFreeze(value); }); return Object.freeze(obj); };
const reject = (state, action) => {
  const before = clone(state); const outcome = transition(state, action);
  assert.equal(outcome.result.ok, false); assert.ok(outcome.result.error); assert.equal(outcome.state, state); assert.deepEqual(state, before);
};
const shippingInput = { warehouseItemIds: ['WH-1001', 'WH-1002'], addressId: 'ADDR-1', method: 'Avion', localDelivery: 'Depozitul nostru', services: ['Fotografii'] };

test('synthetic fixtures cover parcel stages, ledger balances and valid restoration', () => {
  const state = makeInitialState();
  assert.equal(state.warehouse.length, 8); assert.equal(state.warehouse.filter(i => !i.shipmentId).length, 4);
  assert.equal(state.shipments.length, 4); assert.equal(new Set(state.shipments.map(s => s.status)).size, 4);
  assert.equal(state.incoming.length, 2); assert.equal(state.cart.length, 2); assert.equal(state.orders.length, 2);
  assert.equal(state.invoices.length, 4); assert.equal(state.notifications.length, 4); assert.equal(state.tickets.length, 1);
  assert.equal(state.addresses.length, 2); assert.equal(state.transactions.length, 9);
  for (const currency of Object.keys(state.balances)) {
    const entries = state.transactions.filter(t => t.currency === currency).toReversed(); let balance = 0;
    for (const entry of entries) { balance = Math.round((balance + entry.amount) * 100) / 100; assert.equal(entry.balanceAfter, balance); }
    assert.equal(balance, state.balances[currency]);
  }
  assert.deepEqual(restoreDemoState(state), state);
  assert.equal(JSON.stringify(state).includes('BayShopDemo!'), false);
});

test('checkout debits only USD exactly once and cancellation refunds once', () => {
  const state = deepFreeze(makeInitialState()); const total = cartTotal(state.cart);
  assert.equal(total, 45);
  const checked = transition(state, { type: 'checkoutCart' }); assert.equal(checked.result.ok, true);
  assert.equal(state.cart.length, 2); assert.equal(checked.state.cart.length, 0);
  assert.equal(checked.state.balances.USD, state.balances.USD - total); assert.equal(checked.state.balances.EUR, state.balances.EUR);
  assert.equal(checked.state.orders[0].total, total); assert.equal(checked.state.transactions[0].reference, checked.result.id);
  reject(checked.state, { type: 'checkoutCart' });
  const canceled = transition(checked.state, { type: 'cancelOrder', id: checked.result.id });
  assert.equal(canceled.state.balances.USD, state.balances.USD); assert.equal(canceled.state.orders[0].status, 'Anulat');
  reject(canceled.state, { type: 'cancelOrder', id: checked.result.id });
});

test('checkout, invoice payment and withdrawals fail atomically when funds are insufficient', () => {
  const state = makeInitialState(); state.balances.USD = 1;
  reject(state, { type: 'checkoutCart' }); reject(state, { type: 'payInvoice', id: 'INV-2401' }); reject(state, { type: 'requestWithdrawal', amount: 2, currency: 'USD' });
});

test('financial actions reject invalid amounts and currencies without changing any state', () => {
  const state = deepFreeze(makeInitialState());
  for (const amount of [0, -1, NaN, Infinity, 1.005, 100000.01]) {
    for (const type of ['topUp', 'requestWithdrawal']) reject(state, { type, amount, currency: 'USD' });
  }
  reject(state, { type: 'topUp', amount: 10, currency: 'BAD' });
});

test('top-up and withdrawal keep currencies isolated and ledger cents coherent', () => {
  const initial = makeInitialState();
  const topped = transition(initial, { type: 'topUp', amount: 20.15, currency: 'EUR' }).state;
  const withdrawn = transition(topped, { type: 'requestWithdrawal', amount: 10.05, currency: 'EUR' }).state;
  assert.equal(withdrawn.balances.EUR, 90.1); assert.equal(withdrawn.balances.USD, initial.balances.USD);
  assert.equal(withdrawn.transactions[0].amount, -10.05); assert.equal(withdrawn.transactions[0].balanceAfter, 90.1);
  assert.deepEqual(restoreDemoState(withdrawn), withdrawn);
});

test('cart pricing applies quantity to product, local shipping and inspection once per line', () => {
  const line = { ...makeInitialState().cart[0], unitPrice: 10.25, quantity: 3, localShipping: 2, inspection: true };
  assert.equal(cartTotal([line]), 35.75);
  const state = makeInitialState();
  for (const quantity of [0, -1, 1.5, 101, NaN]) reject(state, { type: 'updateCartQuantity', id: state.cart[0].id, quantity });
  reject(state, { type: 'addCart', item: { ...line, url: 'javascript:alert(1)' } });
});

test('incoming tracking is case insensitive and receive is a one-time transition', () => {
  const state = makeInitialState(); const input = { ...state.incoming[0], tracking: ` ${state.incoming[0].tracking.toLowerCase()} ` };
  reject(state, { type: 'addIncoming', input });
  reject(state, { type: 'addIncoming', input: { ...input, tracking: state.warehouse[0].tracking } });
  const result = transition(state, { type: 'receiveIncoming', id: 'INC-901' });
  assert.equal(result.result.ok, true); assert.equal(result.state.incoming[0].status, 'Recepționat');
  const warehouse = result.state.warehouse.find(w => w.id === result.result.id);
  assert.ok(warehouse); assert.equal(warehouse.tracking, state.incoming[0].tracking); assert.equal(warehouse.declared, true);
  assert.deepEqual(warehouse.items, state.incoming[0].items); assert.equal(result.state.warehouse.length, 9);
  reject(result.state, { type: 'receiveIncoming', id: 'INC-901' });
});

test('incoming requires complete declaration, valid warehouse and active recipient', () => {
  const state = makeInitialState(); const input = { ...state.incoming[0], tracking: 'DEMO-NEW-123' };
  reject(state, { type: 'addIncoming', input: { ...input, warehouseId: 'XX' } });
  reject(state, { type: 'addIncoming', input: { ...input, addressId: 'MISSING' } });
  reject(state, { type: 'addIncoming', input: { ...input, items: [] } });
  reject(state, { type: 'addIncoming', input: { ...input, items: [{ ...input.items[0], quantity: 0 }] } });
  const outcome = transition(state, { type: 'addIncoming', input });
  assert.equal(outcome.result.ok, true); assert.equal(outcome.state.incoming[0].tracking, 'DEMO-NEW-123');
});

test('shipment creation rejects undeclared, mixed-depot, duplicate and allocated items atomically', () => {
  const state = deepFreeze(makeInitialState());
  for (const ids of [[], ['WH-1003'], ['WH-1001', 'WH-1004'], ['WH-1001', 'WH-1001'], ['WH-1101'], ['MISSING']]) {
    reject(state, { type: 'createShipment', input: { ...shippingInput, warehouseItemIds: ids } });
  }
  reject(state, { type: 'createShipment', input: { ...shippingInput, addressId: 'MISSING' } });
});

test('shipment atomically allocates items, quotes USD, creates invoice and requires payment before advancing', () => {
  const state = makeInitialState(); const outcome = transition(state, { type: 'createShipment', input: shippingInput });
  assert.equal(outcome.result.ok, true);
  const shipment = outcome.state.shipments[0]; const invoice = outcome.state.invoices[0];
  assert.equal(invoice.status, 'Neachitată'); assert.equal(invoice.currency, 'USD'); assert.equal(invoice.shipmentId, shipment.id);
  assert.equal(outcome.state.balances.USD, state.balances.USD); assert.equal(outcome.state.transactions.length, state.transactions.length);
  assert.equal(shipment.weightKg, 1.6); assert.equal(shipment.volumetricKg, 1.92);
  assert.deepEqual(shipment.costs, { shipping: 21.36, services: 4, handling: 2, importTax: 0 }); assert.equal(invoice.amount, 27.36);
  assert.ok(shippingInput.warehouseItemIds.every(id => outcome.state.warehouse.find(w => w.id === id).shipmentId === shipment.id));
  reject(outcome.state, { type: 'createShipment', input: shippingInput }); reject(outcome.state, { type: 'advanceShipment', id: shipment.id });
  const paid = transition(outcome.state, { type: 'payInvoice', id: invoice.id }); assert.equal(paid.state.balances.USD, 357.64);
  reject(paid.state, { type: 'payInvoice', id: invoice.id });
  let next = paid.state;
  for (const status of ['Trimise', 'Reținere vamală', 'Primit']) {
    const advanced = transition(next, { type: 'advanceShipment', id: shipment.id }); assert.equal(advanced.result.ok, true);
    next = advanced.state; assert.equal(next.shipments[0].status, status); assert.equal(next.shipments[0].events.at(-1).label, status);
  }
  assert.equal(next.shipments[0].events.length, 4); reject(next, { type: 'advanceShipment', id: shipment.id });
  reject(next, { type: 'updateLocalDelivery', id: shipment.id, localDelivery: 'Livrare la domiciliu' });
  assert.deepEqual(restoreDemoState(next), next);
});

test('quote helpers agree on arrays and numerical inputs; services are deduplicated', () => {
  const items = makeInitialState().warehouse.slice(0, 2);
  assert.deepEqual(shipmentQuote(items, ['A', 'A']), shipmentQuote(1.6, 1));
});

test('declaration gates shipping and cannot change after allocation', () => {
  const state = makeInitialState(); const declaration = [{ id: 'D-new', name: 'Cablu test', url: '', quantity: 1, unitPrice: 12.5 }];
  reject(state, { type: 'declareItem', id: 'WH-1003', items: [], documentNames: [] });
  const declared = transition(state, { type: 'declareItem', id: 'WH-1003', items: declaration, documentNames: ['demo.pdf', 'demo.pdf'] });
  assert.equal(declared.state.warehouse[2].declared, true); assert.deepEqual(declared.state.warehouse[2].documentNames, ['demo.pdf']);
  const shipped = transition(declared.state, { type: 'createShipment', input: { ...shippingInput, warehouseItemIds: ['WH-1003'] } });
  assert.equal(shipped.result.ok, true);
  reject(shipped.state, { type: 'declareItem', id: 'WH-1003', items: declaration, documentNames: [] });
});

test('warehouse services deduplicate normalized names and cannot change allocated items', () => {
  const state = makeInitialState(); const next = transition(state, { type: 'requestService', id: 'WH-1001', service: ' Fotografii ' }).state;
  reject(next, { type: 'requestService', id: 'WH-1001', service: 'fotografii' });
  assert.deepEqual(next.warehouse[0].serviceRequests, ['Fotografii']);
  reject(next, { type: 'requestService', id: 'WH-1101', service: 'Fotografii' });
});

test('recipient archival protects active parcels and last active recipient', () => {
  const state = makeInitialState(); reject(state, { type: 'archiveAddress', id: 'ADDR-1' }); reject(state, { type: 'archiveAddress', id: 'ADDR-2' });
  const added = transition(state, { type: 'addAddress', input: { ...state.addresses[1], city: 'Alt Oraș Test' } });
  assert.equal(added.result.ok, true);
  const archived = transition(added.state, { type: 'archiveAddress', id: added.result.id }); assert.equal(archived.result.ok, true);
  reject(archived.state, { type: 'createShipment', input: { ...shippingInput, addressId: added.result.id } });
  const last = makeInitialState(); last.addresses = [last.addresses[0]]; last.shipments = []; last.incoming = [];
  reject(last, { type: 'archiveAddress', id: 'ADDR-1' });
});

test('demo authentication and registration validation never persist the exercise password', () => {
  assert.equal(authenticateDemo(' DEMO@BAYSHOP.TEST ', 'BayShopDemo!').ok, true);
  assert.equal(authenticateDemo('demo@bayshop.test', 'wrong').ok, false);
  const input = { firstName: 'User', lastName: 'Test', email: 'user@example.test', phone: '+373 00 000 000', password: 'TestPassword9', accepted: true };
  assert.equal(validateRegistration(input).ok, true);
  for (const patch of [{ firstName: '' }, { email: 'not-email' }, { phone: 'abc' }, { password: 'abc' }, { accepted: false }]) assert.equal(validateRegistration({ ...input, ...patch }).ok, false);
  const next = transition(makeInitialState(), { type: 'updateProfile', input: { firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone } });
  assert.equal(JSON.stringify(next.state).includes(input.password), false);
  assert.equal(authenticateDemo(input.email, input.password).ok, false);
});

test('saved data validates nested shapes and fails closed for incompatible/corrupt payloads', () => {
  for (const value of [null, {}, [], { version: 1 }]) assert.equal(restoreDemoState(value), null);
  const changes = [s => { s.orders[0].items = null; }, s => { s.incoming[0].items = 'bad'; }, s => { s.incoming[0].items = [null]; }, s => { s.warehouse[0].serviceRequests = null; }, s => { s.shipments[0].events = [null]; }, s => { s.shipments[0].costs.shipping = 'bad'; }, s => { s.tickets[0].replies = [{}]; }, s => { s.notifications[0].read = 'false'; }, s => { s.balances.USD = NaN; }, s => { s.cart[0].name = null; }];
  for (const mutate of changes) { const state = makeInitialState(); mutate(state); assert.equal(restoreDemoState(state), null); }
});

test('transition is deterministic and reset restores all fixture data', () => {
  const state = deepFreeze(makeInitialState()); const action = { type: 'topUp', amount: 20, currency: 'USD' };
  assert.deepEqual(transition(state, action), transition(state, action));
  const updated = transition(state, action).state;
  assert.deepEqual(transition(updated, { type: 'reset' }).state, makeInitialState());
});

test('restoration rejects unknown depot IDs before the shipment wizard can resolve labels', () => {
  for (const collection of ['incoming', 'warehouse', 'shipments']) {
    const state = makeInitialState();
    state[collection][0].warehouseId = 'UNKNOWN';
    assert.equal(restoreDemoState(state), null, `${collection}: invalid depot must fall back to seed data`);
  }
  assert.ok(restoreDemoState(makeInitialState()));
});


test('legacy fixture labels upgrade by identity without replacing user edits or ledger values', () => {
  let state = transition(makeInitialState(), { type: 'topUp', amount: 7.25, currency: 'EUR' }).state;
  state.warehouse[0].name = 'Sneakers · exemplu';
  state.warehouse[0].tracking = 'DEMO-US-1001';
  state.warehouse[0].documentNames = ['factura-exemplu-1001.pdf', 'document-personal.pdf'];
  state.warehouse[0].items[0].name = 'Sneakers de test';
  state.warehouse[1].name = 'Tricou ales de mine · demo';
  state.addresses[0].city = 'Oraș Demo';
  state.addresses[1].city = 'Adresa modificată';
  state.shipments[1].events[0].detail = 'Eveniment sintetic pentru testarea traseului.';
  state.transactions.find(item => item.id === 'TX-7').label = 'Comandă demo ORD-201';
  const custom = { ...clone(state.warehouse[0]), id: 'WH-PERSONAL', tracking: 'PERSONAL-001', name: 'Sneakers · exemplu' };
  state.warehouse.push(custom);
  const before = clone(state);
  const restored = restoreDemoState(deepFreeze(state));
  assert.ok(restored);
  assert.equal(restored.warehouse[0].name, 'Sneakers albi');
  assert.equal(restored.warehouse[0].tracking, 'US-1001');
  assert.deepEqual(restored.warehouse[0].documentNames, ['factura-1001.pdf', 'document-personal.pdf']);
  assert.equal(restored.warehouse[0].items[0].name, 'Sneakers albi');
  assert.equal(restored.warehouse[1].name, 'Tricou ales de mine · demo');
  assert.deepEqual(restored.warehouse.at(-1), custom);
  assert.equal(restored.addresses[0].city, 'Chișinău');
  assert.equal(restored.addresses[1].city, 'Adresa modificată');
  assert.equal(restored.shipments[1].events[0].detail, 'Etapă înregistrată în istoricul expedierii.');
  assert.deepEqual(restored.balances, before.balances);
  assert.deepEqual(restored.transactions.map(({ label, ...transaction }) => transaction), before.transactions.map(({ label, ...transaction }) => transaction));
  assert.equal(restored.transactions.find(item => item.id === 'TX-7').label, 'Comandă ORD-201');
  assert.equal(restored.version, 2); assert.equal(restored.seq, before.seq);
  assert.deepEqual(state, before);
  assert.deepEqual(restoreDemoState(restored), restored, 'label upgrade is idempotent');
});

test('fixture tracking upgrades preserve received links and avoid user tracking collisions', () => {
  const state = makeInitialState();
  state.incoming[0].tracking = 'DEMO-WAIT-901';
  const received = transition(state, { type: 'receiveIncoming', id: 'INC-901' });
  assert.equal(received.result.ok, true);
  const restored = restoreDemoState(received.state);
  assert.equal(restored.incoming.find(item => item.id === 'INC-901').tracking, 'US-0901');
  assert.equal(restored.warehouse.find(item => item.id === received.result.id).tracking, 'US-0901');
  const withCollision = makeInitialState();
  withCollision.warehouse[0].tracking = 'DEMO-US-1001';
  withCollision.incoming.push({ ...clone(withCollision.incoming[0]), id: 'INC-PERSONAL', tracking: 'US-1001' });
  const preserved = restoreDemoState(withCollision);
  assert.equal(preserved.warehouse[0].tracking, 'DEMO-US-1001');
  assert.equal(preserved.incoming.at(-1).tracking, 'US-1001');
});
