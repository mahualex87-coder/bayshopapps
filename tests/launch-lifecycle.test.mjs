import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise production hooks with deterministic timers and native callbacks.
function harness({ ready = true, reduceMotion = false, preferencesHang = false, preferencesDelay = 0, platform = 'ios', timelineCompletes = true, exitCompletes = true } = {}) {
  const slots = [], effects = [], layouts = [], cleanups = [], animations = [], loops = [], haptics = [], finished = [];
  const timers = new Map(), listeners = new Map();
  let now = 0, timerId = 0, cursor = 0, dirty = false, tree, mounted = true;
  const setTimer = (fn, delay = 0) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; };
  const clearTimer = id => timers.delete(id);
  const changed = (previous, next) => !previous || next.some((value, index) => value !== previous[index]);
  const effect = queue => (fn, deps) => { const index = cursor++; if (changed(slots[index], deps)) { slots[index] = deps; queue.push(() => { cleanups[index]?.(); cleanups[index] = fn(); }); } };
  const react = {
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => { const value = typeof next === 'function' ? next(slots[index]) : next; dirty ||= value !== slots[index]; slots[index] = value; }]; },
    useCallback(fn, deps) { const index = cursor++; if (changed(slots[index]?.deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
    useLayoutEffect: effect(layouts), useEffect: effect(effects),
  };
  const subscribe = (name, callback) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); return { remove: () => listeners.get(name).delete(callback) }; };
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    interpolate(config) { return { source: this, config }; }
  }
  const Animated = {
    View: 'AnimatedView', Value,
    timing(value, config) {
      let callback, timer, stopped = false;
      const animation = { config, value, start(fn) { callback = fn; const complete = config.toValue === 1 ? timelineCompletes : exitCompletes; if (complete) timer = setTimer(() => this.complete(), config.duration); }, stop() { if (stopped) return; stopped = true; clearTimer(timer); callback?.({ finished: false }); }, complete() { if (stopped) return; clearTimer(timer); value.setValue(config.toValue); callback?.({ finished: true }); } };
      animations.push(animation); return animation;
    },
    loop(animation) {
      const loop = { animation, running: false, stops: 0, start() { this.running = true; }, stop() { this.running = false; this.stops++; } };
      loops.push(loop); return loop;
    },
  };
  const appState = { currentState: 'active', addEventListener: (name, callback) => subscribe(`app:${name}`, callback) };
  const promise = value => preferencesHang ? new Promise(() => {}) : preferencesDelay ? new Promise(resolve => setTimer(() => resolve(value), preferencesDelay)) : Promise.resolve(value);
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Animated, AppState: appState, AccessibilityInfo: { isReduceMotionEnabled: () => promise(reduceMotion), isReduceTransparencyEnabled: () => promise(false), addEventListener: (name, callback) => subscribe(`accessibility:${name}`, callback) }, Easing: { linear: x => x, quad: x => x * x, out: x => x }, Platform: { OS: platform }, Pressable: 'Pressable', Text: 'Text', StyleSheet: { create: x => x, absoluteFill: {} } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }) },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-haptics': { AndroidHaptics: { Segment_Tick: 'tick', Segment_Frequent_Tick: 'frequent' }, ImpactFeedbackStyle: { Soft: 'soft' }, selectionAsync: async () => { haptics.push({ at: now, kind: 'selection' }); }, impactAsync: async () => { haptics.push({ at: now, kind: 'impact' }); }, performAndroidHapticsAsync: async kind => { haptics.push({ at: now, kind }); } },
    '@/i18n/context': { useI18n: () => ({ t: key => key }) },
    './LaunchArtwork': { LAUNCH_BACKGROUND: '#08080D', LaunchArtwork: 'LaunchArtwork' },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/launch/LaunchExperience.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { assert(name in imports, name); return imports[name]; }, Date: { now: () => now }, setTimeout: setTimer, clearTimeout: clearTimer });
  const props = { ready, onFinished: () => finished.push(now) };
  function render() { if (!mounted) return tree; let turns = 0; do { cursor = 0; dirty = false; tree = exports.LaunchExperience(props); while (layouts.length) layouts.shift()(); while (effects.length) effects.shift()(); assert(++turns < 20, 'hooks settled'); } while (dirty); return tree; }
  async function flush() { for (let index = 0; index < 8; index++) await Promise.resolve(); return render(); }
  async function advance(to) { assert(to >= now); for (;;) { const next = [...timers.entries()].filter(([, item]) => item.at <= to).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]; if (!next) break; now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush(); } now = to; await flush(); }
  function walk(node) { if (Array.isArray(node)) return node.flatMap(walk); if (!node || typeof node !== 'object') return []; return [node, ...walk(node.props?.children)]; }
  const event = async (name, value) => { if (name === 'app:change') appState.currentState = value; [...(listeners.get(name) ?? [])].forEach(fn => fn(value)); await flush(); };
  render();
  return { animations, loops, haptics, finished, flush, advance, event, props, render, all: () => walk(tree), layout: async () => { tree.props.onLayout(); await flush(); }, ready: async value => { props.ready = value; await flush(); }, skip: async () => { const button = walk(tree).find(node => node.type === 'Pressable'); assert(button, 'skip is offered'); button.props.onPress(); await flush(); }, unmount: () => { mounted = false; cleanups.forEach(fn => fn?.()); } };
}

