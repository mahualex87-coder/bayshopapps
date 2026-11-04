import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as onboarding from '../src/api/public-onboarding.ts';

const catalog = { version:1, registrationRegion:true, countries:[
  {id:'10',code:'AA',title:'Synthetic A',defaultLanguageId:'1',languages:[{id:'1',code:'ro',title:'Romanian'},{id:'2',code:'ru',title:'Russian'}]},
  {id:'20',code:'BB',title:'Synthetic B',defaultLanguageId:'3',languages:[{id:'3',code:'en',title:'English'}]},
] };
function harness({enabled=false, fetchMetadata=async()=>catalog, language='ro', allowLanguage=true}={}) {
  const slots=[],effects=[],cleanups=[],calls=[],pageLoads=[]; let cursor=0;
  const react={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((value,n)=>value!==slots[i][n])){slots[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}},
  };
  const i18n={language,setLanguage:async next=>{calls.push(['language',next]);if(allowLanguage)i18n.language=next;return allowLanguage;}};
  const imports={react,'react/jsx-runtime':{},'expo-localization':{getLocales:()=>[{regionCode:'AA',languageCode:'ru'}]},'expo/fetch':{fetch:()=>{}},'react-native':{},'@/api/public-onboarding':{...onboarding,readPublicOnboarding:async(_fetch,lang,signal)=>{calls.push(['metadata',lang,signal]);return fetchMetadata(lang,signal);}},'@/features/accountops/shared':{},'@/i18n/context':{useI18n:()=>i18n},'@/ui':{}};
  imports['@/navigation/PageLoading']={usePageLoad(pending,blocking=pending){pageLoads.push({pending,blocking});}};
  const exports={};const code=ts.transpileModule(readFileSync(new URL('../src/features/auth/RegistrationRegionPicker.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,require:key=>{assert(key in imports,key);return imports[key];},AbortController,process:{env:{}}});
  const render=()=>{cursor=0;const value=exports.useRegistrationRegion(enabled);while(effects.length)effects.shift()();return value;};
  const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();return render();};
  render();return{calls,pageLoads,render,flush,unmount:()=>cleanups.forEach(fn=>fn?.())};
}

test('default-disabled rollout makes no request and does not block legacy registration',async()=>{
  const h=harness();const view=await h.flush();assert.equal(view.enabled,false);assert.equal(view.loading,false);assert.equal(view.confirmedRegion,null);assert.deepEqual(h.calls,[]);assert(h.pageLoads.every(state=>!state.pending&&!state.blocking));h.unmount();
});

test('phone country is editable and language confirmation is required before a region is submitted',async()=>{
  const h=harness({enabled:true});let view=await h.flush();assert.equal(view.selection.countryId,'10');assert.equal(view.confirmedRegion,null);
  view.selectCountry('20');view=h.render();assert.equal(view.selection.languageId,'3');assert.equal(view.confirmedRegion,null);
  await view.confirm();view=await h.flush();view=await h.flush();assert.equal(view.confirmedRegion.countryId,'20');assert.equal(view.confirmedRegion.language,'en');
  assert.deepEqual(h.calls.filter(call=>call[0]==='language'),[['language','en']]);
  view.selectCountry('10');view=h.render();assert.equal(view.confirmedRegion,null);assert.equal(view.selection.languageId,'1');h.unmount();
});

test('a rejected language change cannot confirm registration in a different interface language',async()=>{
  const h=harness({enabled:true,allowLanguage:false});let view=await h.flush();view.selectLanguage('2');view=h.render();await view.confirm();view=await h.flush();assert.equal(view.confirmedRegion,null);h.unmount();
});

test('metadata failure has no countries and retry cannot duplicate or silently register an account',async()=>{
  let fail=true;const h=harness({enabled:true,fetchMetadata:async()=>{if(fail)throw Error('offline');return catalog;}});let view=await h.flush();assert.equal(view.unavailable,true);assert.deepEqual(h.pageLoads[0],{pending:true,blocking:true});assert.deepEqual(h.pageLoads.at(-1),{pending:false,blocking:false});assert.equal(view.catalog,null);assert.equal(view.confirmedRegion,null);
  fail=false;view.retry();view=h.render();view=await h.flush();assert.equal(view.unavailable,false);assert.equal(view.confirmedRegion,null);assert.equal(h.calls.filter(call=>call[0]==='metadata').length,2);h.unmount();
});

test('unmount aborts metadata reads and ignores a late response',async()=>{
  let resolve;const h=harness({enabled:true,fetchMetadata:()=>new Promise(done=>{resolve=done;})});assert.equal(h.calls[0][2].aborted,false);h.unmount();assert.equal(h.calls[0][2].aborted,true);resolve(catalog);const view=await h.flush();assert.equal(view.catalog,null);
});
