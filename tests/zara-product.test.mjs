import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { isZaraBrowseUrl, readZaraCapture, zaraCaptureScript, zaraProductUrl, zaraRomaniaShopStart } from '../src/features/shops/zara-product.ts';

const original = 'https://www.zara.com/ro/ro/geaca-p02634384.html';
const variant = original + '?v1=549815743';
const id = 'abc-123';
const group = {
  '@type': 'ProductGroup', productGroupID:'02634384',
  hasVariant: [['Negru','S','800-2','549815744','InStock'],['Negru / Maro','S','099-2','549815743','OutOfStock'],
    ['Negru / Maro','M','099-3','549815743','InStock']].map(([color,size,sku,v1,stock]) => ({
    '@type':'Product',color,size,sku:'549815744-'+sku,
    offers:{'@type':'Offer',priceCurrency:'RON',price:'359.9',availability:'https://schema.org/'+stock,url:original+'?v1='+v1},
  })),
};
function pageCapture(url, color, groupData, selectedSize = '') {
  const node = (text, scope = null) => ({textContent:text,innerText:text,getClientRects:()=>[{}],closest:()=>scope,getAttribute:()=>null});
  const elColor = node(color), ref = node('2634/384/099'), price = node('359,90 lei');
  const querySelectorAll = s => {
    if (s.startsWith('[data-qa-qualifier="product-detail-info-color"]')) return [elColor];
    if (s.startsWith('button, [data-qa-action')) return [ref];
    if (s.startsWith('.price-current__amount')) return [price];
    return [];
  };
  const root = {querySelectorAll};
  const h = node('GEACĂ WATER REPELLENT'); h.closest=s=>s.includes('.product-detail-info')?root:null;
  const option=node(selectedSize);
  option.querySelector=()=>null;option.matches=s=>s.startsWith('[aria-selected');
  option.closest=s=>s.startsWith('.size-selector')?option:null;
  let reply;
  const win = {addEventListener(){},ReactNativeWebView:{postMessage(s){reply=s;}}};win.top=win;
  const doc = {addEventListener(){},querySelectorAll(s){
    if (s.startsWith('h1[')) return [h];
    if (s.startsWith('script[')) return [{textContent:JSON.stringify(groupData)}];
    if (s.startsWith('.size-selector') && selectedSize) return [option];
    return [];
  }};
  vm.runInNewContext(zaraCaptureScript(id), { document:doc,window:win,URL,location:new URL(url),getComputedStyle:()=>({visibility:'visible'}),setTimeout:fn=>fn() });
  return readZaraCapture(reply,id,url);
}
test('only public Zara Romania storefront and product URLs enter merchant capture',()=>{
  assert.equal(zaraRomaniaShopStart('RO','https://www.zara.com/ro/'),'https://www.zara.com/ro/ro/');
  for(const url of ['https://zara.com.evil.test/ro/ro/','https://user@www.zara.com/ro/ro/','https://www.zara.com/us/en/','https://www.zara.com/ro/ro/checkout','http://www.zara.com/ro/ro/']) assert.equal(isZaraBrowseUrl(url),false);
  assert.equal(zaraRomaniaShopStart('US','https://www.zara.com/'),null);
  assert.equal(zaraProductUrl(variant+'&utm_source=test#details'),variant);
  assert.equal(zaraProductUrl(variant+'&v1=11'),null);
});
test('Zara Romania schema joins the visible colour to available sizes, without selecting the first SKU',()=>{
  for (const url of [variant,original]) {
    const r=pageCapture(url,'Negru / Maro',group);assert.equal(r.reason,'size');
    assert.equal(r.draft.url,variant);assert.equal(r.draft.title,'GEACĂ WATER REPELLENT');assert.equal(r.draft.color,'Negru / Maro');
    assert.deepEqual(r.choices,[{label:'M',sku:'549815744-099-3',price:'359.9'}]);
  }
  const picked=pageCapture(variant,'Negru / Maro',group,'M');
  assert.equal(picked.ok,true);assert.equal(picked.draft.size,'M');assert.equal(picked.draft.sku,'549815744-099-3');
  assert.equal(pageCapture(variant,'Negru / Maro',group,'S').reason,'unavailable');
  assert.equal(pageCapture(variant,'Negru',group).reason,'changed');
});
test('stale offers, stale pages, malformed prices or an unsolicited message cannot create a draft',()=>{
  const altered=structuredClone(group);altered.hasVariant[2].offers.price='200';
  assert.equal(pageCapture(variant,'Negru / Maro',altered,'M').reason,'changed');
  const message={type:'bayshop.zara.capture.v1',requestId:id,url:variant,title:'Produs',size:'M',color:'Negru',price:'100.00',currency:'RON'};
  for(const patch of [{requestId:'other'},{url:original+'?v1=11'},{variantUrl:'https://elsewhere.example/item'},{price:'-2.00'},{currency:'EUR'}]){
    assert.equal(readZaraCapture(JSON.stringify({...message,...patch}),id,variant).ok,false);
  }
});

