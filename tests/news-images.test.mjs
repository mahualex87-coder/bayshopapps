import assert from 'node:assert/strict';
import test from 'node:test';
import { newsImages } from '../src/domain/news-images.ts';
import { newsData } from '../src/api/account-operations.ts';

const origin = 'https://bayshop.com';
const withoutHash = value => { const url = new URL(value); url.hash = ''; return url.toString(); };

test('the documented img field is the first image, followed by body images in source order', () => {
  const row = { img: '/upload/news/cover.jpg', title: '&Icirc;n depozit', body: '<p>Noutăți</p><img src="/upload/news/first.jpg" alt="Prima"><img src="https://images.example.com/content/second" alt="A doua">' };
  const before = structuredClone(row);
  assert.deepEqual(newsImages(row, origin), [
    { url: 'https://bayshop.com/upload/news/cover.jpg', alt: 'În depozit' },
    { url: 'https://bayshop.com/upload/news/first.jpg', alt: 'Prima' },
    { url: 'https://images.example.com/content/second', alt: 'A doua' },
  ]);
  assert.deepEqual(row, before);
});

test('official relative paths and protocol-relative public images resolve to HTTPS', () => {
  assert.deepEqual(newsImages({ body: '<img src="/upload/news/a.jpg"><img src="upload/news/b.jpg"><img src="//images.example.com/c.jpg">' }, origin).map(image => image.url), [
    'https://bayshop.com/upload/news/a.jpg', 'https://bayshop.com/upload/news/b.jpg', 'https://images.example.com/c.jpg',
  ]);
  assert.deepEqual(newsImages({ img: '/upload/one.jpg' }, 'https://dev.bayshop.com').map(image => image.url), ['https://dev.bayshop.com/upload/one.jpg']);
});

test('the backend %%%host%%% marker resolves against the current origin in both cover and body images', () => {
  // Exact marker confirmed by App_Tools::resolveHostPlaceholder in backend source.
  for (const currentOrigin of ['https://bayshop.com', 'https://dev.bayshop.com']) {
    const row = { img: '%%%host%%%/upload/news/cover.jpg', title: 'Știre', body: '<img src="%%%host%%%/upload/news/body.jpg" alt="Imagine">' };
    assert.deepEqual(newsImages(row, currentOrigin), [
      { url: `${currentOrigin}/upload/news/cover.jpg`, alt: 'Știre' },
      { url: `${currentOrigin}/upload/news/body.jpg`, alt: 'Imagine' },
    ]);
  }
  assert.deepEqual(newsImages({ img: '%%%host%%%' }, origin), []);
});

test('legacy HTTP images upgrade only on the supplied official origin host', () => {
  assert.deepEqual(newsImages({ img: 'http://bayshop.com/upload/a.jpg', body: '<img src="http://images.example.com/b.jpg">' }, origin).map(image => image.url), ['https://bayshop.com/upload/a.jpg']);
});

test('HTML image attributes decode named entities without interpreting attribute contents as tags', () => {
  const images = newsImages({ body: '<img src="https://images.example.com/render?id=7&amp;size=large" alt="&Icirc;n depozit &amp; sigur &Acy; &gt; 2">' }, origin);
  assert.deepEqual(images, [{ url: 'https://images.example.com/render?id=7&size=large', alt: 'În depozit & sigur А > 2' }]);
  const attributeOnly = '<img src="/upload/real.jpg" alt="&quot;&gt;&lt;img src=&quot;/upload/attribute-only.jpg&quot;&gt;">';
  assert.deepEqual(newsImages({ body: attributeOnly }, origin).map(image => image.url), ['https://bayshop.com/upload/real.jpg']);
});

test('escaped and double-escaped body markup can expose images without exposing hidden ones', () => {
  assert.deepEqual(newsImages({ body: '&lt;p&gt;&lt;img src=&quot;/upload/a.jpg&quot; alt=&quot;&Icirc;n stoc&quot;&gt;&lt;/p&gt;&amp;lt;img src=&amp;quot;/upload/b.jpg&amp;quot;&amp;gt;' }, origin), [
    { url: 'https://bayshop.com/upload/a.jpg', alt: 'În stoc' },
    { url: 'https://bayshop.com/upload/b.jpg', alt: null },
  ]);
});

test('mixed literal and escaped image tags preserve their original body order', () => {
  const body = '&lt;img src=&quot;/upload/first.jpg&quot;&gt;<img src="/upload/second.jpg">';
  assert.deepEqual(newsImages({ body }, origin).map(image => image.url), ['https://bayshop.com/upload/first.jpg', 'https://bayshop.com/upload/second.jpg']);
});

test('deduplication ignores fragments but preserves distinct query values and first occurrence order', () => {
  const result = newsImages({ img: '/upload/a.jpg#cover', title: 'Coperta', body: '<img src="https://bayshop.com/upload/a.jpg#body" alt="Duplicat"><img src="/upload/a.jpg?size=large"><img src="/upload/a.jpg?size=small"><img src="/upload/a.jpg?size=large#again">' }, origin);
  assert.deepEqual(result.map(image => withoutHash(image.url)), [
    'https://bayshop.com/upload/a.jpg', 'https://bayshop.com/upload/a.jpg?size=large', 'https://bayshop.com/upload/a.jpg?size=small',
  ]);
  assert.equal(result[0].alt, 'Coperta');
});

