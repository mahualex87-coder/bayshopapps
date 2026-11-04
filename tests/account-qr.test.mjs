import assert from 'node:assert/strict';
import test from 'node:test';
import { createQrBrightnessController } from '../src/domain/qr-brightness.ts';
import { normalizeAccountPickupQr } from '../src/api/account-qr.ts';
import { planRead } from '../src/api/operations-contracts.ts';
import { API_ORIGIN } from '../src/api/client.ts';
import { LiveAccountService } from '../src/api/service.ts';

function fixture(overrides = {}) {
  const calls = [];
  const adapter = { available: async () => true, get: async () => 0.32, set: async value => { calls.push(value); }, ...overrides };
  return { calls, controller: createQrBrightnessController(adapter) };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('account pickup QR encodes only the exact authenticated server code', () => {
  const read = planRead({ kind: 'account.qr' });
  assert.equal(read.path, '/api/qr/member');
  assert.deepEqual(read.normalize({ code: 'ABC-123 ' }), { code: 'ABC-123 ' });
  for (const value of [null, [], {}, { code: 123 }, { memberId: 123 }, { code: '' }, { code: ' ' }, { code: 'a\nb' }, { code: 'x'.repeat(513) }]) assert.throws(() => normalizeAccountPickupQr(value));
});
test('pickup QR is requested on demand with the session token and is never persisted in account state', async () => {
  const now = 1790000000000;
  let persisted = JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-qr-session', expiresAt: now + 3600000 });
  const before = persisted; const qrCalls = [];
  const service = new LiveAccountService(async (path, options) => {
    if (path === '/api/qr/member') { qrCalls.push(options); return { code: `synthetic-pickup-${qrCalls.length}` }; }
    if (path === '/api/auth') return { id: '123', name: 'Synthetic' };
    if (path === '/api/member/me') return { id: '123', email: 'synthetic@example.test' };
    if (path === '/api/member/personal-data') return {};
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => persisted, write: async value => { persisted = value; }, clear: async () => { persisted = null; } }, () => now);
  await service.start(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(qrCalls.length, 0, 'startup must not renew the server QR');
  assert.deepEqual(await service.readView({ kind: 'account.qr' }), { code: 'synthetic-pickup-1' });
  assert.deepEqual(await service.readView({ kind: 'account.qr' }), { code: 'synthetic-pickup-2' });
  assert.ok(qrCalls.every(call => call.token === 'synthetic-qr-session'));
  assert.equal(persisted, before);
  assert.equal(JSON.stringify(service.getSnapshot()).includes('synthetic-pickup-'), false);
});
test('QR brightens the screen and restores its exact previous value on close', async () => {
  const { controller, calls } = fixture();
  const lease = controller.acquire(true); await lease.ready; await lease.release();
  assert.deepEqual(calls, [1, 0.32]);
});
test('background and foreground transitions restore then recapture brightness', async () => {
  let current = 0.32;
  const { controller, calls } = fixture({ get: async () => current });
  const lease = controller.acquire(true); await lease.ready;
  await lease.setActive(false); current = 0.6; await lease.setActive(true); await lease.release();
  assert.deepEqual(calls, [1, 0.32, 1, 0.6]);
});
test('Android automatic brightness is restored without writing a system brightness value', async () => {
  let restores = 0;
  const { controller, calls } = fixture({ usingSystem: async () => true, restoreSystem: async () => { restores++; } });
  const lease = controller.acquire(true); await lease.ready; await lease.release();
  assert.deepEqual(calls, [1]); assert.equal(restores, 1);
});
test('closing during capability lookup never boosts a closed modal', async () => {
  const wait = deferred(); const { controller, calls } = fixture({ available: () => wait.promise });
  const lease = controller.acquire(true); await Promise.resolve();
  const closed = lease.release(); wait.resolve(true); await Promise.all([lease.ready, closed]);
  assert.deepEqual(calls, []);
});
test('closing while a native boost is pending restores after the boost resolves', async () => {
  const wait = deferred(); const started = deferred(); const calls = [];
  const { controller } = fixture({ set: async value => { calls.push(value); if (value === 1) { started.resolve(); await wait.promise; } } });
  const lease = controller.acquire(true); await started.promise;
  const closed = lease.release(); wait.resolve(); await Promise.all([lease.ready, closed]);
  assert.deepEqual(calls, [1, 0.32]);
});
test('a retiring modal cannot restore over a new visible QR', async () => {
  const { controller, calls } = fixture();
  const first = controller.acquire(true); await first.ready;
  const closing = first.release(); const second = controller.acquire(true);
  await Promise.all([closing, second.ready]); assert.deepEqual(calls, [1]);
  await second.release(); assert.deepEqual(calls, [1, 0.32]);
});
test('unsupported devices and initially inactive modals leave brightness untouched', async () => {
  const unsupported = fixture({ available: async () => false });
  const noCapability = unsupported.controller.acquire(true); await noCapability.ready; await noCapability.release();
  assert.deepEqual(unsupported.calls, []);
  const inactive = fixture(); const lease = inactive.controller.acquire(false); await lease.ready; await lease.release();
  assert.deepEqual(inactive.calls, []);
});
test('a failed native boost attempts restoration and a failed restore can be retried', async () => {
  const failedBoost = fixture({ set: async value => { if (value === 1) throw new Error('unavailable'); } });
  const lease = failedBoost.controller.acquire(true); await assert.rejects(lease.ready); await lease.release();
  let restored = 0;
  const transient = fixture({ set: async value => { if (value !== 1 && ++restored === 1) throw new Error('temporary'); } });
  const other = transient.controller.acquire(true); await other.ready;
  await assert.rejects(other.release()); await other.release(); assert.equal(restored, 2);
});
