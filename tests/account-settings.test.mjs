import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAccountSettings, passwordChangeFields, validBirthday, validateSettingsMutation } from '../src/api/account-settings.ts';
import { preferencesData } from '../src/api/account-operations.ts';
import { planMutation, planRead } from '../src/api/operations-contracts.ts';
import { API_ORIGIN, ApiError } from '../src/api/client.ts';
import { LiveAccountService } from '../src/api/service.ts';

const fixture = () => ({
  capabilities: { passwordLogRedacted: true, birthdaySave: true, billingSave: true, identityDocumentsSave: true, accountLanguageSave: true, autoPackingPolicyPreserved: true },
  birthday: { value: null, editable: true },
  language: { id: '1', options: [{ id: '1', title: 'Română', code: 'ro' }, { id: '2', title: 'Русский', code: 'ru' }] },
  billing: { fields: { first_name: 'First', last_name: 'Last', company_name: '', address1: 'Exact street', city: 'Chișinău', state: '', email: 'bill@example.test', phone: '60000000', zip: '2000', country: '143' }, countries: [{ id: '143', title: 'Moldova', code: 'MD' }] },
  identity: { revision: 'a'.repeat(64), files: [{ id: 'scan1', url: 'https://bayshop.com/upload/members/opaque.pdf' }], maxFiles: 3, maxBytes: 26214400, allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'] },
});
const flagFixture = { alertOnSystem: '1', obtainSms: '0', obtainGcm: true, obtainMails: 1, obtainViber: false, obtainTelegram: 0, hasTelegram: false };
const NOW = 1790000000000;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };
function create(override = () => undefined) {
  const writes = []; let saved = JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-settings', expiresAt: NOW + 3600000 });
  const service = new LiveAccountService(async (path, options) => {
    const changed = override(path, options); if (changed !== undefined) return changed;
    if (options.write) { writes.push({ path, write: options.write }); return { code: 200, error: false, message: 'Ok', data: { saved: true } }; }
    if (path === '/api/member-settings') return fixture();
    if (path === '/api/auth') return { id: '7', name: 'First', surname: 'Last', access_token: 'synthetic-settings', expires_in: 3600, token_type: 'Bearer' };
    if (path === '/api/member/me') return { member: { id: '7', email: 'account@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'First', surname: 'Last', countryId: '143', countries: [{ id: '143', title: 'Moldova' }], phoneCode: '+373', phone: '60000000' };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    if (path === '/api/member/mail-options/') return flagFixture;
    return [];
  }, { read: async () => saved, write: async value => { saved = value; }, clear: async () => { saved = null; } }, () => NOW);
  return { service, writes, saved: () => saved };
}

test('settings strict extraction keeps permissions, actual language codes and exact billing values', () => {
  const raw = fixture(); raw.password = 'never retain'; raw.token = 'never retain';
  const data = normalizeAccountSettings(raw);
  assert.equal(data.language.options[1].code, 'ru');
  assert.deepEqual(data.billing.fields, raw.billing.fields);
  assert.equal(JSON.stringify(data).includes('never retain'), false);
  assert.equal(normalizeAccountSettings({ ...raw, capabilities: {} }).capabilities.passwordLogRedacted, false);
  assert.equal(normalizeAccountSettings({ ...raw, birthday: { value: '1990-01-02', editable: true } }).birthday.editable, false);
  for (const invalid of ['2024-02-31', '2023-02-29', '02/02/2000']) assert.equal(validBirthday(invalid), false);
  assert.equal(validBirthday('2024-02-29'), true);
  assert.throws(() => normalizeAccountSettings({ ...raw, capabilities: { birthdaySave: 'yes' } }));
  assert.throws(() => normalizeAccountSettings({ ...raw, identity: { ...raw.identity, files: [{ id: 'scan1', url: 'https://secret@bayshop.com/photo' }] } }));
});

test('password exact bytes and documented nonempty validation; never invent a minimum', () => {
  assert.deepEqual(passwordChangeFields({ oldPassword: ' exact old ', newPassword: 'x' }), { old: ' exact old ', new: 'x' });
  for (const value of ['', '0', null, 123]) assert.throws(() => passwordChangeFields({ oldPassword: 'old', newPassword: value }));
  const plan = planMutation({ kind: 'password.change', input: { oldPassword: 'a&b', newPassword: 'x+y' } });
  assert.equal(plan.path, '/api/member/new-password'); assert.equal(plan.encoding, 'form');
  assert.deepEqual(plan.fields, { old: 'a&b', new: 'x+y' });
  assert.throws(() => plan.normalize({ code: 200, error: false, message: 'Maybe' }));
});

test('settings writes use dedicated routes and exact allowlists, never initiate a payment', () => {
  const data = normalizeAccountSettings(fixture());
  const command = { kind: 'settings.billing.save', input: data.billing.fields };
  validateSettingsMutation(command, data);
  assert.equal(planMutation(command).path, '/api/member-settings');
  assert.equal(planMutation(command).fields.setting, 'billing');
  assert.throws(() => planMutation({ ...command, input: { ...command.input, member_id: 'other' } }));
  assert.throws(() => validateSettingsMutation({ ...command, input: { ...command.input, country: '999' } }, data));
  assert.throws(() => validateSettingsMutation({ kind: 'settings.birthday.save', birthday: '2000-01-01' }, { ...data, birthday: { value: '1990-01-01', editable: false } }));
  assert.throws(() => validateSettingsMutation({ kind: 'settings.language.save', languageId: '999' }, data));
  const identity = { kind: 'settings.identity.save', revision: data.identity.revision, retainedIds: ['scan1'], files: [{ uri: 'file:///picked.pdf', name: 'picked.pdf', mimeType: 'application/pdf', size: 26214400 }] };
  validateSettingsMutation(identity, data);
  assert.throws(() => validateSettingsMutation({ ...identity, revision: 'b'.repeat(64) }, data));
  assert.deepEqual(planMutation(identity).files.map(file => file.field), ['documents[]']);
  for (const ids of [['scan2'], ['scan1', 'scan1']]) assert.throws(() => validateSettingsMutation({ ...identity, retainedIds: ids }, data));
  assert.throws(() => validateSettingsMutation({ ...identity, files: [{ ...identity.files[0], size: 26214401 }] }, data));
});

test('informative notifications distinguish absent capability from false', () => {
  assert.equal(preferencesData(flagFixture).values.obtainMass, null);
  assert.equal(preferencesData({ ...flagFixture, obtainMass: '0' }).values.obtainMass, false);
  assert.equal(preferencesData({ ...flagFixture, obtainMass: '1' }).values.obtainMass, true);
  assert.throws(() => preferencesData({ ...flagFixture, obtainMass: 'maybe' }));
});

test('password and informative preference do not dispatch without fresh support; credentials never persist', async () => {
  const { service, writes, saved } = create(path => path === '/api/member-settings' ? { ...fixture(), capabilities: {} } : undefined);
  await service.start(); await flush();
  const password = await service.mutate({ kind: 'password.change', input: { oldPassword: 'sensitive-old', newPassword: 'sensitive-new' } });
  assert.equal(password.outcome, 'rejected'); assert.equal(password.error, 'accountSettings.serverUpdateRequired');
  assert.equal((await service.mutate({ kind: 'preferences.save', input: { obtainMass: 0 } })).outcome, 'rejected');
  assert.equal(writes.length, 0);
  assert.equal(JSON.stringify(service.getSnapshot()).includes('sensitive'), false);
  assert.equal(saved().includes('sensitive'), false);
});

test('approved settings preserve one explicit write and unknown result never retries', async () => {
  let count = 0;
  const { service } = create((path, options) => { if (options.write) { count++; throw new ApiError(0, 'errors.requestTimeout', {}, { outcome: 'unknown' }); } });
  await service.start(); await flush();
  const result = await service.mutate({ kind: 'password.change', input: { oldPassword: 'old', newPassword: 'new' } });
  assert.equal(result.outcome, 'unknown'); assert.equal(count, 1);
});

test('settings 404 is upgrade-required, 401 expires session, network error remains network', async () => {
  for (const status of [404, 401, 503]) {
    const { service } = create(path => { if (path === '/api/member-settings') throw new ApiError(status, status === 401 ? 'errors.sessionExpired' : 'errors.serverUnavailable'); });
    await service.start(); await flush();
    await assert.rejects(service.readView({ kind: 'settings.read' }), error => error.status === status && error.key === (status === 404 ? 'accountSettings.serverUpdateRequired' : status === 401 ? 'errors.sessionExpired' : 'errors.serverUnavailable'));
    assert.equal(service.getSnapshot().authenticated, status !== 401);
  }
  assert.equal(planRead({ kind: 'settings.read' }).path, '/api/member-settings');
});

test('logout while checking permission prevents the write; duplicate taps cannot pass preflight', async () => {
  const wait = deferred(); const { service, writes } = create(path => path === '/api/member-settings' ? wait.promise : undefined);
  await service.start(); await flush();
  const command = { kind: 'password.change', input: { oldPassword: 'old', newPassword: 'new' } };
  const first = service.mutate(command); await flush();
  assert.equal((await service.mutate(command)).error, 'errors.mutationInProgress');
  await service.logout(); wait.resolve(fixture());
  assert.equal((await first).outcome, 'rejected'); assert.equal(writes.length, 0);
});

const regionFixture = () => ({ ...fixture(), capabilities: { ...fixture().capabilities, accountRegionSave: true }, region: { countryId: '143', languageId: '1', countries: [{ id: '143', title: 'Moldova', code: 'MD', languages: [{ id: '1', title: 'Română', code: 'ro' }] }, { id: '179', title: 'România', code: 'RO', languages: [{ id: '1', title: 'Română', code: 'ro' }] }] } });

test('region save cancels prior-region reads, preserves account identity while profile refreshes, and resets page scope', async () => {
  const stale = deferred(); const profile = deferred(); const observations = []; let changed = false; let oldSignal; let writeCount = 0;
  const { service, saved } = create((path, options) => {
    if (path === '/api/member-settings' && !options.write) return regionFixture();
    if (path === '/api/news') { oldSignal = options.signal; return stale.promise; }
    if (path === '/api/member-settings' && options.write) { changed = true; writeCount++; return { code: 200, error: false, message: 'Ok', data: { saved: true } }; }
    if (changed && path === '/api/auth') return profile.promise;
  });
  await service.start(); await flush();
  assert.equal(service.getSnapshot().accountId, '7');
  service.subscribe(() => observations.push(service.getSnapshot().accountId));
  const oldRead = service.readView({ kind: 'news.read' });
  const rejected = assert.rejects(oldRead, error => error.key === 'errors.cancelled');
  await flush();
  const pending = service.mutate({ kind: 'settings.region.save', countryId: '179', languageId: '1' });
  await flush();
  assert.equal(oldSignal.aborted, true);
  assert.equal(service.getSnapshot().accountRevision, 1);
  assert.equal(service.getSnapshot().accountId, '7');
  assert.equal(service.getSnapshot().resources.profile.data, null);
  stale.resolve([]); await rejected;
  profile.resolve({ id: '7', name: 'First', surname: 'Last', access_token: 'synthetic-settings', expires_in: 3600, token_type: 'Bearer' });
  assert.equal((await pending).ok, true);
  assert.equal(writeCount, 1); assert.equal(service.getSnapshot().mutation.pending, false);
  assert.equal(observations.every(id => id === '7'), true);
  assert.equal(service.getSnapshot().authenticated, true); assert(saved());
  await service.logout(); assert.equal(service.getSnapshot().accountId, null);
});

test('uncertain region save invalidates prior reads once without replaying the write', async () => {
  const stale = deferred(); let signal; let count = 0;
  const { service } = create((path, options) => {
    if (path === '/api/member-settings' && !options.write) return regionFixture();
    if (path === '/api/news') { signal = options.signal; return stale.promise; }
    if (options.write) { count++; throw new ApiError(0, 'errors.timeout', {}, { outcome: 'unknown' }); }
  });
  await service.start(); await flush();
  const old = service.readView({ kind: 'news.read' }); const rejected = assert.rejects(old, error => error.key === 'errors.cancelled');
  const result = await service.mutate({ kind: 'settings.region.save', countryId: '179', languageId: '1' });
  assert.equal(result.outcome, 'unknown'); assert.equal(count, 1); assert.equal(signal.aborted, true);
  assert.equal(service.getSnapshot().accountRevision, 1); assert.equal(service.getSnapshot().accountId, '7');
  stale.resolve([]); await rejected;
});
