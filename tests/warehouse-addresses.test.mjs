import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWarehouseIdentity, validWarehouseIdentity, warehouseAddressFields } from '../src/domain/warehouse-addresses.ts';
const identity = { name: '  Ana   Popescu ', clientCode: 'm1234567' };
const value = (address, label) => address.fields.find(field => field.label === label)?.value;

test('warehouse addresses do not allow copying personal templates before identity is supplied', () => {
  for (const id of ['US', 'RO', 'GB', 'IT', 'DE', 'PL']) {
    const address = warehouseAddressFields(id, false, { name: '', clientCode: '' });
    assert.equal(address.complete, false);
    assert.equal(address.fields.find(field => field.label === 'Nume / Prenume').complete, false);
    assert.equal(address.fields.find(field => field.label === 'Cod poștal / ZIP').complete, true);
    assert.ok(address.fields.some(field => field.value.includes('[cod client]') && !field.complete));
  }
});

test('client code appears exactly once in the country-specific field', () => {
  const positions = { US: 'Adresa, linia 2', RO: 'Adresa, linia 1', GB: 'Nume / Prenume', IT: 'Adresa, linia 2', DE: 'Adresa, linia 1', PL: 'Adresa, linia 1' };
  for (const [id, label] of Object.entries(positions)) {
    const address = warehouseAddressFields(id, false, identity);
    assert.equal(address.complete, true);
    assert.equal(address.fields.filter(field => field.value.includes('M1234567')).length, 1);
    assert.ok(value(address, label).includes('M1234567'));
    assert.ok(!address.fields.some(field => /[{}\[\]]/.test(field.value)));
  }
});

test('private US address uses its distinct unit and charge while other countries retain their depot', () => {
  const shared = warehouseAddressFields('US', false, identity);
  const privateUS = warehouseAddressFields('US', true, identity);
  assert.equal(value(shared, 'Adresa, linia 2'), 'UNIT 200 M1234567');
  assert.equal(value(privateUS, 'Adresa, linia 2'), 'ST M1234567');
  assert.notEqual(value(shared, 'Adresa, linia 1'), value(privateUS, 'Adresa, linia 1'));
  assert.ok(privateUS.surcharge.includes('20 USD'));
  assert.deepEqual(warehouseAddressFields('DE', true, identity), warehouseAddressFields('DE', false, identity));
});

test('country-specific postal zeroes and company fields survive formatting without changing entered identity', () => {
  assert.equal(value(warehouseAddressFields('IT', false, identity), 'Cod poștal / ZIP'), '00198');
  assert.equal(value(warehouseAddressFields('DE', false, identity), 'Cod poștal / ZIP'), '02828');
  assert.equal(value(warehouseAddressFields('PL', false, identity), 'Companie'), 'SuperGlobal Sp. z o.o.');
  assert.equal(value(warehouseAddressFields('RO', false, identity), 'Nume / Prenume'), 'ANA POPESCU AIRPOSTSRL');
  assert.equal(validWarehouseIdentity(normalizeWarehouseIdentity(identity)), true);
  assert.equal(validWarehouseIdentity({name:'Ana', clientCode:'M 123'}), false);
  assert.equal(identity.clientCode, 'm1234567');
});
