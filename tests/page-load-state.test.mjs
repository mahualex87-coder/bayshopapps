import test from 'node:test';
import assert from 'node:assert/strict';
import { PageLoadState, initialAccountPending } from '../src/navigation/page-load-state.ts';

const resource = (data = null, error = null) => ({ data, error });
function account() {
  return { authenticated: true, resources: Object.fromEntries(['profile', 'balance', 'waiting', 'warehouse', 'sent', 'received'].map(key => [key, resource()])), parcelPages: { received: { overallTotal: null } } };
}
test('local session alone does not release launch; every initial resource must settle', () => {
  const value = account();
  assert.equal(initialAccountPending(value), true);
  for (const key of ['profile', 'balance', 'waiting', 'warehouse', 'sent']) value.resources[key] = resource([]);
  assert.equal(initialAccountPending(value), true, 'received metadata not available yet');
  value.parcelPages.received.overallTotal = 42000;
  assert.equal(initialAccountPending(value), false, 'large received history remains deliberately unloaded');
  assert.equal(value.resources.received.data, null);
});
test('partial errors and signed-out session end initial loading without inventing data', () => {
  const value = account();
  for (const key of Object.keys(value.resources)) value.resources[key] = resource(null, 'errors.network');
  assert.equal(initialAccountPending(value), false);
  const signedOut = account(); signedOut.authenticated = false;
  assert.equal(initialAccountPending(signedOut), false);
  assert.equal(value.resources.balance.data, null);
});
test('concurrent screen reads, nested reads, retained-data refresh, and cleanup are isolated', () => {
  const one = new PageLoadState(), two = new PageLoadState();
  one.set('detail', true, true); one.set('metadata', true, true);
  assert.deepEqual(one.getSnapshot(), { pending: 2, blocking: 2 });
  one.set('detail', false, false); one.set('child', true, true);
  one.set('metadata', false, false);
  assert.equal(one.getSnapshot().blocking, 1);
  one.set('child', true, false);
  assert.deepEqual(one.getSnapshot(), { pending: 1, blocking: 0 });
  two.set('other-route', true, true);
  one.remove('child');
  assert.deepEqual(one.getSnapshot(), { pending: 0, blocking: 0 });
  assert.equal(two.getSnapshot().blocking, 1);
});
test('repeated reports have stable snapshots and unsubscription removes listeners', () => {
  const state = new PageLoadState(); let calls = 0;
  const unsubscribe = state.subscribe(() => calls++);
  state.set('read', true, true); const snapshot = state.getSnapshot();
  state.set('read', true, true);
  assert.equal(state.getSnapshot(), snapshot);
  assert.equal(calls, 1);
  unsubscribe(); state.remove('read');
  assert.equal(calls, 1);
});
