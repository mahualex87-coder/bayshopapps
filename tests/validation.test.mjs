import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder, validateWeight } from '../src/domain/validation.ts';

const draft = { url: 'https://example.com/product', name: 'Produs demonstrativ', quantity: '1' };
test('order accepts a complete product URL and trims the name', () => {
  assert.deepEqual(validateOrder({ ...draft, name: '  Produs  ', quantity: '2' }), { ok: true, value: { host: 'example.com', name: 'Produs', quantity: 2 } });
});
test('rejects unsupported links and embedded credentials', () => {
  for (const url of ['javascript:alert(1)', 'file:///tmp/product', 'not-a-link', 'https://user:password@example.com']) assert.equal(validateOrder({ ...draft, url }).ok, false);
});
test('quantity requires a whole number within the allowed range', () => {
  for (const quantity of ['', '0', '-1', '1.5', '100', '1e1', 'abc']) assert.equal(validateOrder({ ...draft, quantity }).ok, false);
});
test('product name cannot be blank', () => assert.equal(validateOrder({ ...draft, name: '  ' }).ok, false));
test('accepts Romanian comma and decimal point weight input', () => {
  assert.deepEqual(validateWeight('2,5'), { ok: true, value: 2.5 });
  assert.deepEqual(validateWeight('0.01'), { ok: true, value: 0.01 });
});
test('rejects invalid or out-of-range weights', () => {
  for (const value of ['', '0', '-2', '1001', '1,2,3', 'Infinity', '2kg', '1e2', '0.001']) assert.equal(validateWeight(value).ok, false);
});
