import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { HostedCheckoutError, isHostedCheckoutUrl } from '../src/api/hosted-checkout.ts';
import { areAttemptInvoicesPaid, isPayPalApprovalUrl, isUnopenedCardAttempt, parsePaymentAttempt, parsePaymentLedger, emptyPaymentLedger, attemptsBlockingBills, legacyUnscopedAttempts } from '../src/features/payments/payment-attempt.ts';
import { invoiceScopeIsUnpaid, reconcilePaymentInvoices } from '../src/api/payment-reconciliation.ts';
import { normalizeLegacyPaymentsData, legacyPaymentDisplayBase, legacyPaymentSelectionRevision, legacyPreparationDiagnostic, validateLegacyPaymentSelection } from '../src/api/payment-legacy.ts';
import { ApiError, errorMessage } from '../src/api/client.ts';
import { browserFailureCode } from '../src/features/payments/paypal-browser-controller.ts';

const uuid = '11111111-2222-4333-8444-555555555555';
let issuedKey = 0;
const selected = { paymentType: 'platescro', billIds: ['1'] };
const form = { kind: 'form', url: 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php', method: 'POST', fields: { invoice_id: '42' } };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function selectionData() {
  return normalizeLegacyPaymentsData({ unpaidInvoices: ['USD','EUR'].map((currency,index)=>({currency_id:String(index+1),currency,max_sum:'0',list:[{id:String(index+1),trid:`SYNTH-${index+1}`,summ:'1.00'}]})), isBillingSet:true, billingData:{first_name:'Synthetic',last_name:'Only',address1:'Test',city:'Test',state:'Test',email:'synthetic@example.test',phone:'12345',zip:'12345',country:'1'}, paymentTypes:Object.fromEntries(['platescro','paypal','terminals','apple-pay','google-pay'].map(id=>[id,{name:id,availableCurrency:['USD','EUR'],max_sum:'0',hide_billing:'0',allowedPurposes:'supply'}])) });
}
function decodeLedger(disk) {
  if(disk===null)return emptyPaymentLedger();
  if(JSON.parse(disk).attempts)return parsePaymentLedger(disk);
  const attempt=parsePaymentAttempt(disk);return {version:2,activeAttemptKey:attempt.attemptKey,attempts:[attempt]};
}

