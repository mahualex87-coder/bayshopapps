import test from 'node:test';
import assert from 'node:assert/strict';
import { countryDisplayName, standaloneCountryLabel, currencyDisplayLabel } from '../src/domain/presentation-labels.ts';
import { localizeCountryOptions } from '../src/domain/option-order.ts';

test('country metadata resolves localized names without changing IDs or eligible options', () => {
  const options = Object.freeze([
    Object.freeze({ id: 'all', title: 'All' }),
    Object.freeze({ id: '18', countryCode: 'IT', title: 'Italia', availableCurrencies: ['EUR'] }),
    Object.freeze({ id: '12', code: 'RO', title: 'România' }),
    Object.freeze({ id: '9', title: 'Unknown warehouse' }),
  ]);
  const russian = localizeCountryOptions(options, 'ru');
  assert.equal(russian[1].title, 'Италия');
  assert.equal(russian[2].title, 'Румыния');
  assert.equal(localizeCountryOptions(options, 'en')[2].title, 'Romania');
  assert.deepEqual(russian.map(item => item.id), options.map(item => item.id));
  assert.equal(russian[1].availableCurrencies, options[1].availableCurrencies);
  assert.equal(russian[3].title, 'Unknown warehouse');
  assert.equal(russian[0], options[0]);
  assert.equal(options[1].title, 'Italia');
});

test('standalone country names translate, but postal addresses and depot nicknames stay exact', () => {
  assert.equal(countryDisplayName('UK', 'Regatul Unit', 'ru'), 'Британия');
  assert.equal(standaloneCountryLabel('Polonia', 'en', 'PL'), 'Poland');
  for (const value of ['Strada Italia 21', 'Italia · depozit privat', '10 USD numai spre România']) assert.equal(standaloneCountryLabel(value, 'ru', 'IT'), value);
  assert.equal(standaloneCountryLabel('România', 'ru', 'IT'), 'România');
  assert.equal(countryDisplayName('ZZ', 'Unknown', 'ro'), 'Unknown');
});

test('currency presentation uppercases codes while preserving symbols and financial data', () => {
  const transaction = Object.freeze({ currency: 'ron', amount: -12.50, date: '2026-11-02', id: '0' });
  assert.equal(currencyDisplayLabel(transaction.currency), 'RON');
  assert.deepEqual(transaction, { currency: 'ron', amount: -12.50, date: '2026-11-02', id: '0' });
  for (const value of ['$', '€', '£']) assert.equal(currencyDisplayLabel(value), value);
  for (const value of ['usd', 'eur', 'ron', 'gbp', 'pln', 'mdl', 'cad']) assert.equal(currencyDisplayLabel(value), value.toUpperCase());
  for (const value of ['Moneda implicită a depozitului', 'Валюта склада по умолчанию', 'Warehouse default currency']) assert.equal(currencyDisplayLabel(value), value);
  assert.equal(currencyDisplayLabel(null), '');
});
