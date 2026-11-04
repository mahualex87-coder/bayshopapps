import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicAuth, registrationError, validAuthEmail } from '../src/api/public-auth.ts';

const input = { firstName: '  Test + & Пример ', lastName: ' Verificare = șț ', email: ' audit+synthetic@example.test ', password: 'Synthetic + & = password', confirmation: 'Synthetic + & = password', accepted: true };
const accepted = { code: 200, error: false, message: 'Ok' };
const json = (body, status = 200, contentType = 'application/json') => new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('public registration validates local inputs before dispatch and adds no undocumented password policy', async () => {
  let calls = 0; const client = createPublicAuth(async () => { calls++; return json(accepted); });
  for (const [patch, errorKey] of [[{ firstName: ' ' }, 'auth.registrationNamesRequired'], [{ lastName: '' }, 'auth.registrationNamesRequired'], [{ email: 'invalid' }, 'auth.invalidEmail'], [{ password: '' }, 'auth.passwordRequired'], [{ confirmation: 'different' }, 'auth.passwordMismatch'], [{ accepted: false }, 'auth.acceptTermsRequired'], [{ accepted: 'yes' }, 'auth.acceptTermsRequired']]) {
    assert.equal(registrationError({ ...input, ...patch }), errorKey);
    assert.deepEqual(await client.register({ ...input, ...patch }, 'ro'), { outcome: 'rejected', errorKey });
  }
  assert.equal(registrationError(null), 'auth.registrationNamesRequired');
  assert.equal(validAuthEmail(null), false); assert.equal(validAuthEmail('test@local'), false);
  assert.equal(registrationError({ ...input, password: 'x', confirmation: 'x' }), null, 'server owns unprovided password rules');
  assert.equal(calls, 0);
});

test('registration sends exactly four documented fields as literal URL-encoded strings', async () => {
  for (const platform of ['ios', 'android']) for (const language of ['ro', 'ru', 'en']) {
    const calls = []; const client = createPublicAuth(async (url, options) => { calls.push({ url, options }); return json({ ...accepted, data: 'Check your mailbox.' }, 200, 'application/vnd.MF+json; charset=utf-8'); }, platform);
    const result = await client.register({ ...input, phone: '+000000', access_token: 'must-not-leak' }, language);
    assert.equal(result.outcome, 'accepted'); assert.equal(calls.length, 1);
    const { url, options } = calls[0]; assert.equal(url, 'https://bayshop.com/api/auth/register'); assert.equal(options.method, 'POST');
    assert.equal(options.headers.Accept, `application/vnd.MF+json; version=2; platform=${platform}`); assert.equal(options.headers['Accept-Language'], language);
    assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded; charset=utf-8');
    assert.equal(options.headers.Bearer, undefined); assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(options.body)), { first_name: input.firstName.trim(), last_name: input.lastName.trim(), email: input.email.trim(), password: input.password });
    assert(!JSON.stringify(result).includes(input.password)); assert(!JSON.stringify(result).includes('must-not-leak'));
    assert.deepEqual(Object.keys(client).sort(), ['register', 'restore']);
  }
});

test('restoration sends exactly one email with no token or automatic sign-in', async () => {
  const calls = []; const client = createPublicAuth(async (url, options) => { calls.push({ url, options }); return json(accepted); }, 'ios');
  assert.equal((await client.restore('invalid', 'ro')).outcome, 'rejected'); assert.equal(calls.length, 0);
  assert.equal((await client.restore(input.email, 'en')).outcome, 'accepted');
  assert.equal(calls[0].url, 'https://bayshop.com/api/auth/restore'); assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].options.body)), { email: input.email.trim() });
  assert.equal(calls[0].options.headers.Bearer, undefined); assert.equal(calls[0].options.credentials, 'omit');
});

test('documented HTTP200 error:true and contradictory Error/success:false are rejected', async () => {
  for (const body of [
    { code: 200, error: true, message: 'Ok', data: 'This mail is already registered. Please check your mail to activate account.' },
    { code: 200, error: 1, message: 'invalid mail' },
    { code: 200, error: false, message: 'Error' },
    { ...accepted, success: false },
    { code: 400, error: false, message: 'Ok' },
  ]) {
    const client = createPublicAuth(async () => json(body));
    assert.equal((await client.register(input, 'ro')).outcome, 'rejected');
  }
});

test('unknown success shapes and malformed envelopes never prove account creation', async () => {
  for (const body of [{}, { error: false }, { code: 200, error: false }, { error: false, message: 'Ok' }, { ...accepted, code: 'nonsense' }, { ...accepted, code: null }, { ...accepted, message: 'Created' }, { ...accepted, data: { id: '1', success: false } }, { ...accepted, data: [] }, [], null]) {
    const client = createPublicAuth(async () => json(body));
    assert.deepEqual(await client.register(input, 'en'), { outcome: 'unknown', errorKey: 'auth.requestUnknown' });
  }
  for (const flag of [false, 0, '0']) assert.equal((await createPublicAuth(async () => json({ ...accepted, code: '200', error: flag })).restore(input.email, 'ro')).outcome, 'accepted');
});

