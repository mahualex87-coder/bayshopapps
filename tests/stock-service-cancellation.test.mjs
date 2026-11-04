import assert from 'node:assert/strict';
import test from 'node:test';
import { planMutation } from '../src/api/operations-contracts.ts';
import { currentStockServiceDetail, canCancelStockService, stockServiceCancellationConfirmed } from '../src/domain/stock-service-state.ts';
import { cancelPendingStockService } from '../src/domain/stock-service-cancellation.ts';
const kinds = ['photos', 'verification', 'declaration', 'division', 'label'];
const detail = (kind, state) => currentStockServiceDetail({ allowedDivideRequest: true }, { declared: false, serviceStates: { [kind]: state } });
const describeError = () => 'errors.loadFailed';

test('each cancellation uses its existing API without enabling or requesting a service', () => {
  for (const [service, path, method, fields] of [
    ['photos','/api/storage/','POST',{id:'301',photo:'0'}],
    ['verification','/api/storage/','POST',{id:'301',verification:'0'}],
    ['declaration','/api/storage/','POST',{id:'301',declaration:'0'}],
    ['label','/api/label-request/','POST',{id:'301',enable:'0'}],
    ['division','/api/request-divide?id=301','DELETE',{}],
  ]) {
    const plan=planMutation({kind:'stock.service.cancel',id:'301',service});
    assert.equal(plan.path,path);assert.equal(plan.method,method);assert.deepEqual(plan.fields,fields);
    assert.deepEqual(plan.invalidate,['warehouse','balance']);
  }
  assert.throws(()=>planMutation({kind:'stock.service.cancel',id:'301',service:'future'}));
  assert.throws(()=>planMutation({kind:'stock.service.cancel',id:'bad',service:'photos'}));
});

test('only fresh waiting states allow cancellation; completed, unknown and merely registered do not', () => {
  for(const kind of kinds) {
    assert.equal(canCancelStockService(detail(kind,'waiting'),kind),true);
    for(const state of [null,'canceled','done','future','unknown']) assert.equal(canCancelStockService(detail(kind,state),kind),false);
    assert.equal(canCancelStockService(currentStockServiceDetail({}, {serviceStates:{}}),kind),false);
  }
  assert.equal(canCancelStockService({checkProductInProgress:true},'verification'),false);
});

test('successful cancellation requires a fresh server cancellation state after acknowledgement for every service', async()=>{
  for(const service of kinds) {
    const state=service==='photos'||service==='division'?null:'canceled';
    const responses=[detail(service,'waiting'),detail(service,state)];
    let writes=0,reads=0;
    const result=await cancelPendingStockService({service,readCurrent:async()=>{reads++;return responses.shift();},send:async()=>{writes++;return {ok:true};},describeError});
    assert.deepEqual(result,{status:'cancelled'});assert.equal(reads,2);assert.equal(writes,1);
    assert.equal(stockServiceCancellationConfirmed(detail(service,'done'),service),false);
  }
});

test('warehouse completion or parcel removal between opening and confirming prevents the write', async()=>{
  for(const before of [detail('photos','done'),undefined,detail('photos','unknown')]) {
    let writes=0;
    const result=await cancelPendingStockService({service:'photos',readCurrent:async()=>before,send:async()=>{writes++;return {ok:true};},describeError});
    assert.equal(result.status,'changed');assert.equal(writes,0);
  }
});

test('failed preflight read does not send a cancellation', async()=>{
  let writes=0;
  const result=await cancelPendingStockService({service:'photos',readCurrent:async()=>{throw new Error('offline');},send:async()=>{writes++;return {ok:true};},describeError});
  assert.deepEqual(result,{status:'rejected',error:'errors.loadFailed'});assert.equal(writes,0);
});

test('legacy Ok after a race is not presented as successful cancellation', async()=>{
  for(const [after,status] of [[detail('photos','done'),'changed'],[detail('photos','waiting'),'unknown'],[undefined,'unknown']]) {
    let reads=0;
    const result=await cancelPendingStockService({service:'photos',readCurrent:async()=>++reads===1?detail('photos','waiting'):after,send:async()=>({ok:true}),describeError});
    assert.equal(result.status,status);
  }
});

test('failed acknowledgement or read-back never produces false success or a second write', async()=>{
  for(const [writeResult,expected] of [[{ok:false,outcome:'rejected',error:'denied'},'rejected'],[{ok:false,outcome:'unknown',error:'timeout'},'unknown']]) {
    let reads=0,writes=0;
    const result=await cancelPendingStockService({service:'label',readCurrent:async()=>{reads++;return detail('label','waiting');},send:async()=>{writes++;return writeResult;},describeError});
    assert.equal(result.status,expected);assert.equal(reads,1);assert.equal(writes,1);
  }
  let reads=0,writes=0;
  const result=await cancelPendingStockService({service:'division',readCurrent:async()=>{if(++reads===2)throw new Error('offline');return detail('division','waiting');},send:async()=>{writes++;return {ok:true};},describeError});
  assert.deepEqual(result,{status:'unknown',error:'errors.loadFailed'});assert.equal(writes,1);
});
