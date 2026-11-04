import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeWaitingDetail, normalizeStockDeclaration, normalizeOutgoingDeclaration } from '../src/api/operations-normalize.ts';
import { declarationForDisplay, declarationForEditing, applyDeclarationCurrency, declarationCurrencySubmission, commonDeclarationCurrency } from '../src/features/live/forms/declaration-currency.ts';
import { planMutation } from '../src/api/operations-contracts.ts';

const warehouse = { currencyId: '5', availableCurrencies: [{ id: '5', title: 'RON', sign: 'RON' }, { id: '2', title: 'EUR', sign: '€' }, { id: '8', title: 'PLN', sign: 'PLN' }] };
const raw = { id: '9', title: 'Cotton shirt', url: 'https://example.test/shirt', quantity: '2', price: '50.00', currencyPrice: '10.00', currencyId: '2' };
const waiting = rows => normalizeWaitingDetail({ id: '1', storage: 'ro', price: '50.00', currency: 'RON', declarations: rows, invoices: [], customsDocs: [] });

test('waiting and stock edit the original value, not a value converted into warehouse currency', () => {
  const documents = [waiting([raw]), normalizeStockDeclaration({ title: 'Parcel', currency: 'eur', declarationItems: [{ ...raw, declarationItemId: '9' }], invoiceFiles: [], customsFiles: [] })];
  for (const document of documents) {
    const item = document.items[0];
    assert.equal(item.price, '10.00');
    assert.equal(item.originalPrice, '10.00');
    assert.equal(item.warehousePrice, '50.00');
    assert.equal(item.priceBasis, 'original');
    assert.equal(declarationForDisplay(item, warehouse).currency, 'eur');
    const editable = declarationForEditing(item, warehouse);
    assert.equal(editable.currencyId, '2');
    assert.equal(editable.currency, 'eur');
    assert.equal(editable.price, '10.00');
    assert.equal(editable.requiresPriceEntry, false);
  }
});

test('missing foreign original amount is readable in warehouse currency and cannot silently be reconverted', () => {
  const item = waiting([{ ...raw, currencyPrice: null }]).items[0];
  assert.equal(item.price, '50.00');
  assert.equal(declarationForDisplay(item, warehouse).currency, 'ron');
  const draft = declarationForEditing(item, warehouse);
  assert.equal(draft.price, '');
  assert.equal(draft.currency, 'eur');
  assert.equal(draft.requiresPriceEntry, true);
  const [changed] = applyDeclarationCurrency([draft], '8', 'pln');
  assert.equal(changed.price, '', 'choosing another currency must not restore a converted value');
  assert.equal(declarationForDisplay(item).currency, null, 'no symbol-to-code inference when warehouse data is unavailable');
  const codeOnly = waiting([{ ...raw, currencyPrice: null, currencyId: null, currency: 'eur' }]).items[0];
  assert.equal(declarationForEditing(codeOnly, warehouse).price, '', 'a foreign code without an ID still cannot relabel a converted amount');
});

test('legacy warehouse values and explicit zero originals remain valid without fabrication', () => {
  for (const currencyId of [null, '5']) {
    const draft = declarationForEditing(waiting([{ ...raw, currencyPrice: null, currencyId }]).items[0], warehouse);
    assert.equal(draft.price, '50.00');
    assert.equal(draft.currency, 'ron');
    assert.equal(draft.requiresPriceEntry, false);
  }
  for (const currencyPrice of [0, '0', '0.00']) {
    const item = waiting([{ ...raw, currencyPrice }]).items[0];
    assert.equal(item.price, String(currencyPrice));
    assert.equal(item.priceBasis, 'original');
  }
});