function harness({ stored = null, mutation, statuses = [], read, storageFailure = false, failedWrites = [], invalidSelection = false, sharedDisk, storeWrite, hosted } = {}) {
  const slots = [], effects = [], cleanups = [], calls = [], listeners = new Set(), delays = [];
  const appState = { currentState: 'active', addEventListener: (_event, cb) => { listeners.add(cb); return { remove() { listeners.delete(cb); } }; } };
  let cursor = 0, value, writeCount = 0;
  const storage=sharedDisk??{raw:stored === null ? null : typeof stored === 'string' ? stored : JSON.stringify(stored)};
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((d, j) => d !== slots[i].deps[j])) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((d, j) => d !== slots[i][j])) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  const context = {
    accountId: '10', accountRevision: 1, canMutate: true,
    readView: async (query, options) => {
      calls.push(['read', query]);
      const custom = read?.(query, options); if (custom !== undefined) return custom;
      if (query.kind === 'payments.legacy.catalog') return selectionData();
      if (query.kind === 'payments.invoice.read') return null;
      if (query.kind === 'payments.invoice.history') return [];
      return statuses.shift() ?? { paymentId: query.paymentId, state: 'unconfirmed', amount: null, currencySign: null };
    },
    mutate: async (command, options) => { calls.push(['mutate', command]); return mutation ? mutation(command, options) : { ok: true, data: { paymentId: '42', paymentType: 'platescro', action: form } }; },
    refresh: async keys => calls.push(['refresh', keys]),
  };
  const store = {
    clearLegacyAttempts: async id => { calls.push(['clear',id]); if(storageFailure)throw Error('storage'); storage.raw=null; },
    readLedger: async () => decodeLedger(storage.raw),
    writeLedger: async (_id, next) => {
      writeCount++; calls.push(['writeAttempt', writeCount]);
      if (storageFailure || failedWrites.includes(writeCount)) throw new Error('storage');
      const raw = JSON.stringify(next); parsePaymentLedger(raw); if(storeWrite)await storeWrite(next,writeCount); calls.push(['write', JSON.parse(raw)]); storage.raw = raw;
    },
  };
  const imports = {
    react,
    'react-native': { AppState: appState },
    'expo-crypto': { randomUUID: () => `00000000-0000-4000-8000-${String(++issuedKey).padStart(12,'0')}`, CryptoDigestAlgorithm:{SHA256:'SHA256'}, digestStringAsync:async ()=>assert.fail('no persistent financial digest') },
    'expo/fetch': { fetch: () => { throw Error('No live provider requests'); } },
    '@/api/context': { useLiveAccount: () => context },
    '@/api/client': { ApiError, errorMessage },
    '@/api/payment-legacy': { legacyPreparationDiagnostic, legacyPaymentDisplayBase, legacyPaymentSelectionRevision: (...args) => { if (invalidSelection) throw new Error('invalid'); return legacyPaymentSelectionRevision(...args); }, validateLegacyPaymentSelection },
    '@/api/payment-reconciliation': { invoiceScopeIsUnpaid, reconcilePaymentInvoices },
    '@/api/hosted-checkout': { HostedCheckoutError, isHostedCheckoutUrl, prepareHostedCheckout:async(action,options)=>{calls.push(['hosted',action.fields.invoice_id]);return hosted?hosted(action,options):{paymentId:action.fields.invoice_id,channel:action.fields['ExtraData[ep_channel]']??'APAY',url:'https://secure.euplatesc.ro/synthetic-checkout?epid=SYNTHETIC'};} },
    './payment-attempt-store': { paymentAttemptStore: store },
    './paypal-browser-controller': { browserFailureCode },
    './payment-attempt': { areAttemptInvoicesPaid, isPayPalApprovalUrl, isUnopenedCardAttempt, emptyPaymentLedger, attemptsBlockingBills, legacyUnscopedAttempts },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/payments/usePaymentFlow.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const timers = new Map(); let timer = 0;
  vm.runInNewContext(code, { exports, require: name => { assert(name in imports, name); return imports[name]; }, AbortController, Date, setTimeout: (fn, delay) => { delays.push(delay); timers.set(++timer, fn); return timer; }, setInterval: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id) });
  const reload = () => calls.push(['reload']);
  const render = () => { cursor = 0; value = exports.usePaymentFlow(reload); while (effects.length) effects.shift()(); return value; };
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); return render(); };
  render();
  return { render, flush, calls, ledger:()=>decodeLedger(storage.raw), stored: () => {const ledger=decodeLedger(storage.raw);return ledger.attempts.find(attempt=>attempt.attemptKey===ledger.activeAttemptKey)??null;}, storedRaw: () => storage.raw, context, appState, delays, tick: async () => { const next = timers.entries().next().value; if (next) { timers.delete(next[0]); next[1](); } return flush(); }, unmount: () => cleanups.forEach(fn => fn?.()), remount:()=>{cleanups.forEach(fn=>fn?.());slots.length=0;effects.length=0;cleanups.length=0;return render();}, fireForeground: () => listeners.forEach(fn => fn('active')), fireAppState:state=>{appState.currentState=state;listeners.forEach(fn=>fn(state));} };
}


test('old pending v1/v2 and corrupt local histories are cleared without reads, provider opens, or status claims', async () => {
  for(const stored of [{version:1,attemptKey:uuid,paymentId:null,paymentType:'paypal',createdAt:1}, {version:2,activeAttemptKey:uuid,attempts:[]}, '{corrupt']) {
    const h=harness({stored});const view=await h.flush();
    assert.equal(h.storedRaw(),null);assert.equal(view.attempt,null);assert.equal(view.status,null);assert.equal(view.provider,null);assert.equal(view.invoicesPaid,false);assert.equal(view.ready,true);
    assert.deepEqual(h.calls.map(c=>c[0]),['clear']);assert.equal(h.calls[0][1],'10');h.unmount();
  }
});

test('cleanup failure is visible but cannot restore a payment lock', async()=>{
  const h=harness({stored:'{corrupt',storageFailure:true});let view=await h.flush();
  assert.equal(view.ready,true);assert.equal(view.error,'payments.localCleanupFailed');
  await view.start(selected,selectionData());view=await h.flush();
  assert.equal(h.calls.filter(c=>c[0]==='mutate').length,1);assert.equal(view.provider.kind,'form');assert.equal(h.calls.some(c=>c[0]==='write'),false);h.unmount();
});

