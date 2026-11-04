import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyRecipient, recipientDetail, addressFormats, validateRecipient } from '../src/api/account-operations.ts';
import { recipientScanPath, validRecipientDate } from '../src/api/recipient-fields.ts';
import { planMutation } from '../src/api/operations-contracts.ts';
const formats=addressFormats({countries:{143:'Moldova'},passportCountries:{143:'Moldova',179:'Romania'},recipientRequiredFields:{143:{person:['passportNumber','scans'],company:['companyCif']}}});
const base={...emptyRecipient(),countryId:'143',shipping_first_name:'Test',shipping_last_name:'Recipient',shipping_address:'Test 1',shipping_zip:'2001',shipping_city:'Chisinau',shipping_phone_code:'+373',shipping_phone:'60000000',passportNumber:'0001',scan1:'/upload/address-scans/test.pdf'};
test('recipient detail preserves identity/company fields and separate scan slots without inventing values',()=>{
 const source={...base,shipping_middle_name:'M',passportSeries:'A',passportIdnp:'0000001',passportBirthDate:'1990-02-03',passportIssued:'2024-02-29',passportIssuedBy:'Authority',passportIssuedCountryId:'179',companyAdministrator:'Admin',companyCif:'00012',companyTva:'VAT1',companyBank:'Bank',companyBankCode:'QA00001',scan2:'/upload/address-scans/second.png'};
 assert.deepEqual(recipientDetail({address:source}).fields,source);
 assert.equal(recipientDetail({address:base}).formats.passportCountries,null);
});
test('hidden patronymic is never posted or cleared when another address field changes',()=>{
 for (const stored of ['Petrovici','', 'legacy value 123']) {
  const initial=recipientDetail({address:{...base,shipping_middle_name:stored}}).fields;
  const validation=validateRecipient({...initial,shipping_address:'Test 2'},formats,false,{initial});
  assert.deepEqual(validation.errors,{});
  const plan=planMutation({kind:'recipient.save',id:'10',input:validation.fields});
  assert.equal('shipping_middle_name' in plan.fields,false,'MemberAddress.update preserves the omitted column');
  assert.equal(initial.shipping_middle_name,stored,'the server resource is retained unchanged');
  assert.equal(plan.fields.shipping_first_name,'Test');
  assert.equal(plan.fields.shipping_last_name,'Recipient');
  assert.equal(plan.fields.shipping_address,'Test 2');
 }
 assert.equal('shipping_middle_name' in validateRecipient(base,formats,false).fields,false);
});
test('requirements are returned-country and person/company specific; staged files satisfy scan requirement',()=>{
 assert.deepEqual(validateRecipient(base,formats,false).errors,{});
 assert.equal(validateRecipient({...base,passportNumber:''},formats,false).errors.passportNumber,'accountOps.required');
 assert.equal(validateRecipient({...base,scan1:''},formats,false).errors.scan1,'recipientDetails.firstScanRequired');
 assert.deepEqual(validateRecipient({...base,scan1:''},formats,false,{stagedScans:{scan1:true}}).errors,{});
 assert.equal(validateRecipient({...base,scan1:''},formats,false,{stagedScans:{scan2:true}}).errors.scan1,'recipientDetails.firstScanRequired');
 const legal=validateRecipient({...base,isLegal:'1',shipping_company_name:'Test Co',companyCif:'111'},formats,true);
 assert.deepEqual(legal.errors,{});assert.equal(legal.fields.agree,'1');
 assert.equal(validateRecipient({...base,isLegal:'1',shipping_company_name:'Test Co'},formats,true).errors.companyCif,'accountOps.required');
});
test('empty and unchanged legacy dates are omitted; valid dates never shift and a saved date cannot become epoch',()=>{
 const dateFormats={...formats,requiredFields:null};
 const empty=validateRecipient(base,dateFormats,false);assert.equal('passportBirthDate' in empty.fields,false);assert.equal('passportIssued' in empty.fields,false);
 assert.equal(validRecipientDate('2024-02-29'),true);assert.equal(validRecipientDate('2023-02-29'),false);assert.equal(validRecipientDate('2024-13-01'),false);
 assert.equal(validateRecipient({...base,passportBirthDate:'2000-01-01'},dateFormats,false).fields.passportBirthDate,'2000-01-01');
 assert.equal(validateRecipient({...base,passportBirthDate:''},dateFormats,false,{initial:{...base,passportBirthDate:'2000-01-01'}}).errors.passportBirthDate,'recipientDetails.dateCannotClear');
 const legacy={...base,passportIssued:'0000-00-00'};assert.equal('passportIssued' in validateRecipient(legacy,dateFormats,false,{initial:legacy}).fields,false);
});
test('retained documents cannot trigger server URL downloads or refer outside member scans',()=>{
 assert.equal(recipientScanPath('https://bayshop.com/upload/address-scans/test.pdf'),'/upload/address-scans/test.pdf');
 for(const bad of ['https://other.test/upload/address-scans/a.pdf','/upload/other/a.pdf','/upload/address-scans/../secret.pdf','/upload/address-scans/a.pdf?token=x']) assert.equal(recipientScanPath(bad),null);
 assert.throws(()=>planMutation({kind:'recipient.save',input:{scan1:'https://other.test/a.pdf'}}));
 const plan=planMutation({kind:'recipient.save',input:{scan1:'https://bayshop.com/upload/address-scans/test.pdf'}});assert.equal(plan.fields.scan1,'/upload/address-scans/test.pdf');
});
test('recipient files use documented multipart names, limits and strict picker types',()=>{
 const file={uri:'file:///qa.pdf',name:'qa.pdf',mimeType:'application/pdf',size:100};
 const plan=planMutation({kind:'recipient.save',id:'10',input:{passportNumber:'0001'},scans:{scan1:file,scan2:{...file,uri:'file:///qa2.pdf'}}});
 assert.equal(plan.path,'/api/member-address/10/');assert.equal(plan.encoding,'multipart');assert.deepEqual(plan.files.map(file=>file.field),['scan1','scan2']);
 for(const invalid of [{...file,size:26214401},{...file,size:undefined},{...file,mimeType:'text/html'},{...file,uri:'https://other.test/a.pdf'}]) assert.throws(()=>planMutation({kind:'recipient.save',input:{},scans:{scan1:invalid}}));
 assert.throws(()=>planMutation({kind:'recipient.save',input:{},scans:{other:file}}));
});

test('recipient multipart filename avoids legacy first-dot extension parsing without changing bytes URI',()=>{
 const plan=planMutation({kind:'recipient.save',input:{},scans:{scan1:{uri:'file:///scan.2026.pdf',name:'scan.2026.pdf',mimeType:'application/pdf',size:100}}});
 assert.equal(plan.files[0].file.name,'identity-scan1.pdf');assert.equal(plan.files[0].file.uri,'file:///scan.2026.pdf');
});