test('during mobile navigation read the centred product only, including its own sale price and sizes', () => {
  const url = 'https://www.zara.com/ro/ro/jacheta-p03411330.html?v1=552297497&v2=2436823';
  const articleId = '03411330';
  const offers = { '@type':'ProductGroup', productGroupID:articleId, hasVariant:[
    { '@type':'Product', color:'Negru', size:'S', sku:'552297497-800-2',
      offers:{ '@type':'Offer', url, priceCurrency:'RON', price:'159.9', availability:'https://schema.org/InStock' } },
  ] };
  const element = (text = '') => ({textContent:text, innerText:text, getClientRects:()=>[{}], closest:()=>null,
    getAttribute:()=>null, querySelector:()=>null});
  function card(x, title, color, ref, price) {
    const root=element();
    root.closest=s=>s==='.product-detail-view-base-mob__carousel-item' ? {getBoundingClientRect:()=>({left:x,right:x+390})} : null;
    root.querySelectorAll=s=>{
      if(s==='h1') return [element(title)];
      if(s.startsWith('[data-qa-qualifier="product-detail-info-color"]')) return [element(color)];
      if(s.startsWith('button, [data-qa-action')) return [element(ref)];
      if(s.startsWith('.price-current__amount')) return [element(price),element(price)];
      return [];
    };
    return root;
  }
  const cards = [
    card(-390,'SACOU','Ocru','4456/999/707','209,90 lei'),
    card(0,'JACHETĂ','Negru','3411/330/800','159,90 lei'),
    card(390,'ALT ARTICOL','Crem','6789/123/040','109,90 lei'),
  ];
  // At first the location has changed but the category list is still rendered.
  let ready = false;
  const catalogHeading=element('Prețuri speciale');
  catalogHeading.parentElement={ querySelectorAll:() => [] };
  const doc={addEventListener(){},documentElement:{clientWidth:390},querySelectorAll(s){
    if(s==='main h1') return [catalogHeading];
    if(s.startsWith('.product-detail-view-base-mob__carousel-item')) return ready?cards:[];
    if(s.startsWith('script[')) return [element(JSON.stringify(offers))];
    return [];
  }};
  const replies=[];
  const win={addEventListener(){},ReactNativeWebView:{postMessage(msg){replies.push(msg);}}};win.top=win;
  let waits=0;
  vm.runInNewContext(zaraCaptureScript(id),{window:win,document:doc,URL,location:new URL(url),getComputedStyle:()=>({visibility:'visible'}),
    setTimeout(fn){waits++;ready=true;fn();}});
  assert.equal(replies.length,1); assert.equal(waits,1);
  const captured = readZaraCapture(replies[0],id,url);
  assert.equal(captured.reason,'size'); assert.equal(captured.draft.title,'JACHETĂ');
  assert.equal(captured.draft.color,'Negru'); assert.equal(Number(captured.draft.price),159.9);
  assert.deepEqual(captured.choices,[{label:'S',sku:'552297497-800-2',price:'159.9'}]);
});
