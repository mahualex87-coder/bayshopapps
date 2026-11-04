import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(overrides = {}) {
  const calls = [], timers = new Map(); let timerId = 0, callback, errorCallback, removals = 0;
  const env = { now: Date.parse('2026-11-02T10:00:00Z'), permission: async () => ({ status: 'granted' }), cache: async () => null, watch: null, ...overrides };
  const subscription = { remove() { removals++; } };
  const sdk = {
    Accuracy: { Balanced: 3, High: 4 },
    requestForegroundPermissionsAsync: () => { calls.push(['permission']); return env.permission(); },
    getLastKnownPositionAsync: options => { calls.push(['cache', options]); return env.cache(); },
    watchPositionAsync: (options, next, fail) => { calls.push(['watch', options]); callback = next; errorCallback = fail; return env.watch ? env.watch() : Promise.resolve(subscription); },
  };
  class FakeDate extends Date { static now() { return env.now; } }
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/location/pickup-device.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports, require: key => { assert.equal(key, 'expo-location'); return sdk; }, Date: FakeDate,
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { at: env.now + delay, fn }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return {
    device: exports.createPickupLocationDevice(), env, calls, subscription, timers,
    get removals() { return removals; },
    fix: (patch = {}) => ({ timestamp: env.now, coords: { latitude: 47, longitude: 28, accuracy: 50 }, ...patch }),
    emit: value => callback(value), fail: value => errorCallback(value),
    advance(ms) { env.now += ms; for (const [id, timer] of Array.from(timers)) if (timer.at <= env.now && timers.delete(id)) timer.fn(); },
  };
}

test('device is idle on construction and never reads location before foreground permission', async () => {
  const a = setup({ permission: async () => ({ status: 'denied' }) });
  assert.deepEqual(a.calls, []);
  assert.equal(await a.device.getLastKnownPosition(), null);
  await assert.rejects(a.device.getPosition(), /Location unavailable/);
  assert.deepEqual(a.calls, []);
  assert.equal(await a.device.requestPermission(), false);
  assert.equal(await a.device.getLastKnownPosition(), null);
  assert.deepEqual(a.calls, [['permission']]);
  a.env.permission = async () => { throw new Error('raw native error'); };
  assert.equal(await a.device.requestPermission(), false);
});

test('cached location is bounded by age/accuracy and returns only validated coordinates', async () => {
  const a = setup(); await a.device.requestPermission(); a.env.cache = async () => a.fix({ timestamp: a.env.now - 60000, extra: 'discard' });
  const result = await a.device.getLastKnownPosition();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { latitude: 47, longitude: 28 });
  assert.deepEqual(JSON.parse(JSON.stringify(a.calls.at(-1)[1])), { maxAge: 60000, requiredAccuracy: 100 });
  const invalid = [null, a.fix({ timestamp: a.env.now - 60001 }), a.fix({ timestamp: a.env.now + 1 }), a.fix({ timestamp: 'now' }),
    ...[null, -1, 101, NaN, Infinity].map(accuracy => a.fix({ coords: { latitude: 47, longitude: 28, accuracy } })),
    a.fix({ coords: { latitude: 91, longitude: 28, accuracy: 10 } }), a.fix({ coords: { latitude: 47, longitude: '28', accuracy: 10 } })];
  for (const value of invalid) { a.env.cache = async () => value; assert.equal(await a.device.getLastKnownPosition(), null); }
  assert.equal(a.timers.size, 0);
});

test('slow or failed cache resolves null within750ms and does not block an independent current watch', async () => {
  const pending = deferred(); const a = setup({ cache: () => pending.promise }); await a.device.requestPermission();
  const cached = a.device.getLastKnownPosition(); const current = a.device.getPosition(); await tick();
  a.emit(a.fix()); await current; assert.equal(a.removals, 1);
  a.advance(750); assert.equal(await cached, null);
  pending.resolve(a.fix()); await tick(); assert.equal(a.timers.size, 0);
  a.env.cache = async () => { throw new Error('private device failure'); }; assert.equal(await a.device.getLastKnownPosition(), null);
});