test('intro and exit run natively, finish below four seconds, and complete once', async () => {
  const h = harness(); await h.layout(); await h.advance(3999);
  assert.equal(h.finished.length, 1); assert(h.finished[0] < 4000);
  assert(h.animations.length >= 1); assert(h.animations.every(a => a.config.useNativeDriver === true && a.config.isInteraction === false));
  assert.equal(h.haptics.length, 2);
  await h.event('app:change', 'background'); await h.ready(true); await h.advance(8000);
  assert.equal(h.finished.length, 1); h.unmount();
});

test('deadline settles the artwork and keeps a quiet loading cover until screen readiness', async () => {
  const h = harness({ ready: false, timelineCompletes: false }); await h.layout(); await h.advance(4000);
  assert.equal(h.finished.length, 0); assert.equal(h.animations[0].value.value, 1);
  assert.equal(h.all().some(node => node.type === 'Pressable'), false);
  assert.equal(h.loops.length, 1); assert.equal(h.loops[0].running, true);
  await h.ready(true); assert.deepEqual(h.finished, [4000]);
  await h.advance(9000); assert.equal(h.finished.length, 1); h.unmount();
});

test('missing native callbacks cannot strand a ready launch beyond four seconds', async () => {
  for (const options of [{ timelineCompletes: false }, { exitCompletes: false }]) {
    const h = harness(options); await h.layout(); await h.advance(4000);
    assert.equal(h.finished.length, 1); assert(h.finished[0] <= 4000); h.unmount();
  }
});

test('late timeline completion respects total deadline if exit callback is lost', async () => {
  const h = harness({ timelineCompletes: false, exitCompletes: false }); await h.layout(); await h.advance(3890);
  h.animations[0].complete(); await h.flush(); await h.advance(4000);
  assert.equal(h.finished.length, 1); assert(h.finished[0] <= 4000); h.unmount();
});

test('skip cancels remaining haptics but waits for account readiness', async () => {
  const h = harness({ ready: false }); await h.layout(); await h.advance(650); await h.skip();
  const count = h.haptics.length; await h.advance(5000);
  assert.equal(h.haptics.length, count); assert.equal(h.finished.length, 0);
  await h.ready(true); assert.equal(h.finished.length, 1); h.unmount();
});

test('background and unmount cancel pending motion and haptics', async () => {
  for (const mode of ['background', 'unmount']) {
    const h = harness(); await h.layout(); await h.advance(100);
    if (mode === 'background') await h.event('app:change', 'background'); else h.unmount();
    await h.advance(5000); assert.equal(h.haptics.length, 0);
    assert.equal(h.finished.length, mode === 'background' ? 1 : 0); h.unmount();
  }
});

test('Reduce Motion and unavailable preferences produce a static launch without haptics', async () => {
  for (const options of [{ reduceMotion: true }, { preferencesHang: true }]) {
    const h = harness(options); await h.layout(); await h.advance(4000);
    assert.equal(h.animations.length, 0); assert.equal(h.haptics.length, 0); assert.equal(h.finished.length, 1); h.unmount();
  }
});

test('enabling Reduce Motion during intro settles immediately and cancels later haptics', async () => {
  const h = harness(); await h.layout(); await h.advance(100);
  await h.event('accessibility:reduceMotionChanged', true); await h.advance(4000);
  assert.equal(h.finished.length, 1); assert.equal(h.haptics.length, 0); h.unmount();
});

