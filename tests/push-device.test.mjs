import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveAccountService} from '../src/api/service.ts';
import {API_ORIGIN} from '../src/api/client.ts';
import {pushDeviceWrite,validatePushCapability,validatePushAcknowledgement} from '../src/api/push-device.ts';
const NOW=1790000000000;const token='synthetic_fcm_token_0123456789';const flush=()=>new Promise(r=>setImmediate(r));
function setup(intercept){const calls=[];const service=new LiveAccountService(async(path,options={})=>{if(path==='/api/member/push-device'){
  calls.push({path,options});const override=intercept?.(options);if(override!==undefined)return override;
  return options.write?{code:200,error:false,data:{version:1,accountId:'7',enabled:options.write.fields.enabled==='1'}}:{version:1,provider:'fcm',appId:'com.bayshop.mobile.demo'};
}if(path==='/api/auth')return {id:'7',uid:'M-7',name:'Synthetic',surname:'Member'};if(path==='/api/member/me')return {member:{id:'7',email:'synthetic@example.test'}};if(path==='/api/member/personal-data')return {};if(path==='/api/member/counters')return {awaiting:0,incoming:0,outgoing:0,received:0};return [];},{read:async()=>JSON.stringify({origin:API_ORIGIN,token:'synthetic-session',expiresAt:NOW+3600000}),write:async()=>{},clear:async()=>{}},()=>NOW);return {service,calls};}
test('device API accepts only FCM-safe tokens and correct capability/owner ack',()=>{
  for(const bad of ['', 'a'.repeat(5000),'abc\r\nHeader:123456789', 'https://token.test/'])assert.throws(()=>pushDeviceWrite(bad,true));
  assert.deepEqual(pushDeviceWrite(token,false).fields,{appId:'com.bayshop.mobile.demo',token,enabled:'0'});
  assert.throws(()=>validatePushCapability({version:1,provider:'apns',appId:'com.bayshop.mobile.demo'}));
  assert.throws(()=>validatePushAcknowledgement({code:200,error:false,data:{version:1,accountId:'8',enabled:true}},'7',true));
});
test('registration checks capability and detaches only this device using captured session after logout',async()=>{
  const {service,calls}=setup();await service.start();await flush();const binding=await service.bindPushDevice(token,undefined,service.getSnapshot().authRevision);await service.logout();await binding.release();
  assert.equal(calls.length,3);assert.equal(calls[0].options.write,undefined);assert.equal(calls[1].options.write.fields.enabled,'1');assert.equal(calls[2].options.write.fields.enabled,'0');assert.equal(calls[2].options.token,'synthetic-session');
  await binding.release();assert.equal(calls.length,3);
});
test('logout while capability is loading prevents registration',async()=>{
  let resolve;const delayed=new Promise(r=>resolve=r);const {service,calls}=setup(o=>!o.write?delayed:undefined);await service.start();await flush();const pending=service.bindPushDevice(token,undefined,service.getSnapshot().authRevision);await flush();await service.logout();resolve({version:1,provider:'fcm',appId:'com.bayshop.mobile.demo'});await assert.rejects(pending);assert.equal(calls.some(c=>c.options.write),false);
});
test('logout while registration is in flight removes late binding instead of adopting it',async()=>{
  let resolve;const delayed=new Promise(r=>resolve=r);const {service,calls}=setup(o=>o.write?.fields.enabled==='1'?delayed:undefined);await service.start();await flush();const pending=service.bindPushDevice(token,undefined,service.getSnapshot().authRevision);await flush();await service.logout();resolve({code:200,error:false,data:{version:1,accountId:'7',enabled:true}});await assert.rejects(pending);assert.deepEqual(calls.filter(c=>c.options.write).map(c=>c.options.write.fields.enabled),['1','0']);
});
test('stale lease teardown cannot remove a refreshed device binding',async()=>{
  const {service,calls}=setup();await service.start();await flush();const a=await service.bindPushDevice(token,undefined,service.getSnapshot().authRevision);const b=await service.bindPushDevice(token,undefined,service.getSnapshot().authRevision);await a.release();assert.equal(calls.filter(c=>c.options.write?.fields.enabled==='0').length,0);await b.release();assert.equal(calls.filter(c=>c.options.write?.fields.enabled==='0').length,1);
});
