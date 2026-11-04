import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCartByShop, cartSelectionIssue } from '../src/domain/cart-shops.ts';

const item = (id, shopId = '4', extra = {}) => ({ id, shopId, shopTitle: 'Same visible name', storageId: '2', currency: 'usd', isComplex: true, ...extra });
test('cart grouping trusts server shop identity and never merges unknown or different-currency products', () => {
  const groups = groupCartByShop([item('1'), item('2'), item('3', '5'), item('4', null), item('5', null), item('6', '4', { currency: 'EUR' })]);
  assert.deepEqual(groups.map(group => group.items.map(item => item.id)), [['1', '2'], ['3'], ['4'], ['5'], ['6']]);
  assert.equal(groups[0].currency, 'USD');
});
test('single-product shops and stale selections cannot authorize a combined checkout', () => {
  const [single] = groupCartByShop([item('1', '4', { isComplex: false }), item('2', '4', { isComplex: false })]);
  assert.equal(cartSelectionIssue(single, ['1']), null);
  assert.equal(cartSelectionIssue(single, ['1', '2']), 'cartLink.singleOnly');
  assert.equal(cartSelectionIssue(single, ['1', '3']), 'cartLink.selectionChanged');
  assert.equal(cartSelectionIssue(single, ['1', '1']), 'cartLink.selectionChanged');
  assert.equal(cartSelectionIssue(groupCartByShop([item('1', null)])[0], ['1']), 'cartLink.shopPending');
});
test('conflicting server consolidation metadata prevents multi-product checkout', () => {
  const [group] = groupCartByShop([item('1'), item('2', '4', { isComplex: null })]);
  assert.equal(group.isComplex, null);
  assert.equal(cartSelectionIssue(group, ['1', '2']), 'cartLink.singleOnly');
});
