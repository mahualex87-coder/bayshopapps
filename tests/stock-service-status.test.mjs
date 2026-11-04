import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeStockData} from '../src/api/normalize.ts';
import {normalizeLegacyStockServiceStates,needsLegacyStockStates,mergeStockServiceStates} from '../src/api/stock-service-status.ts';
import {currentStockServiceDetail,stockServiceState} from '../src/domain/stock-service-state.ts';
const mf=()=>normalizeStockData({list:[{id:'100',storageId:'14',isDeclarationFilled:'1',photosPackageRequestStatus:null,declarationRequestStatus:null}]})[0];
const oldDetail={declared:false,declarationItemCount:0,checkProductInProgress:false,photosInProgress:0,additionalPhotosRequested:false,allowedDivideRequest:true};
test('existing MF columns combine with existing legacy storage columns on same parcel ID',()=>{
  const current=mf();
  assert.equal(needsLegacyStockStates(current),true);
  const legacy=normalizeLegacyStockServiceStates({storage:{US:[{id:'100',verificationPackageRequestStatus:null,divideRequestedStatus:null,labelRequestStatus:null},{id:'101',verificationPackageRequestStatus:'done'}]}});
  const merged=mergeStockServiceStates(current,legacy), detail=currentStockServiceDetail(oldDetail,merged);
  assert.equal(detail.declared,true);
  for(const kind of ['photos','verification','division','label']) assert.equal(stockServiceState(detail,kind),'available');
  assert.equal(stockServiceState(detail,'declaration'),'alreadyDeclared');
});
test('fresh legacy pending/completed blocks cached available status after remount, no unrelated row fallback',()=>{
  const current=mf();
  const rows=normalizeLegacyStockServiceStates({storage:[{id:'100',verificationPackageRequestStatus:'waiting',divideRequestedStatus:'done',labelRequestStatus:'waiting'}]});
  const detail=currentStockServiceDetail(oldDetail,mergeStockServiceStates(current,rows));
  assert.equal(stockServiceState(detail,'verification'),'pending');
  assert.equal(stockServiceState(detail,'division'),'completed');
  assert.equal(stockServiceState(detail,'label'),'pending');
  const unknown=currentStockServiceDetail(oldDetail,mergeStockServiceStates(current,[{id:'999',states:{verification:null,label:null,division:null}}]));
  assert.equal(stockServiceState(unknown,'verification'),'unavailable');
  assert.equal(stockServiceState(unknown,'photos'),'available');
});
test('partial legacy data leaves only missing services blocked; fresh MF states take priority',()=>{
  const current=mf();current.serviceStates.verification='done';
  const merged=mergeStockServiceStates(current,normalizeLegacyStockServiceStates({storage:{US:[{id:'100',verificationPackageRequestStatus:null}]}}));
  const detail=currentStockServiceDetail(oldDetail,merged);
  assert.equal(stockServiceState(detail,'verification'),'completed');
  assert.equal(stockServiceState(detail,'label'),'unavailable');
  assert.equal(stockServiceState(detail,'photos'),'available');
  assert.throws(()=>normalizeLegacyStockServiceStates({storage:{US:[{id:'100'},{id:'100'}]}}));
});
