import test from 'node:test';
import assert from 'node:assert/strict';
import { browserFailureCode, createPayPalBrowserController } from '../src/features/payments/paypal-browser-controller.ts';

const url = 'https://www.paypal.com/checkoutnow?token=SYNTHETIC-ORDER';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return { promise, resolve, reject }; };
function harness(platform='ios') {
  const wait=deferred(), calls=[]; let listener;
  const controller=createPayPalBrowserController(url,{platform,open:async value=>{calls.push(['open',value]);return wait.promise;},dismiss:async()=>calls.push(['dismiss']),subscribe:fn=>{listener=fn;return()=>{listener=null;};},returned:()=>calls.push(['return']),closed:()=>calls.push(['close']),failed:()=>calls.push(['error'])});
  return {controller,wait,calls,change:state=>listener?.(state)};
}
test('iOS OS browser opens exact saved URL once, Done checks only and does not claim paid/cancelled',async()=>{
  const h=harness(); const run=h.controller.start(); await h.controller.start();
  assert.deepEqual(h.calls,[['open',url]]); h.wait.resolve({type:'cancel'});await run;
  assert.deepEqual(h.calls,[['open',url],['return'],['close']]);h.controller.close();h.controller.dispose();assert.equal(h.calls.length,3);
});
test('Android opened is not a return; actual away→active checks once',async()=>{
  const h=harness('android'); const run=h.controller.start();h.wait.resolve({type:'opened'});await run;
  h.change('active');assert.equal(h.calls.length,1);h.change('background');h.change('active');h.change('active');
  assert.deepEqual(h.calls,[['open',url],['return'],['close']]);h.controller.dispose();
});
test('unmount before opening, late completion and browser error cannot replay a session',async()=>{
  const disposed=harness();disposed.controller.dispose();await disposed.controller.start();assert.deepEqual(disposed.calls,[]);
  const h=harness();const run=h.controller.start();h.controller.dispose();h.wait.resolve({type:'cancel'});await run;assert.deepEqual(h.calls,[['open',url],['dismiss']]);
  const error=harness();const pending=error.controller.start();error.wait.reject(Error('untrusted provider detail'));await pending;await error.controller.start();assert.deepEqual(error.calls,[['open',url],['error']]);
});
test('only strict PayPal approval links may reach the system browser',async()=>{
  for(const value of ['https://evil.example/checkoutnow?token=SYNTHETIC','https://www.paypal.com/checkoutnow?token=SYNTHETIC&redirect=x','https://www.paypal.com/signin']){
    let opened=false,failed=false;const c=createPayPalBrowserController(value,{platform:'ios',open:async()=>{opened=true;return{type:'opened'};},dismiss:async()=>{},subscribe:()=>()=>{},returned:()=>{},closed:()=>{},failed:()=>{failed=true;}});await c.start();assert.equal(opened,false);assert.equal(failed,true);
  }
});
test('validated processor GET sessions use the OS browser without form replay or callback status inference',async()=>{
  const url='https://secure.euplatesc.ro/synthetic-session?epid=SYNTHETIC';const calls=[];
  const c=createPayPalBrowserController(url,{platform:'ios',open:async value=>{calls.push(['open',value]);return{type:'cancel'};},dismiss:async()=>{},subscribe:()=>()=>{},returned:()=>calls.push(['read']),closed:()=>calls.push(['close']),failed:()=>calls.push(['error'])});
  await c.start();assert.deepEqual(calls,[['open',url],['read'],['close']]);
});


test('verified secure2 and secure3 checkout origins reach the OS browser, without accepting a numbered-host wildcard', async () => {
  for (const host of ['secure2.euplatesc.ro', 'secure3.euplatesc.ro']) {
    const checkout = `https://${host}/tdsprocess/checkout.php?cart_id=SYNTHETIC&mid=SYNTHETIC`;
    const calls = [];
    const controller = createPayPalBrowserController(checkout, { platform: 'ios',
      open: async value => { calls.push(['open', value]); return { type: 'cancel' }; }, dismiss: async () => {}, subscribe: () => () => {},
      returned: () => calls.push(['read']), closed: () => calls.push(['close']), failed: () => calls.push(['error']) });
    await controller.start(); await controller.start();
    assert.deepEqual(calls, [['open', checkout], ['read'], ['close']]);
  }
  for (const checkout of ['https://secure4.euplatesc.ro/tdsprocess/checkout.php', 'https://secure3.euplatesc.ro.evil.example/pay', 'https://user:pass@secure3.euplatesc.ro/pay', 'https://secure3.euplatesc.ro:444/pay']) {
    const calls = [];
    const controller = createPayPalBrowserController(checkout, { platform: 'ios', open: async () => { calls.push('open'); return { type: 'opened' }; },
      dismiss: async () => {}, subscribe: () => () => {}, returned: () => {}, closed: () => {}, failed: () => calls.push('error') });
    await controller.start(); assert.deepEqual(calls, ['error']);
  }
});

test('failed opens relinquish ownership before unmount, never dismiss another browser or report a return', async () => {
  const cases = [
    { expected: 'BROWSER_LOCKED', result: { type: 'locked' } },
    { expected: 'BROWSER_RESULT', result: { type: 'unexpected' } },
    { expected: 'BROWSER_OPEN_FAILED', error: new Error('private native detail https://private.example/token') },
    { expected: 'BROWSER_URL', url: 'https://outside.example/checkout' },
  ];
  for (const item of cases) {
    const calls = [];
    let controller;
    controller = createPayPalBrowserController(item.url || url, {
      platform: 'ios',
      open: async () => { calls.push('open'); if (item.error) throw item.error; return item.result; },
      dismiss: async () => { calls.push('dismiss'); },
      subscribe: () => () => {}, returned: () => calls.push('return'), closed: () => calls.push('close'),
      failed: reason => { calls.push(reason); controller.dispose(); },
    });
    await controller.start(); await controller.start(); controller.close(); controller.dispose();
    assert.deepEqual(calls, [...(item.url ? [] : ['open']), item.expected]);
  }
});

test('failed Android opens unsubscribe before a later foreground event and cannot report a return', async () => {
  const calls = []; let listener;
  const controller = createPayPalBrowserController(url, {
    platform: 'android', open: async () => ({ type: 'locked' }), dismiss: async () => calls.push('dismiss'),
    subscribe: callback => { listener = callback; return () => { calls.push('unsubscribe'); listener = null; }; },
    returned: () => calls.push('return'), closed: () => calls.push('close'), failed: reason => calls.push(reason),
  });
  await controller.start(); listener?.('background'); listener?.('active'); controller.close(); controller.dispose();
  assert.deepEqual(calls, ['unsubscribe', 'BROWSER_LOCKED']);
});

test('browser diagnostics accept only constant codes and never retain raw native or URL text', () => {
  for (const code of ['BROWSER_URL', 'BROWSER_LOCKED', 'BROWSER_RESULT', 'BROWSER_OPEN_FAILED']) assert.equal(browserFailureCode(code), code);
  for (const value of [null, undefined, {}, 'locked', 'https://private.example/token', 'BROWSER_OPEN_FAILED private']) assert.equal(browserFailureCode(value), null);
});
