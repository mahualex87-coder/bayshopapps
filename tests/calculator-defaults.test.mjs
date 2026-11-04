import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatorDefaultDestination, calculatorDefaults } from '../src/domain/calculator-defaults.ts';

const options = (storages, countries = [{ id: '143', title: 'Moldova', code: 'MD' }, { id: '200', title: 'Romania', code: 'RO' }]) => ({ storages, countries, weights: [{ id: 'kg', title: 'kg' }], sizes: [{ id: 'cm', title: 'cm' }] });
const storage = (id, code, activeCountries, title = code) => ({ id, code, activeCountries, title });

test('US origin is selected by server code even when not first, retaining the exact server IDs', () => {
  const data = options([storage('12', 'RO', ['143']), storage('9001', 'US', ['143', '200'])]);
  assert.deepEqual(calculatorDefaults(data, '143'), { storageId: '9001', countryId: '143' });
  assert.deepEqual(calculatorDefaults(options([storage('0050', 'usa', ['143'])]), '143'), { storageId: '0050', countryId: '143' });
});

test('profile country is never replaced by another destination when the selected US route does not serve it', () => {
  const data = options([storage('12', 'RO', ['143']), storage('14', 'US', ['200'])]);
  assert.deepEqual(calculatorDefaults(data, '143'), { storageId: '14', countryId: '' });
  assert.equal(calculatorDefaultDestination(data, '12', '143'), '143');
  assert.equal(calculatorDefaultDestination(data, '14', '143'), '');
});

test('without an available US warehouse the fallback is an actual warehouse serving the account country', () => {
  const data = options([storage('14', 'US', []), storage('18', 'IT', ['200']), storage('7', 'GB', ['143'])]);
  assert.deepEqual(calculatorDefaults(data, '143'), { storageId: '7', countryId: '143' });
  assert.deepEqual(calculatorDefaults(data, null), { storageId: '18', countryId: '' });
});

test('unknown profile countries, unlisted routes and numeric-looking mismatches remain unselected', () => {
  const data = options([storage('14', 'US', ['143', '999'])]);
  for (const country of [undefined, null, '', '999', '0143', 'MD']) assert.deepEqual(calculatorDefaults(data, country), { storageId: '14', countryId: '' });
  assert.equal(calculatorDefaultDestination(data, 'missing', '143'), '');
  assert.deepEqual(calculatorDefaults(options([storage('14', 'US', ['999'])]), '143'), { storageId: '', countryId: '' });
  assert.deepEqual(calculatorDefaults(options([]), '143'), { storageId: '', countryId: '' });
});

test('translated labels do not change defaults or become evidence of a US warehouse, and source data stays intact', () => {
  const data = options([storage('20', 'PL', ['143'], 'USA'), storage('14', 'US', ['143'], 'США')]);
  const snapshot = structuredClone(data);
  assert.deepEqual(calculatorDefaults(data, '143'), { storageId: '14', countryId: '143' });
  assert.deepEqual(data, snapshot);
  const translated = { ...data, storages: data.storages.map(value => ({ ...value, title: 'Translated caption' })), countries: data.countries.map(value => ({ ...value, title: 'Translated country' })) };
  assert.deepEqual(calculatorDefaults(translated, '143'), calculatorDefaults(data, '143'));
});