test('double tap makes one POST after a fresh catalog and never persists a provider',async()=>{
  const wait=deferred(),h=harness({mutation:()=>wait.promise});let view=await h.flush();
  const first=view.start(selected,selectionData()),second=view.start(selected,selectionData());await h.flush();
  assert.equal(h.calls.filter(c=>c[0]==='mutate').length,1);assert.ok(h.calls.findIndex(c=>c[0]==='read'&&c[1].kind==='payments.legacy.catalog')<h.calls.findIndex(c=>c[0]==='mutate'));
  wait.resolve({ok:true,data:{paymentId:'42',paymentType:'platescro',action:form}});await Promise.all([first,second]);view=await h.flush();
  assert.equal(view.provider.kind,'form');assert.equal(view.attempt.paymentId,'42');assert.equal(view.status,null);assert.equal(h.storedRaw(),null);assert.equal(h.calls.some(c=>c[0]==='write'),false);h.unmount();
});

test('fresh changed billing, cap or invoice data rejects the displayed selection without a POST',async()=>{
  const changed=selectionData();changed.catalog.invoiceGroups[0].maxSum='0.50';
  const h=harness({read:q=>q.kind==='payments.legacy.catalog'?changed:undefined});let view=await h.flush();await view.start(selected,selectionData());view=await h.flush();
  assert.equal(view.error,'payments.quoteChanged');assert.equal(view.attempt,null);assert.equal(view.busy,false);assert.equal(h.calls.some(c=>c[0]==='mutate'),false);h.unmount();
});

test('each later manual PayPal tap is allowed after an unknown response; no automatic POST occurs',async()=>{
  const h=harness({mutation:async()=>({ok:false,outcome:'unknown'})});let view=await h.flush();
  for(let n=1;n<=2;n++){await view.start({...selected,paymentType:'paypal'},selectionData());view=await h.flush();assert.equal(view.attempt,null);assert.equal(view.provider,null);assert.equal(view.error,'payments.unknown');assert.equal(h.calls.filter(c=>c[0]==='mutate').length,n);}
  await h.tick();assert.equal(h.calls.filter(c=>c[0]==='mutate').length,2);assert.equal(h.storedRaw(),null);h.unmount();
});

test('closing an unconfirmed card returns to fresh invoices and permits a new deliberate payment',async()=>{
  const h=harness();let view=await h.flush();await view.start(selected,selectionData());view=await h.flush();await view.closeProvider();view=await h.flush();
  assert.equal(view.provider,null);assert.equal(view.attempt,null);assert.equal(view.status,null);assert.equal(view.invoicesPaid,false);assert.ok(h.calls.filter(c=>c[0]==='read'&&c[1].kind==='payments.legacy.catalog').length>=2);
  await view.start(selected,selectionData());view=await h.flush();assert.equal(h.calls.filter(c=>c[0]==='mutate').length,2);assert.equal(view.provider.kind,'form');h.unmount();
});

test('provider failure refreshes invoices and exposes only an interruption code unless owned status proves payment',async()=>{
  for(const paid of [false,true]) {
    const h=harness({statuses:[{paymentId:'42',state:paid?'paid':'unconfirmed',amount:paid?'1.00':null,currencySign:paid?'$':null}]});let view=await h.flush();await view.start(selected,selectionData());view=await h.flush();await view.providerFailed();view=await h.flush();
    assert.equal(view.provider,null);assert.equal(view.error,paid?null:'payments.providerInterrupted');assert.equal(view.diagnosticCode,paid?null:'PROVIDER_INTERRUPTED');
    assert.equal(view.status?.state??null,paid?'paid':null);assert.equal(view.attempt?.paymentId??null,paid?'42':null);
    assert.ok(h.calls.filter(c=>c[0]==='read'&&c[1].kind==='payments.legacy.catalog').length>=2);h.unmount();
  }
});

test('known card succeeds only after exact owned paid status and refreshes real balance',async()=>{
  const h=harness({statuses:[{paymentId:'42',state:'paid',amount:'1.00',currencySign:'$'}]});let view=await h.flush();await view.start(selected,selectionData());view=await h.flush();
  await view.providerReturn('42');view=await h.flush();assert.equal(view.status.state,'paid');assert.equal(view.provider,null);assert.equal(view.attempt.paymentId,'42');assert.deepEqual(h.calls.filter(c=>c[0]==='refresh').map(c=>[...c[1]]),[['balance','profile']]);
  await view.finish();view=await h.flush();assert.equal(view.attempt,null);assert.equal(view.status,null);assert.equal(h.storedRaw(),null);h.unmount();
});

test('mismatched callback/payment status cannot confirm another payment',async()=>{
  const h=harness({statuses:[{paymentId:'99',state:'paid',amount:'1',currencySign:'$'}]});let view=await h.flush();await view.start(selected,selectionData());view=await h.flush();
  await view.providerReturn('99');view=await h.flush();assert.equal(view.status,null);assert.ok(view.provider);assert.equal(h.calls.some(c=>c[0]==='read'&&c[1].paymentId==='99'),false);
  await view.closeProvider();view=await h.flush();assert.equal(view.status,null);assert.equal(view.attempt,null);assert.equal(h.calls.some(c=>c[0]==='refresh'),false);h.unmount();
});

