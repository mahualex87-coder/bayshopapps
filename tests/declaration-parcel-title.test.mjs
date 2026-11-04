import assert from 'node:assert/strict';
import test from 'node:test';
import { declarationParcelTitle } from '../src/domain/declaration-parcel-title.ts';
import { planMutation } from '../src/api/operations-contracts.ts';

const item = (title, url, extra = {}) => ({ title, url, quantity: '1', price: '10', ...extra });

test('a single declaration row uses the full product title, regardless of quantity', () => {
  const title = 'Cămașă din bumbac, model cu mânecă lungă, culoare albastră';
  assert.equal(declarationParcelTitle([item(` ${title} `, 'altex.ro/product', { quantity: '5' })]), title);
  assert.equal(declarationParcelTitle([item(' ', 'altex.ro')]), null);
  assert.equal(declarationParcelTitle([]), null);
});

test('multiple products use the most frequent link host, matching the server rule', () => {
  const products = [item('Cablu', 'https://amazon.com/cable'), item('Telefon', 'www.altex.ro/telefon?ref=1'), item('Husă', 'https://www.altex.ro/husa#details')];
  assert.equal(declarationParcelTitle(products), 'altex.ro');
  assert.equal(declarationParcelTitle(products.slice(0, 2)), 'amazon.com', 'ties preserve declaration order');
  assert.equal(declarationParcelTitle([products[0]]), 'Cablu', 'removing the other products returns to the product title');
});

test('shop names never include tracking parameters, credentials, or non-web schemes', () => {
  assert.equal(declarationParcelTitle([item('A', 'https://www.amazon.co.uk/p?token=private'), item('B', 'https://www.amazon.co.uk/other')]), 'amazon.co.uk');
  for (const url of ['', 'javascript:alert(1)', 'ftp://shop.example/item', 'https://user:secret@shop.example/item', 'https://', '/relative', 'https://shop.example/\nitem']) {
    assert.equal(declarationParcelTitle([item('A', url), item('B', null)]), null);
  }
});

test('stock declarations save without a separate parcel name while retaining product data and attachments', () => {
  const products = [item('Telefon', 'altex.ro/telefon', { id: '31', quantity: '2', currency: 'ron' })];
  const input = { declarationItems: products, invoiceList: ['41'], customsDocsList: ['51'] };
  const plan = planMutation({ kind: 'stock.declaration.save', id: '7', input });
  assert.equal(plan.path, '/api/mf-storage-declaration/7');
  assert.equal(Object.hasOwn(plan.fields, 'title'), false);
  assert.deepEqual(JSON.parse(plan.fields.declarationItems), [{ title: 'Telefon', quantity: '2', price: '10', url: 'https://altex.ro/telefon', id: '31', currency: 'ron' }]);
  assert.deepEqual(plan.fields['invoiceList[]'], ['41']);
  assert.deepEqual(plan.fields['customsDocsList[]'], ['51']);
  assert.equal(products[0].url, 'altex.ro/telefon', 'serialization does not mutate the draft');
});
