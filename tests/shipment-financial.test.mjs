import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeShipmentDetailData } from '../src/api/normalize.ts';
import { positiveCharge, shipmentFinancialDisplay, shipmentSummaryCosts } from '../src/domain/shipment-financial.ts';

test('zero or unknown prices do not create a costs action', () => {
  const detail = normalizeShipmentDetailData({ id:'1', status:'sent', price_boxes:0, price_declarations:0, price_delivery:0, price_total:0, import_taxes:{ total:0, currency:'EUR', lines:[] }, addition_services_list:[{ keyName:'check', title:'Check', price:0, active:true }] });
  assert.deepEqual(shipmentFinancialDisplay(detail), { costs:[], services:[], taxLines:[], hasTaxes:false, visible:false });
  assert.equal(detail.shippingTotal,0, 'Display filtering must preserve zero in the API model');
  for (const value of [null,undefined,NaN,Infinity,-Infinity,0,-1]) assert.equal(positiveCharge(value),false);
});

test('cost sheet retains positive tax components and descriptions without recalculating the total', () => {
  const detail=normalizeShipmentDetailData({ id:'1', status:'sent', currency:'USD', price_delivery:8, price_insurance:0, price_total:11, price_import_taxes:7.28, import_taxes:{total:7.28,currency:'EUR',lines:[{title:'VAT',amount:7,description:'Server explanation'},{title:'Processing',amount:0.28},{title:'Zero',amount:0},{title:'Adjustment',amount:-1}]} });
  const before=JSON.stringify(detail);
  const view=shipmentFinancialDisplay(detail);
  assert.equal(view.visible,true);
  assert.deepEqual(view.costs.map(item=>item.amount),[8,7.28]);
  assert.deepEqual(view.costs.map(item=>item.currency),['USD','EUR'], 'Import taxes retain their own server currency');
  assert.deepEqual(view.taxLines.map(item=>item.amount),[7,0.28]);
  assert.equal(view.taxLines[0].description,'Server explanation');
  assert.equal(detail.importTaxes.currency,'EUR');
  assert.equal(detail.shippingTotal,11,'Server total may include adjustments; it is not the sum of visible lines');
  assert.equal(JSON.stringify(detail),before,'The ledger/model cannot be changed by visual filtering');
});

test('inline costs show tax once, support a tax-only response and never infer a total', () => {
  const raw = {id:'1',status:'sent',currency:'USD',price_delivery:8,price_import_taxes:7.28,price_total:11,price_boxes:100,price_declarations:200,import_taxes:{total:7.28,currency:'EUR',lines:[]}};
  const detail = normalizeShipmentDetailData(raw);
  const before = JSON.stringify(detail);
  assert.deepEqual(shipmentSummaryCosts(detail).map(({amount,currency})=>({amount,currency})),[{amount:8,currency:'USD'},{amount:7.28,currency:'EUR'}]);
  assert.equal(detail.shippingTotal,11);
  assert.equal(JSON.stringify(detail),before);
  const taxesOnly = normalizeShipmentDetailData({...raw,price_import_taxes:undefined,price_delivery:0,price_total:undefined});
  assert.deepEqual(shipmentSummaryCosts(taxesOnly).map(({amount,currency,labelKey})=>({amount,currency,labelKey})),[{amount:7.28,currency:'EUR',labelKey:'parcel.cost.importTaxes'}]);
  assert.equal(taxesOnly.shippingTotal,null);
  const legacy = normalizeShipmentDetailData({...raw,import_taxes:undefined});
  assert.equal(shipmentSummaryCosts(legacy).find(cost=>cost.labelKey==='parcel.cost.importTaxes').currency,'USD');
  assert.deepEqual(shipmentSummaryCosts(normalizeShipmentDetailData({id:'1',status:'sent',price_delivery:0,price_total:0})),[]);
});

test('paid additional services retain server identity, status and explanation, free services stay out of costs', () => {
  const detail=normalizeShipmentDetailData({id:'1',status:'sent',addition_services_list:[{keyName:'inspection',title:'Product inspection',price:'2.50',active:true,description:'Server service description'},{keyName:'free',title:'Free packaging',price:0,active:true},{keyName:'unknown',title:'Unknown',price:null}]});
  const view=shipmentFinancialDisplay(detail);
  assert.equal(view.services.length,1);
  assert.deepEqual(view.services[0],{key:'inspection',title:'Product inspection',description:'Server service description',amount:2.5,active:true});
  assert.equal(view.visible,true);
});