test('PayPal null ID uses exact paid invoices, not an arbitrary callback ID',async()=>{
  const row={id:null,reference:'SYNTH-1',amount:'1.00',type:'minus',status:'paid',paymentId:'77',created:'2026-11-02 10:00:00'};
  const h=harness({mutation:async()=>({ok:true,data:{paymentId:null,paymentType:'paypal',action:{kind:'redirect',url:'https://www.paypal.com/checkoutnow?token=SYNTHETIC'}}}),read:q=>q.kind==='payments.invoice.read'?row:q.kind==='payments.invoice.history'?[{currency:'USD',record:row}]:undefined});
  let view=await h.flush();await view.start({...selected,paymentType:'paypal'},selectionData());view=await h.flush();await view.providerReturn('999');view=await h.flush();
  assert.equal(view.invoicesPaid,true);assert.equal(view.status,null);assert.equal(view.attempt.paymentId,null);assert.equal(h.calls.some(c=>c[0]==='read'&&c[1].paymentId==='999'),false);assert.equal(h.storedRaw(),null);h.unmount();
});

test('partial or missing invoice proof does not claim success or retain a pending screen',async()=>{
  const h=harness({mutation:async()=>({ok:true,data:{paymentId:null,paymentType:'paypal',action:{kind:'redirect',url:'https://www.paypal.com/checkoutnow?token=SYNTHETIC'}}})});let view=await h.flush();await view.start({...selected,paymentType:'paypal'},selectionData());view=await h.flush();await view.closeProvider();view=await h.flush();
  assert.equal(view.invoicesPaid,false);assert.equal(view.status,null);assert.equal(view.attempt,null);assert.equal(view.provider,null);h.unmount();
});

test('same bPay code can be shown again without a duplicate durable ID failure, or another method chosen',async()=>{
  const h=harness({mutation:async command=>({ok:true,data:{paymentId:'301',paymentType:command.input.paymentType,action:{kind:'terminal',paymentCode:'301',amount:'19.00',currency:null,currencySign:'MDL',expiresAt:null}}})});let view=await h.flush();
  for(let n=0;n<2;n++){await view.start({...selected,paymentType:'terminals'},selectionData());view=await h.flush();assert.equal(view.action.paymentCode,'301');await view.showInvoices();view=await h.flush();assert.equal(view.action,null);assert.equal(view.attempt,null);}
  assert.equal(h.calls.filter(c=>c[0]==='mutate').length,2);assert.equal(h.calls.some(c=>c[0]==='write'),false);h.unmount();
});

test('unmount during catalog read makes no POST and no new account receives the old result',async()=>{
  const wait=deferred(),h=harness({read:q=>q.kind==='payments.legacy.catalog'?wait.promise:undefined});let view=await h.flush();const start=view.start(selected,selectionData());await h.flush();h.unmount();wait.resolve(selectionData());await start;
  assert.equal(h.calls.some(c=>c[0]==='mutate'),false);h.remount();view=await h.flush();assert.equal(view.attempt,null);assert.equal(view.provider,null);h.unmount();
});

test('logout invalidates an old catalog callback and masks account-bound payment state immediately',async()=>{
  const wait=deferred();let reads=0;const h=harness({read:q=>q.kind==='payments.legacy.catalog'&&++reads===2?wait.promise:undefined});let view=await h.flush();await view.start(selected,selectionData());view=await h.flush();
  const returning=view.showInvoices();await h.flush();const reloads=h.calls.filter(c=>c[0]==='reload').length;
  h.context.accountId=null;h.context.accountRevision++;view=h.render();assert.equal(view.attempt,null);assert.equal(view.provider,null);assert.equal(view.ready,false);
  wait.resolve(selectionData());await returning;view=await h.flush();
  assert.equal(h.calls.filter(c=>c[0]==='reload').length,reloads);assert.equal(view.error,null);assert.equal(view.ready,false);h.unmount();
});

test('remount cannot double-submit an in-flight request or open its late provider',async()=>{
  const wait=deferred();let count=0;const h=harness({mutation:async()=>++count===1?wait.promise:{ok:true,data:{paymentId:'43',paymentType:'platescro',action:form}}});let view=await h.flush();const pending=view.start(selected,selectionData());await h.flush();h.remount();view=await h.flush();await view.start(selected,selectionData());assert.equal(count,1);
  wait.resolve({ok:true,data:{paymentId:'42',paymentType:'platescro',action:form}});await pending;view=await h.flush();assert.equal(view.attempt,null);assert.equal(view.provider,null);
  await view.start(selected,selectionData());view=await h.flush();assert.equal(count,2);assert.equal(view.attempt.paymentId,'43');h.unmount();
});