test('Android focus loss suppresses haptics without restarting the intro', async () => {
  const h = harness({ platform: 'android' }); await h.layout(); await h.event('app:blur'); await h.advance(4000);
  assert.equal(h.haptics.length, 0); assert.equal(h.finished.length, 1); h.unmount();
});

test('late first layout uses the original mount deadline rather than adding a full intro', async () => {
  const h = harness(); await h.advance(1200); await h.layout(); await h.advance(4000);
  assert.equal(h.finished.length, 1); assert(h.finished[0] <= 4000); h.unmount();
});

test('slow normal accessibility answers are used instead of an early static fallback', async () => {
  const h = harness({ preferencesDelay: 300 }); await h.layout(); await h.advance(200);
  assert.equal(h.finished.length,0); assert.equal(h.animations.length,0);
  await h.advance(301); assert.equal(h.animations[0].config.duration,3500);
  await h.advance(4000); assert.equal(h.finished.length,1); assert(h.finished[0]<=4000); h.unmount();
});

test('waiting beyond the artistic deadline never releases the screen or repeats haptics', async () => {
  const h = harness({ ready:false }); await h.layout(); await h.advance(4000);
  assert.equal(h.finished.length,0); assert.equal(h.haptics.length,2);
  assert.equal(h.all().some(node=>node.type==='Pressable'),false);
  assert.equal(h.loops.length,1); assert.equal(h.loops[0].running,true);
  assert.equal(h.loops[0].animation.config.useNativeDriver,true);
  assert.equal(h.loops[0].animation.config.isInteraction,false);
  await h.advance(30000); assert.equal(h.finished.length,0); assert.equal(h.haptics.length,2);
  await h.ready(true); assert.equal(h.finished.length,1); assert.equal(h.loops[0].running,false); h.unmount();
});

test('readiness loss during exit restores an opaque cover and permits a later completion', async () => {
  const h=harness();await h.layout();await h.advance(3550);
  const cover=h.all()[0].props.style[1].opacity;
  assert.equal(h.finished.length,0);
  await h.ready(false); assert.equal(cover.value,1);
  await h.advance(5000); assert.equal(h.finished.length,0); assert.equal(cover.value,1);
  await h.ready(true); assert.equal(h.finished.length,1);
  await h.ready(false);await h.ready(true);await h.advance(6000);assert.equal(h.finished.length,1);h.unmount();
});

test('loading pulse stops in background and resumes without replaying artwork or haptics', async () => {
  const h=harness({ready:false});await h.layout();await h.advance(4000);
  assert.equal(h.loops[0].running,true);
  await h.event('app:change','background');assert.equal(h.loops[0].running,false);
  await h.advance(10000);assert.equal(h.finished.length,0);assert.equal(h.haptics.length,2);
  await h.event('app:change','active');assert.equal(h.loops.length,2);assert.equal(h.loops[1].running,true);
  assert.equal(h.animations.filter(a=>a.config.duration===3500).length,1);
  h.unmount();assert.equal(h.loops[1].running,false);
});

test('Reduce Motion uses a static loading cover and stops an active pulse without bypassing readiness', async () => {
  const staticLaunch=harness({ready:false,reduceMotion:true});await staticLaunch.layout();await staticLaunch.advance(8000);
  assert.equal(staticLaunch.loops.length,0);assert.equal(staticLaunch.finished.length,0);assert.equal(staticLaunch.haptics.length,0);staticLaunch.unmount();
  const h=harness({ready:false});await h.layout();await h.advance(4000);
  await h.event('accessibility:reduceMotionChanged',true);assert.equal(h.loops[0].running,false);
  await h.advance(8000);assert.equal(h.finished.length,0);assert.equal(h.haptics.length,2);
  await h.ready(true);assert.equal(h.finished.length,1);h.unmount();
});

test('Android focus loss pauses the waiting pulse and a supplied loading message stays visible', async () => {
  const h=harness({ready:false,platform:'android'});h.props.loadingMessage='Loading first screen';await h.layout();await h.advance(4000);
  assert(h.all().some(node=>node.type==='Text'&&node.props.children==='Loading first screen'));
  await h.event('app:blur');assert.equal(h.loops[0].running,false);
  await h.event('app:focus');assert.equal(h.loops[1].running,true);assert.equal(h.haptics.length,2);h.unmount();
});
