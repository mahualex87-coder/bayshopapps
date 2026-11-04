import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushRegistration } from '../src/features/push/push-registration.ts';

const user = (accountId, revision = 0) => ({ accountId, revision, resolved: true });
function fixture(initial = null, overrides = {}) {
  let record = initial;
  const calls = [];
  const device = {
    read: async () => record,
    save: async next => { record = next; },
    permission: async () => 'granted',
    request: async () => { calls.push('request'); return 'granted'; },
    token: async () => { calls.push('token'); return 'synthetic'; },
    bind: async (token, previous, revision) => {
      calls.push(['bind', token, previous, revision]);
      return { release: async () => { calls.push(['release', token]); } };
    },
    clear: async () => { calls.push('invalidate'); },
    ...overrides,
  };
  return { registration: createPushRegistration(device), calls, record: () => record, device };
}
test('reading settings never requests permission or obtains a device address without opt-in', async () => {
  const { registration, calls } = fixture(null, { permission: async () => 'undetermined' });
  await registration.setSession(user('10'));
  await registration.refresh();
  assert.deepEqual(calls, []);
  assert.equal(registration.snapshot().optedIn, false);
  await registration.enable();
  assert.equal(calls[0], 'request');
  assert.equal(registration.snapshot().registered, true);
});
test('restores per-account opt-in without prompting, and atomically rotates the previous token', async () => {
  const { registration, calls, record, device } = fixture({ accountId: '10', token: 'older' });
  await registration.setSession(user('10', 4));
  assert.deepEqual(calls, ['token', ['bind', 'synthetic', 'older', 4]]);
  device.token = async () => 'newer';
  await registration.refresh();
  await registration.refresh();
  assert.deepEqual(calls.slice(2), [['bind', 'newer', 'synthetic', 4], ['release', 'synthetic']]);
  assert.deepEqual(record(), { accountId: '10', token: 'newer' });
  await registration.disable();
  assert.deepEqual(calls.slice(-2), [['release', 'newer'], 'invalidate']);
  assert.equal(record(), null);
  assert.equal(registration.snapshot().optedIn, false);
});
test('opening a different account after process death invalidates the prior token before any registration', async () => {
  const { registration, calls, record } = fixture({ accountId: '10', token: 'older' });
  await registration.setSession(user('20'));
  assert.deepEqual(calls, ['invalidate']);
  assert.equal(record(), null);
  assert.equal(registration.snapshot().optedIn, false);
});
test('a changed session invalidates an in-flight registration before another user can opt in', async () => {
  let complete, started;
  const inFlight = new Promise(resolve => { complete = resolve; });
  const bindingStarted = new Promise(resolve => { started = resolve; });
  const { registration, calls, record, device } = fixture(null);
  const bind = device.bind;
  device.bind = async (...args) => { started(); await inFlight; return bind(...args); };
  await registration.setSession(user('10', 1));
  const first = registration.enable();
  await bindingStarted;
  const logout = registration.setSession(user(null, 2));
  const nextAccount = registration.setSession(user('20', 3));
  assert.equal(registration.snapshot().optedIn, false);
  complete();
  await Promise.all([first, logout, nextAccount]);
  assert.deepEqual(calls, ['token', ['bind', 'synthetic', undefined, 1], ['release', 'synthetic'], 'invalidate']);
  assert.equal(record(), null);
  assert.equal(registration.snapshot().registered, false);
});
test('recovering from an interrupted deletion never registers the stored token for the new user', async () => {
  const { registration, calls, record, device } = fixture({ cleanup: true });
  device.clear = async () => { calls.push('failed deletion'); throw new Error(); };
  await registration.setSession(user('20'));
  assert.equal(registration.snapshot().error, 'push.cleanupFailed');
  assert.deepEqual(record(), { cleanup: true });
  device.clear = async () => { calls.push('invalidate'); };
  await registration.refresh();
  assert.deepEqual(calls, ['failed deletion', 'invalidate']);
  assert.equal(record(), null);
});
test('revoking OS permission releases the account registration and invalidates FCM', async () => {
  const { registration, calls, record, device } = fixture({ accountId: '10', token: 'old' });
  await registration.setSession(user('10'));
  device.permission = async () => 'denied';
  await registration.refresh();
  assert.equal(registration.snapshot().permission, 'denied');
  assert.equal(registration.snapshot().optedIn, false);
  assert.deepEqual(calls.slice(-2), [['release', 'synthetic'], 'invalidate']);
  assert.equal(record(), null);
  await registration.enable();
  assert.equal(registration.snapshot().registered, false);
  assert.equal(calls.includes('request'), false);
});
test('disable immediately blocks delivery and invalidates even if server release fails', async () => {
  let finish;
  const { registration, calls, record } = fixture({ accountId: '10' }, {
    bind: async () => ({ release: async () => new Promise((_, reject) => { finish = () => reject(new Error()); }) }),
  });
  await registration.setSession(user('10'));
  const disabling = registration.disable();
  assert.equal(registration.snapshot().optedIn, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.includes('invalidate'));
  finish();
  await disabling;
  assert.equal(record(), null);
});
test('a burst of resume and refresh events coalesces; a bound token is not registered again', async () => {
  const { registration, calls, device } = fixture({ accountId: '10', token: 'synthetic' });
  await registration.setSession(user('10'));
  calls.length = 0;
  await Promise.all(Array.from({ length: 20 }, () => registration.refresh()));
  assert.deepEqual(calls, ['token']);
  device.bind = async () => { throw Object.assign(new Error(), { status: 503 }); };
  device.token = async () => 'rotated';
  await registration.refresh();
  assert.equal(registration.snapshot().error, 'push.failed');
  const attempts = [];
  device.bind = async (...args) => { attempts.push(args); return { release: async () => {} }; };
  await Promise.all(Array.from({ length: 20 }, () => registration.refresh()));
  assert.deepEqual(attempts, [['rotated', 'synthetic', 0]]);
});