test('late status from A cannot mark active B paid or clear its provider',async()=>{
  const wait=deferred();let count=0;const h=harness({mutation:async()=>({ok:true,data:{paymentId:String(42+count++),paymentType:'platescro',action:form}}),read:q=>q.kind==='payments.legacy.status'&&q.paymentId==='42'?wait.promise:undefined});let view=await h.flush();await view.start(selected,selectionData());view=await h.flush();const closing=view.closeProvider();await h.flush();
  view=h.render();await view.start(selected,selectionData());view=await h.flush();assert.equal(view.attempt.paymentId,'43');wait.resolve({paymentId:'42',state:'paid',amount:'1',currencySign:'$'});await closing;view=await h.flush();assert.equal(view.attempt.paymentId,'43');assert.equal(view.status,null);assert.ok(view.provider);assert.equal(h.calls.some(c=>c[0]==='refresh'),false);h.unmount();
});

test('hosted APAY uses one tokenless PSP preparation and opens secure2 only in memory',async()=>{
  const action={...form,fields:{...form.fields,'ExtraData[ep_channel]':'APAY'}};
  const h=harness({mutation:async()=>({ok:true,data:{paymentId:'42',paymentType:'platescro',action}}),hosted:async()=>({paymentId:'42',channel:'APAY',url:'https://secure2.euplatesc.ro/tdsprocess/checkout.php?ep_id=SYNTHETIC'})});let view=await h.flush();await view.start({...selected,hostedChannel:'APAY'},selectionData());view=await h.flush();
  assert.equal(view.provider.kind,'redirect');assert.ok(view.provider.url.startsWith('https://secure2.euplatesc.ro/'));assert.equal(h.calls.filter(c=>c[0]==='hosted').length,1);assert.equal(h.calls.find(c=>c[0]==='mutate')[1].input.hostedChannel,'APAY');assert.equal(h.storedRaw(),null);h.unmount();
});

test('hosted timeout returns invoices without automatic retry and a later manual tap works',async()=>{
  const action={...form,fields:{...form.fields,'ExtraData[ep_channel]':'GPAY'}};let count=0;
  const h=harness({mutation:async()=>({ok:true,data:{paymentId:'42',paymentType:'platescro',action}}),hosted:async()=>{if(++count===1)throw Error('timeout');return {paymentId:'42',channel:'GPAY',url:'https://secure2.euplatesc.ro/checkout?ep_id=SYNTHETIC'};}});let view=await h.flush();await view.start({...selected,hostedChannel:'GPAY'},selectionData());view=await h.flush();assert.equal(view.error,'payments.checkoutFailed');assert.equal(view.attempt,null);assert.equal(view.provider,null);await h.tick();assert.equal(count,1);
  await view.start({...selected,hostedChannel:'GPAY'},selectionData());view=await h.flush();assert.equal(count,2);assert.equal(view.provider.kind,'redirect');h.unmount();
});

test('hosted failures expose only a constant diagnostic code and reset it for a later manual action',async()=>{
  let count=0; const action={...form,fields:{...form.fields,'ExtraData[ep_channel]':'APAY'}};
  const h=harness({mutation:async()=>({ok:true,data:{paymentId:'42',paymentType:'platescro',action}}),hosted:async()=>{if(++count===1)throw new HostedCheckoutError('outcome_unknown','response','42',true,'URL_ORIGIN');return {paymentId:'42',channel:'APAY',url:'https://secure3.euplatesc.ro/checkout?ep_id=SYNTHETIC'};}});
  let view=await h.flush();await view.start({...selected,hostedChannel:'APAY'},selectionData());view=await h.flush();
  assert.equal(view.error,'payments.checkoutFailed');assert.equal(view.diagnosticCode,'HOSTED_URL_ORIGIN');assert.equal(view.attempt,null);assert.equal(view.provider,null);
  await view.start({...selected,hostedChannel:'APAY'},selectionData());view=await h.flush();
  assert.equal(view.diagnosticCode,null);assert.equal(view.error,null);assert.ok(view.provider.url.startsWith('https://secure3.euplatesc.ro/'));assert.equal(count,2);h.unmount();
});

