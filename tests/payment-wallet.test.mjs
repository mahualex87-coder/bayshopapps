import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuotedWallet } from '../src/api/payment-wallet.ts';
const quote = { method: 'google-pay', authorizationTotal: '12.34', currency: 'EUR', acquirerCountryCode: 'RO', merchantName: 'BayShop', google: { gatewayMerchantId: 'synthetic_merchant', environment: 'TEST', networks: ['VISA', 'MASTERCARD'] } };
test('wallet uses exact quoted amount and processing country, never customer/OAuth data', () => {
  assert.deepEqual(normalizeQuotedWallet({ ...quote, customerCountry: 'MD', oauthClient: 'ignored', token: 'ignored' }, 'google-pay'), quote);
  assert.equal(normalizeQuotedWallet({ authorizationTotal: '12.34', currency: 'EUR' }, 'google-pay'), null);
  assert.equal(normalizeQuotedWallet({ ...quote, acquirerCountryCode: undefined, customerCountry: 'MD' }, 'google-pay'), null);
});
test('unverified, mixed or unsupported native wallet metadata cannot enable payment', () => {
  for (const bad of [null, { ...quote, method: 'apple-pay' }, { ...quote, authorizationTotal: '0.00' }, { ...quote, authorizationTotal: '12.345' }, { ...quote, currency: 'eur' }, { ...quote, apple: { merchantIdentifier: 'merchant.other' } }, { ...quote, google: { ...quote.google, networks: ['unknown'] } }, { ...quote, google: { ...quote.google, environment: 'LIVE' } }]) assert.equal(normalizeQuotedWallet(bad, 'google-pay'), null);
});
test('Apple quote must explicitly bind its native merchant and network list', () => {
  const apple = { ...quote, method: 'apple-pay', google: undefined, apple: { merchantIdentifier: 'merchant.synthetic.bayshop', networks: ['visa'] } };
  const normalized = normalizeQuotedWallet(apple, 'apple-pay');
  assert.equal(normalized.apple.merchantIdentifier, 'merchant.synthetic.bayshop');
  assert.equal(normalized.google, undefined);
});
