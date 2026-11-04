import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { createSupportSessionController, supportIdentityAllowed } from '../src/features/support/session-controller.ts';
const now = 1800000000000;
const jwt = payload => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.c3ludGhldGljLXNpZ25hdHVyZQ`;
const claims = { user_id: 'TEST-UID', name: 'Nume Șț Test', email: 'synthetic@example.test', exp: now / 1000 + 3600 };
const identity = { userId: 'TEST-UID', jwt: jwt(claims), expiresInSeconds: 3600 };
const config = { appId: 'syntheticapp', apiKey: 'synthetic-public-sdk-key', region: 'US' };
const options = { expectedUserId: 'TEST-UID', isCurrent: () => true, theme: 'dark' };
function mock(overrides = {}) {
  const calls = [];
  const bridge = Object.fromEntries(['initialize', 'logout', 'hideIntercom', 'removeUserJwtProvider', 'setUserJwt', 'loginUserWithUserAttributes', 'setThemeMode', 'setLogLevel', 'setLauncherVisibility', 'setInAppMessageVisibility', 'suppressProactiveContent', 'present'].map(name => [name, async (...args) => { calls.push([name, ...args]); return overrides[name] ? overrides[name](...args) : true; }]));
  return { calls, controller: createSupportSessionController(bridge, () => config, () => now), bridge };
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
test('support permits only the signed basic chat identity and rejects wrong UID, expired or bulk attributes', () => {
  assert(supportIdentityAllowed(identity, 'TEST-UID', now));
  for (const patch of [{ user_id: 'OTHER' }, { exp: now / 1000 }, { phone: '+37312345678' }, { parcels: [] }, { balance: 1 }, { custom_attributes: { all: true } }]) assert.equal(supportIdentityAllowed({ ...identity, jwt: jwt({ ...claims, ...patch }) }, 'TEST-UID', now), false);
  assert.equal(supportIdentityAllowed({ ...identity, userId: 'OTHER' }, 'TEST-UID', now), false);
  assert.equal(supportIdentityAllowed({ ...identity, jwt: 'broken' }, 'TEST-UID', now), false);
});
test('construction and cleanup before first open make no SDK calls; opening is signed and explicit', async () => {
  const { controller, calls } = mock(); assert.equal(calls.length, 0); assert.equal(await controller.clear(), true); assert.equal(calls.length, 0);
  assert.deepEqual(await controller.open(identity, options), { ok: true });
  const names = calls.map(call => call[0]); assert(names.indexOf('logout') < names.indexOf('setUserJwt')); assert(names.indexOf('setUserJwt') < names.indexOf('loginUserWithUserAttributes')); assert.equal(names.at(-1), 'present');
  assert.deepEqual(calls.find(call => call[0] === 'loginUserWithUserAttributes')[1], { userId: 'TEST-UID' });
  assert.deepEqual(calls.find(call => call[0] === 'setThemeMode'), ['setThemeMode', 'DARK']);
  assert(!names.some(name => ['logEvent', 'updateUser', 'loginUnidentifiedUser', 'sendTokenToIntercom', 'setUserHash'].includes(name)));
  await controller.clear(); assert.equal(calls.at(-1)[0], 'logout');
});
test('stale/mismatched identities and missing configuration never initialize or transmit data', async () => {
  const { controller, calls, bridge } = mock();
  assert.deepEqual(await controller.open(identity, { ...options, isCurrent: () => false }), { ok: false, error: 'session_changed' });
  assert.deepEqual(await controller.open({ ...identity, userId: 'OTHER' }, options), { ok: false, error: 'identity_unavailable' });
  assert.equal((await createSupportSessionController(bridge, () => null).open(identity, options)).error, 'not_configured'); assert.equal(calls.length, 0);
});
test('logout while initialization is in flight prevents login and cleans up the newly initialized SDK', async () => {
  const wait = deferred(); const { controller, calls } = mock({ initialize: async () => wait.promise });
  const opening = controller.open(identity, options);
  while (!calls.some(call => call[0] === 'initialize')) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await controller.open(identity, options)).error, 'busy');
  const clearing = controller.clear(); wait.resolve(true);
  assert.equal((await opening).error, 'session_changed'); assert.equal(await clearing, true);
  assert(!calls.some(call => call[0] === 'loginUserWithUserAttributes')); assert.equal(calls.at(-1)[0], 'logout');
});
test('account change during login hides and logs out rather than presenting another account', async () => {
  let current = true; const { controller, calls } = mock({ loginUserWithUserAttributes: async () => { current = false; return true; } });
  assert.equal((await controller.open(identity, { ...options, isCurrent: () => current })).error, 'session_changed');
  assert(!calls.some(call => call[0] === 'present')); assert.equal(calls.at(-1)[0], 'logout');
});
test('cleanup failures block presentation and an explicit later attempt must clear the old session first', async () => {
  let fail = true; const { controller, calls } = mock({ logout: async () => !fail });
  assert.equal((await controller.open(identity, options)).error, 'cleanup_failed'); assert(!calls.some(call => call[0] === 'setUserJwt'));
  fail = false; assert.deepEqual(await controller.open(identity, options), { ok: true });
  assert.equal(calls.filter(call => call[0] === 'initialize').length, 1);
});