test('background or account change cancels the in-flight hosted URL handoff',async()=>{
  for(const mode of ['background','account']){
    const wait=deferred(),action={...form,fields:{...form.fields,'ExtraData[ep_channel]':'APAY'}};let signal;
    const h=harness({mutation:async()=>({ok:true,data:{paymentId:'42',paymentType:'platescro',action}}),hosted:(_action,options)=>{signal=options.signal;return wait.promise;}});let view=await h.flush();const pending=view.start({...selected,hostedChannel:'APAY'},selectionData());await h.flush();
    if(mode==='background')h.fireAppState('background');else{h.context.accountId='20';h.context.accountRevision++;h.render();await h.flush();}
    assert.equal(signal.aborted,true);wait.resolve({paymentId:'42',channel:'APAY',url:'https://secure2.euplatesc.ro/checkout?ep_id=SYNTHETIC'});await pending;view=await h.flush();assert.equal(view.provider,null);assert.equal(view.attempt,null);h.unmount();
  }
});

test('a brief iOS inactive state during checkout preparation keeps the original payment and opens it once active', async () => {
  const wait = deferred(); let signal;
  const h = harness({ hosted: (_action, options) => { signal = options.signal; return wait.promise; } });
  let view = await h.flush();
  const pending = view.start({ ...selected, hostedChannel: 'APAY' }, selectionData());
  await h.flush();
  h.fireAppState('inactive');
  assert.equal(signal.aborted, false);
  wait.resolve({ paymentId: '42', channel: 'APAY', url: 'https://secure3.euplatesc.ro/checkout?ep_id=SYNTHETIC' });
  view = await h.flush();
  assert.equal(view.provider, null); assert.equal(view.busy, true); assert.equal(view.error, null);
  await view.start({ ...selected, hostedChannel: 'APAY' }, selectionData());
  assert.equal(h.calls.filter(call => call[0] === 'mutate').length, 1);
  h.fireAppState('active'); await pending; view = await h.flush();
  assert.equal(view.provider.url, 'https://secure3.euplatesc.ro/checkout?ep_id=SYNTHETIC');
  assert.equal(view.attempt.paymentId, '42'); assert.equal(view.error, null);
  assert.equal(h.calls.filter(call => call[0] === 'hosted').length, 1);
  assert.equal(h.calls.some(call => call[0] === 'write'), false);
  h.unmount();
});

test('inactive before PSP preparation waits for active without losing the signed BayShop response', async () => {
  const wait = deferred(), h = harness({ mutation: () => wait.promise });
  let view = await h.flush(); const pending = view.start({ ...selected, hostedChannel: 'APAY' }, selectionData());
  await h.flush(); h.fireAppState('inactive');
  wait.resolve({ ok: true, data: { paymentId: '42', paymentType: 'platescro', action: form } });
  view = await h.flush();
  assert.equal(view.error, null); assert.equal(view.busy, true);
  assert.equal(h.calls.filter(call => call[0] === 'hosted').length, 0);
  h.fireAppState('active'); await pending; view = await h.flush();
  assert.equal(view.provider.kind, 'redirect'); assert.equal(view.attempt.paymentId, '42');
  assert.equal(h.calls.filter(call => call[0] === 'mutate').length, 1);
  assert.equal(h.calls.filter(call => call[0] === 'hosted').length, 1);
  h.unmount();
});

test('background, account change, unmount or inactivity timeout cannot open a saved checkout later', async () => {
  for (const mode of ['background', 'account', 'unmount', 'timeout']) {
    const wait = deferred(), h = harness({ hosted: () => wait.promise });
    let view = await h.flush(); const pending = view.start({ ...selected, hostedChannel: 'APAY' }, selectionData());
    await h.flush(); h.fireAppState('inactive');
    wait.resolve({ paymentId: '42', channel: 'APAY', url: 'https://secure3.euplatesc.ro/checkout?ep_id=SYNTHETIC' });
    await h.flush();
    if (mode === 'background') h.fireAppState('background');
    else if (mode === 'account') { h.context.accountId = '20'; h.context.accountRevision++; h.render(); }
    else if (mode === 'unmount') h.unmount();
    else await h.tick();
    await pending; h.fireAppState('active'); view = await h.flush();
    assert.equal(view.provider, null, mode);
    if (mode === 'timeout') {
      assert.equal(view.diagnosticCode, 'HANDOFF_INACTIVE_TIMEOUT');
      assert.equal(view.busy, false); assert.equal(view.attempt, null);
    }
    assert.equal(h.calls.filter(call => call[0] === 'mutate').length, 1);
    assert.equal(h.calls.filter(call => call[0] === 'hosted').length, 1);
    h.unmount();
  }
});

