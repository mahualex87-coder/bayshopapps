import assert from 'node:assert/strict';
import test from 'node:test';
import { declarationTotals } from '../src/features/live/forms/declaration-totals.ts';

test('declared values match the staging read-back and web calculation, without multiplying quantity', () => {
  // Actual staging contract: quantity 2, price 12.50 -> package value 12.50 RON.
  assert.deepEqual(declarationTotals([{ quantity: '2', price: '12.50', currency: 'ron' }], 'RON'), { RON: 12.5 });
  assert.deepEqual(declarationTotals([{ quantity: '2', price: '12.50' }, { quantity: '3', price: '7,25' }], 'RON'), { RON: 19.75 });
});

test('mixed original currencies remain separate, while outgoing uses the explicit declaration currency', () => {
  const rows = [{ quantity: '2', price: '10', currency: 'eur' }, { quantity: '1', price: '20', currency: 'RON' }, { quantity: '3', price: '2.5', currency: 'EUR' }];
  assert.deepEqual(declarationTotals(rows, 'RON'), { EUR: 12.5, RON: 20 });
  assert.deepEqual(declarationTotals(rows, 'RON', false), { RON: 32.5 });
});

test('unfinished and invalid rows do not create a misleading declared total', () => {
  const rows = [{ quantity: '', price: '5' }, { quantity: '0', price: '5' }, { quantity: '2.5', price: '5' }, { quantity: '1', price: '' }, { quantity: '1', price: '-5' }, { quantity: '1', price: '10000000' }, { quantity: '1', price: '0' }];
  assert.deepEqual(declarationTotals(rows, 'RON'), { RON: 0 });
});
