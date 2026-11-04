import assert from 'node:assert/strict';
import test from 'node:test';
import { shipmentDocumentAccess } from '../src/api/shipment-document-policy.ts';

test('sent and received document forms are intentionally unavailable instead of triggering denied reads', () => {
  for (const status of ['sent', 'received', 'customs-held', 'packed', 'ready-to-pickup', 'dept']) {
    const value = shipmentDocumentAccess(status, 1);
    assert.equal(value.declaration, 'unavailable'); assert.equal(value.invoice, false);
  }
});

test('invoice capability follows current status while declaration follows underlying processing status', () => {
  assert.deepEqual(shipmentDocumentAccess('awaiting-invoice', 1), { declaration: 'available', invoice: true, singleBox: true });
  assert.deepEqual(shipmentDocumentAccess('processing', 1), { declaration: 'available', invoice: false, singleBox: true });
  assert.equal(shipmentDocumentAccess('order-invoice', 1).declaration, 'available');
  assert.equal(shipmentDocumentAccess('order-invoice', 1).invoice, false);
});

test('ambiguous hold states still ask the backend rather than guessing raw processing permission', () => {
  for (const status of [null, 'held-by-damage', 'held-by-prohibition', 'held-by-missing', 'awaiting-action', 'reinclude', 'new-server-status']) assert.equal(shipmentDocumentAccess(status, 1).declaration, 'check');
});

test('declaration read access does not imply permission for a multi-box declaration write', () => {
  for (const count of [0, 2, 30, null, Number.NaN]) assert.equal(shipmentDocumentAccess('processing', count).singleBox, false);
  assert.equal(shipmentDocumentAccess('processing', 2).declaration, 'available');
});