test('aborted PSP preparation keeps its safe failure code after transient state cleanup', async () => {
  const h = harness({ hosted: (_action, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new HostedCheckoutError('outcome_unknown', 'aborted', '42', true)), { once: true });
  }) });
  let view = await h.flush(); const pending = view.start({ ...selected, hostedChannel: 'APAY' }, selectionData());
  await h.flush(); h.fireAppState('background'); await pending; view = await h.flush();
  assert.equal(view.error, 'payments.checkoutFailed'); assert.equal(view.diagnosticCode, 'HOSTED_ABORTED');
  assert.equal(view.attempt, null); assert.equal(view.provider, null); assert.equal(view.busy, false);
  assert.equal(h.calls.filter(call => call[0] === 'mutate').length, 1);
  h.unmount();
});

test('active then inactive before the continuation cannot dispatch PSP or open checkout early', async () => {
  for (const phase of ['preparation', 'presentation']) {
    const wait = deferred();
    const h = harness(phase === 'preparation' ? { mutation: () => wait.promise } : { hosted: () => wait.promise });
    let view = await h.flush(); const pending = view.start({ ...selected, hostedChannel: 'APAY' }, selectionData());
    await h.flush(); h.fireAppState('inactive');
    wait.resolve(phase === 'preparation' ? { ok: true, data: { paymentId: '42', paymentType: 'platescro', action: form } }
      : { paymentId: '42', channel: 'APAY', url: 'https://secure3.euplatesc.ro/checkout?ep_id=SYNTHETIC' });
    await h.flush(); h.fireAppState('active'); h.fireAppState('inactive');
    view = await h.flush(); assert.equal(view.provider, null); assert.equal(view.error, null);
    if (phase === 'preparation') assert.equal(h.calls.filter(call => call[0] === 'hosted').length, 0);
    h.fireAppState('active'); await pending; view = await h.flush();
    assert.equal(view.provider.kind, 'redirect');
    assert.equal(h.calls.filter(call => call[0] === 'mutate').length, 1);
    assert.equal(h.calls.filter(call => call[0] === 'hosted').length, 1);
    h.unmount();
  }
});

test('leaving during BayShop preparation prevents a late PSP request even after returning active', async () => {
  const wait = deferred(); let signal;
  const h = harness({ mutation: (_command, options) => { signal = options.signal; return wait.promise; } });
  let view = await h.flush(); const pending = view.start({ ...selected, hostedChannel: 'APAY' }, selectionData());
  await h.flush(); h.fireAppState('background'); h.fireAppState('active');
  assert.equal(signal.aborted, true);
  wait.resolve({ ok: true, data: { paymentId: '42', paymentType: 'platescro', action: form } });
  await pending; view = await h.flush();
  assert.equal(view.provider, null); assert.equal(view.attempt, null); assert.equal(view.busy, false);
  assert.equal(h.calls.filter(call => call[0] === 'hosted').length, 0);
  assert.equal(h.calls.filter(call => call[0] === 'mutate').length, 1);
  h.unmount();
});

test('browser opening failure preserves its stage code without changing server-authoritative confirmation', async () => {
  for (const [code, expected] of [['BROWSER_LOCKED', 'BROWSER_LOCKED'], ['https://private.test/?token=secret', 'PROVIDER_INTERRUPTED']]) {
    const h = harness(); let view = await h.flush();
    await view.start(selected, selectionData()); view = await h.flush();
    await view.providerFailed(code); view = await h.flush();
    assert.equal(view.diagnosticCode, expected); assert.equal(view.status, null); assert.equal(view.provider, null);
    assert.equal(view.error, 'payments.providerInterrupted');
    assert.equal(h.calls.filter(call => call[0] === 'mutate').length, 1);
    h.unmount();
  }
});

test('foreground polling performs only owned status reads and never repeats initiation',async()=>{
  const h=harness();let view=await h.flush();await view.start(selected,selectionData());view=await h.flush();
  for(let i=0;i<8;i++)await h.tick();assert.ok(h.delays.includes(15000));assert.equal(h.calls.some(c=>c[0]==='read'&&c[1].kind==='payments.invoice.history'),false);assert.equal(h.calls.filter(c=>c[0]==='mutate').length,1);
  const reads=h.calls.filter(c=>c[0]==='read').length;h.appState.currentState='background';await h.tick();assert.equal(h.calls.filter(c=>c[0]==='read').length,reads);h.unmount();
});

