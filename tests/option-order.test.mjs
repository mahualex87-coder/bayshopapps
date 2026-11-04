import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNTRY_ORDER, sortCountries, sortCountryOptions, sortCurrencies } from '../src/domain/option-order.ts';
import { countryCodes } from '../src/components/country-flags/names.ts';
import { parcelFilterCountries } from '../src/features/live/parcel-filter-countries.ts';
import { transactionHistoryPage } from '../src/domain/transaction-history.ts';
import { calculatorDefaults } from '../src/domain/calculator-defaults.ts';
import { defaultParcelQuery, localParcelPage } from '../src/api/parcel-pagination.ts';

test('country order uses ISO metadata across languages while retaining sentinel options, IDs and references', () => {
  const options = Object.freeze([
    { id: '9', code: 'RO', title: 'România' }, { id: 'all', title: 'Toate' },
    { id: '7', code: 'GB', title: 'Regatul Unit' }, { id: '4', code: 'DE', title: 'Germania' },
    { id: '5', code: 'US', title: 'SUA' }, { id: '3', code: 'MD', title: 'Moldova' },
    { id: '1', code: 'IT', title: 'Italia' }, { id: '2', code: 'PL', title: 'Polonia' },
    { id: '8', code: 'CA', title: 'Canada' }, { id: '', title: 'Alege țara' },
  ].map(Object.freeze));
  const before = structuredClone(options);
  const result = sortCountryOptions(options);
  assert.deepEqual(result.map(item => item.id), ['', 'all', '5', '9', '7', '1', '4', '2', '8', '3']);
  const translated = options.toReversed().map(item => ({ ...item, title: `Перевод ${item.id}` }));
  assert.deepEqual(sortCountryOptions(translated).map(item => item.id), result.map(item => item.id));
  assert.deepEqual(options, before);
  result.forEach(item => assert.ok(options.includes(item)));
});

test('all eligible country options survive sorting including options beyond 50, without adding unavailable choices', () => {
  const options = countryCodes.toReversed().map((code, index) => ({ id: String(1000 + index), code, title: code }));
  const result = sortCountryOptions(options);
  assert.ok(result.length > 200);
  assert.equal(result.length, options.length);
  assert.equal(new Set(result.map(item => item.id)).size, options.length);
  assert.deepEqual(result.slice(0, 6).map(item => item.code), [...COUNTRY_ORDER]);
  assert.ok(result.findIndex(item => item.code === 'ZW') > 50);
  const subset = options.filter(item => ['RO', 'DE'].includes(item.code));
  assert.deepEqual(sortCountryOptions(subset).map(item => item.code), ['RO', 'DE']);
});

test('country aliases and exact names resolve but numeric IDs never become guessed ISO codes', () => {
  const rows = [
    { id: '3', code: '3', title: 'Unknown' }, { id: '2', code: 'UK', title: 'Britain' },
    { id: '1', code: '1', title: 'Unknown' }, { id: '4', code: 'USA', title: 'America' },
    { id: '5', title: 'SUA' },
  ];
  assert.deepEqual(sortCountryOptions(rows).map(item => item.id), ['4', '5', '2', '1', '3']);
  const duplicate = rows[0];
  assert.deepEqual(sortCountries([duplicate, duplicate], item => ({ code: item.code })), [duplicate, duplicate]);
});

test('currency summaries use USD EUR RON GBP then alphabetical extras without changing amounts or eligibility', () => {
  const rows = Object.freeze(['gbp', 'CAD', 'RON', 'USD', 'JPY', 'EUR', 'AUD'].map((currency, index) => Object.freeze({ currency, amount: [-7.11, 1.01, 0, 1.23, 500, -12.34, 4.56][index] })));
  const before = structuredClone(rows);
  const ordered = sortCurrencies(rows, item => item.currency);
  assert.deepEqual(ordered.map(item => item.currency), ['USD', 'EUR', 'RON', 'gbp', 'AUD', 'CAD', 'JPY']);
  assert.deepEqual(rows, before);
  ordered.forEach(item => assert.ok(rows.includes(item)));
  assert.deepEqual(sortCurrencies(['GBP', 'RON'], code => code), ['RON', 'GBP']);
});

test('ordered currency filters do not regroup financial history or change chronological row references', () => {
  const rows = Object.freeze(['GBP', 'RON', 'EUR', 'USD', 'CAD'].map((currency, index) => Object.freeze({ id: String(index), currency, status: null, amount: index - 2, date: `2026-11-0${5 - index}`, label: currency })));
  const page = transactionHistoryPage(rows);
  assert.deepEqual(page.currencies, ['USD', 'EUR', 'RON', 'GBP', 'CAD']);
  assert.deepEqual(page.items, rows);
  page.items.forEach((item, index) => assert.equal(item, rows[index]));
});

test('local parcel filters retain accessible zero-count depots and received keeps only server choices', () => {
  const current = Object.freeze([{ code: 'RO', total: 3 }]);
  const addresses = [
    { id: 'us', countryCode: 'US', active: true, countryTitle: 'SUA' },
    { id: 'gb', countryCode: 'GB', active: true, countryTitle: 'Regatul Unit' },
    { id: 'de', countryCode: 'DE', active: false },
    { id: 'ro', countryCode: 'RO', active: true },
    { id: 'us-private', countryCode: 'USA', active: true },
    { id: 'unknown', countryCode: 'ZZ', active: true, countryTitle: 'Unknown' },
  ];
  for (const stage of ['waiting', 'warehouse', 'sent']) {
    const expected = [{ code: 'US', total: 0 }, { code: 'RO', total: 3 }, { code: 'GB', total: 0 }];
    assert.deepEqual(parcelFilterCountries(stage, current, addresses), expected);
    assert.deepEqual(parcelFilterCountries(stage, current, addresses.toReversed().map(row => ({ ...row, countryTitle: 'Перевод' }))), expected);
  }
  assert.deepEqual(parcelFilterCountries('received', current, addresses), current);
  assert.deepEqual(parcelFilterCountries('received', [...current, { code: 'GB', total: 0 }], addresses), [{ code: 'RO', total: 3 }, { code: 'GB', total: 0 }]);
  assert.deepEqual(current, [{ code: 'RO', total: 3 }]);
  const emptySelection = localParcelPage([{ id: 'ro-one', countryCode: 'RO', status: 'waiting' }], { ...defaultParcelQuery(), countryCode: 'US' }, 123);
  assert.equal(emptySelection.query.countryCode, 'US');
  assert.equal(emptySelection.total, 0);
  assert.deepEqual(emptySelection.items, []);
});

test('presentation ordering preserves the calculator US-to-account default and does not grant unavailable routes', () => {
  const options = {
    storages: [{ id: '14', code: 'RO', title: 'România', activeCountries: ['143'] }, { id: '4', code: 'US', title: 'SUA', activeCountries: ['143'] }],
    countries: [{ id: '175', code: 'RO', title: 'România' }, { id: '143', code: 'MD', title: 'Moldova' }],
  };
  const sorted = { ...options, storages: sortCountryOptions(options.storages), countries: sortCountryOptions(options.countries) };
  assert.deepEqual(calculatorDefaults(options, '143'), { storageId: '4', countryId: '143' });
  assert.deepEqual(calculatorDefaults(sorted, '143'), calculatorDefaults(options, '143'));
  assert.deepEqual(calculatorDefaults(sorted, '175'), { storageId: '4', countryId: '' });
});
