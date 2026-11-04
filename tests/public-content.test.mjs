import assert from 'node:assert/strict';
import test from 'node:test';
import { publicContentPages, publicContentNavigationAllowed, publicContentUrl, publicPageUrl, readerNavigationAllowed, readerUrl, readPublicContent } from '../src/features/content/public-content-policy.ts';
import { readablePublicText } from '../src/features/content/readable-public-text.ts';

const response = ({ url = publicContentPages.terms, body = '<main><h1>Terms</h1><p>Official text</p></main>', status = 200, type = 'text/html; charset=utf-8', length } = {}) => {
  const result = new Response(body, { status, headers: { 'content-type': type, ...(length === undefined ? {} : { 'content-length': String(length) }) } });
  Object.defineProperty(result, 'url', { value: url });
  return result;
};
const read = (fetcher, url = publicContentPages.terms, signal = new AbortController().signal) => readPublicContent(fetcher, url, signal);

test('public reader accepts only official legal/contact pages and regional reading redirects', () => {
  for (const url of [publicContentPages.terms, publicContentPages.contacts, 'https://bayshop.com/ro/page/terms-of-use.html', 'https://bayshop.com/us/page/terms-of-use.html#section-4', 'https://bayshop.com/gb/page/contact-us.html', 'https://bayshop.com/ro/en/page/privacy-policy.html']) {
    assert.equal(publicContentUrl(url), url);
    assert.equal(publicContentNavigationAllowed(url), true);
  }
  assert.equal(publicContentUrl('about:blank'), null, 'blank cannot be the initial document');
  assert.equal(publicContentNavigationAllowed('about:blank'), true, 'WebView may create an inert blank document');
});

test('reader denies account/login, arbitrary external schemes, pop-up targets and URL impersonation', () => {
  for (const url of [
    'https://bayshop.com/member/balance', 'https://bayshop.com/login', 'https://bayshop.com/api/auth',
    'https://bayshop.com/page/terms-of-use.html?redirect=/member',
    'https://bayshop.com/page/%74erms-of-use.html', 'https://bayshop.com/page/terms-of-use.html/extra',
    'https://external.example/page/terms-of-use.html', 'https://bayshop.com.external.example/page/terms-of-use.html',
    'https://evil@bayshop.com/page/terms-of-use.html', 'https://bayshop.com:8767/page/contact-us.html',
    'https://www.bayshop.com/page/contact-us.html', 'http://bayshop.com/page/contact-us.html',
    'javascript:alert(1)', 'data:text/html,hello', 'tel:+000000', 'mailto:test@example.test',
    'intent://bayshop.com', 'file:///private/secret', 'about:blank#other', '', null, undefined,
    ' https://bayshop.com/page/contact-us.html',
  ]) {
    assert.equal(publicContentUrl(url), null, String(url));
    assert.equal(publicContentNavigationAllowed(url), false, String(url));
  }
});

test('web public read omits every session credential and accepts an official regional final URL', async () => {
  const calls = []; const signal = new AbortController().signal;
  const html = await read(async (url, options) => { calls.push({ url, options }); return response({ url: 'https://bayshop.com/us/page/terms-of-use.html' }); }, publicContentPages.terms, signal);
  assert.match(html, /Official text/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, publicContentPages.terms);
  assert.deepEqual(calls[0].options, { method: 'GET', credentials: 'omit', mode: 'cors', cache: 'no-store', referrerPolicy: 'no-referrer', signal });
  assert.equal(calls[0].options.headers, undefined);
  assert.equal(calls[0].options.body, undefined);
});

test('failed/redirected/non-HTML/oversized public responses are never shown as legal text', async () => {
  for (const result of [
    response({ status: 403 }), response({ status: 500 }),
    response({ url: 'https://bayshop.com/login' }), response({ url: 'https://external.example/terms' }),
    response({ type: 'application/json', body: '{"data":"not a page"}' }),
    response({ length: 2_000_001 }), response({ body: 'x'.repeat(2_000_001) }), response({ body: '  ' }),
  ]) await assert.rejects(read(async () => result), /contentReader.loadError/);
});

