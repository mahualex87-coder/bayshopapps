import assert from 'node:assert/strict';
import test from 'node:test';
import { currentStockServiceDetail, stockServiceState } from '../src/domain/stock-service-state.ts';
import { planMutation } from '../src/api/operations-contracts.ts';
const detail = { declared: true, photosInProgress: 0, additionalPhotosRequested: false, checkProductInProgress: false, declarationRequestStatus: null, labelRequestStatus: null };
test('photo request respects completed and unknown states; completed is not requestable again', () => {
  assert.equal(stockServiceState(detail, 'photos'), 'available');
  assert.equal(stockServiceState({ ...detail, photosInProgress: 1 }, 'photos'), 'pending');
  assert.equal(stockServiceState({ ...detail, photosInProgress: 2 }, 'photos'), 'completed');
  assert.equal(stockServiceState({ ...detail, photosInProgress: null }, 'photos'), 'unavailable');
});
test('verification registered flag is not mislabeled as pending and requires declaration', () => {
  assert.equal(stockServiceState(detail, 'verification'), 'available');
  assert.equal(stockServiceState({ ...detail, checkProductInProgress: true }, 'verification'), 'registered');
  assert.equal(stockServiceState({ ...detail, declared: false }, 'verification'), 'needsDeclaration');
  assert.equal(stockServiceState({ ...detail, declared: null }, 'verification'), 'unavailable');
});
test('declaration request is limited to an undeclared parcel without an existing registered request', () => {
  assert.equal(stockServiceState(detail, 'declaration'), 'alreadyDeclared');
  assert.equal(stockServiceState({ ...detail, declared: false }, 'declaration'), 'available');
  assert.equal(stockServiceState({ ...detail, declared: false, declarationRequestStatus: 'waiting' }, 'declaration'), 'pending');
  assert.equal(stockServiceState({ ...detail, declared: false, declarationRequestStatus: 'done' }, 'declaration'), 'completed');
  assert.equal(stockServiceState({ ...detail, declared: false, declarationRequestStatus: 'new-server-status' }, 'declaration'), 'unavailable');
});
test('label can be requested after completion or cancellation, but pending is not duplicated', () => {
  assert.equal(stockServiceState({ ...detail, labelRequestStatus: 'waiting' }, 'label'), 'pending');
  for (const labelRequestStatus of [null, 'done', 'canceled']) assert.equal(stockServiceState({ ...detail, labelRequestStatus }, 'label'), 'available');
  assert.equal(stockServiceState({ ...detail, labelRequestStatus: 'unknown' }, 'label'), 'unavailable');
});
test('one stock service per request matches backend first-branch handling', () => {
  const plan = planMutation({ kind: 'stock.service.save', id: '301', declaration: 1 });
  assert.deepEqual(plan.fields, { id: '301', declaration: '1' });
  assert.equal(plan.path, '/api/storage/');
  assert.throws(() => planMutation({ kind: 'stock.service.save', id: '301', declaration: 1, photo: 1 }));
  assert.throws(() => planMutation({ kind: 'stock.service.save', id: '301' }));
});

test('verification uses actual declaration rows rather than the legacy title-dependent flag', () => {
  assert.equal(stockServiceState({ ...detail, declared: false, declarationItemCount: 1 }, 'verification'), 'available');
  assert.equal(stockServiceState({ ...detail, declared: true, declarationItemCount: 0 }, 'verification'), 'needsDeclaration');
  assert.equal(stockServiceState({ ...detail, verificationRequestStatus: 'done' }, 'verification'), 'completed');
  assert.equal(stockServiceState({ ...detail, verificationRequestStatus: 'waiting' }, 'verification'), 'pending');
  assert.equal(stockServiceState({ ...detail, verificationRequestStatus: 'future' }, 'verification'), 'unavailable');
});
test('declaration completion wins over declared marker; division honors explicit server support and status', () => {
  assert.equal(stockServiceState({ ...detail, declarationRequestStatus: 'done' }, 'declaration'), 'completed');
  assert.equal(stockServiceState({ ...detail, declared: false, declarationItemCount: 2 }, 'declaration'), 'alreadyDeclared');
  assert.equal(stockServiceState({ ...detail, allowedDivideRequest: true }, 'division'), 'available');
  assert.equal(stockServiceState({ ...detail, allowedDivideRequest: false }, 'division'), 'unavailable');
  assert.equal(stockServiceState({ ...detail, allowedDivideRequest: true, divideRequestStatus: 'waiting' }, 'division'), 'pending');
  assert.equal(stockServiceState({ ...detail, allowedDivideRequest: true, divideRequestStatus: 'done' }, 'division'), 'completed');
});

test('fresh pending/completed rows prevent duplicate requests after remount with an old available detail', () => {
  const old = { ...detail, declared: false, declarationItemCount: 0, allowedDivideRequest: true, divideRequestStatus: null };
  for (const kind of ['photos', 'verification', 'declaration', 'division', 'label']) {
    const current = currentStockServiceDetail(old, { serviceStates: { [kind]: 'waiting' } });
    assert.equal(stockServiceState(current, kind), 'pending');
  }
  const current = currentStockServiceDetail(old, { serviceStates: { photos:'done',verification:'done',declaration:'done',division:'done' } });
  for (const kind of ['photos','verification','declaration','division']) assert.equal(stockServiceState(current, kind),'completed');
});
test('missing fresh request state never reuses cached available flags', () => {
  const current=currentStockServiceDetail({ ...detail,declared:false,allowedDivideRequest:true },{serviceStates:{}});
  for(const kind of ['photos','verification','declaration','division','label']) assert.equal(stockServiceState(current,kind),'unavailable');
});