test('scripts, styles, comments, templates and explicitly hidden image containers are ignored', () => {
  const html = '<script>const x="<img src=\'/upload/script.jpg\'>";</script><style>.x{content:"<img src=\'/upload/style.jpg\'>"}</style><!--<img src="/upload/comment.jpg">--><template><img src="/upload/template.jpg"></template><div hidden><img src="/upload/hidden.jpg"></div><div aria-hidden="true"><img src="/upload/aria.jpg"></div><div style="display:none"><img src="/upload/display.jpg"></div><img style="visibility:hidden" src="/upload/visibility.jpg"><p><img src="/upload/visible.jpg"></p>';
  assert.deepEqual(newsImages({ body: html }, origin), [{ url: 'https://bayshop.com/upload/visible.jpg', alt: null }]);
});

test('HTML entities in visibility attributes do not reveal otherwise hidden images', () => {
  const body = '<div style="display&#58;none"><img src="/upload/hidden.jpg"></div><img aria-hidden="tr&#117;e" src="/upload/aria.jpg"><img src="/upload/visible.jpg">';
  assert.deepEqual(newsImages({ body }, origin), [{ url: 'https://bayshop.com/upload/visible.jpg', alt: null }]);
});

test('ordinary links, text URLs and guessed field names do not become news images', () => {
  assert.deepEqual(newsImages({ title: 'https://images.example.com/title.jpg', body: '<a href="https://images.example.com/link.jpg">https://images.example.com/text.jpg</a>', cover: '/upload/not-a-contract-field.jpg', image: '/upload/not-a-contract-field.png' }, origin), []);
  assert.deepEqual(newsImages({ id: '731', title: 'Fără fotografie', body: 'Doar text' }, origin), []);
});

test('unsafe schemes, embedded HTTP authentication, control characters and backslashes are rejected', () => {
  for (const img of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///tmp/photo.png', 'ftp://images.example.com/photo.jpg', 'https://user:pass@images.example.com/photo.jpg', 'https://user@images.example.com/photo.jpg', 'https://images.example.com/a\nb.jpg', 'https://images.example.com/a\tb.jpg', 'https://images.example.com/a\u0000b.jpg', 'https://images.example.com/a\\b.jpg']) {
    assert.deepEqual(newsImages({ img }, origin), [], img);
  }
  assert.deepEqual(newsImages({ body: '<img src="javascript&#58;alert(1)"><img src="https://user&#58;pass@images.example.com/a.jpg"><img src="https://images.example.com/a&#10;b.jpg">' }, origin), []);
});

test('local and private literal hosts are rejected, including URL-normalized loopback forms', () => {
  for (const host of ['localhost', 'localhost.localdomain', '127.0.0.1', '127.1', '2130706433', '0.0.0.0', '10.1.2.3', '172.16.1.2', '192.168.1.2', '169.254.1.2', '[::1]', '[fc00::1]', '[fe80::1]', '[::ffff:127.0.0.1]']) {
    assert.deepEqual(newsImages({ img: `https://${host}/photo.jpg` }, origin), [], host);
  }
});

test('a public HTTPS image URL does not need an extension and retains its server query', () => {
  const img = 'https://images.example.com/render/42?signature=example-public-signature&size=1200';
  assert.deepEqual(newsImages({ img, title: '' }, origin), [{ url: img, alt: null }]);
});

test('missing or invalid image fields produce an empty list without discarding normal news', () => {
  for (const img of [undefined, null, '', ' ', '&nbsp;', '&#32;', false, 1, [], {}]) assert.deepEqual(newsImages({ img, body: '<p>Doar text.</p>' }, origin), []);
  const raw = [{ id: '007', title: '&Icirc;n depozit', body: '<p>Știre fără imagine.</p>', time: '2026-11-02 12:34:56', isImportant: '1' }];
  const before = structuredClone(raw);
  assert.deepEqual(newsData(raw), [{ id: '007', title: 'În depozit', body: 'Știre fără imagine.', date: '2026-11-02 12:34:56', important: true, images: [] }]);
  assert.deepEqual(raw, before);
});

test('newsData extracts its image before converting the body to plain text', () => {
  const raw = [{ id: '8', title: 'Știre', body: '<p>Text înainte.</p><img src="/upload/news/body.jpg" alt="&Icirc;n depozit"><p>Text după.</p>', time: '2026-11-02', isImportant: false }];
  const news = newsData(raw)[0];
  assert.equal(news.body, 'Text înainte.\n\nText după.');
  assert.deepEqual(news.images.map(image => ({ path: new URL(image.url).pathname, alt: image.alt })), [{ path: '/upload/news/body.jpg', alt: 'În depozit' }]);
  assert.equal(news.id, '8');
  assert.equal(news.date, '2026-11-02');
});
