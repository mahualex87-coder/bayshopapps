import assert from 'node:assert/strict';
import test from 'node:test';
import { addressFormats, emptyRecipient, recipientDetail, recipientFields, validateRecipient } from '../src/api/account-operations.ts';
import { planMutation } from '../src/api/operations-contracts.ts';
import { postalAddressFields } from '../src/features/live/address-fields.ts';

const formats = addressFormats({ countries: { 143: 'Moldova' } });
const address = { ...emptyRecipient(), countryId: '143', shipping_first_name: 'Ana', shipping_last_name: 'Mahu', shipping_address: 'Strada 1', shipping_zip: '2001', shipping_city: 'Chisinau', shipping_phone_code: '+373', shipping_phone: '60000000' };

test('new recipient does not require or invent a shipping email', () => {
  assert.equal(recipientFields.includes('shipping_email'), false);
  const validation = validateRecipient(address, formats, false);
  assert.deepEqual(validation.errors, {});
  assert.equal('shipping_email' in validation.fields, false);
  const plan = planMutation({ kind: 'recipient.save', input: validation.fields });
  assert.equal('shipping_email' in plan.fields, false);
  assert.equal(plan.fields.shipping_first_name, 'Ana');
});

test('editing omits existing server email rather than clearing or invisibly validating it', () => {
  for (const storedEmail of ['existing@example.test', 'legacy incomplete value', '']) {
    const detail = recipientDetail({ address: { ...address, shipping_email: storedEmail }, countries: { 143: 'Moldova' } });
    assert.equal('shipping_email' in detail.fields, false);
    // Defend against an older in-memory form still carrying the removed key.
    const validation = validateRecipient({ ...detail.fields, shipping_email: storedEmail, shipping_address: 'Strada 2' }, detail.formats, false);
    assert.deepEqual(validation.errors, {});
    const plan = planMutation({ kind: 'recipient.save', id: '10', input: validation.fields });
    assert.equal('shipping_email' in plan.fields, false, 'MemberAddress.update preserves columns absent from the POST');
    assert.equal(plan.fields.shipping_address, 'Strada 2');
  }
});

test('address display and full-address copying exclude email fields and preserve postal values exactly', () => {
  const original = [
    { label: 'Nume', labelKey: 'field.fullName', value: 'Ana Mahu', personal: true },
    { label: 'Any translated label', labelKey: 'field.email', value: 'private@example.test', personal: true },
    { label: ' E-mail: ', value: 'second@example.test', personal: true },
    { label: 'Электронная почта', value: 'third@example.test', personal: true },
    { label: 'Adresa', labelKey: 'field.address', value: 'Rue de l’Église 12, ap. 4', personal: true },
    { label: 'Companie', labelKey: 'field.company', value: 'Email Express', personal: true },
    { label: 'Cod poștal', labelKey: 'field.postalCode', value: '00123', personal: false },
  ];
  const shown = postalAddressFields(original);
  assert.deepEqual(shown.map(item => item.value), ['Ana Mahu', 'Rue de l’Église 12, ap. 4', 'Email Express', '00123']);
  assert.equal(shown.map(item => item.value).join('\n').includes('@'), false);
  assert.equal(shown[1], original[4], 'no reconstruction or rewriting of postal fields');
  assert.equal(original.length, 7, 'server resource remains untouched');
});

test('postal views and clipboard omit distinct patronymic fields in all supported locales without rewriting names', () => {
  const labels=['Patronimic', 'Patronimic / al doilea prenume', 'Middle name', 'Middle name / patronymic', 'Отчество', 'Отчество / второе имя', 'shipping_middle_name'];
  const visible=[{label:'Prenume',labelKey:'field.firstName',value:'Ana Maria'},{label:'Nume',labelKey:'field.lastName',value:'Mahu'},{label:'Nume complet',labelKey:'field.fullName',value:'Ana Maria Mahu'},{label:'Adresă',labelKey:'field.address',value:'Str. Ștefan cel Mare 10'}];
  const hidden=[...labels.map(label=>({label,value:'Stored patronymic'})),{label:'Localized label',labelKey:'field.middleName',value:'Stored patronymic'},{label:'Localized label',labelKey:'field.secondName',value:'Stored patronymic'}];
  const source=[...visible,...hidden];
  assert.deepEqual(postalAddressFields(source),visible);
  assert.equal(source.length,visible.length+hidden.length,'API data remains unchanged');
  assert.equal(postalAddressFields(source).map(field=>field.value).join('\n'),'Ana Maria\nMahu\nAna Maria Mahu\nStr. Ștefan cel Mare 10');
});