test('mixed waiting edit preserves row currencies and omits top-level override', () => {
  const rows = waiting([raw, { ...raw, id: '10', price: '7.20', currencyPrice: '7.20', currencyId: '5' }]).items.map(item => declarationForEditing(item, warehouse));
  const choice = declarationCurrencySubmission(rows, 'waiting-edit', warehouse, null);
  assert.deepEqual(choice, { currencyCode: null, error: null });
  assert.equal(commonDeclarationCurrency(rows), null);
  const input = { storage: 'ro', tracking: 'BAYQA-123', declarations: rows.map(item => ({ id: item.id, title: item.title, url: item.url, quantity: String(item.quantity), price: item.price, currency: item.currency })) };
  const plan = planMutation({ kind: 'waiting.edit', id: '1', input });
  assert.equal('currency' in plan.fields, false);
  assert.deepEqual(JSON.parse(plan.fields.declarations).map(item => [item.price, item.currency]), [['10.00', 'eur'], ['7.20', 'ron']]);
  assert.equal(declarationCurrencySubmission(rows, 'stock', warehouse, null).error, 'declarationCurrency.stockMixed');
});

test('explicit currency selection updates every row without changing amounts and allows a single-currency stock save', () => {
  const before = [{ price: '10.00', currency: 'eur', currencyId: '2' }, { price: '7.20', currency: 'ron', currencyId: '5' }];
  const changed = applyDeclarationCurrency(before, '8', 'PLN');
  assert.deepEqual(changed.map(item => [item.price, item.currency, item.currencyId]), [['10.00', 'pln', '8'], ['7.20', 'pln', '8']]);
  assert.equal(before[0].currency, 'eur');
  assert.deepEqual(declarationCurrencySubmission(changed, 'stock', warehouse, '8'), { currencyCode: 'pln', error: null });
  assert.equal(declarationCurrencySubmission(before, 'waiting-edit', warehouse, '8').error, 'declarationCurrency.unavailable', 'top-level and row currency may never disagree');
  assert.equal(declarationCurrencySubmission([{ price: '1', currency: 'usd' }], 'waiting-new', warehouse, null).error, 'declarationCurrency.unavailable');
});

test('outgoing converted values do not establish a safe editing currency from declarationCurrency', () => {
  const document = normalizeOutgoingDeclaration({ items: [{ ...raw, currency: 'eur' }], declarationCurrency: '2', availableStorageCurrencies: { 2: 'eur', 5: 'ron' } });
  assert.equal(document.items[0].price, '50.00');
  assert.equal(document.currencyCode, null);
  assert.equal(document.items[0].currency, null);
  assert.equal(document.amountsVerified, false);
  assert.equal(normalizeOutgoingDeclaration({ items: [], declarationCurrency: '2', availableStorageCurrencies: { 2: 'eur' } }).amountsVerified, true);
});

test('additive outgoing contract verifies original values and known warehouse values without conversion', () => {
  const payload = { priceSemantics: 'line-total', warehouseCurrencyId: '5', declarationCurrency: '2', availableStorageCurrencies: { 2: 'eur', 5: 'ron' }, items: [raw, { ...raw, id: '10', currencyPrice: null }] };
  const document = normalizeOutgoingDeclaration(payload);
  assert.equal(document.amountsVerified, true);
  assert.deepEqual(document.items.map(item => [item.price, item.currency, item.currencyId]), [['10.00', 'eur', '2'], ['50.00', 'ron', '5']]);
  assert.equal(declarationCurrencySubmission(document.items, 'shipment', warehouse, null).error, 'declarationCurrency.shipmentMixed');
  const selected = applyDeclarationCurrency(document.items, '2', 'eur');
  assert.deepEqual(selected.map(item => item.price), ['10.00', '50.00'], 'amounts must be reviewed by the user, never converted locally');
  assert.deepEqual(declarationCurrencySubmission(selected, 'shipment', warehouse, '2'), { currencyCode: 'eur', error: null });
  assert.equal(normalizeOutgoingDeclaration({ ...payload, warehouseCurrencyId: null }).amountsVerified, false);
  assert.equal(normalizeOutgoingDeclaration({ ...payload, items: [{ ...raw, currencyId: null }] }).amountsVerified, false);
  assert.equal(normalizeOutgoingDeclaration({ ...payload, priceSemantics: undefined }).amountsVerified, false);
  assert.equal(normalizeOutgoingDeclaration({ ...payload, availableStorageCurrencies: { 2: '€', 5: 'ron' } }).amountsVerified, false);
});
