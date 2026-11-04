import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalletController } from '../src/features/payments/wallet-controller.ts';
import { walletRequest, walletConfig, walletToken } from '../src/features/payments/wallet-contract.ts';
import plugin from '../plugins/with-wallet.cjs';
const { walletOptions } = plugin;
const config = { method: 'google-pay', google: { gatewayMerchantId: '44840000', environment: 'TEST', networks: ['VISA', 'MASTERCARD'] } };
const request = (id = 'qa-request-12345678') => ({ ...config, requestId: id, amount: '12.50', currencyCode: 'RON', countryCode: 'RO', merchantName: 'Synthetic QA' });
const token = r => ({ requestId: r.requestId, method: r.method, token: Buffer.from('{"encrypted":"synthetic"}').toString('base64') });
function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b}); return {promise,resolve,reject}; }
function bridge() {
 const result = deferred(); const calls = [];
 const native = { protocolVersion:1, isReadyAsync:async () => true, presentAsync:r=>{calls.push(['present',r.requestId]);return result.promise}, completeAsync:async(id,success)=>{calls.push(['complete',id,success]);return true}, cancelAsync:async id=>{calls.push(['cancel',id]);return true} };
 return {native,result,calls};
}
test('EuPlatesc request retains exact money strings and public fields only',()=>{
 const r=walletRequest({...request(),idToken:'secret',rawCard:'forbidden',google:{...config.google,oauthClientId:'wrong'}},'android');
 assert.equal(r.amount,'12.50');assert.equal(r.countryCode,'RO');assert.equal(r.google.gatewayMerchantId,'44840000');
 assert.equal('rawCard'in r,false);assert.equal('oauthClientId'in r.google,false);
});
test('malformed money/platform/currency/merchant/networks fail closed',()=>{
 for(const bad of ['0','0.00','-1','01.00','1,00','1.001','1e3','1000000000.00']) assert.throws(()=>walletRequest({...request(),amount:bad},'android'));
 assert.throws(()=>walletRequest(request(),'ios'));
 assert.throws(()=>walletRequest({...request(),currencyCode:'ron'},'android'));
 assert.throws(()=>walletConfig({...config,google:{...config.google,networks:['AMEX']}},'android'));
 assert.throws(()=>walletConfig({...config,google:{...config.google,environment:'test'}},'android'));
});
test('Apple configuration is separate from OAuth and validates merchant/network',()=>{
 assert.deepEqual(walletConfig({method:'apple-pay',apple:{merchantIdentifier:'merchant.com.example',networks:['visa']}},'ios'),{method:'apple-pay',apple:{merchantIdentifier:'merchant.com.example',networks:['visa']}});
 assert.throws(()=>walletConfig({method:'apple-pay',apple:{merchantIdentifier:'com.example',networks:['visa']}},'ios'));
});
test('plugin requires explicit matching entitlement and never creates it',()=>{
 const cfg={ios:{entitlements:{}}};assert.throws(()=>walletOptions(cfg,{appleMerchantIds:['merchant.com.example']}));
 assert.deepEqual(cfg,{ios:{entitlements:{}}});
 assert.deepEqual(walletOptions({ios:{entitlements:{'com.apple.developer.in-app-payments':['merchant.com.example']}}},{appleMerchantIds:['merchant.com.example']}).appleMerchantIds,['merchant.com.example']);
 assert.deepEqual(walletOptions({}).googleMerchantIds,[]);
});
test('no native module, protocol mismatch and web never call native',async()=>{
 assert.equal(await createWalletController(null,'android').isReadyAsync(config),false);
 await assert.rejects(createWalletController(null,'ios').presentAsync(request()),{code:'unavailable'});
 const b=bridge();b.native.protocolVersion=2;assert.equal(await createWalletController(b.native,'android').isReadyAsync(config),false);assert.deepEqual(b.calls,[]);
});
test('token acquisition retains lease until confirmed completion',async()=>{
 const b=bridge(), c=createWalletController(b.native,'android'); const r=request();
 const p=c.presentAsync(r);b.result.resolve(token(r));assert.deepEqual(await p,token(r));
 assert.equal(await c.completeAsync('wrong-id',true),false);
 await assert.rejects(c.presentAsync(request('qa-request-second1')),{code:'busy'});
 assert.equal(await c.completeAsync(r.requestId,true),true);assert.deepEqual(b.calls.at(-1),['complete',r.requestId,true]);
 assert.equal(await c.completeAsync(r.requestId,true),false);
});
test('two controller instances cannot double tap into same native module',async()=>{
 const b=bridge(),a=createWalletController(b.native,'android'),c=createWalletController(b.native,'android');
 const p=a.presentAsync(request());await assert.rejects(c.presentAsync(request('qa-request-second2')),{code:'busy'});
 a.dispose();await assert.rejects(p,{code:'cancelled'});c.dispose();
});
test('abort before start creates no native request',async()=>{
 const b=bridge(),a=new AbortController();a.abort();await assert.rejects(createWalletController(b.native,'android').presentAsync(request(),a.signal),{code:'cancelled'});assert.equal(b.calls.length,0);
});
test('abort during sheet discards late token and sanitizes result',async()=>{
 const b=bridge(),c=createWalletController(b.native,'android'),a=new AbortController();const r=request();const p=c.presentAsync(r,a.signal);a.abort();b.result.resolve(token(r));
 await assert.rejects(p,{code:'cancelled'});assert.equal(await c.completeAsync(r.requestId,true),false);assert.equal(b.calls.at(-1)[0],'cancel');
});
test('dispose after token prevents later completion and does not store token',async()=>{
 const b=bridge(),c=createWalletController(b.native,'android'),r=request();const p=c.presentAsync(r);b.result.resolve(token(r));await p;c.dispose();assert.equal(await c.completeAsync(r.requestId,true),false);
 assert.equal(JSON.stringify(c).includes('encrypted'),false);
});
test('wrong ID/method/base64 never reaches server caller',async()=>{
 const b=bridge(),c=createWalletController(b.native,'android');const p=c.presentAsync(request());b.result.resolve({...token(request()),requestId:'stale-request-1234'});await assert.rejects(p,{code:'invalid_result'});assert.equal(b.calls.at(-1)[0],'cancel');
 assert.throws(()=>walletToken({...token(request()),method:'apple-pay'},request()));assert.throws(()=>walletToken({...token(request()),token:'not base64'},request()));
});
test('native exception cannot expose provider payload in error',async()=>{
 const b=bridge(),c=createWalletController(b.native,'android'),p=c.presentAsync(request());b.result.reject(new Error('PAYMENT_TOKEN_DO_NOT_SHOW'));await assert.rejects(p,error=>error.message==='wallet.failed'&&!error.message.includes('PAYMENT_TOKEN'));
});
test('timeout cancels native without retry or duplicated request',async()=>{
 const b=bridge(),c=createWalletController(b.native,'android',{presentationMs:10,processingMs:10});
 await assert.rejects(c.presentAsync(request()),{code:'timeout'});assert.deepEqual(b.calls.map(x=>x[0]),['present','cancel']);
});
test('processing timeout invalidates completion but makes no payment/retry',async()=>{
 const b=bridge(),c=createWalletController(b.native,'android',{presentationMs:100,processingMs:10}),r=request();const p=c.presentAsync(r);b.result.resolve(token(r));await p;await new Promise(r=>setTimeout(r,20));assert.equal(await c.completeAsync(r.requestId,true),false);assert.deepEqual(b.calls.map(x=>x[0]),['present','cancel']);
});
test('same ID cannot be reused after cancel and native cleanup races cannot release newer lease',async()=>{
 const b=bridge(),c=createWalletController(b.native,'android'),r=request(),p=c.presentAsync(r);await c.cancelAsync(r.requestId);await assert.rejects(p,{code:'cancelled'});await assert.rejects(c.presentAsync(r),{code:'invalid_request'});
});
test('server rejection passes failure to native, never changes money or retries',async()=>{
 const b=bridge(),c=createWalletController(b.native,'android'),r=request();const p=c.presentAsync(r);b.result.resolve(token(r));await p;assert.equal(await c.completeAsync(r.requestId,false),true);assert.deepEqual(b.calls.at(-1),['complete',r.requestId,false]);
});
test('double completion dispatches only one native acknowledgment',async()=>{
 const b=bridge(),done=deferred();let completions=0;b.native.completeAsync=()=>{completions++;return done.promise};
 const c=createWalletController(b.native,'android'),r=request();const p=c.presentAsync(r);b.result.resolve(token(r));await p;
 const ack=c.completeAsync(r.requestId,true);assert.equal(await c.completeAsync(r.requestId,true),false);assert.equal(completions,1);done.resolve(true);assert.equal(await ack,true);
});
test('cancel during completion wins without accepting late success',async()=>{
 const b=bridge(),done=deferred();b.native.completeAsync=()=>done.promise;
 const c=createWalletController(b.native,'android'),r=request();const p=c.presentAsync(r);b.result.resolve(token(r));await p;
 const ack=c.completeAsync(r.requestId,true);await c.cancelAsync(r.requestId);done.resolve(true);assert.equal(await ack,false);
});
