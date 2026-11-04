import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeUserUrl } from '../src/domain/user-url.ts';
import { absoluteHttpUrl, userHttpUrl, OperationValidationError, declarationItems, cartItemFields, planMutation, planRead, waitingParcelFields } from '../src/api/operations-contracts.ts';

const product = { title: 'Product', quantity: '2', price: '12.50', url: 'shop.example/item?color=red&code=a%2Fb#details' };

test('bare and protocol-relative product links gain HTTPS without rewriting path, query or fragment', () => {
  for (const [input, expected] of [
    ['  shop.example/item?color=red&code=a%2Fb#details  ', 'https://shop.example/item?color=red&code=a%2Fb#details'],
    ['www.shop.example', 'https://www.shop.example'],
    ['//shop.example/item', 'https://shop.example/item'],
    ['cărți.example/produs', 'https://cărți.example/produs'],
    ['example.com:8443/a?x=1#b', 'https://example.com:8443/a?x=1#b'],
    ['127.0.0.1:8443/a?x=1#b', 'https://127.0.0.1:8443/a?x=1#b'],
  ]) {
    assert.equal(normalizeUserUrl(input), expected);
    assert.equal(userHttpUrl(input), expected);
    assert.equal(normalizeUserUrl(expected), expected, 'blur plus submit is idempotent');
  }
});

test('existing HTTP and HTTPS URLs preserve their exact scheme, case, port and signed parameters', () => {
  for (const url of ['http://Shop.example:8080/a?sig=X%2Fy&b=2&a=1', 'HTTPS://SHOP.example/A#B', 'https://shop.example']) {
    assert.equal(normalizeUserUrl(url), url);
    assert.equal(userHttpUrl(` ${url} `), url);
  }
  assert.equal(normalizeUserUrl('  '), '');
  assert.throws(() => userHttpUrl('  '), OperationValidationError);
});

test('other schemes and relative paths do not become valid HTTP addresses', () => {
  for (const value of ['javascript:alert(1)', 'JAVASCRIPT://shop.example', 'java\tscript://shop.example', 'mailto:user@shop.example', 'tel:+373123456', 'ftp://shop.example/item', 'file:///tmp/item', 'data:text/html,test', 'custom+app://shop.example', '/item', '//', '///item', '../item', './item', '#item', '?item=1', '\\item']) {
    assert.equal(normalizeUserUrl(value), value);
    assert.throws(() => userHttpUrl(value), OperationValidationError, value);
  }
  for (const value of ['user:password@shop.example/item', 'https://user:password@shop.example/item', 'shop .example/item']) {
    assert.throws(() => userHttpUrl(value), OperationValidationError, 'ambiguous schemes, credentials and invalid hosts still require correction');
  }
});

test('declaration create and edit planners normalize on submit even if the field never blurred', () => {
  const input = { storage: 'usa', tracking: 'TRACK-123', declarations: [{ ...product, id: '19' }] };
  for (const command of [{ kind: 'waiting.create', input }, { kind: 'waiting.edit', id: '7', input }]) {
    const plan = planMutation(command);
    assert.equal(JSON.parse(plan.fields.declarations)[0].url, `https://${product.url}`);
  }
  for (const command of [
    { kind: 'stock.declaration.save', id: '7', input: { title: 'Parcel', declarationItems: [product] } },
    { kind: 'shipment.declaration.save', id: '7', input: { currencyId: '1', declarationItems: [product] } },
  ]) assert.equal(JSON.parse(planMutation(command).fields.declarationItems)[0].url, `https://${product.url}`);
  assert.equal(input.declarations[0].url, product.url, 'serialization never mutates the caller draft');
  assert.throws(() => declarationItems([{ ...product, url: 'bayshop.com/item' }], { stock: true }), OperationValidationError, 'stock self-link restriction remains enforced after normalization');
});

test('cart create, edit and lookup use the same normalized product link', () => {
  const input = { storage_id: '2', ...product, shipping: '0.00' };
  assert.equal(cartItemFields(input).url, `https://${product.url}`);
  for (const command of [{ kind: 'cart.create', input }, { kind: 'cart.edit', id: '7', input }]) {
    assert.equal(planMutation(command).fields.url, `https://${product.url}`);
  }
  const path = planRead({ kind: 'cart.link', url: product.url }).path;
  assert.equal(new URL(path, 'https://unit.test').searchParams.get('url'), `https://${product.url}`);
  assert.throws(() => planRead({ kind: 'cart.link', url: 'mailto:shop@example.test' }), OperationValidationError);
});

test('retained server attachment URLs keep strict validation and exact signed identity', () => {
  const invoice = 'https://bayshop.example/invoice.pdf?sig=A%2Fb&expires=123';
  const input = { storage: 'usa', tracking: 'TRACK-123', declarations: [product], invoiceList: [invoice] };
  assert.deepEqual(waitingParcelFields(input).fields['invoiceList[]'], [invoice]);
  for (const url of ['shop.example/invoice.pdf', '//shop.example/invoice.pdf', '/invoice.pdf']) {
    assert.throws(() => absoluteHttpUrl(url), OperationValidationError);
    assert.throws(() => waitingParcelFields({ ...input, invoiceList: [url] }), OperationValidationError);
  }
});
