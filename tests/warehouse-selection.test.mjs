import assert from 'node:assert/strict';
import test from 'node:test';
import { warehouseSelection, warehouseSelectionIssue } from '../src/features/live/warehouse-selection.ts';
const parcel = (id, storageId = '10', changes = {}) => ({ id, storageId, stage: 'warehouse', declared: true, restrictions: { heldByProhibition: false, heldByDamage: false, packingDenied: false }, ...changes });
test('keeps multiple declared parcels from one warehouse across list filtering', () => {
  const rows = [parcel('1'), parcel('2'), parcel('3','20')];
  const selection = warehouseSelection(rows, ['1','2','1']);
  assert.deepEqual(selection, { ids: ['1','2'], storageId: '10', invalid: false, ready: true });
  assert.equal(warehouseSelectionIssue(rows[2], selection.storageId), 'packing.otherWarehouse');
});
test('refresh never silently drops a missing or newly restricted selection', () => {
  const missing = warehouseSelection([parcel('1')], ['1','2']);
  assert.deepEqual(missing.ids, ['1','2']); assert.equal(missing.ready, false); assert.equal(missing.invalid, true);
  const restricted = warehouseSelection([parcel('1', '10', {restrictions:{heldByProhibition:false,heldByDamage:true,packingDenied:false}})], ['1']);
  assert.equal(restricted.ready, false); assert.deepEqual(restricted.ids, ['1']);
});
test('undeclared, unknown safety state, mixed warehouses and no selection cannot proceed', () => {
  assert.equal(warehouseSelection([parcel('1', '10', {declared:false})], ['1']).ready, false);
  assert.equal(warehouseSelection([parcel('1', '10', {restrictions:undefined})], ['1']).ready, false);
  assert.equal(warehouseSelection([parcel('1'), parcel('2','20')], ['1','2']).ready, false);
  assert.equal(warehouseSelection([parcel('1')], []).ready, false);
});
