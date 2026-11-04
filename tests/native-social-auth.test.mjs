import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeSocialAuth, socialCapabilities, socialChallenge, socialAuthData, socialCompletionFields } from '../src/api/native-social-auth.ts';

const opaque = 'a'.repeat(64);
const challenge = { flowId: opaque, provider: 'apple', nonce: 'b'.repeat(64), state: 'c'.repeat(64), expiresAt: '2030-01-01T00:00:00+00:00' };
const profile = { firstName: 'Test', lastName: 'Member', email: 'test@example.test', phone: '', phoneCode: '', countryId: '' };
const allFields = ['firstName', 'lastName', 'phone', 'phoneCode', 'countryId'];
const rawPending = { status: 'completion_required', pendingToken: opaque, expiresAt: challenge.expiresAt, isNew: true, profile, editableFields: allFields, requiredFields: allFields, termsRequired: true, metadata: { countries: [{ id: '1', code: 'MD', title: 'Moldova' }], phoneFormats: [{ id: '3', countryId: '1', countryCode: 'MD', title: 'Moldova', code: '+373', format: '99 999 999' }] } };
const filled = { ...profile, firstName: ' Test + & ', lastName: ' Member = Șț ', phone: '12 345 678', phoneCode: '+373', countryId: '1', memberId: 'untrusted', access_token: 'must-not-send' };
const session = { status: 'authenticated', session: { access_token: 'synthetic-session', expires_in: 3600, token_type: 'Bearer', id: '42', name: 'Test', surname: 'Member', uid: 'TEST-42' } };
const caps = { version: 1, providers: { apple: { enabled: true, clientId: 'com.example.test' }, google: { enabled: false, clientId: null } } };
const response = (data, status = 200) => new Response(JSON.stringify({ code: 200, error: false, message: 'Ok', data }), { status, headers: { 'Content-Type': 'application/json' } });
const failure = (errorCode, status = 400) => new Response(JSON.stringify({ code: status, error: true, message: 'Never expose provider-token', errorCode }), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('native social metadata rejects unknown versions, malformed challenges and unsafe completion scope', () => {
  assert.deepEqual(socialCapabilities(caps), caps);
  assert.throws(() => socialCapabilities({ ...caps, version: 2 }));
  assert.throws(() => socialCapabilities({ ...caps, providers: { ...caps.providers, apple: { enabled: true, clientId: null } } }));
  assert.deepEqual(socialChallenge(challenge), challenge);
  for (const patch of [{ nonce: 'short' }, { flowId: 'https://other.invalid' }, { provider: 'unknown' }, { expiresAt: '2030-01-01' }]) assert.throws(() => socialChallenge({ ...challenge, ...patch }));
  const pending = socialAuthData(rawPending);
  assert.equal(pending.formats.phoneCodes[0].code, '+373'); assert.equal(pending.formats.countries[0].code, 'MD');
  for (const patch of [{ termsRequired: false }, { requiredFields: ['phone'] }, { editableFields: [...allFields, 'email'] }, { requiredFields: [...allFields, 'phone'] }]) assert.throws(() => socialAuthData({ ...rawPending, ...patch }));
  assert.throws(() => socialAuthData({ ...rawPending, isNew: false, termsRequired: false, editableFields: ['firstName'], requiredFields: ['firstName'] }));
  const existing = socialAuthData({ ...rawPending, isNew: false, termsRequired: false, editableFields: ['phone'], requiredFields: ['phone'] });
  assert.deepEqual(socialCompletionFields(existing, filled, false), { phone: '12 345 678' });
  assert.equal(socialAuthData(session).session.profile.id, '42');
});

test('public capabilities and challenge send only exact fixed endpoint, platform, language and safe transport flags', async () => {
  const calls = []; const client = createNativeSocialAuth(async (url, options) => { calls.push({ url, options }); return response(options.method === 'GET' ? caps : challenge); }, 'ios');
  assert.equal((await client.capabilities('ru')).outcome, 'success');
  assert.equal((await client.challenge('apple', 'en')).outcome, 'success');
  assert.equal(calls[0].url, 'https://bayshop.com/api/native-auth?platform=ios');
  assert.equal(calls[1].url, 'https://bayshop.com/api/native-auth');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[1].options.body)), { operation: 'challenge', provider: 'apple', platform: 'ios' });
  for (const { options } of calls) {
    assert.equal(options.headers.Accept, 'application/vnd.MF+json; version=2; platform=ios');
    assert.equal(options.headers.Bearer, undefined); assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
  }
  assert.equal(calls[0].options.headers['Accept-Language'], 'ru');
});

