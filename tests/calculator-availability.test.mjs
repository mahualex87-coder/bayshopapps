import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatorQuotes } from '../src/api/account-operations.ts';

const quote = { id: '21', title: 'Air Post', currency: 'usd', price: '12.35', time: '7–10 zile', description: 'Server text' };
test('calculator follows server-resolved hidden state, including personally enabled methods', () => {
  for (const isHidden of [1, '1', true]) assert.deepEqual(calculatorQuotes({ shippers: [{ ...quote, isHidden, price: null }] }), []);
  for (const isHidden of [0, '0', false, undefined]) {
    const result = calculatorQuotes({ shippers: [{ ...quote, isHidden }] });
    assert.equal(result.length, 1);
    assert.equal(result[0].amount, 12.35);
    assert.equal(result[0].currency, 'USD');
    assert.equal(result[0].exceeded, false);
  }
  assert.throws(() => calculatorQuotes({ shippers: [{ ...quote, isHidden: 'unknown' }] }));
});

test('weight-exceeded null price remains unavailable without losing valid offers or implying free shipping', () => {
  const raw = Object.freeze({ shippers: Object.freeze([
    Object.freeze({ ...quote, id: '1', isExceeded: true, price: null }),
    Object.freeze({ ...quote, id: '2', isExceeded: false, price: '0.00' }),
    Object.freeze({ ...quote, id: '3', isExceeded: '0', price: '12.50' }),
  ]) });
  const result = calculatorQuotes(raw);
  assert.deepEqual(result.map(item => [item.id, item.amount, item.exceeded]), [['1', null, true], ['2', 0, false], ['3', 12.5, false]]);
  assert.equal(raw.shippers[2].price, '12.50');
  assert.equal(result[0].description, 'Server text');
  for (const flag of [1, '1', true]) assert.equal(calculatorQuotes({ shippers: [{ ...quote, isExceeded: flag, price: null }] })[0].amount, null);
});

test('unexplained missing or malformed prices still fail explicitly instead of becoming unavailable or zero', () => {
  for (const isExceeded of [undefined, false, 0, '0']) assert.throws(() => calculatorQuotes({ shippers: [{ ...quote, isExceeded, price: null }] }));
  for (const price of ['', ' ', false, '12,50', '-1']) assert.throws(() => calculatorQuotes({ shippers: [{ ...quote, price }] }));
  assert.throws(() => calculatorQuotes({ shippers: [{ ...quote, isExceeded: 'unknown' }] }));
});
