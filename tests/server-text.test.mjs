import assert from 'node:assert/strict';
import test from 'node:test';
import { serverText } from '../src/domain/server-text.ts';
import { newsData, plainServerText } from '../src/api/account-operations.ts';
import { packingText } from '../src/api/packing-normalize.ts';

test('Romanian and case-sensitive named entities become the correct characters', () => {
  assert.equal(serverText('&Abreve; &abreve; &Icirc; &icirc; &Scaron; &scaron; &Scedil; &scedil;'), 'Ă ă Î î Š š Ş ş');
  assert.equal(serverText('&ICIRC; &BayShopUnknown; &notARealEntity; &copycat;'), '&ICIRC; &BayShopUnknown; &notARealEntity; &copycat;');
});

test('named and numeric Cyrillic preserve capitalization and actual server language', () => {
  assert.equal(serverText('&Acy;&acy; &#1044;&#1077;&#1085;&#1100; &#x41F;&#x440;&#x438;&#x432;&#x435;&#x442;'), 'Аа День Привет');
  assert.equal(serverText('Новости: Получено 2 посылки 📦 — Chișinău'), 'Новости: Получено 2 посылки 📦 — Chișinău');
});

test('quotes, punctuation and currency entities are decoded without changing values', () => {
  assert.equal(serverText('&ldquo;Livrare&rdquo; &ndash; 12,50 &euro;&hellip; &quot;USD&quot; &apos;RON&apos;'), '“Livrare” – 12,50 €… "USD" \'RON\'');
  assert.equal(serverText('2<3, 4>1; "RON" 12,50 €, 0 USD & C++'), '2<3, 4>1; "RON" 12,50 €, 0 USD & C++');
});

test('double-encoded entities and escaped HTML become display text, not markup', () => {
  assert.equal(serverText('&amp;icirc;n &amp;amp;abreve;șteptare'), 'în ășteptare');
  assert.equal(serverText('&lt;p&gt;&Icirc;n depozit&lt;/p&gt;&lt;p&gt;A doua știre.&lt;/p&gt;'), 'În depozit\n\nA doua știre.');
});

test('paragraph and line-break boundaries stay readable around inline elements', () => {
  assert.equal(serverText('<p>Primul <strong>paragraf</strong>.</p><p>Al doilea<br>Rândul doi<br />Rândul trei</p>'), 'Primul paragraf.\n\nAl doilea\nRândul doi\nRândul trei');
  assert.equal(serverText('<p>Livrare&nbsp;în <em>România</em> &amp; Moldova.</p>'), 'Livrare în România & Moldova.');
  assert.equal(serverText('Primul<br><br>Al doilea'), 'Primul\n\nAl doilea');
});

test('unordered and ordered list items keep visible boundaries and numbering', () => {
  assert.equal(serverText('<ul><li>Factura</li><li>Declarația</li></ul>'), '• Factura\n• Declarația');
  assert.equal(serverText('<ol><li>Înregistrează</li><li>Expediază</li><li>Primește</li></ol>'), '1. Înregistrează\n2. Expediază\n3. Primește');
});

test('scripts, styles, comments and attribute values never become visible text', () => {
  const html = '<p title="SECRET_ATTRIBUTE > hidden" onclick="SECRET_HANDLER()">Vizibil</p><!--SECRET_COMMENT--><script>SECRET_SCRIPT()</script><style>.SECRET_STYLE { color: red }</style><img alt="SECRET_ALT" src="SECRET_URL">';
  assert.equal(serverText(html), 'Vizibil');
  assert.equal(serverText('<p>Bun</p><script>SECRET_UNTERMINATED();'), 'Bun');
});

test('escaped active markup is removed after entity decoding too', () => {
  const html = '&lt;p title=&quot;SECRET_ATTRIBUTE&quot;&gt;Text&lt;/p&gt;&lt;script&gt;SECRET_SCRIPT()&lt;/script&gt;&lt;style&gt;SECRET_STYLE&lt;/style&gt;&lt;!--SECRET_COMMENT--&gt;';
  assert.equal(serverText(html), 'Text');
});

test('malformed numeric references cannot throw or corrupt adjacent plain text', () => {
  for (const entity of ['&#x110000;', '&#1114112;', '&#999999999999999999999999999999;', '&#xD800;', '&#0;', '&#xZZ;', '&#;', '&#-1;']) {
    let output;
    assert.doesNotThrow(() => { output = serverText(`Înainte ${entity} După`); }, entity);
    assert.equal(typeof output, 'string');
    assert.ok(output.startsWith('Înainte ') && output.endsWith(' După'), entity);
  }
  assert.equal(serverText('&#x1F4E6; &#128512;'), '📦 😀');
});

test('non-text values cannot leak object or boolean serialization into the UI', () => {
  for (const input of [null, undefined, {}, [], true, false]) assert.equal(serverText(input), '');
  assert.equal(serverText(''), '');
  assert.equal(serverText(' \n\t '), '');
});

test('plainServerText and packingText use the same decoder with existing empty semantics', () => {
  const html = '<p>&Icirc;n așteptare</p><p>&Acy; &euro;</p>';
  assert.equal(plainServerText(html), 'În așteptare\n\nА €');
  assert.equal(packingText(html), plainServerText(html));
  assert.equal(plainServerText(null), '');
  assert.equal(packingText(null), null);
  assert.equal(packingText('<script>hidden()</script>'), null);
});

test('news decoding touches display title/body only and does not mutate the response', () => {
  const raw = [{ id: '00142', title: '&Icirc;n depozit &ndash; noutăți', body: '<p>Coletul &abreve;sta.</p><p>&Acy; &amp; &euro;</p>', time: '2026-11-02 12:34:56', isImportant: '1' }];
  const before = structuredClone(raw);
  assert.deepEqual(newsData(raw), [{ id: '00142', title: 'În depozit – noutăți', body: 'Coletul ăsta.\n\nА & €', date: '2026-11-02 12:34:56', important: true, images: [] }]);
  assert.deepEqual(raw, before);
});
