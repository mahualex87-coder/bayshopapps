import assert from 'node:assert/strict';
import test from 'node:test';
import { accountRegionFromPersonalData, accountRegionInterfaceLanguage, accountRegionLanguage, normalizeAccountSettings, normalizeAccountRegion, validateSettingsMutation } from '../src/api/account-settings.ts';
import { planMutation } from '../src/api/operations-contracts.ts';
import { normalizePersonalProfileData } from '../src/api/normalize.ts';

const region = { countryId: '143', languageId: '2', countries: [
  { id: '143', title: 'Moldova', code: 'MD', languages: [{ id: '1', title: 'Română', code: 'ro' }, { id: '2', title: 'Русский', code: 'ru' }] },
  { id: '181', title: 'România', code: 'RO', languages: [{ id: '1', title: 'Română', code: 'ro' }, { id: '3', title: 'English', code: 'en' }] },
] };
const raw = { capabilities: { accountRegionSave: true }, birthday: { value: null, editable: false }, language: { id: '2', options: region.countries[0].languages }, region, billing: { fields: {}, countries: [] }, identity: { revision: 'a'.repeat(64), files: [], maxFiles: 3, maxBytes: 26214400, allowedMimeTypes: ['application/pdf'] } };
test('an account without a destination can select its first country from the settings returned by the API', () => {
  const personal = { name: 'Test', countries: region.countries, languages: {} };
  assert.equal(normalizePersonalProfileData(personal, {}).countryId, undefined);
  assert.throws(() => accountRegionFromPersonalData(personal));
  for (const countryId of ['0', 0, '', null]) {
    assert.equal(normalizePersonalProfileData({ ...personal, countryId }, {}).countryId, null);
    assert.equal(accountRegionFromPersonalData({ ...personal, countryId }).countryId, '');
    const settings = normalizeAccountSettings({ ...raw, region: { ...region, countryId } });
    assert.equal(settings.region.countryId, '');
    assert.deepEqual(settings.region.countries.map(c => c.id), ['143','181']);
    validateSettingsMutation({ kind: 'settings.region.save', countryId: '181', languageId: '3' }, settings);
    assert.throws(() => validateSettingsMutation({ kind: 'settings.region.save', countryId: '', languageId: '3' }, settings));
  }
});
test('region retains only friendly display values and exact dependent language IDs', () => {
  const data = normalizeAccountRegion({ ...region, countries: region.countries.map(country => ({ ...country, phoneLength: 8, availableLanguageCodes: 'hidden', internal: 'hidden' })) });
  assert.deepEqual(data.countries.map(country => [country.title, country.code, country.languages.map(language => language.id)]), [['Moldova', 'MD', ['1', '2']], ['România', 'RO', ['1', '3']]]);
  assert.equal(JSON.stringify(data).includes('hidden'), false);
  assert.equal(accountRegionLanguage(data, '181', '2'), '');
  assert.equal(accountRegionLanguage(data, '181', '1'), '1');
  assert.equal(accountRegionLanguage(data, '999', '1'), '');
});
test('legacy fallback displays account preference without inventing cross-country languages', () => {
  const data = accountRegionFromPersonalData({ countryId: 143, languageId: 2, countries: region.countries, languages: { 1: 'Română', 2: 'Русский' } });
  assert.equal(data.languageId, '2');
  assert.deepEqual(data.countries[1].languages, []);
  assert.equal(normalizeAccountSettings({ ...raw, capabilities: {}, region: undefined }).capabilities.accountRegionSave, false);
});
test('pair write checks fresh capability and country language dependency', () => {
  const data = normalizeAccountSettings(raw);
  const command = { kind: 'settings.region.save', countryId: '181', languageId: '3' };
  validateSettingsMutation(command, data);
  assert.throws(() => validateSettingsMutation({ ...command, languageId: '2' }, data));
  assert.throws(() => validateSettingsMutation({ ...command, countryId: '999' }, data));
  assert.throws(() => validateSettingsMutation(command, { ...data, capabilities: { ...data.capabilities, accountRegionSave: false } }));
  assert.throws(() => validateSettingsMutation(command, { ...data, region: null }));
  const plan = planMutation(command);
  assert.deepEqual(plan.fields, { setting: 'region', countryId: '181', languageId: '3' });
  assert.equal(plan.path, '/api/member-settings');
  assert.equal(plan.method, 'POST');
  assert.deepEqual(new Set(plan.invalidate), new Set(['profile', 'waiting', 'warehouse', 'sent', 'received', 'addresses', 'recipients', 'balance']));
  assert.equal(JSON.stringify(plan).includes('token_gcm'), false);
});
test('interface locale follows the confirmed country-scoped server code, never numeric IDs or names', () => {
  assert.equal(accountRegionInterfaceLanguage(normalizeAccountRegion(region)), 'ru');
  assert.equal(accountRegionInterfaceLanguage(normalizeAccountRegion({ ...region, countryId: '181', languageId: '3' })), 'en');
  assert.equal(accountRegionInterfaceLanguage(normalizeAccountRegion({ ...region, countryId: '181', languageId: '2' })), null);
  for (const [code, expected] of [['RO', 'ro'], ['ru-MD', 'ru'], ['de', null], [null, null], [undefined, null]]) {
    const data = normalizeAccountRegion({ ...region, countries: [{ ...region.countries[0], languages: [{ id: '2', title: 'Română', code }] }] });
    assert.equal(accountRegionInterfaceLanguage(data), expected);
  }
  assert.equal(accountRegionInterfaceLanguage(accountRegionFromPersonalData({ countryId: '143', languageId: '2', countries: region.countries, languages: { 2: 'Русский' } })), null);
});
test('a retained legacy identity slot without preview does not hide region data or discard its document ID', () => {
  const data = normalizeAccountSettings({ ...raw, capabilities: { ...raw.capabilities, identityDocumentsSave: true }, identity: { ...raw.identity, files: [{ id: 'scan1', url: null }] } });
  assert.equal(data.region.countryId, '143');
  assert.equal(data.region.languageId, '2');
  assert.equal(data.capabilities.accountRegionSave, true);
  assert.deepEqual(data.identity.files, [{ id: 'scan1', url: null }]);
  validateSettingsMutation({ kind: 'settings.region.save', countryId: '181', languageId: '3' }, data);
  validateSettingsMutation({ kind: 'settings.identity.save', revision: data.identity.revision, retainedIds: ['scan1'], files: [] }, data);
  assert.deepEqual(normalizeAccountSettings(data), data, 'typed readView results can be safely decoded again by the account view');
  for (const url of ['', undefined, 'javascript:alert(1)', 'http://bayshop.com/legacy', '/private/path', 'https://user:secret@bayshop.com/doc']) {
    assert.throws(() => normalizeAccountSettings({ ...raw, identity: { ...raw.identity, files: [{ id: 'scan1', url }] } }));
  }
});
