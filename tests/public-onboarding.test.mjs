import test from 'node:test';
import assert from 'node:assert/strict';
import { onboardingCatalog, initialOnboardingSelection, confirmedRegistrationRegion, readPublicOnboarding } from '../src/api/public-onboarding.ts';
import { createPublicAuth } from '../src/api/public-auth.ts';
import { LanguagePreferenceStore } from '../src/i18n/core.ts';
import { initialSocialProfile } from '../src/features/auth/social-completion.ts';

const data = () => ({ version: 1, registrationRegion: true, countries: [
  { id: '10', title: 'Synthetic A', code: 'AA', defaultLanguageId: '1', languages: [{ id: '1', title: 'Română', code: 'ro' }, { id: '2', title: 'Русский', code: 'ru' }] },
  { id: '20', title: 'Synthetic B', code: 'BB', defaultLanguageId: '3', languages: [{ id: '3', title: 'English', code: 'en' }] },
] });
const response = (data, status = 200) => new Response(JSON.stringify({ code: status, error: status !== 200, message: status === 200 ? 'Ok' : 'Invalid Token', data }), { status, headers: { 'content-type': 'application/json' } });

test('catalog preserves only server countries and attached languages, rejects broken defaults/duplicates', () => {
  const parsed = onboardingCatalog(data());
  assert.deepEqual(parsed, data());
  for (const bad of [ { ...data(), registrationRegion: false }, { ...data(), countries: [] }, { ...data(), countries: [data().countries[0], data().countries[0]] }, { ...data(), countries: [{ ...data().countries[0], defaultLanguageId: '999' }] } ]) assert.throws(() => onboardingCatalog(bad));
  const unknown = data(); unknown.countries[1].languages = [{ id: '3', title: 'Deutsch', code: 'de' }];
  const catalog = onboardingCatalog(unknown);
  assert.equal(catalog.countries[1].languages[0].code, 'de', 'do not silently hide a server language');
  assert.equal(confirmedRegistrationRegion(catalog, '20', '3'), null, 'never claim translated support for an unavailable app locale');
});

test('OS region selects a supported market, but unknown country stays an explicit user choice', () => {
  const catalog = onboardingCatalog(data());
  assert.deepEqual(initialOnboardingSelection(catalog, [{ regionCode: 'BB', languageCode: 'en' }], 'ro'), { countryId: '20', languageId: '3' });
  assert.deepEqual(initialOnboardingSelection(catalog, [{ regionCode: 'ZZ', languageCode: 'en' }], 'en'), { countryId: '', languageId: '' });
  assert.deepEqual(initialOnboardingSelection(catalog, [{ regionCode: 'BB', languageCode: 'en' }], 'ro', { countryId: '10', languageId: '2' }), { countryId: '10', languageId: '2' }, 'user choice wins over OS guess');
  assert.deepEqual(initialOnboardingSelection(catalog, [{ regionCode: 'AA', languageCode: 'en' }], 'en'), { countryId: '10', languageId: '1' }, 'country default wins over unsupported language');
  assert.equal(confirmedRegistrationRegion(catalog, '10', '3'), null);
  assert.deepEqual(confirmedRegistrationRegion(catalog, '20', '3'), { countryId: '20', languageId: '3', language: 'en' });
  const german = onboardingCatalog({ ...data(), countries: [{ id: '30', title: 'Synthetic German market', code: 'DE', defaultLanguageId: '3', languages: [{ id: '4', title: 'Deutsch', code: 'de' }, { id: '3', title: 'English', code: 'en' }] }] });
  assert.deepEqual(initialOnboardingSelection(german, [{ regionCode: 'DE', languageCode: 'de-DE' }], 'en'), { countryId: '30', languageId: '4' }, 'preserve a real device language even if app translations are not ready');
  assert.equal(confirmedRegistrationRegion(german, '30', '4'), null, 'unsupported app language requires explicit user choice, not a silent fallback');
});

test('public metadata uses a single tokenless GET and does not fall back to invented choices on 401', async () => {
  const calls = [];
  const value = await readPublicOnboarding(async (url, options) => { calls.push({ url, options }); return response(data()); }, 'ru');
  assert.deepEqual(value, data()); assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://bayshop.com/api/onboarding');
  const options = calls[0].options;
  assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.body, undefined);
  assert.equal(options.headers['Accept-Language'], 'ru'); assert.equal(options.headers.Bearer, undefined); assert.equal(options.headers.Cookie, undefined);
  let failedCalls = 0;
  await assert.rejects(readPublicOnboarding(async () => { failedCalls++; return response(null, 401); }, 'ro'));
  assert.equal(failedCalls, 1);
});

test('metadata rejects redirects, invalid envelopes, unexpected content and already cancelled reads', async () => {
  for (const result of [new Response('{}', { headers: { 'content-type': 'text/html' } }), response({ ...data(), version: 2 }), new Response(JSON.stringify({ code: 200, error: false, message: 'Ok' }), { headers: { 'content-type': 'application/json' } })]) await assert.rejects(readPublicOnboarding(async () => result, 'ro'));
  const redirected = response(data()); Object.defineProperty(redirected, 'url', { value: 'https://example.test/api/onboarding' });
  await assert.rejects(readPublicOnboarding(async () => redirected, 'ro'));
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(readPublicOnboarding(async () => { calls++; return response(data()); }, 'ro', controller.signal)); assert.equal(calls, 0);
});

test('registration sends confirmed region as a pair and refuses a different request language before dispatch', async () => {
  const input = { firstName: 'Synthetic', lastName: 'Test', email: 'synthetic@example.test', password: 'test-password', confirmation: 'test-password', accepted: true, region: { countryId: '10', languageId: '2', language: 'ru' } };
  const calls = []; const client = createPublicAuth(async (url, options) => { calls.push({ url, options }); return response(undefined); }, 'ios');
  assert.equal((await client.register(input, 'ro')).outcome, 'rejected'); assert.equal(calls.length, 0);
  assert.equal((await client.register(input, 'ru')).outcome, 'accepted'); assert.equal(calls.length, 1);
  const form = Object.fromEntries(new URLSearchParams(calls[0].options.body));
  assert.equal(form.countryId, '10'); assert.equal(form.languageId, '2'); assert.equal(calls[0].options.headers['Accept-Language'], 'ru');
  assert.equal(form.region, undefined); assert.equal(form.language, undefined);
});

test('phone locale supplies first-run interface language without overwriting stored preference', async () => {
  for (const [stored, expected] of [[null, 'en'], ['ru', 'ru'], ['unrecognized', 'en']]) {
    const writes = []; const store = new LanguagePreferenceStore({ read: async () => stored, write: async language => writes.push(language) }, 'en');
    await store.start(); assert.equal(store.getSnapshot().language, expected); assert.equal(store.getSnapshot().ready, true); assert.deepEqual(writes, []);
  }
});

test('registration-country prefill applies only to new editable social profiles supported by current server metadata', () => {
  const profile = { firstName: 'Provided', lastName: 'Name', email: 'provider@example.test', countryId: '', phone: '', phoneCode: '' };
  const pending = { isNew: true, editableFields: ['countryId'], formats: { countries: [{ id: '20' }] }, profile };
  assert.deepEqual(initialSocialProfile(pending, '20'), { ...profile, countryId: '20' });
  for (const variant of [{ ...pending, isNew: false }, { ...pending, editableFields: [] }]) assert.equal(initialSocialProfile(variant, '20'), profile);
  assert.equal(initialSocialProfile(pending, '999'), profile);
  assert.equal(initialSocialProfile(pending), profile);
});
