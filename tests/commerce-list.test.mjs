import assert from 'node:assert/strict';
import test from 'node:test';
import { commercePage, filterCart, filterOrders } from '../src/features/commerce/list-model.ts';

test('large commerce lists render at most twenty entries and keep the last page reachable', () => {
  const items = Array.from({ length: 10005 }, (_, index) => ({ id: String(index + 1) }));
  assert.deepEqual(commercePage(items, 1).items.map(item => item.id), items.slice(0, 20).map(item => item.id));
  const last = commercePage(items, 501);
  assert.equal(last.page, 501); assert.equal(last.pages, 501); assert.equal(last.from, 10001); assert.equal(last.to, 10005); assert.equal(last.total, 10005);
  assert.equal(last.items.length, 5); assert.equal(last.items.at(-1).id, '10005');
  assert.deepEqual(commercePage(items, 999), last);
  assert.equal(commercePage(items, -1).page, 1); assert.equal(commercePage(items, NaN).page, 1);
  assert.deepEqual(commercePage([], 501), { items: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
});

test('purchase filtering intersects exact server statuses and searches product IDs and server text', () => {
  const items = [
    { id: '1', uid: 'O001', status: 'paid', statusLabel: 'Achitată', items: [{ id: '51', uid: 'SKUABC', title: 'Синий рюкзак', statusLabel: 'Получено' }] },
    { id: '2', uid: 'O002', status: 'unpaid', statusLabel: 'În așteptare', items: [{ id: '52', uid: null, title: 'Red backpack', statusLabel: null }] },
    { id: '3', uid: 'O003', status: 'future-server-status', statusLabel: null, items: [] },
  ];
  assert.deepEqual(filterOrders(items, 'РЮКЗАК', 'paid', 'ru').map(item => item.id), ['1']);
  assert.deepEqual(filterOrders(items, 'SKUabc', '', 'en').map(item => item.id), ['1']);
  assert.deepEqual(filterOrders(items, 'Получено', 'unpaid', 'ru'), []);
  assert.deepEqual(filterOrders(items, '', 'future-server-status', 'ro').map(item => item.id), ['3']);
  assert.equal(commercePage(filterOrders(items, 'Red', '', 'en'), 501).page, 1);
});

test('cart search preserves exact items and finds supplier, variants and comments', () => {
  const items = [{ id: '1', uid: 'P100', title: 'Rucsac', shopTitle: 'Магазин', color: 'Blue', size: 'XL', comment: 'Cadou' }, { id: '2', uid: null, title: 'Pantofi', shopTitle: null, color: null, size: null, comment: null }];
  for (const query of ['p100', 'МАГАЗИН', 'blue', 'xl', 'cadou']) assert.equal(filterCart(items, query, 'ru')[0], items[0]);
  assert.equal(filterCart(items, '   ', 'ro').length, 2);
  assert.deepEqual(filterCart(items, 'absent', 'en'), []);
});