test('local validation and fresh catalog failures leave a usable invoice screen and make no POST',async()=>{
  for(const config of [{invalidSelection:true},{read:q=>q.kind==='payments.legacy.catalog'?Promise.reject(new ApiError(0,'errors.network')):undefined}]){
    const h=harness(config);let view=await h.flush();await view.start(selected,selectionData());view=await h.flush();assert.equal(view.ready,true);assert.equal(view.busy,false);assert.equal(view.attempt,null);assert.equal(h.calls.some(c=>c[0]==='mutate'),false);h.unmount();
  }
});


test('bPay equivalent retains the exact fresh net base after balance cap, bound to the current attempt', async () => {
  const data = selectionData();
  data.catalog.invoiceGroups[0].invoices[0].amount = '200.123400';
  data.catalog.invoiceGroups[0].maxSum = '12.3400';
  const h = harness({ read: q => q.kind === 'payments.legacy.catalog' ? data : undefined,
    mutation: async command => ({ ok: true, data: { paymentId: '301', paymentType: command.input.paymentType, action: { kind: 'terminal', paymentCode: '301', amount: '234.567', currency: null, currencySign: 'MDL', expiresAt: null } } }) });
  let view = await h.flush();
  await view.start({ paymentType: 'terminals', billIds: ['1'] }, data); view = await h.flush();
  assert.equal(view.terminalOrigin.amount, '12.3400');
  assert.equal(view.terminalOrigin.currency, 'USD');
  assert.equal(view.terminalOrigin.attemptKey, view.attempt.attemptKey);
  assert.equal(view.action.amount, '234.567');
  assert.equal(h.calls.filter(c => c[0] === 'mutate').length, 1);
  assert.equal('amount' in h.calls.find(c => c[0] === 'mutate')[1].input, false);
  await view.showInvoices(); view = await h.flush();
  assert.equal(view.terminalOrigin, null);
  assert.equal(view.attempt, null); h.unmount();
});

test('bPay origin clears on a new attempt and failed preparation, and is masked on account change', async () => {
  const pending = deferred(); let writes = 0;
  const h = harness({ mutation: async () => ++writes === 1 ? { ok: true, data: { paymentId: '301', paymentType: 'terminals', action: { kind: 'terminal', paymentCode: '301', amount: '19.50', currency: null, currencySign: 'MDL', expiresAt: null } } } : pending.promise });
  let view = await h.flush(); await view.start({ paymentType: 'terminals', billIds: ['1'] }, selectionData()); view = await h.flush();
  assert.equal(view.terminalOrigin.amount, '1.00');
  const next = view.start({ paymentType: 'terminals', billIds: ['1'] }, selectionData()); view = await h.flush();
  assert.equal(view.terminalOrigin, null);
  pending.resolve({ ok: false, outcome: 'unknown' }); await next; view = await h.flush();
  assert.equal(view.terminalOrigin, null);
  h.context.accountId = '11'; h.context.accountRevision++; view = h.render();
  assert.equal(view.terminalOrigin, null); h.unmount();
});


test('failed server preparation retains safe stage diagnosis without replay; next manual APAY opens cleanly', async () => {
  for (const [reason, diagnostic] of [['errors_timeout', 'PREPARATION_TIMEOUT'], ['http_503', 'PREPARATION_HTTP_503'], ['curr', 'PREPARATION_CURR'], ['private-token-should-not-appear', 'PREPARATION_RESPONSE']]) {
    let starts=0;
    const action={...form,fields:{invoice_id:'42','ExtraData[ep_channel]':'APAY'}};
    const h=harness({mutation:async()=>++starts===1
      ? {ok:false,outcome:'unknown',error:'payments.checkoutFailed',paymentPreparation:{paymentId:'42',reason}}
      : {ok:true,data:{paymentId:'43',paymentType:'platescro',action:{...action,fields:{...action.fields,invoice_id:'43'}}}}});
    let view=await h.flush();await view.start({...selected,hostedChannel:'APAY'},selectionData());view=await h.flush();
    assert.equal(view.error,'payments.checkoutFailed');assert.equal(view.diagnosticCode,diagnostic);
    assert.equal(view.provider,null);assert.equal(view.attempt,null);assert.equal(h.calls.some(c=>c[0]==='hosted'),false);
    await h.tick();assert.equal(starts,1);
    await view.start({...selected,hostedChannel:'APAY'},selectionData());view=await h.flush();
    assert.equal(view.error,null);assert.equal(view.diagnosticCode,null);assert.equal(view.attempt.paymentId,'43');assert.equal(view.provider.kind,'redirect');
    assert.equal(h.calls.filter(c=>c[0]==='hosted').length,1);h.unmount();
  }
});
