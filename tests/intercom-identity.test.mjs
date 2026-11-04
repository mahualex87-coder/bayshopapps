import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeIntercomIdentityData } from '../src/api/intercom-identity.ts';
import { planRead } from '../src/api/operations-contracts.ts';
import { API_ORIGIN, ApiError, errorMessage } from '../src/api/client.ts';
import { LiveAccountService } from '../src/api/service.ts';

const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiTTcifQ.synthetic';
const fixture = () => ({ id: '7', uid: 'M7', name: 'Synthetic', intercom: { intercom_user_jwt: jwt, expires_in: 86400 } });
test('support identity extracts only the existing uid/JWT/TTL and has no arbitrary userId query', () => {
  const plan = planRead({ kind: 'support.identity' });
  assert.equal(plan.path, '/api/auth');
  assert.deepEqual(plan.normalize({ ...fixture(), email: 'ignored@example.test', token: 'not-copied' }), { userId: 'M7', jwt, expiresInSeconds: 86400 });
  assert.throws(() => normalizeIntercomIdentityData({ ...fixture(), intercom: undefined }), error => errorMessage(error) === 'support.identityUnavailable');
  for (const raw of [null, [], { ...fixture(), uid: undefined }, { ...fixture(), uid: ' M7' }, { ...fixture(), uid: 'M7\n' }, { ...fixture(), intercom: [] }, ...[0, -1, 86401, '86400', Infinity].map(expires_in => ({ ...fixture(), intercom: { intercom_user_jwt: jwt, expires_in } })), { ...fixture(), intercom: { intercom_user_jwt: 'bad\njwt', expires_in: 86400 } }]) {
    assert.throws(() => normalizeIntercomIdentityData(raw), error => errorMessage(error) === 'errors.contract' && !error.message.includes(jwt));
  }
});
function setup() {
  const now = 1790000000000; let stored = JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-account-token', expiresAt: now + 3600000 });
  let delay = null; let fail = null;
  const service = new LiveAccountService(async (path, options) => {
    if (path === '/api/auth') { assert.equal(options.token, 'synthetic-account-token'); if (fail) throw fail; if (delay) return delay; return fixture(); }
    if (path === '/api/member/me') return { member: { id: '7', email: 'test@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'Synthetic' };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => stored, write: async value => { stored = value; }, clear: async () => { stored = null; } }, () => now);
  return { service, stored: () => stored, defer: value => { delay = value; }, fail: value => { fail = value; } };
}
test('support JWT stays out of account snapshots and secure-storage state; late result cannot cross logout', async () => {
  const value = setup(); await value.service.start();
  assert.equal((await value.service.readView({ kind: 'support.identity' })).jwt, jwt);
  assert.equal(JSON.stringify(value.service.getSnapshot()).includes(jwt), false); assert.equal(value.stored().includes(jwt), false);
  let resolve; value.defer(new Promise(done => { resolve = done; }));
  const pending = value.service.readView({ kind: 'support.identity' });
  await value.service.logout(); resolve(fixture());
  await assert.rejects(pending, error => errorMessage(error) === 'errors.cancelled');
  assert.equal(value.stored(), null);
});
test('support session expiry retains ordinary 401 logout behavior', async () => {
  const value = setup(); await value.service.start(); value.fail(new ApiError(401, 'errors.sessionExpired'));
  await assert.rejects(value.service.readView({ kind: 'support.identity' }), error => error.status === 401);
  assert.equal(value.service.getSnapshot().authenticated, false); assert.equal(value.stored(), null);
});
