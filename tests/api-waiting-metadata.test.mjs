import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStockDetail, normalizeWaitingDetail } from '../src/api/operations-normalize.ts';
import { ApiContractError, normalizeStockData } from '../src/api/normalize.ts';

const waiting = { id: '1', declarations: [], invoices: [], customsDocs: [] };

test('waiting preserves server request comments, null versus false, and readable delivery data', () => {
  const data = normalizeWaitingDetail({ ...waiting, photosPackageRequested: '1', photosPackageRequestedComments: 'Photo comment exactly', verificationPackageRequested: '0', verificationPackageRequestedComments: null,
    local_delivery: { title: 'Server pickup title', address: 'Server address', country: 'Server country', address_array: { first_name: 'Synthetic', last_name: 'Recipient' } },
    autoPackingData: { autoPacking: '1', autoInsurance: '0', autoPackingAddressId: '9' } });
  assert.equal(data.photosPackageRequested, true);
  assert.equal(data.photosPackageRequestedComments, 'Photo comment exactly');
  assert.equal(data.verificationPackageRequested, false);
  assert.equal(data.verificationPackageRequestedComments, null);
  assert.deepEqual(data.autoPacking, { enabled: true, insurance: false });
  assert.equal(data.localDelivery.address, 'Server address');
  assert.equal(data.localDelivery.addressFields[0].value, 'Synthetic');
  assert.equal(data.autoPackingData.autoPackingAddressId, '9');
  assert.equal(Object.hasOwn(data.autoPacking, 'autoPackingAddressId'), false);
});

test('missing waiting options remain unknown instead of becoming disabled or fabricated addresses', () => {
  const data = normalizeWaitingDetail(waiting);
  assert.equal(data.localDelivery, null);
  assert.equal(data.photosPackageRequestedComments, null);
  assert.equal(data.autoPacking, null);
  assert.deepEqual(normalizeWaitingDetail({ ...waiting, autoPackingData: { autoPacking: null, autoInsurance: null } }).autoPacking, { enabled: null, insurance: null });
  assert.throws(() => normalizeWaitingDetail({ ...waiting, autoPackingData: { autoPacking: 'yes' } }), ApiContractError);
  assert.throws(() => normalizeWaitingDetail({ ...waiting, photosPackageRequestedComments: [] }), ApiContractError);
});

test('stock preserves declaration request state and nullable dimensions without inventing request comments', () => {
  const data = normalizeStockDetail({ id: '1', x: '12.5', y: null, z: '0', declarationRequestStatus: 'done', verificationPackageRequestedComments: 'Not in the stock detail contract' });
  assert.deepEqual(data.dimensionsCm, { x: 12.5, y: null, z: 0 });
  assert.equal(data.declarationRequestStatus, 'done');
  assert.equal(Object.hasOwn(data, 'verificationPackageRequestedComments'), false);
  assert.equal(normalizeStockDetail({ id: '1' }).declarationRequestStatus, null);
  assert.equal(normalizeStockDetail({ id: '1' }).dimensionsCm, null);
  assert.equal(normalizeStockDetail({ id: '1', declarationRequestStatus: 'future-status' }).declarationRequestStatus, 'future-status');
  assert.throws(() => normalizeStockDetail({ id: '1', x: '-2' }), ApiContractError);
});

test('stock list preserves the actual inspection comment, independently of detail data', () => {
  const result = normalizeStockData({ list: [{ id: '1', verificationPackageRequestedComments: 'Exact server inspection note' }] });
  assert.equal(result[0].verificationComment, 'Exact server inspection note');
});