test('current location uses Balanced and removes its watcher after the first fresh fix', async () => {
  const a = setup(); await a.device.requestPermission(); const current = a.device.getPosition(); await tick();
  assert.equal(a.calls.at(-1)[1].accuracy, 3);
  a.emit(a.fix()); const result = await current;
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { latitude: 47, longitude: 28 });
  assert.equal(a.removals, 1); assert.equal(a.timers.size, 0);
  a.emit(a.fix({ coords: { latitude: 48, longitude: 29, accuracy: 1 } }));
  assert.equal(a.removals, 1); assert.equal(a.calls.filter(x => x[0] === 'watch').length, 1);
});

test('first fix before subscription registration settles still removes the late subscription', async () => {
  const registration = deferred(); const a = setup({ watch: () => registration.promise }); await a.device.requestPermission();
  const current = a.device.getPosition(); a.emit(a.fix()); await current;
  assert.equal(a.removals, 0); registration.resolve(a.subscription); await tick();
  assert.equal(a.removals, 1); assert.equal(a.timers.size, 0);
});

test('abort before start opens nothing; abort during registration removes late subscription and ignores late fixes', async () => {
  const a = setup(); const early = new AbortController(); early.abort();
  await assert.rejects(a.device.getPosition(early.signal), { name: 'AbortError' }); assert.deepEqual(a.calls, []);
  const registration = deferred(); const b = setup({ watch: () => registration.promise }); await b.device.requestPermission();
  const aborter = new AbortController(); const current = b.device.getPosition(aborter.signal);
  aborter.abort(); await assert.rejects(current, { name: 'AbortError' }); b.emit(b.fix());
  registration.resolve(b.subscription); await tick(); assert.equal(b.removals, 1); assert.equal(b.timers.size, 0);
});

test('8second timeout removes registered or late watcher without retrying High accuracy', async () => {
  for (const late of [false, true]) {
    const registration = deferred(); const a = setup(late ? { watch: () => registration.promise } : {}); await a.device.requestPermission();
    const current = a.device.getPosition(); await tick(); a.advance(8000);
    await assert.rejects(current, /Location unavailable/);
    if (late) { assert.equal(a.removals, 0); registration.resolve(a.subscription); await tick(); }
    assert.equal(a.removals, 1); assert.equal(a.calls.filter(x => x[0] === 'watch').length, 1);
    assert.equal(a.calls.find(x => x[0] === 'watch')[1].accuracy, 3);
  }
});

test('stale, future and invalid current fixes are ignored; fresh approximate position remains usable', async () => {
  const a = setup(); await a.device.requestPermission(); const current = a.device.getPosition(); await tick();
  for (const value of [a.fix({ timestamp: a.env.now - 5001 }), a.fix({ timestamp: a.env.now + 1 }), a.fix({ coords: { latitude: 47, longitude: 28, accuracy: null } }), a.fix({ coords: { latitude: NaN, longitude: 28, accuracy: 1 } })]) a.emit(value);
  assert.equal(a.removals, 0);
  a.emit(a.fix({ coords: { latitude: 47, longitude: 28, accuracy: 500 } })); await current;
  assert.equal(a.removals, 1);
});

test('native errors stay generic and remove a subscription that resolves after the error callback', async () => {
  const registration = deferred(); const a = setup({ watch: () => registration.promise }); await a.device.requestPermission();
  const current = a.device.getPosition(); a.fail('private raw native details');
  await assert.rejects(current, error => error.message === 'Location unavailable');
  registration.resolve(a.subscription); await tick(); assert.equal(a.removals, 1);
  const b = setup({ watch: () => Promise.reject(new Error('private registration body')) }); await b.device.requestPermission();
  await assert.rejects(b.device.getPosition(), error => error.message === 'Location unavailable'); assert.equal(b.timers.size, 0);
});
