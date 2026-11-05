import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicShopCatalog, parsePublicShopDetail, readPublicShopCatalog } from '../src/api/public-shop-catalog.ts';

const origin = 'https://bayshop.com';
const context = { sourceCountry: 'RO', destinationCountry: 'RO', language: 'ro' };
const electronics = { ...context, category: 'electronica', page: 2 };
const page = origin + '/ro/shop-ro/electronica/2/';
const html = `<html lang="ro-RO"><head><link rel="canonical" href="/ro/shop-ro/electronica/"></head><body>
<select><option selected data-country="ro">România</option></select>
<aside class="subcategory-list"><a class="is-active" href="/ro/shop-ro/electronica/2">Electronică</a>
<a href="/ro/shop-us/other/">Another country</a><a href="https://another.example/ro/shop-ro/bad/">Foreign host</a>
<a href="/ro/shop-ro/incaltaminte/2">Încălțăminte</a></aside>
<a class="store-card-content" href="/ro/shop-ro/store_altex/"><div class="store-card-title">Altex</div>
<div class="store-card-desc"><p>Electronice &amp; TV<script>never shown</script></p></div></a>
<a class="store-card-list-content" href="/ro/shop-ro/store_altex/"><div class="store-card-title">Altex again</div></a>
<a class="store-card-content" href="/ro/shop-gb/store_other/"><div class="store-card-title">wrong</div></a>
<ul class="store-pagination"><li><a href="/ro/shop-ro/electronica/">1</a></li><li class="is-active"><a href="#">2</a></li>
<li><a href="/ro/shop-ro/electronica/3/">3</a></li></ul></body></html>`;
const detailUrl = origin + '/ro/shop-ro/store_altex/';
const detailQuery = { ...context, shopSlug: 'store_altex' };
const detailHtml = `<html lang="ro-RO"><head><link href="${detailUrl}" rel="canonical"></head><body>
<div class="store-slide-steps"><p><a href="https://altex.ro/" rel="nofollow">Altex</a></p></div>
<div class="store-detail-desc"><div class="store-desc-box">Descriere <b>magazin</b>.</div></div>
<div class="related-stores"><p>Alternative store</p></div></body></html>`;

test('native category pages use exact public slugs, translated labels and the selected source page', () => {
  const list = parsePublicShopCatalog(html, electronics, page);
  assert.deepEqual(list.categories, [{slug:'electronica',title:'Electronică'}, {slug:'incaltaminte',title:'Încălțăminte'}]);
  assert.deepEqual(list.shops, [{slug:'store_altex',title:'Altex',description:'Electronice & TV'}]);
  assert.deepEqual([list.page,list.hasPrevious,list.hasNext], [2,true,true]);
});

test('wrong destination, language, source, category, selected page and canonical are rejected', () => {
  const cases = [html.replace('ro-RO','ro-MD'), html.replace('ro-RO','en-RO'), html.replace('data-country="ro"','data-country="us"'),
    html.replace('class="is-active" href="/ro/shop-ro/electronica/2"','href="/ro/shop-ro/electronica/2"'),
    html.replace('href="#">2','href="#">3'), html.replace('rel="canonical" href="/ro/shop-ro/electronica/"','rel="canonical" href="/ro/shop-us/electronica/"')];
  for (const changed of cases) assert.throws(() => parsePublicShopCatalog(changed, electronics, page));
  for (const url of [page.replace('bayshop.com','another.example'),page.replace('/ro/shop-ro/','/ro/shop-gb/'),page+'?unexpected']) assert.throws(() => parsePublicShopCatalog(html,electronics,url));
});

test('reads are anonymous, paced by the selected page, and carry no account credentials', async () => {
  const seen = [];
  const list = await readPublicShopCatalog(async (url, request) => {
    seen.push(url);assert.equal(request.method,'GET');assert.equal(request.credentials,'omit');assert.equal(request.redirect,'manual');
    assert.deepEqual(Object.keys(request.headers).sort(), ['Accept','Accept-Language']);
    return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
  }, electronics, new AbortController().signal);
  assert.equal(list.shops.length,1);assert.deepEqual(seen,[page]);
});

test('malformed slugs and large/non-HTML bodies or foreign redirects never produce catalog data', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return new Response(html,{headers:{'content-type':'text/html'}}); };
  for(const category of ['../../admin','store_altex','bad/path','?q','%2fadmin']) await assert.rejects(readPublicShopCatalog(fetcher,{...context,category},new AbortController().signal));
  assert.equal(calls,0);
  const responses=[new Response(null,{status:302,headers:{location:'https://third.example/path'}}),
    new Response(html,{headers:{'content-type':'application/json'}}), new Response(html,{headers:{'content-type':'text/html','content-length':'2000000'}})];
  for(const r of responses) await assert.rejects(readPublicShopCatalog(async()=>r,electronics,new AbortController().signal));
});

test('public shop detail carries server text and a generic link but never fabricates an API identity or categories', () => {
  assert.deepEqual(parsePublicShopDetail(detailHtml, detailQuery, detailUrl), {title:'Altex',description:'Descriere magazin.',url:'https://altex.ro/',categories:[],publicCommissionPercent:null});
  assert.equal(parsePublicShopDetail(detailHtml.replace('https://altex.ro/','javascript:alert(1)'),detailQuery,detailUrl).url,null);
  assert.throws(() => parsePublicShopDetail(detailHtml,{...context,shopSlug:'store_fake'},detailUrl));
});

test('reads the current public purchasing percentage only from the commission tile', () => {
  const tile = (caption, amount) => '<div class="statistics-item"><div class="h2">'+amount+'</div><div class="h4">'+caption+'</div></div>';
  const content = tile('Livrare', '80%') + tile('Comisionul nostru de achiziție a comenzii<br>până la 30/11/26', '2,75%<sup><del>10%</del></sup>');
  assert.equal(parsePublicShopDetail(detailHtml.replace('</body>',content+'</body>'), detailQuery, detailUrl).publicCommissionPercent,2.75);
  assert.equal(parsePublicShopDetail(detailHtml.replace('</body>',tile('Comisionul nostru de achiziție a comenzii','0%')+'</body>'), detailQuery, detailUrl).publicCommissionPercent,0);
  assert.equal(parsePublicShopDetail(detailHtml.replace('</body>',tile('Livrare','10%')+'</body>'), detailQuery, detailUrl).publicCommissionPercent,null);
});
