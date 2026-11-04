import assert from 'node:assert/strict';
import test from 'node:test';
import { parcelStatusTone } from '../src/domain/parcel-status.ts';
import { parcelStatusColors } from '../src/theme/parcel-status.ts';

test('effective holds remain red even in sent/received sections and after external delivery tracking', () => {
  for (const status of ['customs-held', 'held-by-prohibition', 'held-by-damage', 'held-by-missing', 'hold-by-user', 'dept']) {
    assert.equal(parcelStatusTone({ status, stage: 'sent', trackingStatus: 'DELIVERED' }), 'danger');
  }
  assert.equal(parcelStatusTone({ status: 'sent', restrictions: { heldByProhibition: true } }), 'danger');
  assert.equal(parcelStatusTone({ stage: 'warehouse', declared: false, restrictions: { packingDenied: true, heldByDamage: true } }), 'danger');
});

test('incomplete stock and waiting for order items are intermediate, while active processing is green', () => {
  assert.equal(parcelStatusTone({ stage: 'warehouse', declared: false }), 'warning');
  assert.equal(parcelStatusTone({ stage: 'warehouse', declared: true, restrictions: { packingDenied: true } }), 'warning');
  assert.equal(parcelStatusTone({ stage: 'warehouse', declared: true }), 'success');
  assert.equal(parcelStatusTone({ stage: 'waiting', trackingStatus: 'DELIVERED' }), 'warning');
  for (const status of ['awaiting-invoice', 'packed', 'reinclude-request']) assert.equal(parcelStatusTone({ status }), 'warning');
  for (const status of ['processing', 'sent', 'taken-to-delivery', 'ready-to-pickup', 'received']) assert.equal(parcelStatusTone({ status }), 'success');
});

test('unknown statuses are not inferred from translated labels, section or external tracking', () => {
  for (const statusLabel of ['Sent', 'Принята', 'Reținut în vamă', 'Received']) {
    assert.equal(parcelStatusTone({ status: 'new-server-status', statusLabel, stage: 'received' }), 'neutral');
  }
  assert.equal(parcelStatusTone({ stage: 'sent', status: null }), 'neutral');
  assert.equal(parcelStatusTone({ stage: 'warehouse', declared: null }), 'neutral');
});

const luminance = hex => {
  const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};
test('all status labels retain 4.5:1 contrast on their own surface in both themes', () => {
  for (const [theme, palette] of Object.entries(parcelStatusColors)) for (const [tone, colors] of Object.entries(palette)) {
    const a = luminance(colors.text), b = luminance(colors.background);
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05) >= 4.5, `${theme} ${tone}`);
  }
});
