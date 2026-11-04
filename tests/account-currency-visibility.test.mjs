import test from 'node:test';
import assert from 'node:assert/strict';
import { accountCurrencyChoices, defaultAccountCurrency, visibleCurrencySelection } from '../src/domain/account-currency-visibility.ts';
test('currency picker uses member balance metadata, not a fixed MDL exception', () => {
  assert.deepEqual(accountCurrencyChoices(['USD', 'MDL', 'EUR'], [{ currency: 'usd' }, { currency: 'eur' }]), ['USD', 'EUR']);
  assert.deepEqual(accountCurrencyChoices(['USD', 'MDL'], [{ currency: 'mdl' }]), ['MDL']);
});
test('missing metadata exposes no unconfirmed currency choice; invalid selection returns All', () => {
  assert.deepEqual(accountCurrencyChoices(['USD', 'MDL'], null), []);
  assert.equal(visibleCurrencySelection('MDL', ['USD']), 'all');
  assert.equal(visibleCurrencySelection('USD', ['USD']), 'USD');
  assert.equal(visibleCurrencySelection('all', []), 'all');
});
test('presentation filtering preserves the original ledger currency set', () => {
  const values = ['USD', 'MDL']; const original = [...values];
  accountCurrencyChoices(values, [{ currency: 'USD' }]);
  assert.deepEqual(values, original);
});

test('initial choice follows visible USD EUR RON GBP priority without deleting other currencies', () => {
 assert.equal(defaultAccountCurrency(['GBP','RON','EUR','USD']), 'USD');
 assert.equal(defaultAccountCurrency(['RON','EUR']), 'EUR');
 assert.equal(defaultAccountCurrency(['MDL']), 'all');
 assert.equal(defaultAccountCurrency([]), 'all');
});