test('messages are plain text and redact a password even when the server HTML-encodes it', async () => {
  const value = { ...input, password: 'Secret<&>', confirmation: 'Secret<&>' };
  const body = { code: 200, error: true, message: 'Ok', data: '<script>ignored()</script><b>Invalid</b> Secret&lt;&amp;&gt; and Secret<&>' };
  const result = await createPublicAuth(async () => json(body)).register(value, 'ro');
  assert.equal(result.outcome, 'rejected'); assert(!result.message.includes(value.password)); assert(!result.message.includes('<script>')); assert(result.message.includes('••••'));
});

test('HTTP rate limit rejects, HTTP500 remains unknown, and non-JSON cannot be accepted', async () => {
  for (const [status, contentType, outcome, errorKey] of [[429, 'text/html', 'rejected', 'errors.rateLimit'], [500, 'application/json', 'unknown', 'auth.requestUnknown'], [200, 'text/html', 'unknown', 'auth.requestUnknown'], [400, 'text/html', 'rejected', 'auth.requestRejected']]) {
    assert.deepEqual(await createPublicAuth(async () => json(accepted, status, contentType)).restore(input.email, 'ro'), { outcome, errorKey });
  }
  assert.equal((await createPublicAuth(async () => new Response('broken', { status: 400, headers: { 'content-type': 'application/json' } })).restore(input.email, 'ro')).outcome, 'rejected');
  assert.equal((await createPublicAuth(async () => json(accepted, 200, 'Application/JSON ; charset=utf-8')).restore(input.email, 'ro')).outcome, 'accepted');
});

test('redirected responses cannot be trusted or trigger another request', async () => {
  let calls = 0; const response = json(accepted); Object.defineProperty(response, 'url', { value: 'https://other.example.test/registration' });
  const result = await createPublicAuth(async () => { calls++; return response; }).register(input, 'ro');
  assert.equal(result.outcome, 'unknown'); assert.equal(calls, 1);
});

test('pre-aborted actions never dispatch; timeout is unknown with no retry', async () => {
  let calls = 0; const aborted = new AbortController(); aborted.abort();
  assert.deepEqual(await createPublicAuth(async () => { calls++; return json(accepted); }).restore(input.email, 'ro', aborted.signal), { outcome: 'rejected', errorKey: 'errors.cancelled' });
  const client = createPublicAuth(async (_url, options) => { calls++; return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })); }, 'ios', 5);
  const result = await client.register(input, 'ro'); assert.deepEqual(result, { outcome: 'unknown', errorKey: 'auth.requestUnknown' }); assert.equal(calls, 1);
  assert.deepEqual(await client.register(input, 'ro'), result); assert.equal(calls, 1);
});

test('late success after cancellation or timeout stays unknown when a transport ignores abort', async () => {
  for (const timeout of [false, true]) {
    let calls = 0; let signal; const pending = deferred(); const abort = new AbortController();
    const client = createPublicAuth(async (_url, options) => { calls++; signal = options.signal; return pending.promise; }, 'android', timeout ? 5 : 20000);
    const result = client.restore(input.email, 'ro', abort.signal);
    if (timeout) await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); else abort.abort();
    pending.resolve(json(accepted)); assert.deepEqual(await result, { outcome: 'unknown', errorKey: 'auth.requestUnknown' }); assert.equal(calls, 1);
  }
});

test('duplicate taps lock pending actions and terminal results before React can rerender', async () => {
  let calls = 0; const pending = deferred(); const client = createPublicAuth(async () => { calls++; return pending.promise; });
  const first = client.register(input, 'en');
  assert.deepEqual(await client.register(input, 'en'), { outcome: 'rejected', errorKey: 'auth.requestPending' });
  assert.deepEqual(await client.restore(input.email, 'en'), { outcome: 'rejected', errorKey: 'auth.requestPending' });
  pending.resolve(json(accepted)); const result = await first;
  assert.equal(result.outcome, 'accepted'); assert.deepEqual(await client.register(input, 'en'), result); assert.equal(calls, 1);
});

test('a rejected action can be corrected and resubmitted once by the user', async () => {
  let calls = 0; const client = createPublicAuth(async () => json(++calls === 1 ? { code: 200, error: true, message: 'Invalid email' } : accepted));
  assert.equal((await client.restore(input.email, 'ro')).outcome, 'rejected');
  assert.equal((await client.restore(input.email, 'ro')).outcome, 'accepted'); assert.equal(calls, 2);
});


test('encoded password tag characters are redacted before they can become display markup', async () => {
  const value = { ...input, password: 'Secret<b>inside</b>value', confirmation: 'Secret<b>inside</b>value' };
  const body = { code: 200, error: true, message: 'Ok', data: 'Invalid Secret&lt;b&gt;inside&lt;/b&gt;value' };
  const result = await createPublicAuth(async () => json(body)).register(value, 'ro');
  assert.equal(result.message, 'Invalid ••••');
});