test('verify keeps proof body-only and completion submits only server-editable fields, never email or account id', async () => {
  const calls = []; const client = createNativeSocialAuth(async (url, options) => { calls.push({ url, options }); return response(calls.length === 1 ? rawPending : session); }, 'ios');
  const result = await client.verify(challenge, { idToken: 'synthetic.jwt.value', firstName: 'Test', lastName: 'Member' }, 'ro');
  assert.equal(result.outcome, 'success');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].options.body)), { operation: 'verify', flowId: opaque, idToken: 'synthetic.jwt.value', firstName: 'Test', lastName: 'Member' });
  const pending = socialAuthData(rawPending);
  assert.deepEqual(await client.complete(pending, filled, false, 'ro'), { outcome: 'rejected', errorCode: 'terms_required' }); assert.equal(calls.length, 1);
  assert.equal((await client.complete(pending, filled, true, 'ro')).outcome, 'success');
  const data = Object.fromEntries(new URLSearchParams(calls[1].options.body));
  assert.deepEqual(data, { operation: 'complete', pendingToken: opaque, acceptedTerms: '1', 'profile[firstName]': 'Test + &', 'profile[lastName]': 'Member = Șț', 'profile[phone]': '12 345 678', 'profile[phoneCode]': '+373', 'profile[countryId]': '1' });
  assert(!calls[1].options.body.includes('example.test')); assert(!calls[1].options.body.includes('must-not-send'));
});

test('known validation failures can be corrected; server messages and unknown errors never reach display', async () => {
  let count = 0; const client = createNativeSocialAuth(async () => ++count === 1 ? failure('invalid_phone') : response(session), 'ios');
  const pending = socialAuthData(rawPending);
  assert.deepEqual(await client.complete(pending, filled, true, 'ro'), { outcome: 'rejected', errorCode: 'invalid_phone' });
  assert.equal((await client.complete(pending, filled, true, 'ro')).outcome, 'success');
  assert.deepEqual(await createNativeSocialAuth(async () => failure('provider-token'), 'ios').challenge('apple', 'ro'), { outcome: 'rejected', errorCode: 'request_rejected' });
  assert.deepEqual(await createNativeSocialAuth(async () => failure('none', 404), 'ios').capabilities('ro'), { outcome: 'rejected', errorCode: 'provider_unavailable' });
});

test('late successful response after abort stays unknown and cannot be replayed by the same client', async () => {
  const wait = deferred(); let count = 0; const aborter = new AbortController();
  const client = createNativeSocialAuth(async () => { count++; return wait.promise; }, 'ios');
  const first = client.verify(challenge, { idToken: 'synthetic.jwt.value' }, 'ro', aborter.signal);
  assert.deepEqual(await client.challenge('apple', 'ro'), { outcome: 'rejected', errorCode: 'request_pending' });
  aborter.abort(); wait.resolve(response(session));
  assert.deepEqual(await first, { outcome: 'unknown', errorCode: 'request_unknown' });
  assert.deepEqual(await client.verify(challenge, { idToken: 'synthetic.jwt.value' }, 'ro'), { outcome: 'unknown', errorCode: 'request_unknown' }); assert.equal(count, 1);
});

test('timeout, malformed success and ambiguous final write never retry or claim authenticated', async () => {
  for (const result of [response({ status: 'authenticated', session: {} }), failure('temporarily_unavailable', 503), new Response('<html>failure</html>', { status: 200 }), new Response('{broken', { status: 200, headers: { 'Content-Type': 'application/json' } })]) {
    let count = 0; const client = createNativeSocialAuth(async () => { count++; return result; }, 'ios');
    assert.deepEqual(await client.complete(socialAuthData(rawPending), filled, true, 'ro'), { outcome: 'unknown', errorCode: 'request_unknown' });
    assert.equal((await client.complete(socialAuthData(rawPending), filled, true, 'ro')).outcome, 'unknown'); assert.equal(count, 1);
  }
  const cancelled = new AbortController(); cancelled.abort(); let count = 0;
  assert.deepEqual(await createNativeSocialAuth(async () => { count++; return response(caps); }, 'ios').capabilities('ro', cancelled.signal), { outcome: 'rejected', errorCode: 'cancelled' }); assert.equal(count, 0);
  const client = createNativeSocialAuth(async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })), 'ios', 5);
  assert.equal((await client.challenge('apple', 'ro')).outcome, 'unknown');
});
