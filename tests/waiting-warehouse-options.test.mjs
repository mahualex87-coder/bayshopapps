import test from 'node:test';
import assert from 'node:assert/strict';
import { waitingWarehouseOption, waitingWarehouseOptions } from '../src/domain/waiting-warehouse-options.ts';
import { normalizeWarehousesData } from '../src/api/normalize.ts';
import { invoiceRequirementError, OperationValidationError, planMutation } from '../src/api/operations-contracts.ts';
import { warehouseForStorage } from '../src/api/operations-normalize.ts';
import { sortCountries } from '../src/domain/option-order.ts';

// Synthetic storage titles deliberately differ from ISO codes: values must come
// from WarehouseListController's storage.title, not a local country mapping.
const raw = [
  ['20', 'PL', 'pl-hub-server', 'Polonia', '8', 'pln', '1'],
  ['18', 'IT', 'Italy server title', 'Italia', '2', 'eur', '0'],
  ['7', 'GB', 'uk', 'Regatul Unit', '3', 'gbp', '0'],
  ['14', 'US', 'usa', 'SUA', '1', 'usd', '0'],
  ['12', 'RO', 'ro', 'România', '5', 'ron', '1'],
  ['4', 'DE', 'de', 'Germania', '2', 'eur', '0'],
].map(([id, countryCode, title, countryTitle, currencyId, code, requireInvoiceUpload]) => ({
  id, countryCode, title, countryTitle, currencyId, requireInvoiceUpload,
  availableCurrencies: [{ id: currencyId, title: code, currency_sign: code }],
}));
const declaration = { title: 'Product', quantity: '2', price: '12.50', url: 'https://example.test/item' };

test('all eligible warehouses, including IT and PL, use the exact API title in create and edit bodies', () => {
  const rows = normalizeWarehousesData(raw);
  const options = sortCountries(waitingWarehouseOptions(rows), item => ({ code: item.countryCode }));
  assert.deepEqual(options.map(item => item.countryCode), ['US', 'RO', 'GB', 'IT', 'DE', 'PL']);
  for (const warehouse of rows) {
    const option = options.find(item => item.countryCode === warehouse.code);
    assert.equal(option.value, warehouse.sourceTitle);
    assert.equal(option.availableCurrencies, warehouse.availableCurrencies);
    assert.equal(option.currencyId, warehouse.currencyId);
    assert.equal(option.requireInvoiceUpload, warehouse.requireInvoiceUpload);
    const currency = option.availableCurrencies.find(item => item.id === option.currencyId).title;
    for (const kind of ['waiting.create', 'waiting.edit']) {
      const input = { storage: option.value, tracking: 'TRACK-123', declarations: [{ ...declaration, currency }], invoiceList: ['21'] };
      const plan = planMutation({ kind, ...(kind === 'waiting.edit' ? { id: '91' } : {}), input });
      assert.equal(plan.path, kind === 'waiting.create' ? '/api/waiting-mf/' : '/api/waiting-mf/91');
      assert.equal(plan.fields.storage, warehouse.sourceTitle);
      assert.equal(JSON.parse(plan.fields.declarations)[0].currency, currency);
      assert.equal(JSON.parse(plan.fields.declarations)[0].price, '12.50');
      assert.deepEqual(plan.fields['invoiceList[]'], ['21']);
    }
    assert.equal(invoiceRequirementError(option.requireInvoiceUpload, 0, 0), ['RO', 'PL'].includes(warehouse.code) ? 'parcelForm.invoiceRequired' : null);
  }
});

test('translated display names never change warehouse write identity and missing aliases never fall back to numeric IDs', () => {
  const original = normalizeWarehousesData(raw);
  const translated = normalizeWarehousesData(raw.map(item => ({ ...item, countryTitle: `Перевод ${item.countryCode}` })));
  assert.deepEqual(waitingWarehouseOptions(translated).map(item => item.value), waitingWarehouseOptions(original).map(item => item.value));
  for (const item of original) assert.equal(warehouseForStorage(translated, item.sourceTitle)?.id, item.id);
  assert.equal(waitingWarehouseOption({ ...original[0], sourceTitle: null }), null);
  assert.equal(waitingWarehouseOption({ ...original[0], sourceTitle: undefined }), null);
  assert.equal(waitingWarehouseOptions(original.filter(item => item.code !== 'PL')).some(item => item.countryCode === 'PL'), false);
});

test('invalid storage input is rejected before a mutation without restricting legitimate server titles to a historical enum', () => {
  for (const storage of ['', ' ', null, 18, 'it\npl', 'it\u0000']) {
    assert.throws(() => planMutation({ kind: 'waiting.create', input: { storage, tracking: 'TRACK-123', declarations: [declaration] } }), OperationValidationError);
  }
});
