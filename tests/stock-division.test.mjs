import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStockDivision, divisionFields, divisionParts, divisionQuote } from '../src/api/stock-division.ts';
import { normalizeStockServicePrices } from '../src/api/operations-normalize.ts';
import { planRead, planMutation } from '../src/api/operations-contracts.ts';
const raw = { error: false, declarationPriceBasis: 'original-line-total', currency: 'EUR', comment: '', dividePrice: '5.00', additionalDividePrice: '3.00', declarationItems: [1,2,3].map(id => ({ id: String(id), title: `Item ${id}`, quantity: '2', price: '22.60', originalPrice: '20.00', url: 'https://shop.example/product', partNumber: '1', currencyId: '3', productType: 'clothes', orderNumber: 'ORDER-1' })) };
test('actual divide GET uses envelope root and preserves original price, identifiers and optional row metadata', () => {
  const data = normalizeStockDivision(raw);
  assert.equal(planRead({kind:'stock.division.read',id:'100'}).responseMode,'envelope');
  assert.equal(data.items[0].price, '20.00');
  assert.equal(data.items[0].productType,'clothes');
  assert.equal(data.items[0].orderNumber,'ORDER-1');
  assert.equal(data.verified,true);
});
test('unverified legacy converted prices are readable but cannot be posted back', () => {
  const data = normalizeStockDivision({...raw,declarationPriceBasis:undefined});
  assert.equal(data.items[0].price,'22.60');
  assert.equal(data.verified,false);
  assert.throws(()=>divisionFields(data,{'1':'1','2':'2','3':'2'},''));
});
test('split assignment preserves all rows and groups in server order without changing money or quantities', () => {
  const data = normalizeStockDivision(raw), assignments={'1':'2','2':'1','3':'2'};
  assert.equal(divisionParts(data.items,assignments),2);
  assert.equal(divisionQuote(data,assignments),5);
  const plan=planMutation({kind:'stock.division.save',id:'100',data,assignments,comment:' Please separate '});
  assert.equal(plan.path,'/api/request-divide');
  assert.equal(plan.encoding,'form');
  assert.equal(plan.fields.priceSemantics,'original-line-total');
  assert.equal(plan.fields.comment,'Please separate');
  assert.deepEqual(JSON.parse(plan.fields.declarationItems).map(item=>[item.id,item.partNumber,item.quantity,item.price]),[['2',1,2,'20.00'],['1',2,2,'20.00'],['3',2,2,'20.00']]);
});
test('at least two contiguous groups, known tariffs and every row are required before confirmation', () => {
  const data=normalizeStockDivision(raw);
  for (const assignments of [{'1':'1','2':'1','3':'1'},{'1':'1','2':'3','3':'3'},{'1':'1','2':'2'},{'1':'1','2':'2.5','3':'2'},{'1':'1','2':'2','3':'2','4':'2'}]) assert.throws(()=>divisionFields(data,assignments,''));
  assert.equal(divisionQuote(data,{'1':'1','2':'2','3':'3'}),8);
  assert.equal(divisionQuote({...data,extraPrice:null},{'1':'1','2':'2','3':'3'}),null);
  assert.equal(divisionQuote({...data,basePrice:0},{'1':'1','2':'2','3':'2'}),0);
  assert.throws(()=>divisionFields({...data,currency:null},{'1':'1','2':'2','3':'2'},''));
});
test('service descriptions stay server-authored and zero prices remain available',()=>{
  const data=normalizeStockServicePrices({currency:'USD',order_photo:'0',order_verification:'4',order_declaration:null,serviceDetails:{order_verification:{title:'Server title',description:'Server description'}}});
  assert.equal(data.photos,0);
  assert.equal(data.declaration,null);
  assert.equal(data.details.verification.description,'Server description');
  assert.throws(()=>normalizeStockServicePrices({currency:'USD',order_photo:'-1'}));
});

test('fresh service eligibility targets one parcel rather than a paginated cached list',()=>{
  const path=planRead({kind:'stock.current',id:'100',storageId:'14'}).path;
  const url=new URL(path,'https://bayshop.com');
  assert.equal(url.pathname,'/api/mf-list');
  assert.equal(url.searchParams.get('ids'),'100');
  assert.equal(url.searchParams.get('storage'),'14');
  assert.equal(url.searchParams.get('type'),'in-stock');
});
