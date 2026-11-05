import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createNativeSocialAuth } from '../src/api/native-social-auth.ts';
import { socialErrorKey, socialProfileErrors } from '../src/features/auth/social-completion.ts';

const caps = { version:1, providers:{apple:{enabled:true,clientId:'com.example.test'},google:{enabled:true,clientId:'synthetic.apps.googleusercontent.com'}} };
const profile = {firstName:'Provider',lastName:'Name',email:'verified@example.test',phone:'',phoneCode:'',countryId:''};
const fields=['firstName','lastName','phone','phoneCode','countryId'];
const challenge={flowId:'a'.repeat(64),provider:'apple',nonce:'b'.repeat(64),state:'c'.repeat(64),expiresAt:'2035-01-01T00:00:00Z'};
const completion={status:'completion_required',pendingToken:'d'.repeat(64),expiresAt:challenge.expiresAt,isNew:true,profile,editableFields:fields,requiredFields:fields,termsRequired:true,metadata:{countries:[{id:'1',code:'MD',title:'Moldova'}],phoneFormats:[{id:'1',countryId:'1',countryCode:'MD',title:'Moldova',code:'+373',format:'99 999 999'}]}};
const session={status:'authenticated',session:{access_token:'synthetic-session',expires_in:3600,token_type:'Bearer',id:'7',name:'Provider',surname:'Name',uid:'SYNTH7'}};
const ok=data=>new Response(JSON.stringify({code:200,error:false,message:'Ok',data}),{headers:{'Content-Type':'application/json'}});
const notDeployed=()=>new Response(JSON.stringify({code:401,error:true,message:'Invalid Token'}),{status:401,headers:{'Content-Type':'application/json'}});
function harness(fetcher) {
  const slots=[],effects=[],cleanups=[],calls=[],pageLoads=[];let cursor=0;
  const react={
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((d,j)=>d!==slots[i][j])){slots[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}},
    useCallback(fn,deps){const i=cursor++;if(!slots[i]||deps.some((d,j)=>d!==slots[i].deps[j]))slots[i]={fn,deps};return slots[i].fn;},
  };
  const context={authRevision:0,adoptSocialSession:async(value,revision)=>{calls.push(['adopt',value.profile.id,revision]);return{ok:true};}};
  const imports={react,'expo-router':{useFocusEffect:fn=>react.useEffect(fn,[fn]),usePreventRemove:()=>()=>calls.push(['release'])},'react-native':{AppState:{addEventListener:()=>({remove(){}})},BackHandler:{addEventListener:()=>({remove(){}})},Platform:{OS:'ios'}},'expo/fetch':{fetch:async(url,options)=>{calls.push(['http',options.method,new URLSearchParams(options.body).get('operation'),options]);return fetcher(url,options);}},'@/api/native-social-auth':{createNativeSocialAuth},'@/api/context':{useLiveAccount:()=>context},'@/i18n/context':{useI18n:()=>({language:'ro'})},'./social-provider':{availableSocialProviders:async c=>Object.keys(c.providers).filter(k=>c.providers[k].enabled),getSocialIdentity:async provider=>{calls.push(['identity',provider]);return{status:'success',proof:{idToken:'synthetic.provider.jwt'}};}},'./social-completion':{socialErrorKey,socialProfileErrors}};
  imports['@/navigation/PageLoading']={usePageLoad(pending,blocking=pending){pageLoads.push({pending,blocking});}};
  const exports={};const code=ts.transpileModule(readFileSync(new URL('../src/features/auth/useNativeSocialAuth.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:key=>{assert(key in imports,key);return imports[key];},AbortController,Date,setTimeout:()=>1,clearTimeout:()=>{}});
  const render=()=>{cursor=0;const value=exports.useNativeSocialAuth(true);while(effects.length)effects.shift()();return value;};
  const flush=async()=>{for(let n=0;n<40;n++)await Promise.resolve();return render();};
  render();
  return{calls,pageLoads,render,flush,unmount:()=>cleanups.forEach(fn=>fn?.())};
}

test('undeployed public route leaves email usable; retry makes GET only then enables real server-approved providers',async()=>{
  let reads=0;
  const h=harness(async()=>++reads===1?notDeployed():ok(caps));let view=await h.flush();
  assert.deepEqual(h.pageLoads[0],{pending:true,blocking:true});assert.deepEqual(h.pageLoads.at(-1),{pending:false,blocking:false});
  assert.equal(view.unavailable,true);assert.equal(view.checkingAvailability,false);assert.equal(view.providers.length,0);
  await view.start('apple');assert.equal(h.calls.some(c=>c[0]==='identity'),false);
  view.retryAvailability();view=h.render();view=await h.flush();
  assert.deepEqual(Array.from(view.providers),['apple','google']);assert.equal(view.unavailable,false);assert.equal(reads,2);
  assert(h.calls.filter(c=>c[0]==='http').every(c=>c[1]==='GET'&&c[3].headers.Bearer===undefined));h.unmount();
});

test('a provider switched off after the capability read disappears without restarting the sign-in flow', async () => {
  let reads = 0;
  const h = harness(async (_url, options) => {
    if (options.method === 'GET') return ok(++reads === 1 ? caps : { ...caps, providers: { ...caps.providers, apple: { enabled: false, clientId: null } } });
    return new Response(JSON.stringify({ code: 503, error: true, errorCode: 'provider_unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  });
  let view = await h.flush();
  await view.start('apple');
  h.render();
  view = await h.flush();
  assert.equal(reads, 2);
  assert.deepEqual(Array.from(view.providers), ['google']);
  await view.start('apple');
  assert.equal(h.calls.filter(c => c[0] === 'http' && c[1] === 'POST').length, 1);
  assert.equal(h.calls.some(c => c[0] === 'identity' || c[0] === 'adopt'), false);
  h.unmount();
});

test('new Google or Apple identity must confirm provider email, first/last name, phone and terms before account completion',async()=>{
  for(const provider of ['apple','google']){
    const h=harness(async(_url,options)=>{
      if(options.method==='GET')return ok(caps);
      const operation=new URLSearchParams(options.body).get('operation');
      return ok(operation==='challenge'?{...challenge,provider}:operation==='verify'?completion:session);
    });
    let view=await h.flush();await view.start(provider);view=await h.flush();
    assert.equal(view.pending.profile.email,'verified@example.test');assert.equal(view.pending.profile.firstName,'Provider');
    assert.equal(h.calls.some(c=>c[0]==='adopt'),false);
    const reads=h.calls.filter(c=>c[0]==='http').length;
    view.retryAvailability();await h.flush();assert.equal(h.calls.filter(c=>c[0]==='http').length,reads);
    await view.complete(profile,true);view=await h.flush();assert.equal(h.calls.some(c=>c[2]==='complete'),false);
    const filled={...profile,phone:'60123456',phoneCode:'+373',countryId:'1'};
    await view.complete(filled,false);view=await h.flush();assert.equal(h.calls.some(c=>c[2]==='complete'),false);
    await view.complete(filled,true);view=await h.flush();
    assert.equal(view.pending,null);assert.equal(h.calls.filter(c=>c[0]==='adopt').length,1);
    const body=new URLSearchParams(h.calls.find(c=>c[0]==='http'&&c[2]==='complete')[3].body);
    assert.equal(body.get('profile[phone]'),'60123456');assert.equal(body.has('profile[email]'),false);
    assert.equal(body.has('idToken'),false);h.unmount();
  }
});

test('normal linked account signs in once without new registration or completion',async()=>{
  const h=harness(async(_url,options)=>options.method==='GET'?ok(caps):ok(new URLSearchParams(options.body).get('operation')==='challenge'?challenge:session));
  let view=await h.flush();await view.start('apple');view=await h.flush();
  assert.equal(view.pending,null);assert.equal(h.calls.filter(c=>c[0]==='adopt').length,1);
  assert.equal(h.calls.some(c=>c[2]==='complete'),false);h.unmount();
});
