import assert from 'node:assert/strict';
import test from 'node:test';
import { declarationItems, declarationTitle, waitingTracking, planMutation } from '../src/api/operations-contracts.ts';

const item = { title: 'BayShop QA - factură fiscală test', url: 'https://example.com/qa-product', quantity: '1', price: '10' };
test('the server-required product URL is enforced for all three declaration write paths', () => {
  for (const url of [undefined, '', '   ']) {
    const row = { ...item, url };
    for (const command of [
      { kind: 'waiting.create', input: { storage: 'ro', tracking: 'QA-RO-12345', declarations: [row] } },
      { kind: 'stock.declaration.save', id: '1', input: { title: 'Parcel', declarationItems: [row] } },
      { kind: 'shipment.declaration.save', id: '1', input: { currencyId: '4', declarationItems: [row] } },
    ]) assert.throws(() => planMutation(command), error => error.field === 'url');
  }
  assert.equal(declarationItems([item])[0].url, item.url);
});
test('server declaration alphabet keeps Romanian accents and rejects the exact staging failure', () => {
  for (const title of ['Cămașă - țesătură', 'Cămaşă - ţesătură', 'Set (2) / 20% + cadou', 'Laptop ‑ nou', 'AB', 'a'.repeat(255)]) assert.equal(declarationTitle(title), title);
  for (const title of ['BayShop QA — factură fiscală test', 'Товар', 'Box 📦', 'A', 'a'.repeat(256)]) assert.throws(() => declarationTitle(title), error => error.field === 'title');
});
test('tracking boundaries and declaration amount bounds match the validated backend contracts', () => {
  assert.equal(waitingTracking('AB-12'), 'AB-12'); assert.equal(waitingTracking('A'.repeat(100)), 'A'.repeat(100));
  for (const tracking of ['AB12', 'A'.repeat(101), 'AB_123', 'AB.123', 'AB 123']) assert.throws(() => waitingTracking(tracking), error => error.field === 'tracking');
  assert.equal(declarationItems([{ ...item, price: '0' }])[0].price, '0');
  assert.equal(declarationItems([{ ...item, price: '9999999', quantity: '9999999' }])[0].quantity, '9999999');
  assert.throws(() => declarationItems([{ ...item, price: '9999999.01' }]), error => error.field === 'price');
  assert.throws(() => declarationItems([{ ...item, quantity: '10000000' }]), error => error.field === 'quantity');
});
test('stock declaration rejects BayShop cabinet links as product URLs, as its backend does', () => {
  assert.throws(() => declarationItems([{ ...item, url: 'https://bayshop.com/storage/' }], { stock: true }), error => error.field === 'url');
  assert.equal(declarationItems([item], { stock: true })[0].url, item.url);
});
