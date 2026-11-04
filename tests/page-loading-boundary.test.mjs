import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { initialAccountPending, PageLoadState } from '../src/navigation/page-load-state.ts';

// Execute production providers/hooks with per-component state, child-first
// layout commits, synchronous store notifications, and deterministic timers.
function harness({ platform = 'ios' } = {}) {
  const instances = new Map(), timers = new Map(), listeners = new Map(), loops = [];
  let current, seen, layoutQueue, effectQueue, tree, dirty = false, now = 0, nextTimer = 0, initialReady = false;
  let pages = [{ id: 'a', tasks: [] }], focused = 'a', reduceMotion = false;
  const resource = () => ({ data: {}, error: null });
  let live = { authenticated: true, authRevision: 1, accountId: 'one', accountRevision: 1, language: 'ro', resources: Object.fromEntries(['profile','balance','waiting','warehouse','sent','received'].map(key=>[key,resource()])), parcelPages: { received: { overallTotal: 0 } } };
  const setTimer = (fn, delay = 0) => { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; };
  const changed = (old, next) => !old || old.length !== next.length || next.some((value,index)=>!Object.is(value,old[index]));
  const useState = initial => {
    const instance = current, index = instance.cursor++;
    if (!(index in instance.slots)) instance.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [instance.slots[index], next => { const value = typeof next === 'function' ? next(instance.slots[index]) : next; if (!Object.is(instance.slots[index],value)) { instance.slots[index]=value; dirty=true; } }];
  };
  const useEffect = kind => (fn,deps) => {
    const instance=current,index=instance.cursor++;
    if (changed(instance.slots[index],deps)) {
      instance.slots[index]=deps;
      (kind==='layout'?layoutQueue:effectQueue).push({ depth:instance.depth, run:()=>{ instance.cleanups[index]?.();instance.cleanups[index]=fn(); } });
    }
  };
  const useMemo = (fn,deps) => { const instance=current,index=instance.cursor++; if(changed(instance.slots[index]?.deps,deps))instance.slots[index]={deps,value:fn()};return instance.slots[index].value; };
  const react = {
    useState, useMemo, useCallback:(fn,deps)=>useMemo(()=>fn,deps),
    useRef:initial=>{const instance=current,index=instance.cursor++;return instance.slots[index]??={current:initial};},
    useId:()=>`${current.id}:${current.cursor++}`,
    useLayoutEffect:useEffect('layout'),useEffect:useEffect('passive'),
    createContext(defaultValue){const context={defaultValue};context.Provider={context};return context;},
    useContext:context=>current.contexts.has(context)?current.contexts.get(context):context.defaultValue,
    useSyncExternalStore(subscribe,getSnapshot){
      const [,setSnapshot]=useState(getSnapshot);
      react.useLayoutEffect(()=>{const update=()=>setSnapshot(getSnapshot());const stop=subscribe(update);update();return stop;},[subscribe,getSnapshot]);
      return getSnapshot();
    },
  };
  const subscribe = (name,fn) => {if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return {remove:()=>listeners.get(name).delete(fn)};};
  class Value { constructor(value){this.value=value;} setValue(value){this.value=value;} interpolate(config){return {value:this,config};} }
  const Animated={View:'AnimatedView',Value,timing:(value,config)=>({value,config}),loop:animation=>{const loop={animation,running:false,start(){this.running=true;},stop(){this.running=false;}};loops.push(loop);return loop;}};
  const jsx=(type,props,key)=>({type,props:props??{},key});
  const imports={
    react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
    'react-native':{Animated,AppState:{currentState:'active',addEventListener:(name,fn)=>subscribe(name,fn)},Easing:{quad:x=>x*x,inOut:x=>x},Platform:{OS:platform},StyleSheet:{create:x=>x,absoluteFill:{}},Text:'Text',View:'View'},
    'expo-router':{useIsFocused:()=>current.routeId===focused},
    '@/api/context':{useLiveAccount:()=>live},'@/i18n/context':{useI18n:()=>({t:key=>key,language:live.language})},
    '@/theme/context':{useTheme:()=>({colors:{accent:'#f00',background:'#fff',soft:'#ddd',muted:'#666'}})},
    './accessibility':{useVisualPreferences:()=>({reduceMotion})},
    './page-load-state':{PageLoadState,initialAccountPending},
  };
  const exports={};
  const code=ts.transpileModule(readFileSync(new URL('../src/navigation/PageLoading.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>{assert(name in imports,name);return imports[name];},setTimeout:setTimer,clearTimeout:id=>timers.delete(id)});
  function Resource({task}) { exports.usePageLoad(task.pending,task.blocking??task.pending);return jsx('Resource',{id:task.id,error:task.error??null}); }
  function InitialProbe(){initialReady=exports.useInitialPageReady();return null;}
  function node(value,path,contexts=new Map(),routeId=null,depth=0){
    if(Array.isArray(value))return value.map((item,index)=>node(item,`${path}/${item?.key??index}`,contexts,routeId,depth));
    if(!value||typeof value!=='object')return value;
    if(value.type?.context){const next=new Map(contexts);next.set(value.type.context,value.props.value);return node(value.props.children,path+'/provider',next,routeId,depth+1);}
    if(typeof value.type==='function'){
      const id=path+':'+value.type.name;
      let instance=instances.get(id);if(!instance){instance={id,slots:[],cleanups:[]};instances.set(id,instance);}
      Object.assign(instance,{cursor:0,contexts,routeId:value.props.routeId??routeId,depth});seen.add(id);current=instance;
      const rendered=value.type(value.props);
      return node(rendered,path+'/rendered',contexts,instance.routeId,depth+1);
    }
    return {...value,routeId,props:{...value.props,children:node(value.props.children,path+'/children',contexts,routeId,depth+1)}};
  }
  function render(){
    let turns=0;
    do {
      assert(++turns<40,'Provider/layout updates must settle');dirty=false;seen=new Set();layoutQueue=[];effectQueue=[];
      tree=node(jsx(exports.PageLoadingProvider,{children:[...pages.map(page=>jsx(exports.PageLoadingBoundary,{routeId:page.id,children:page.tasks.map(task=>jsx(Resource,{task},task.id))},page.id)),jsx(InitialProbe,{})]}),'root');
      for(const [id,instance] of instances)if(!seen.has(id)){instance.cleanups.forEach(cleanup=>cleanup?.());instances.delete(id);}
      layoutQueue.sort((a,b)=>b.depth-a.depth).forEach(item=>item.run());
      effectQueue.sort((a,b)=>b.depth-a.depth).forEach(item=>item.run());
    }while(dirty);
  }
  const walk=value=>Array.isArray(value)?value.flatMap(walk):!value||typeof value!=='object'?[]:[value,...walk(value.props?.children)];
  render();
  return {
    loops, get initialReady(){return initialReady;},get live(){return live;},
    content:id=>walk(tree).find(value=>value.routeId===id&&value.props?.['aria-hidden']!==undefined),
    resources:id=>walk(tree).filter(value=>value.routeId===id&&value.type==='Resource'),
    setPages(value){pages=value;render();}, focus(id){focused=id;render();}, setLive(value){live=value;render();},
    layout(id){const view=walk(tree).find(value=>value.routeId===id&&value.type==='View'&&value.props.onLayout);assert(view,'page stays mounted for layout');view.props.onLayout();render();},
    advance(to){assert(to>=now);for(;;){const next=[...timers.entries()].filter(([,value])=>value.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();render();}now=to;render();},
    event(state){[...(listeners.get('change')??[])].forEach(fn=>fn(state));render();},
    reduced(value){reduceMotion=value;render();},
    unmount(){for(const instance of instances.values())instance.cleanups.forEach(cleanup=>cleanup?.());instances.clear();},
  };
}

test('children mount behind an inaccessible curtain; layout and settled data release the initial page',()=>{
 const h=harness({platform:'web'});h.setPages([{id:'a',tasks:[{id:'data',pending:true}]}]);
 assert.equal(h.resources('a').length,1);assert.equal(h.initialReady,false);
 assert.equal(h.content('a').props.inert,true);assert.equal(h.content('a').props.pointerEvents,'none');assert.equal(h.content('a').props.importantForAccessibility,'no-hide-descendants');
 h.layout('a');h.advance(1000);assert.equal(h.initialReady,false);
 h.setPages([{id:'a',tasks:[{id:'data',pending:false}]}]);h.advance(1099);assert.equal(h.initialReady,false);h.advance(1100);
 assert.equal(h.initialReady,true);assert.equal(h.content('a').props.inert,false);assert.equal(h.content('a').props.pointerEvents,'auto');h.unmount();
});

test('cascading child requests cancel a quiet completion and errors settle instead of deadlocking',()=>{
 const h=harness();h.layout('a');h.advance(50);
 h.setPages([{id:'a',tasks:[{id:'parent',pending:false},{id:'child',pending:true}]}]);h.advance(500);assert.equal(h.initialReady,false);
 h.setPages([{id:'a',tasks:[{id:'parent',pending:false},{id:'child',pending:false,error:'unavailable'}]}]);h.advance(600);
 assert.equal(h.initialReady,true);assert.equal(h.resources('a').find(x=>x.props.id==='child').props.error,'unavailable');h.unmount();
});

test('retained-data refresh shows progress without hiding or re-gating a ready page',()=>{
 const h=harness();h.layout('a');h.advance(100);assert.equal(h.initialReady,true);
 h.setPages([{id:'a',tasks:[{id:'refresh',pending:true,blocking:false}]}]);
 assert.equal(h.content('a').props['aria-hidden'],false);assert.equal(h.initialReady,true);assert(h.loops.some(loop=>loop.running));
 h.setPages([{id:'a',tasks:[{id:'refresh',pending:false}]}]);assert.equal(h.content('a').props['aria-hidden'],false);h.unmount();
});

test('inactive pages cannot block the focused page and unmounted requests are removed',()=>{
 const h=harness();h.setPages([{id:'a',tasks:[]},{id:'b',tasks:[{id:'slow',pending:true}]}]);h.layout('a');h.layout('b');h.advance(100);
 assert.equal(h.initialReady,true);assert.equal(h.content('a').props['aria-hidden'],false);assert.equal(h.content('b').props['aria-hidden'],true);
 h.focus('b');h.advance(200);assert.equal(h.initialReady,false);
 h.setPages([{id:'a',tasks:[]},{id:'b',tasks:[]}]);h.advance(300);assert.equal(h.initialReady,true);h.unmount();
});

test('rapid navigation invalidates obsolete ready reports, including a detached screen gap',()=>{
 const h=harness();h.layout('a');h.advance(100);assert.equal(h.initialReady,true);
 h.focus(null);assert.equal(h.initialReady,false,'a blurred screen must not keep initial launch ready');
 h.setPages([{id:'b',tasks:[{id:'next',pending:true}]}]);h.focus('b');h.layout('b');h.advance(1000);assert.equal(h.initialReady,false);
 h.setPages([{id:'b',tasks:[]}]);h.advance(1100);assert.equal(h.initialReady,true);h.unmount();
});

test('account and language scopes discard previous readiness; partial bootstrap errors are settled',()=>{
 const h=harness();h.layout('a');h.advance(100);assert.equal(h.initialReady,true);
 const resources={...h.live.resources,balance:{data:null,error:null}};
 h.setLive({...h.live,accountId:'two',accountRevision:2,language:'ru',resources});assert.equal(h.initialReady,false);h.advance(1000);assert.equal(h.initialReady,false);
 h.setLive({...h.live,resources:{...resources,balance:{data:null,error:'network'}}});h.advance(1100);assert.equal(h.initialReady,true);h.unmount();
});

test('blocking work re-gates a page and stale quiet timers cannot reopen it',()=>{
 const h=harness();h.layout('a');h.advance(100);
 h.setPages([{id:'a',tasks:[{id:'new',pending:true}]}]);assert.equal(h.initialReady,false);assert.equal(h.content('a').props['aria-hidden'],true);
 h.setPages([{id:'a',tasks:[]}]);h.advance(150);h.setPages([{id:'a',tasks:[{id:'cascade',pending:true}]}]);h.advance(500);assert.equal(h.initialReady,false);
 h.setPages([{id:'a',tasks:[]}]);h.advance(600);assert.equal(h.initialReady,true);h.unmount();
});

test('progress loops never block list rendering and pause with background, reduced motion or inactivity',()=>{
 const h=harness();h.setPages([{id:'a',tasks:[{id:'slow',pending:true}]}]);h.layout('a');
 assert(h.loops.length>0);assert(h.loops.every(loop=>loop.animation.config.useNativeDriver===true&&loop.animation.config.isInteraction===false));
 h.event('background');assert.equal(h.loops.some(loop=>loop.running),false);h.event('active');assert.equal(h.loops.some(loop=>loop.running),true);
 h.reduced(true);assert.equal(h.loops.some(loop=>loop.running),false);h.reduced(false);h.focus(null);assert.equal(h.loops.some(loop=>loop.running),false);h.unmount();
});