test('invalid/aborted public reads do not dispatch and transport errors never auto-retry', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new TypeError('CORS blocked'); };
  await assert.rejects(read(fetcher, 'https://bayshop.com/member/balance'));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(read(fetcher, publicContentPages.terms, controller.signal));
  assert.equal(calls, 0);
  await assert.rejects(read(fetcher), /CORS blocked/); assert.equal(calls, 1);
  const later = new AbortController();
  await assert.rejects(read(async () => { later.abort(); return response(); }, publicContentPages.terms, later.signal), /contentReader.loadError/);
});

test('public product/carrier URLs keep their query and only navigate within the initial HTTPS hostname', () => {
  const product = 'https://shop.example/products/item?variant=20&color=red';
  const tracking = 'https://carrier.example/track?parcel=ABC123';
  assert.equal(publicPageUrl(product), product); assert.equal(publicPageUrl(tracking), tracking);
  assert.equal(publicContentUrl(product), null, 'legal reader does not gain arbitrary page access');
  assert.equal(readerUrl('https://shop.example/products/next', 'public-page', product), 'https://shop.example/products/next');
  assert.equal(readerUrl('https://other.example/products/item', 'public-page', product), null);
  assert.equal(readerUrl('https://login.shop.example/products/item', 'public-page', product), null);
  assert.equal(readerNavigationAllowed('https://bayshop.com/page/contact-us.html', 'public-page', product), false);
  assert.equal(readerNavigationAllowed('tel:+00000', 'public-page', product), false);
});

test('public page reader rejects account entry points even on the original host', () => {
  for (const url of [
    'https://shop.example/login', 'https://shop.example/ap/signin?next=product',
    'https://shop.example/member/account', 'https://shop.example/auth/login',
    'https://shop.example/my-account', 'https://shop.example/%61ccount',
    'https://shop.example/api/products', 'https://bayshop.com/ro/member/balance',
    'https://bayshop.com/package/view/123', 'https://bayshop.com/ro/order/view/1',
    'https://admin.bayshop.com/admin/users', 'http://shop.example/product',
    'https://user:secret@shop.example/product', 'https://shop.example:8443/product',
    'https://shop.example\\@elsewhere.example/product',
  ]) assert.equal(publicPageUrl(url), null, url);
});

test('public page web read never follows an accepted result across hosts or into account content', async () => {
  const url = 'https://carrier.example/track?parcel=SYNTHETIC';
  const calls = [];
  await readPublicContent(async (requested, options) => { calls.push({ requested, options }); return response({ url }); }, url, new AbortController().signal, 'public-page');
  assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.headers, undefined);
  for (const target of ['https://carrier.example/login', 'https://another.example/track', 'https://bayshop.com/member']) {
    await assert.rejects(readPublicContent(async () => response({ url: target }), url, new AbortController().signal, 'public-page'), /contentReader.loadError/);
  }
});

test('native public page extraction retains literal content without mounting forms, scripts or navigation', () => {
  const html = '<html><head><style>body{display:none}</style><script>steal()</script></head><body><header>Menu</header><main><h1>Product &amp; tracking</h1><p>Parcel ABC123</p><p>&lt;script&gt;literal&lt;/script&gt;</p><a href="https://other.example">Public label</a><form action="/buy"><input value="private"><button>Buy now</button></form></main><footer>Footer</footer></body></html>';
  const text = readablePublicText(html);
  assert.match(text, /Product & tracking/); assert.match(text, /Parcel ABC123/); assert.match(text, /Public label/);
  assert.match(text, /<script>literal<\/script>/, 'decoded text remains literal when rendered as React Native Text');
  for (const hidden of ['steal()', 'display:none', 'Menu', 'Footer', 'Buy now', 'private', 'https://other.example']) assert(!text.includes(hidden), hidden);
  assert.equal(readablePublicText('<script>loadPage()</script>'), '', 'dynamic-only page must show the unavailable state');
});
