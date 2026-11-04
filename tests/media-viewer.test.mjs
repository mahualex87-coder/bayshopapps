import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedTransform, mediaIndex, mediaKind, mediaKindFromMime } from '../src/features/media/media-model.ts';
import { MAX_DOCUMENT_BYTES, readDocument } from '../src/features/media/read-document.ts';

test('media navigation clamps the initial photo and zoom/pan at both ends', () => {
  assert.equal(mediaIndex(9, 9), 8); assert.equal(mediaIndex(-1, 9), 0); assert.equal(mediaIndex(NaN, 9), 0);
  assert.deepEqual(boundedTransform(.5, 100, -100, 300, 600), { scale: 1, x: 0, y: 0 });
  assert.deepEqual(boundedTransform(2, 500, -500, 300, 600), { scale: 2, x: 150, y: -300 });
  assert.deepEqual(boundedTransform(Infinity, NaN, Infinity, 300, 600), { scale: 1, x: 0, y: 0 });
  assert.equal(boundedTransform(9, 0, 0, 300, 600).scale, 4);
});
test('file recognition uses the path, not an arbitrary URL query or a web page', () => {
  assert.equal(mediaKind('https://bayshop.com/files/invoice.PDF?signature=x'), 'pdf');
  assert.equal(mediaKind('https://bayshop.com/files/photo%2Ejpg'), 'image');
  assert.equal(mediaKind('https://bayshop.com/member?file=a.pdf'), null);
  assert.equal(mediaKind('https://bayshop.com/%E0%A4%A'), null);
  assert.equal(mediaKindFromMime('application/pdf; charset=binary'), 'pdf');
  assert.equal(mediaKindFromMime('text/html'), null);
});
test('document reader rejects login HTML and HTTP errors, including falsely labelled PDF files', async () => {
  for (const response of [new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } }), new Response('<html>Login</html>', { headers: { 'content-type': 'application/pdf' } }), new Response('%PDF-1.7', { status: 403 })]) await assert.rejects(() => readDocument(response));
  const pdf = await readDocument(new Response('%PDF-1.7\nfixture', { headers: { 'content-type': 'application/octet-stream' } }));
  assert.equal(pdf.kind, 'pdf'); assert.equal(new TextDecoder().decode(pdf.bytes), '%PDF-1.7\nfixture');
});
test('document downloads are bounded even when the server omits its content length', async () => {
  await assert.rejects(() => readDocument(new Response('small', { headers: { 'content-length': String(MAX_DOCUMENT_BYTES + 1) } })));
  let cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(6_000_000)); }, cancel() { cancelled = true; } });
  await assert.rejects(() => readDocument(new Response(body)));
  assert.equal(cancelled, true);
});
