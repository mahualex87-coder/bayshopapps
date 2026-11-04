import test from 'node:test';
import assert from 'node:assert/strict';
import { addressFormats, emptyRecipient, validateRecipient } from '../src/api/account-operations.ts';
import { changeRecipientCity, changeRecipientRegion, changeRecipientScope, recipientRegions, visibleRecipientFields, recipientFieldLabel } from '../src/api/recipient-rules.ts';
const formats = addressFormats({
 countries:{10:'Synthetic destination A',20:'Synthetic destination B',30:'Legacy destination'},
 regionsList:[{id:'101',countryId:'10',title:'Region A'},{id:'201',countryId:'20',title:'Region B'}],
 maskFormatsList:[{id:'1',countryId:'10',code:'+10'},{id:'2',countryId:'20',code:'+20'}],
 recipientRequiredFields:{10:{person:[],company:['companyCif']},20:{person:['passportNumber','passportIssuedCountryId','scans'],company:['companyBankCode']}},
 recipientCountryRules:{10:{labels:{shipping_zip:'<b>Postal code A</b>',shipping_email:'hidden',shipping_middle_name:'hidden'},zipMask:'9999',addressAlphabet:'latin',postalCodeRequired:true,regionRequired:true},20:{labels:{passportNumber:'Document B'},zipMask:'999999',addressAlphabet:'cyrillic',postalCodeRequired:true,regionRequired:true}},
 passportCountries:{10:'Issuer A',20:'Issuer B'},
});
const person = { ...emptyRecipient(), countryId:'10',regionId:'101',shipping_first_name:'Synthetic',shipping_last_name:'Recipient',shipping_address:'Example 1',shipping_city:'Example City',shipping_zip:'0001',shipping_phone_code:'+10',shipping_phone:'00000000' };

test('country-specific labels are plain server text and unsupported fields cannot reappear',()=>{
 assert.equal(recipientFieldLabel(formats,'10','shipping_zip'),'Postal code A');
 assert.equal(recipientFieldLabel(formats,'20','passportNumber'),'Document B');
 assert.equal(recipientFieldLabel(formats,'20','shipping_zip'),null);
 assert.equal(formats.countryRules['10'].labels.shipping_email,undefined);
 assert.equal(formats.countryRules['10'].labels.shipping_middle_name,undefined);
 assert.equal(formats.countryRules['20'].addressAlphabet,'cyrillic');
});

test('country identity requirements drive visible fields without a hardcoded country list',()=>{
 assert.equal(visibleRecipientFields(person,formats).has('passportNumber'),false);
 const needed=visibleRecipientFields({...person,countryId:'20'},formats);
 for(const key of ['passportNumber','passportIssuedCountryId','scan1','scan2'])assert.equal(needed.has(key),true);
 for(const key of ['passportSeries','passportBirthDate','shipping_middle_name','companyCif'])assert.equal(needed.has(key),false);
 assert.equal(visibleRecipientFields({...person,countryId:'30'},formats).has('passportSeries'),true,'unknown metadata retains legacy form capability');
 assert.equal(visibleRecipientFields({...person,countryId:''},formats).has('scan1'),false,'do not ask for identity documents before choosing a destination');
});

test('hidden identity and company values are neither submitted nor validated after a country/type change',()=>{
 const stale={...person,passportNumber:'old',passportBirthDate:'not-a-date',passportIssuedCountryId:'999',scan1:'https://external.invalid/stale.pdf',companyCif:'hidden company'};
 const result=validateRecipient(stale,formats,false,{initial:stale});
 assert.deepEqual(result.errors,{});
 for(const key of ['passportNumber','passportBirthDate','passportIssuedCountryId','scan1','companyCif','shipping_company_name'])assert.equal(key in result.fields,false);
 const legal={...stale,isLegal:'1',shipping_company_name:'Synthetic Ltd',companyCif:'123'};
 const company=validateRecipient(legal,formats,true);
 assert.deepEqual(company.errors,{});assert.equal(company.fields.companyCif,'123');
 assert.equal('shipping_first_name' in company.fields,false);assert.equal('scan1' in company.fields,false);assert.equal('companyBankCode' in company.fields,false);
});

