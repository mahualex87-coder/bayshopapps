import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveAccountService } from '../src/api/service.ts';
import { API_ORIGIN } from '../src/api/client.ts';
const now = 1790000000000;
const auth = { accessToken: 'synthetic-bayshop-token', expiresInSeconds: 3600, tokenType: 'Bearer', profile: { id: '7', clientCode: 'M7', firstName: 'First', lastName: 'Last', email: null, phone: null } };
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
function create(extra = {}) {
  let saved = null; const requests = []; const events = [];
  const service = new LiveAccountService(async (path, options) => {
    requests.push({ path, options });
    if (path === '/api/auth') return { id: '7', name: 'First', surname: 'Last' };
    if (path === '/api/member/me') return { member: { id: '7', email: 'person@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'First', surname: 'Last' };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => saved, clear: async () => { saved = null; events.push('clear'); }, write: async value => { saved = value; events.push('write'); if (extra.write) await extra.write(value); } }, () => now);
  return { service, saved: () => saved, requests, events };
}
test('completed social session adopts the ordinary secure session without provider credentials or an auth POST', async () => {
  const value = create(); await value.service.start();
  const result = await value.service.adoptSocialSession({ ...auth, pendingToken: 'must-not-persist', profile: { ...auth.profile, idToken: 'must-not-persist' } }, value.service.getSnapshot().authRevision);
  assert.equal(result.ok, true); await flush();
  assert.equal(value.service.getSnapshot().accountId, '7'); assert.equal(value.service.getSnapshot().authenticated, true);
  assert.deepEqual(JSON.parse(value.saved()), { origin: API_ORIGIN, token: auth.accessToken, expiresAt: now + 3600000 });
  assert.equal(value.saved().includes('must-not-persist'), false);
  assert.equal(JSON.stringify(value.service.getSnapshot()).includes(auth.accessToken), false);
  assert.equal(value.requests.some(call => call.options.login || call.options.write), false);
  assert.equal(value.service.getSnapshot().authRevision, 1);
});
test('an OAuth result arriving after logout cannot restore a closed account', async () => {
  const value = create(); await value.service.start(); const before = value.service.getSnapshot().authRevision;
  await value.service.logout();
  assert.deepEqual(await value.service.adoptSocialSession(auth, before), { ok: false, error: 'errors.cancelled' });
  assert.equal(value.saved(), null); assert.equal(value.service.getSnapshot().authenticated, false); assert.equal(value.requests.length, 0);
});
test('logout during social secure storage wins and duplicates cannot overwrite it', async () => {
  const wait = deferred(); const value = create({ write: () => wait.promise }); await value.service.start();
  const before = value.service.getSnapshot().authRevision;
  const pending = value.service.adoptSocialSession(auth, before); await flush();
  assert.equal((await value.service.adoptSocialSession(auth, before)).error, 'errors.loginInProgress');
  const logout = value.service.logout(); wait.resolve(); await logout;
  assert.equal((await pending).ok, false); assert.equal(value.saved(), null); assert.equal(value.service.getSnapshot().accountId, null);
});
test('malformed or incomplete sessions never become tokens or account state', async () => {
  for (const input of [null, { pendingToken: 'opaque' }, { ...auth, accessToken: 'bad\ntoken' }, { ...auth, expiresInSeconds: 0 }, { ...auth, tokenType: 'Other' }, { ...auth, profile: { ...auth.profile, id: null } }]) {
    const value = create(); await value.service.start(); assert.equal((await value.service.adoptSocialSession(input, 0)).ok, false);
    assert.equal(value.saved(), null); assert.equal(value.requests.length, 0); assert.equal(value.service.getSnapshot().authenticated, false);
  }
});
