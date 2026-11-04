import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, createApiTransport } from '../src/api/client.ts';
import { MutationInputError, prepareWriteBody, validationFieldErrors } from '../src/api/mutations.ts';

const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const write = { method: 'POST', encoding: 'form', fields: { title: 'Șir + & = Пример', 'invoiceList[]': ['11', '12'], disabled: false, omitted: undefined } };

test('authenticated writes use custom Bearer, selected locale and literal repeated form fields', async () => {
  const calls = [];
  const transport = createApiTransport(async (url, options) => { calls.push({ url, options }); return response({ code: 200, error: false, data: { success: true } }); }, 20000, 'android');
  assert.deepEqual(await transport('/api/mf-storage-declaration/123', { token: 'test-token', language: 'ru', write }), { success: true });
  const { options } = calls[0];
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Bearer, 'test-token');
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.headers['Accept-Language'], 'ru');
  assert.match(options.headers.Accept, /platform=android$/);
  const fields = new URLSearchParams(options.body);
  assert.equal(fields.get('title'), write.fields.title);
  assert.deepEqual(fields.getAll('invoiceList[]'), ['11', '12']);
  assert.equal(fields.get('disabled'), '0');
  assert.equal(fields.has('omitted'), false);
  assert.equal(options.redirect, 'error');
  assert.equal(calls.length, 1);
});

test('multipart uses file blobs and fetch-owned boundary without base64 or remote file fetching', async () => {
  const picked = { uri: 'file:///cache/receipt.pdf', name: 'receipt.pdf', mimeType: 'application/pdf', size: 9 };
  const calls = [];
  const transport = createApiTransport(async (_url, options) => { calls.push(options); return response({ data: { success: true } }); }, 20000, 'ios', file => {
    assert.deepEqual(file, picked);
    return new Blob(['synthetic'], { type: file.mimeType });
  });
  await transport('/api/package-invoice/123', { token: 'test-token', write: { method: 'POST', encoding: 'multipart', fields: { 'invoiceList[]': ['10', '11'] }, files: [{ field: 'file', file: picked }] } });
  assert.equal(calls[0].headers['Content-Type'], undefined);
  assert(calls[0].body instanceof FormData);
  assert.deepEqual(calls[0].body.getAll('invoiceList[]'), ['10', '11']);
  assert.equal(calls[0].body.get('file').name, 'receipt.pdf');
  assert.equal(await calls[0].body.get('file').text(), 'synthetic');
  await assert.rejects(prepareWriteBody({ ...write, encoding: 'multipart', files: [{ field: 'file', file: { ...picked, uri: 'https://other.example/private.pdf' } }] }, () => { throw new Error('must not resolve remote'); }), MutationInputError);
  await assert.rejects(prepareWriteBody({ ...write, encoding: 'multipart', files: [{ field: 'file', file: { ...picked, name: 'receipt.pdf\r\nInjected: yes' } }] }), MutationInputError);
});

test('missing credentials, auth-write collisions and pre-aborted files never dispatch', async () => {
  let calls = 0;
  const transport = createApiTransport(async () => { calls++; return response({ data: {} }); });
  await assert.rejects(transport('/api/cart', { write }), ApiError);
  await assert.rejects(transport('/api/auth/', { token: 'test', write }), ApiError);
  await assert.rejects(transport('/api/auth/', { login: { email: 'test@example.test', password: 'synthetic' }, write }), ApiError);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(transport('/api/cart', { token: 'test', write, signal: controller.signal }), error => error.outcome === 'rejected');
  await assert.rejects(transport('/api/../../outside', { token: 'test', write }), ApiError);
  assert.equal(calls, 0);
});

test('documented HTTP200 Error validation is rejected despite error:false; field text never escapes', async () => {
  const transport = createApiTransport(async () => response({ code: 200, error: false, message: 'Error', data: { tracking: { trackingNumberExists: 'SENSITIVE INPUT secret@example.test' }, declarations: [{ title: { invalid: 'SENSITIVE title' } }], access_token: 'SENSITIVE TOKEN' } }));
  await assert.rejects(transport('/api/waiting-mf/', { token: 'synthetic-token', write }), error => {
    assert.equal(error.outcome, 'rejected');
    assert.equal(error.key, 'errors.validation');
    assert.deepEqual(error.fieldErrors, { tracking: 'errors.trackingExists', 'items.0.title': 'errors.invalidField' });
    assert.equal(JSON.stringify(error).includes('SENSITIVE'), false);
    return true;
  });
  assert.deepEqual(validationFieldErrors({ password: 'secret', access_token: 'secret', '__proto__': { invalid: 'secret' } }), {});
});

test('timeout and malformed write acknowledgement remain unknown and are never retried', async () => {
  let calls = 0;
  const transport = createApiTransport(async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  }, 5);
  await assert.rejects(transport('/api/cart', { token: 'test', write }), error => error.key === 'errors.timeout' && error.outcome === 'unknown');
  assert.equal(calls, 1);
  for (const result of [response({ error: true }, 500), response({ code: 200, error: false, message: 'Ok' }), new Response('not-json')]) {
    const check = createApiTransport(async () => result);
    await assert.rejects(check('/api/cart', { token: 'test', write }), error => error.outcome === 'unknown');
  }
});

test('recipient validation errors use the backend errorMessages envelope without exposing raw values', async () => {
  for (const status of [200, 422]) {
    const transport = createApiTransport(async () => response({ code: status, error: true, message: 'Invalid data', errorMessages: { shipping_first_name: { isEmpty: 'RAW value' }, shipping_phone: { invalid: 'RAW number' } } }, status));
    await assert.rejects(transport('/api/member-address/', { token: 'synthetic-token', write }), error => {
      assert.equal(error.outcome, 'rejected');
      assert.equal(error.key, 'errors.validation');
      assert.deepEqual(error.fieldErrors, { shipping_first_name: 'errors.fieldRequired', shipping_phone: 'errors.invalidField' });
      assert.equal(JSON.stringify(error).includes('RAW'), false);
      return true;
    });
  }
});

test('envelope reads preserve documented top-level fields but still enforce application errors', async () => {
  const envelope = { code: 200, error: false, images: [], maxImages: 5 };
  const transport = createApiTransport(async () => response(envelope));
  assert.deepEqual(await transport('/api/customs-photos/123', { token: 'test', responseMode: 'envelope' }), envelope);
  await assert.rejects(transport('/api/customs-photos/123', { token: 'test' }), ApiError);
  const rejected = createApiTransport(async () => response({ code: 200, error: true, images: [] }));
  await assert.rejects(rejected('/api/customs-photos/123', { token: 'test', responseMode: 'envelope' }), ApiError);
});
