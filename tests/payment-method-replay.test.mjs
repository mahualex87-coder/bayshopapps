import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveAccountService } from '../src/api/service.ts';
import { API_ORIGIN } from '../src/api/client.ts';
import { legacyPaymentSelectionRevision, normalizeLegacyPaymentsData } from '../src/api/payment-legacy.ts';

test('later manual terminal and PayPal initiations each get a fresh catalog without automatic retries', async () => {
  const now = Date.now(), writes = [];
  const catalog = { unpaidInvoices: [{ currency_id:'1', currency:'USD', max_sum:'0', list:[{id:'101',trid:'SYNTH101',summ:'1.00'}] }], paymentTypes:Object.fromEntries(['paypal','terminals'].map(id=>[id,{name:id,availableCurrency:['USD'],allowedPurposes:'supply',max_sum:'0'}])) };
  const service = new LiveAccountService(async (path, options) => {
    if (options.write) { writes.push(options.write); return options.write.fields.paymentType==='terminals' ? {paymentCode:'301',convertedAmount:'19.00',currency_sign:'MDL'} : {redirect:'https://www.paypal.com/checkoutnow?token=SYNTHETIC-ORDER'}; }
    if (path==='/api/payments') return catalog;
    if (path==='/api/auth') return {id:'7',name:'Synthetic',surname:'Only'};
    if (path==='/api/member/me') return {member:{id:'7',email:'synthetic@example.test'}};
    if (path==='/api/member/personal-data') return {name:'Synthetic',surname:'Only',phone:'12345',phoneCode:'+373'};
    if (path==='/api/member/counters') return {awaiting:0,incoming:0,outgoing:0,received:0};
    if (path==='/api/refund-request') return {memberBalance:[]};
    return [];
  }, {read:async()=>JSON.stringify({origin:API_ORIGIN,token:'synthetic-only-session',expiresAt:now+3600000}),write:async()=>{},clear:async()=>{}},()=>now);
  await service.start(); await new Promise(resolve=>setImmediate(resolve));
  const command = paymentType => { const selection={paymentType,billIds:['101']}; return {kind:'payments.legacy.start',input:{...selection,selectionRevision:legacyPaymentSelectionRevision(selection,normalizeLegacyPaymentsData(catalog))}}; };
  assert.equal((await service.mutate(command('terminals'))).ok,true);
  assert.equal((await service.mutate(command('paypal'))).ok,true);
  for (const paymentType of ['terminals','paypal']) assert.equal((await service.mutate(command(paymentType))).ok,true);
  assert.equal(writes.length,4); assert.deepEqual(writes.map(write=>write.fields.paymentType),['terminals','paypal','terminals','paypal']);
  assert.ok(writes.every(write=>write.method==='POST' && write.path==='/api/payments'));
});