test('country switch clears dependent region/city/postal and obsolete hidden data; type switch keeps address',()=>{
 const changed=changeRecipientScope({...person,countryId:'20',regionId:'201',cityId:'222',passportSeries:'old',passportNumber:'old',scan1:'/upload/address-scans/old.pdf'},formats,{countryId:'10'});
 for(const key of ['regionId','cityId','shipping_city','shipping_zip','passportSeries','passportNumber','scan1'])assert.equal(changed[key],'');
 assert.equal(changed.shipping_phone_code,'+10');assert.equal(changed.shipping_first_name,person.shipping_first_name);
 const company=changeRecipientScope(person,formats,{isLegal:'1'});assert.equal(company.shipping_address,person.shipping_address);assert.equal(company.regionId,'101');
});

test('postal code and available destination region are required before submission',()=>{
 assert.equal(validateRecipient({...person,shipping_zip:''},formats,false).errors.shipping_zip,'accountOps.required');
 assert.equal(validateRecipient({...person,regionId:''},formats,false).errors.regionId,'accountOps.selectRegion');
 assert.deepEqual(validateRecipient(person,formats,false).errors,{});
});

test('malformed additive country rules cannot silently choose another countries labels or alphabet',()=>{
 for(const value of [{labels:[],zipMask:null,addressAlphabet:'latin',postalCodeRequired:true,regionRequired:true},{labels:{shipping_zip:[]},zipMask:null,addressAlphabet:'latin',postalCodeRequired:true,regionRequired:true},{labels:{},zipMask:null,addressAlphabet:'guessed'}])assert.throws(()=>addressFormats({countries:{10:'A'},recipientCountryRules:{10:value}}));
});

test('role exemptions and legacy missing metadata do not acquire invented postal/region requirements',()=>{
 const exempt={...formats,countryRules:{...formats.countryRules,10:{...formats.countryRules['10'],postalCodeRequired:false,regionRequired:false}}};
 assert.deepEqual(validateRecipient({...person,shipping_zip:'',regionId:''},exempt,false).errors,{});
 const legacy=addressFormats({countries:{10:'Legacy'}});
 assert.deepEqual(validateRecipient({...person,shipping_zip:'',regionId:''},legacy,false).errors,{});
});

test('required region with no returned choices is an explicit unavailable state, never an invisible invalid field',()=>{
 const unavailable={...formats,regions:[]};
 assert.deepEqual(recipientRegions(unavailable,'10'),{options:[],required:true,unavailable:true});
 assert.equal(validateRecipient(person,unavailable,false).errors.regionId,'recipientDetails.regionUnavailable');
 assert.equal(validateRecipient({...person,regionId:''},unavailable,false).errors.regionId,'recipientDetails.regionUnavailable');
});

test('region and city changes discard a stale postal code while selecting the same value preserves it',()=>{
 assert.equal(changeRecipientRegion(person,'101'),person);
 const changed=changeRecipientRegion(person,'102');assert.equal(changed.shipping_zip,'');assert.equal(changed.shipping_city,'');
 const city=changeRecipientCity(person,{id:'',title:'Another city'});assert.equal(city.shipping_zip,'');assert.equal(city.shipping_city,'Another city');
 assert.equal(changeRecipientCity(person,{id:'',title:person.shipping_city}),person);
});

test('an explicit required scan slot accepts its staged upload but never a different slot',()=>{
 for(const key of ['scan1','scan2']) {
  const exact={...formats,requiredFields:{10:{person:[key],company:[]}}};
  assert.equal(visibleRecipientFields(person,exact).has(key),true);
  assert.equal(validateRecipient(person,exact,false).errors[key],'accountOps.required');
  assert.deepEqual(validateRecipient(person,exact,false,{stagedScans:{[key]:true}}).errors,{});
  assert.equal(validateRecipient(person,exact,false,{stagedScans:{[key==='scan1'?'scan2':'scan1']:true}}).errors[key],'accountOps.required');
 }
});
