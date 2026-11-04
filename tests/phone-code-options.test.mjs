import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneCodeOptions, searchPhoneCodes } from '../src/domain/phone-code-options.ts';

const formats = { countries: [{ id:'1', title:'România', code:'RO' }, { id:'2', title:'Republica Moldova', code:'MD' }, { id:'3', title:'United States', code:'US' }], regions:[], cities:[], phoneCodes:[{id:'7',countryId:'2',title:'Moldova',code:'+373'},{id:'8',countryId:'1',title:'România',code:'+40'},{id:'9',countryId:'3',title:'United States',code:'+1'},{id:'10',countryId:'2',title:'Alternate format',code:'+373'},{id:'11',title:'Invalid',code:'javascript:'}] };
test('recipient calling codes use server values, localized names and the shared country order', () => {
  const options=phoneCodeOptions(formats,'ru');
  assert.deepEqual(options.map(option=>option.callingCode),['+1','+40','+373']);
  assert.equal(options[1].title,'Румыния');
  assert.equal(searchPhoneCodes(options,'Рум')[0].callingCode,'+40');
  assert.equal(searchPhoneCodes(options,'+373')[0].countryId,'2');
  assert.equal(searchPhoneCodes(options,'373')[0].countryId,'2');
  assert.equal(searchPhoneCodes(options,'romania')[0].countryId,'1');
  assert.deepEqual(searchPhoneCodes(options,'999'),[]);
  assert.equal(formats.phoneCodes.length,5,'The server payload is never mutated');
});
