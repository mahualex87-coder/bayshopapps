import test from 'node:test';
import assert from 'node:assert/strict';
import { PushInbox, parsePushIntent, pushDestination, pushTargets } from '../src/features/push/push-intent.ts';
const message = (change={}) => ({data:{bs_version:'1',bs_account_id:'7',bs_event_id:'event_12345678',bs_target:'shipments',bs_id:'22',...change}, notification:{title:'BayShop',body:'Status changed'}});
test('each supported notification has an internal read-only destination',()=>{
  const expected={waiting:'/waiting',warehouse:'/warehouse',shipments:'/shipments',received:'/received',order:'/shopping',shopping:'/shopping',refunds:'/refunds',payments:'/payments',balance:'/balance',loyalty:'/loyalty',account:'/account',news:'/notifications',overview:'/'};
  for(const target of pushTargets){const parsed=parsePushIntent(message({bs_target:target,bs_id:''}));assert.equal(pushDestination(parsed,'7').pathname,expected[target]);}
});
test('owned parcel and order links use only numeric detail identifiers',()=>{
  for(const [target,pathname] of [['waiting','/incoming/[id]'],['warehouse','/warehouse/[id]'],['shipments','/shipment/[id]'],['received','/shipment/[id]'],['order','/order/[id]']]){
    const destination=pushDestination(parsePushIntent(message({bs_target:target})),'7');assert.equal(destination.pathname,pathname);assert.equal(destination.params.id,'22');
  }
});
test('legacy, cross-account, malformed and external-url payloads never navigate',()=>{
  assert.equal(parsePushIntent({data:{action:'parcel',id:'22'}}),null);
  for(const change of [{bs_version:'2'},{bs_account_id:''},{bs_event_id:'../../route'},{bs_target:'https://evil.test'},{bs_id:'1?amount=100'},{bs_id:'9007199254740993'}])assert.equal(parsePushIntent(message(change)),null);
  const parsed=parsePushIntent(message());assert.equal(pushDestination(parsed,'8'),null);assert.equal(pushDestination(parsed,null),null);
  assert.deepEqual(pushDestination(parsePushIntent(message({bs_target:'payments',url:'https://evil.test',bs_id:'22'})),'7'),{pathname:'/payments'});
});
test('cold-start and duplicate click delivery are consumed once, other-account payloads are discarded',()=>{
  const inbox=new PushInbox();const parsed=parsePushIntent(message());assert.equal(inbox.offer(parsed),true);assert.equal(inbox.offer(parsed),false);assert.equal(inbox.take('7').eventId,parsed.eventId);assert.equal(inbox.take('7'),null);
  inbox.offer(parsePushIntent(message({bs_event_id:'event_another',bs_account_id:'8'})));assert.equal(inbox.take('7'),null);assert.equal(inbox.take('8'),null);
  inbox.offer(parsePushIntent(message({bs_event_id:'event_to_clear'})));inbox.clear();assert.equal(inbox.take('7'),null);
});
test('notification buffers and visible text are bounded without persisting account data',()=>{
  const inbox=new PushInbox();for(let i=0;i<50;i++)inbox.offer(parsePushIntent(message({bs_event_id:`event_number_${i}`})));
  let n=0;while(inbox.take('7'))n++;assert.equal(n,32);
  const parsed=parsePushIntent({...message(),notification:{title:'a'.repeat(300),body:'b\u0000'.repeat(600)}});assert.equal(parsed.title.length,160);assert.equal(parsed.body.length,500);assert.equal(parsed.body.includes('\u0000'),false);
});
