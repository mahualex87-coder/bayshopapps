import test from 'node:test';
import assert from 'node:assert/strict';
import { socialProfileErrors, updateSocialProfile, socialErrorKey } from '../src/features/auth/social-completion.ts';
import { socialCompletionFields } from '../src/api/native-social-auth.ts';
import { planMutation } from '../src/api/operations-contracts.ts';

const fields = ['firstName', 'lastName', 'phone', 'phoneCode', 'countryId'];
const profile = { firstName: 'QA', lastName: 'Test', email: 'qa@example.test', phone: '60123456', phoneCode: '+373', countryId: '143' };
const pending = { status: 'completion_required', pendingToken: 'a'.repeat(64), expiresAt: '2099-01-01T00:00:00Z', isNew: true, profile, editableFields: fields, requiredFields: fields, termsRequired: true, formats: { countries: [{ id: '143', title: 'Moldova', code: 'MD' }], phoneCodes: [], regions: [], cities: [] } };
test('new social account requires explicit terms and all required data', () => {
  assert.deepEqual(socialProfileErrors(pending, profile, true), {});
  assert.equal(socialProfileErrors(pending, profile, false).terms, 'socialAuth.error.terms_required');
  for (const field of fields) assert.ok(socialProfileErrors(pending, { ...profile, [field]: '' }, true)[field]);
  assert.ok(socialProfileErrors(pending, { ...profile, countryId: '999' }, true).countryId);
  assert.ok(socialProfileErrors(pending, { ...profile, phone: 'not-a-phone' }, true).phone);
});
test('existing social account can complete only missing fields and never submits email', () => {
  const existing = { ...pending, isNew: false, termsRequired: false, profile: { ...profile, phone: '' }, editableFields: ['phone'], requiredFields: ['phone'] };
  assert.equal(updateSocialProfile(existing, existing.profile, 'firstName', 'Changed'), existing.profile);
  const completed = updateSocialProfile(existing, existing.profile, 'phone', '60123456');
  assert.equal(completed.firstName, 'QA');
  assert.deepEqual(socialProfileErrors(existing, completed, false), {});
  assert.deepEqual(socialCompletionFields(existing, { ...completed, email: 'other@example.test', firstName: 'Changed' }, false), { phone: '60123456' });
});
test('expired completion is blocked locally and unknown errors do not leak raw text', () => {
  assert.equal(socialProfileErrors({ ...pending, expiresAt: '2020-01-01T00:00:00Z' }, profile, true).session, 'socialAuth.error.flow_expired');
  assert.equal(socialErrorKey('secret-token-or-server-payload'), 'socialAuth.error.request_failed');
  assert.equal(socialErrorKey('account_link_required'), 'socialAuth.error.account_link_required');
});
test('stock label request explicitly enables the service instead of cancelling it', () => {
  const plan = planMutation({ kind: 'stock.label.request', id: '301' });
  assert.equal(plan.method, 'POST'); assert.equal(plan.path, '/api/label-request/');
  assert.deepEqual(plan.fields, { id: '301', enable: '1' });
});
