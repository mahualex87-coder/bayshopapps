import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveZaraReply } from '../src/features/shops/zara-browser-capture.ts';

const url = 'https://www.zara.com/ro/ro/rochie-p12345678.html?v1=2121';
const request = {id:'b7b9e71a-86bd-40b5-ac38-5b074dedbe81', url};
const base = {type:'bayshop.zara.capture.v1', requestId:request.id, url, title:'Dress', price:'25.00', currency:'RON', color:'Red'};
const message = data => JSON.stringify({...base,...data});
const options = [{label:'S',sku:'100S',price:'25.00'},{label:'M',sku:'100M',price:'29.90'}];
test('unrequested messages, unrelated frames and navigation invalidate browser captures', () => {
  for (const [source, current, data] of [[url,url,message({type:'other'})],[url,url,message({requestId:'old'})],
    ['https://example.org/',url,message({})],[url.replace('www.', ''),url,message({})],[url,url.replace('2121','1111'),message({})],[url,url,'[]']]) {
    assert.equal(resolveZaraReply(request, source, current, data), null);
  }
});
test('native size selector rechecks availability, colour, exact SKU and current size-specific price', () => {
  const response = resolveZaraReply(request, url, url, message({choices:options}));
  assert.equal(response.reason, 'size');
  const pending = {...request, selection:{draft:response.draft,choice:response.choices[1]}};
  const confirmed = resolveZaraReply(pending, url, url, message({choices:options}));
  assert.deepEqual(confirmed.draft, {...response.draft,size:'M',sku:'100M',price:'29.90'});
  assert.equal(resolveZaraReply(pending,url,url,message({size:'M',sku:'100M',price:'29.90'})).ok, true);
  for (const data of [{size:'M',sku:'100M',price:'25.00'},{choices:options.slice(0,1)},{choices:[options[0],{...options[1],price:'35.00'}]},
    {choices:options,color:'Blue'},{size:'S',sku:'100S'},{choices:options,title:'Another dress'}]) {
    assert.deepEqual(resolveZaraReply(pending,url,url,message(data)), {ok:false,reason:'changed'});
  }
});
test('rechecking a size compares the selected offer in RON, independent of the page price or trailing zeroes', () => {
  const first = resolveZaraReply(request, url, url, message({choices:options}));
  const pending = {...request, selection:{draft:first.draft, choice:first.choices[1]}};
  const newOffers = [options[0],{...options[1],price:'29.9'}];
  const refreshed = resolveZaraReply(pending, url, url, message({price:'26',choices:newOffers}));
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.draft.price, '29.9');
  assert.equal(resolveZaraReply(pending,url,url,message({size:'M',sku:'100M',price:'29.9'})).ok,true);
  for (const changed of [
    {choices:[{...options[1],price:'29.91'}]},
    {choices:[{...options[1],sku:'newSku'}]},
    {choices:newOffers,currency:'EUR'},
    {choices:newOffers,color:'Green'},
  ]) assert.equal(resolveZaraReply(pending,url,url,message(changed)).ok,false);
});
test('a sold-out chosen size reports availability on recapture and cannot be imported', () => {
  const first = resolveZaraReply(request, url, url, message({choices:options}));
  const pending = {...request, selection:{draft:first.draft, choice:first.choices[1]}};
  assert.deepEqual(resolveZaraReply(pending,url,url,message({reason:'unavailable'})), {ok:false,reason:'unavailable'});
});
