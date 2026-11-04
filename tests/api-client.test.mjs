import assert from 'node:assert/strict';
import test from 'node:test';
import { API_ACCEPT, API_ORIGIN, ApiError, createApiTransport, errorMessage } from '../src/api/client.ts';

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

test('API transport sends credentials only to the HTTPS auth endpoint and uses bearer for reads', async () => {
  const requests = [];
  const transport = createApiTransport(async (url, options) => {
    requests.push({ url, options });
    return jsonResponse({ code: 200, error: false, data: { value: 'accepted' } });
  });
  const login = { email: 'bay+test@example.test', password: 'test + & = parola ș' };
  assert.deepEqual(await transport('/api/auth', { login, token: 'old-token-must-not-be-sent' }), { value: 'accepted' });
  await transport('/api/member-storage-address', { token: 'test-only-token' });
  assert.equal(requests[0].url, `${API_ORIGIN}/api/auth/`);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[0].options.headers.Bearer, undefined);
  assert.equal(requests[0].options.headers['Content-Type'], 'application/x-www-form-urlencoded; charset=utf-8');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(requests[0].options.body)), login);
  assert.equal(requests[1].options.method, 'GET');
  assert.equal(requests[1].options.body, undefined);
  assert.equal(requests[1].options.headers.Authorization, undefined);
  assert.equal(requests[1].options.headers.Bearer, 'test-only-token');
  for (const request of requests) {
    assert.equal(request.options.headers.Accept, API_ACCEPT);
    assert.equal(request.options.headers['Cache-Control'], 'no-store, no-cache');
    assert.equal(request.options.headers.Pragma, 'no-cache');
    assert.equal(request.options.redirect, 'error');
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.cache, 'no-store');
  }
  await assert.rejects(transport('/api/balance', { login: { email: 'bay@example.test', password: 'test-password' } }), ApiError);
  for (const path of ['https://other.example/api/auth', '/auth/login', '/api/auth\r\nX-Header: unsafe', '/api/auth#fragment']) await assert.rejects(transport(path), ApiError);
  assert.equal(requests.length, 2, 'invalid paths must never reach fetch');
});

test('MF version negotiation supports each native platform and vendor JSON responses', async () => {
  for (const platform of ['ios', 'android']) {
    const transport = createApiTransport(async (_url, options) => {
      assert.equal(options.headers.Accept, `${API_ACCEPT}; platform=${platform}`);
      return new Response(JSON.stringify({ data: [] }), { headers: { 'Content-Type': 'application/vnd.MF+json; charset=UTF-8' } });
    }, 20000, platform);
    assert.deepEqual(await transport('/api/auth/'), []);
  }
});

test('HTTP and application errors cannot expose server bodies, passwords or tokens', async () => {
  const sensitive = 'test-secret-password-token';
  for (const response of [
    jsonResponse({ message: sensitive }, 401),
    jsonResponse({ code: '401', error: false, message: sensitive, data: { token: sensitive } }),
    jsonResponse({ code: 200, error: true, message: sensitive, data: { token: sensitive } }),
    jsonResponse({ code: 200, error: 1, message: sensitive, data: { token: sensitive } }),
    jsonResponse({ code: 200, error: '1', message: sensitive, data: { token: sensitive } }),
    new Response(`<html>${sensitive}</html>`, { headers: { 'content-type': 'text/html' } }),
    jsonResponse({ message: sensitive }),
    jsonResponse([]),
  ]) {
    const transport = createApiTransport(async () => response);
    await assert.rejects(transport('/api/auth', { login: { email: 'bay@example.test', password: sensitive } }), error => {
      assert.equal(error.name, 'ApiError');
      assert.equal(error.message.includes(sensitive), false);
      return true;
    });
  }
  assert.equal(errorMessage(new Error(sensitive)).includes(sensitive), false);
  const failure = createApiTransport(async () => { throw new Error(`Failed fetch with ${sensitive}`); });
  await assert.rejects(failure('/api/balance', { token: sensitive }), error => !error.message.includes(sensitive));
});

test('a different response origin is rejected even when a fetch implementation follows redirects', async () => {
  const transport = createApiTransport(async () => ({
    url: 'https://other.example/api/balance', ok: true, status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ data: 'must not be read' }),
  }));
  await assert.rejects(transport('/api/balance', { token: 'test-token' }), error => error.name === 'ApiError' && /redirecționat/.test(error.message));
});

test('request timeout aborts fetch and external cancellation is distinguished', async () => {
  const signals = [];
  const fetcher = async (_url, options) => new Promise((_resolve, reject) => {
    signals.push(options.signal);
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (options.signal.aborted) abort();
    else options.signal.addEventListener('abort', abort, { once: true });
  });
  const timeoutTransport = createApiTransport(fetcher, 5);
  await assert.rejects(timeoutTransport('/api/auth'), error => /prea lent/.test(error.message));
  assert.equal(signals[0].aborted, true);
  const external = new AbortController();
  const cancellable = createApiTransport(fetcher, 10000)('/api/auth', { signal: external.signal });
  external.abort();
  await assert.rejects(cancellable, error => /anulată/.test(error.message));
  assert.equal(signals[1].aborted, true);
});

test('a valid request timeout override extends the default while external abort remains immediate', async () => {
  const signals = [];
  const transport = createApiTransport(async (_url, options) => new Promise((resolve, reject) => {
    signals.push(options.signal);
    const timer = setTimeout(() => resolve(jsonResponse({ data: { ready: true } })), 25);
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    if (options.signal.aborted) abort();
    else options.signal.addEventListener('abort', abort, { once: true });
  }), 5);
  assert.deepEqual(await transport('/api/balance?period=all', { timeoutMs: 60000 }), { ready: true });
  assert.equal(signals[0].aborted, false, 'the short transport default must be overridden');
  const external = new AbortController();
  const read = transport('/api/balance?period=all', { timeoutMs: 60000, signal: external.signal });
  const rejected = assert.rejects(read, error => error instanceof ApiError && error.key === 'errors.cancelled');
  external.abort();
  await rejected;
  assert.equal(signals[1].aborted, true);
});

test('invalid request timeout bounds never reach fetch', async () => {
  let calls = 0;
  const transport = createApiTransport(async () => { calls++; return jsonResponse({ data: [] }); });
  for (const timeoutMs of [0, -1, 60001, NaN, Infinity, -Infinity, '60000']) {
    await assert.rejects(transport('/api/balance?period=all', { timeoutMs }), error => error instanceof ApiError && error.key === 'errors.invalidRequest');
  }
  assert.equal(calls, 0);
  assert.deepEqual(await transport('/api/balance?period=1', { timeoutMs: 1 }), []);
  assert.equal(calls, 1);
});
