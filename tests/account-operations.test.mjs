import test from 'node:test';
import assert from 'node:assert/strict';
import { addressFormats, emptyRecipient, validateRecipient, profileFormData, preferencesData, calculatorOptions, calculatorQuotes, plainServerText, paymentView, loyaltyData } from '../src/api/account-operations.ts';

test('recipient form uses returned IDs and rejects a region from another country', () => {
  const formats=addressFormats({countries:{143:'Republica Moldova',179:'România'},regionsList:[{id:'3',countryId:'143',title:'Chișinău'},{id:'5',countryId:'179',title:'București'}],maskFormatsList:[{id:'1',countryId:'143',title:'Moldova',code:'+373'}]});
  const input={...emptyRecipient(),countryId:'143',regionId:'5',shipping_first_name:'Ana',shipping_last_name:'Mahu',shipping_address:'Strada 1',shipping_zip:'2001',shipping_city:'Chișinău',shipping_phone_code:'+373',shipping_phone:'60000000'};
  assert.equal(validateRecipient(input,formats,false).errors.regionId,'accountOps.selectRegion');
  const valid=validateRecipient({...input,regionId:'3'},formats,false);
  assert.deepEqual(valid.errors,{});assert.equal(valid.fields.shipping_address,'Strada 1');
  const company=validateRecipient({...input,regionId:'3',isLegal:'1',shipping_company_name:'Firma'},formats,false);
  assert.ok(company.errors.agree);assert.equal(company.fields.agree,undefined);
});
test('profile and preferences keep server values and reject missing preference flags', () => {
  const profile=profileFormData({name:'Александру',surname:'Mahu',phone:'60000000',phoneCode:'+373',countryId:'143',countries:[{id:'143',title:'Молдова'}]});
  assert.equal(profile.name,'Александру');assert.equal(profile.countryId,'143');
  const flags={alertOnSystem:'0',obtainSms:'1',obtainGcm:'0',obtainMails:'1',obtainViber:'0',obtainTelegram:'0',hasTelegram:false,telegramBotLink:'https://t.me/example_bot?start=abc'};
  assert.equal(preferencesData(flags).values.obtainSms,true);
  assert.equal(preferencesData({...flags,telegramBotLink:'javascript:alert(1)'}).telegramBotLink,null);
  assert.throws(()=>preferencesData({...flags,obtainSms:undefined}));
});
test('calculator uses route restrictions and never treats missing prices as free shipping', () => {
  const options=calculatorOptions({storageList:[{id:'14',title:'SUA',activeCountries:['143']}],countriesList:{143:{id:'143',title:'Moldova'},179:{id:'179',title:'România'}},units:{size:{cm:'cm'},weight:{kg:'kg'}}});
  assert.deepEqual(options.storages[0].activeCountries,['143']);assert.equal(options.weights[0].id,'kg');
  const raw={shippers:[{id:'21',title:'Air Post',price:'12.35',currency:'usd',time:'7–10 zile',description:'<p>Din depozit</p>'}]};
  assert.equal(calculatorQuotes(raw)[0].amount,12.35);assert.equal(calculatorQuotes(raw)[0].currency,'USD');
  assert.throws(()=>calculatorQuotes({shippers:[{...raw.shippers[0],price:null}]}));
  assert.throws(()=>calculatorQuotes({shippers:[{...raw.shippers[0],price:''}]}));
});
test('news text is readable without executing markup or translating server content', () => {
  assert.equal(plainServerText('<p>Привет&nbsp;&amp; salut</p><script>bad()</script>'), 'Привет & salut');
});
test('payment view preserves separate invoice currencies and rejects absent totals', () => {
  const input={unpaidInvoices:[{currency:'ron',list:[{id:'1',trid:'PAY1',summ:'42.70',comment:'Transport',ceated:'2026-11-01 12:00:00'}]}],paymentTypes:{bank:{name:'Bank',description:'<p>Plată</p>',availableCurrency:['ron']}}};
  assert.equal(paymentView(input).invoices[0].amount,42.7);assert.equal(paymentView(input).invoices[0].currency,'RON');
  assert.throws(()=>paymentView({...input,unpaidInvoices:[{currency:'ron',list:[{id:'1',summ:null}]}]}));
});
test('server financial fields reject coercible nonnumbers and preserve explicit zero and decimal values', () => {
  const quote = value => calculatorQuotes({ shippers: [{ id: '1', price: value, currency: 'USD' }] })[0].amount;
  const invoice = value => paymentView({ unpaidInvoices: [{ currency: 'RON', list: [{ id: '1', summ: value }] }], paymentTypes: {} }).invoices[0].amount;
  const discount = value => loyaltyData([{ shipperId: '1', discountPercent: value }])[0].discount;
  for (const parse of [quote, invoice, discount]) {
    for (const invalid of [false, true, '', ' ', '\t', null, undefined, [], [0], {}, NaN, Infinity, '0x10', '1e2', ' 0 ', '12,50']) {
      assert.throws(() => parse(invalid), error => error.key === 'errors.contract', `Must reject ${String(invalid)}`);
    }
    assert.equal(parse(0), 0);
    assert.equal(parse('0.00'), 0);
    assert.equal(parse('12.50'), 12.5);
    assert.equal(parse(12.5), 12.5);
  }
  assert.equal(invoice('-4.25'), -4.25, 'Preserve explicit signed invoice amounts without coercing them');
  assert.throws(() => quote('-4.25'));
  assert.throws(() => discount('100.01'));
});
