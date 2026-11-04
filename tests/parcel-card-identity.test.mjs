import assert from 'node:assert/strict';
import test from 'node:test';
import { parcelCardIdentity } from '../src/features/live/parcel-list-presentation.ts';
const base = { id: '12', uid: 'WMF12', tracking: 'TRACK12345', title: 'Camera', declared: null, stage: 'waiting' };
test('waiting keeps server declaration summary without inventing a declared flag', () => {
 assert.deepEqual(parcelCardIdentity(base), { incoming: true, identifier: 'WMF12', title: 'Camera', tracking: 'TRACK12345' });
 assert.equal(parcelCardIdentity({ ...base, title: null }).title, null);
});
test('stock avoids stale product labels when declaration is explicitly missing', () => {
 assert.equal(parcelCardIdentity({ ...base, stage: 'warehouse', declared: false }).title, null);
 assert.equal(parcelCardIdentity({ ...base, stage: 'warehouse', declared: true }).title, 'Camera');
});
test('tracking remains explicit while identical codes and titles are not repeated', () => {
 assert.deepEqual(parcelCardIdentity({ ...base, uid: 'TRACK12345', title: 'TRACK12345' }), { incoming: true, identifier: null, title: null, tracking: 'TRACK12345' });
 assert.equal(parcelCardIdentity({ ...base, stage: 'sent' }).tracking, null);
});
