import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { isHostedCheckoutUrl } from '../src/api/hosted-checkout.ts';
import { createPayPalBrowserController } from '../src/features/payments/paypal-browser-controller.ts';

async function browserHarness(checkoutUrl, rejected = false) {
  const slots=[],effects=[],cleanups=[],calls=[];let cursor=0, failures=0, returns=0, failureCode=null;
  const react={useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((d,j)=>d!==slots[i][j])){slots[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}}};
  const jsx=(type,props)=>({type,props});const imports={react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react-native':{ActivityIndicator:'ActivityIndicator',AppState:{addEventListener:()=>({remove(){}})},Modal:'Modal',Platform:{OS:'ios'},Text:'Text',View:'View'},'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},'expo-web-browser':{WebBrowserPresentationStyle:{FULL_SCREEN:'fullScreen'},openBrowserAsync:async(...args)=>{calls.push(args);if(rejected)throw new Error('Synthetic unavailable browser');return new Promise(()=>{});},dismissBrowser:async()=>{}},'@/ui':{Button:'Button',Notice:'Notice',useUi:()=>({s:{},colors:{}})},'@/i18n/context':{useI18n:()=>({t:key=>key})},'./paypal-browser-controller':{createPayPalBrowserController},'@/api/hosted-checkout':{isHostedCheckoutUrl}};
  const exports={};const code=ts.transpileModule(readFileSync(new URL('../src/features/payments/PayPalBrowser.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,Promise,require:name=>{assert(name in imports,name);return imports[name];}});
  const action={kind:'redirect',url:checkoutUrl};
  const render=()=>{cursor=0;const tree=exports.PayPalBrowser({action,onClose:()=>{},onReturn:()=>returns++,onFailure:code=>{failures++;failureCode=code;}});while(effects.length)effects.shift()();return tree;};
  let tree=render();await Promise.resolve();assert.equal(calls.length,0);
  tree.props.onShow();tree=render();await Promise.resolve();assert.equal(calls.length,1);
  assert.equal(calls[0][0],action.url);assert.equal(calls[0][1].createTask,false);assert.equal(calls[0][1].headers,undefined);
  render();await Promise.resolve();assert.equal(calls.length,1);
  return {failureCode:()=>failureCode,failures:()=>failures,returns:()=>returns,dispose:()=>cleanups.forEach(cleanup=>cleanup?.())};
}

for (const checkoutUrl of ['https://www.paypal.com/checkoutnow?token=SYNTHETIC-ORDER', 'https://secure3.euplatesc.ro/tdsprocess/checkout.php?cart_id=SYNTHETIC&mid=SYNTHETIC']) test(`Safari presentation waits for onShow and opens only once: ${new URL(checkoutUrl).hostname}`,async()=>{
  const h=await browserHarness(checkoutUrl);
  assert.equal(h.failures(),0);assert.equal(h.returns(),0);h.dispose();
});

test('a rejected OS-browser open notifies failure without a return or payment assertion',async()=>{
  const h=await browserHarness('https://secure3.euplatesc.ro/tdsprocess/checkout.php?cart_id=SYNTHETIC&mid=SYNTHETIC',true);
  assert.equal(h.failures(),1);assert.equal(h.failureCode(),'BROWSER_OPEN_FAILED');assert.equal(h.returns(),0);h.dispose();
});
