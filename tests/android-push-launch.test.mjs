import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const filename = new URL('../src/features/push/native-push.native.ts', import.meta.url);
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const checkpoint = () => new Promise(resolve => setImmediate(resolve));
const message = { data: { bs_version: '1', bs_target: 'shipments', bs_id: '29' } };

function simulate(platform, initialState, responses) {
  const listeners = new Set();
  const frames = [];
  let reads = 0;
  const appState = {
    currentState: initialState,
    addEventListener(name, callback) {
      assert.equal(name, 'change');
      listeners.add(callback);
      return { remove() { listeners.delete(callback); } };
    },
  };
  const modules = {
    'react-native': { Platform: { OS: platform }, AppState: appState },
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { push: { ios: true, android: true, projectId: 'baymd-148208' } } } } },
    '@react-native-firebase/app': { getApp: () => ({ options: { projectId: 'baymd-148208' } }) },
    '@react-native-firebase/messaging': { getMessaging: () => ({}), getInitialNotification: async () => responses[reads++] ?? null },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => modules[name], requestAnimationFrame: callback => frames.push(callback) });
  return {
    read: exports.initialNativePush,
    get reads() { return reads; }, get listeners() { return listeners.size; }, get frames() { return frames.length; },
    transition(state) { appState.currentState = state; for (const listener of [...listeners]) listener(state); },
    nextFrame() { frames.shift()?.(); },
  };
}

test('Android recovers an initial notification when the Activity is attached after JavaScript starts', async () => {
  const device = simulate('android', 'background', [null, message]);
  const result = device.read(); await checkpoint();
  assert.equal(device.reads, 1); assert.equal(device.listeners, 1); assert.equal(device.frames, 0);
  device.transition('active'); device.transition('active');
  assert.equal(device.listeners, 0); assert.equal(device.frames, 1); assert.equal(device.reads, 1);
  device.nextFrame(); assert.equal(await result, message); assert.equal(device.reads, 2);
});

test('an ordinary Android start checks once after the first foreground frame, without polling', async () => {
  const device = simulate('android', 'active', [null, null]);
  const result = device.read(); await checkpoint();
  assert.equal(device.frames, 1); assert.equal(device.listeners, 0);
  device.nextFrame(); assert.equal(await result, null); assert.equal(device.reads, 2);
  device.transition('active'); assert.equal(device.frames, 0);
});

test('Android handles a ready launch immediately, and iOS keeps its single consumable launch read', async () => {
  for (const [platform, response] of [['android', message], ['ios', null], ['ios', message]]) {
    const device = simulate(platform, 'active', [response]);
    assert.equal(await device.read(), response); assert.equal(device.reads, 1);
    assert.equal(device.listeners, 0); assert.equal(device.frames, 0);
  }
});
