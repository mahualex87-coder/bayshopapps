import assert from 'node:assert/strict';
import test from 'node:test';
import { API_ORIGIN, ApiError } from '../src/api/client.ts';
import { LiveAccountService } from '../src/api/service.ts';
import { planMutation } from '../src/api/operations-contracts.ts';
import { normalizeMemberEmailData, profileDraftFields, validateProfileUpdate } from '../src/api/profile-identity.ts';

const NOW = 1790000000000;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const personal = { name: 'Prenume real', surname: 'Nume real', countryId: '143', countries: [{ id: '143', title: 'Moldova' }, { id: '179', title: 'România' }], phoneCode: '+373', phone: '60000000' };
const auth = id => ({ id, name: `Name ${id}`, surname: `Surname ${id}`, access_token: `synthetic-${id}`, expires_in: 3600, token_type: 'Bearer' });
function storage() {
  let value = JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-A', expiresAt: NOW + 3600000 });
  return { read: async () => value, write: async next => { value = next; }, clear: async () => { value = null; }, value: () => value };
}
function baseline(path, options) {
  const id = options.token === 'synthetic-B' ? 'B' : 'A';
  if (options.login) return auth(options.login.email.startsWith('b@') ? 'B' : 'A');
  if (path === '/api/auth') return auth(id);
  if (path === '/api/member/personal-data') return personal;
  if (path === '/api/member/me') return { member: { id, email: `${id.toLowerCase()}@server.example`, password: 'synthetic-unused-secret', token: 'synthetic-unused-token', role: 'member' } };
  if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
  if (path === '/api/refund-request') return { memberBalance: [] };
  return [];
}

test('member email selects only the matching authenticated account and preserves the exact email', () => {
  assert.equal(normalizeMemberEmailData({ member: { id: 143, email: 'Real.Name@Example.test', password: 'unused' } }, '143'), 'Real.Name@Example.test');
  assert.equal(normalizeMemberEmailData({ member: { id: '143', email: null } }, '143'), null);
  for (const raw of [{ member: { id: '144', email: 'other@example.test' } }, { member: { id: '143' } }, { member: { id: '143', email: [] } }, { member: { id: '143', email: 'x@example.test\nheader' } }, {}, null]) assert.throws(() => normalizeMemberEmailData(raw, '143'));
});

test('profile updates omit protected identity and existing phone without changing other values', () => {
  const fields = profileDraftFields(personal, { ...personal, countryId: '179', name: 'Attempted overwrite', email: 'new@example.test' });
  assert.deepEqual(fields, { country_id: '179' });
  const serialized = { ...fields, phone: personal.phone };
  assert.deepEqual(validateProfileUpdate(fields, personal), { fields: serialized, errors: {} });
  assert.deepEqual(validateProfileUpdate({ country_id: '179', phone_code: '+373', phone: '60000000' }, personal), { fields: serialized, errors: {} }, 'Echo only fresh unchanged phone for the legacy required-field check, not a new value');
  for (const key of ['name', 'surname', 'email']) assert.throws(() => planMutation({ kind: 'profile.save', input: { [key]: 'changed' } }));
  assert.throws(() => planMutation({ kind: 'profile.save', input: {} }));
});

test('a first phone is allowed; missing identity, changed existing phone and unavailable countries are rejected', () => {
  const first = { ...personal, phone: '', phoneCode: '' };
  assert.deepEqual(validateProfileUpdate({ phone: '60000001', phone_code: '+373' }, first), { fields: { phone: '60000001', phone_code: '+373' }, errors: {} });
  assert.equal(validateProfileUpdate({ country_id: '999' }, personal).errors.country_id, 'accountOps.selectCountry');
  assert.equal(validateProfileUpdate({ phone: '60000001' }, personal).errors.phone, 'profileIdentity.phoneProtected');
  assert.equal(validateProfileUpdate({ country_id: '179' }, { ...personal, name: '' }).errors.identity, 'profileIdentity.incomplete');
  assert.equal(validateProfileUpdate({ phone: '12', phone_code: 'x' }, first).errors.phone, 'accountOps.invalidPhone');
});

test('restored sessions recover the server email without persisting the member row or login text', async () => {
  const saved = storage(); const original = saved.value();
  const service = new LiveAccountService(async (path, options) => baseline(path, options), saved, () => NOW);
  await service.start(); await flush();
  const profile = service.getSnapshot().resources.profile.data;
  assert.equal(profile.email, 'a@server.example');
  assert.equal(profile.emailError, null);
  assert.equal(profile.firstName, 'Name A');
  assert.equal(saved.value(), original);
  assert.equal(JSON.stringify(service.getSnapshot()).includes('synthetic-unused'), false);
  await service.login('b@login.example', 'synthetic-password'); await flush();
  assert.equal(service.getSnapshot().resources.profile.data.email, 'b@server.example', 'Server value wins over the typed login');
  assert.equal(JSON.stringify(saved.value()).includes('server.example'), false);
});

test('email failure is partial and cannot hide the valid profile or substitute an unverified email', async () => {
  for (const failure of [new ApiError(503, 'errors.serverUnavailable'), { member: { id: 'wrong-account', email: 'other@example.test' } }]) {
    const service = new LiveAccountService(async (path, options) => { if (path === '/api/member/me') { if (failure instanceof Error) throw failure; return failure; } return baseline(path, options); }, storage(), () => NOW);
    await service.start(); await flush();
    const resource = service.getSnapshot().resources.profile;
    assert.equal(resource.error, null);
    assert.equal(resource.data.firstName, 'Name A');
    assert.equal(resource.data.phone, '+37360000000');
    assert.equal(resource.data.email, null);
    assert.ok(resource.data.emailError);
  }
});

test('401 while reading email expires the entire session', async () => {
  const saved = storage();
  const service = new LiveAccountService(async (path, options) => { if (path === '/api/member/me') throw new ApiError(401, 'errors.sessionExpired'); return baseline(path, options); }, saved, () => NOW);
  await service.start(); await flush();
  assert.equal(service.getSnapshot().authenticated, false);
  assert.equal(service.getSnapshot().resources.profile.data, null);
  assert.equal(saved.value(), null);
});

test('late email from an old account cannot be assigned to a new sign-in', async () => {
  const old = deferred(); let signal;
  const service = new LiveAccountService(async (path, options) => { if (path === '/api/member/me' && options.token === 'synthetic-A') { signal = options.signal; return old.promise; } return baseline(path, options); }, storage(), () => NOW);
  await service.start(); await flush();
  await service.logout();
  assert.equal(signal.aborted, true);
  await service.login('b@login.example', 'synthetic-password'); await flush();
  old.resolve({ member: { id: 'A', email: 'a@old.example' } }); await flush();
  assert.equal(service.getSnapshot().resources.profile.data.id, 'B');
  assert.equal(service.getSnapshot().resources.profile.data.email, 'b@server.example');
});

test('country save rereads permissions and preserves the exact current phone required by legacy validation', async () => {
  const writes = [];
  const service = new LiveAccountService(async (path, options) => { if (options.write) { writes.push(options.write.fields); return { code: 200, error: false, message: 'Ok' }; } return baseline(path, options); }, storage(), () => NOW);
  await service.start(); await flush();
  const result = await service.mutate({ kind: 'profile.save', input: { country_id: '179' } });
  assert.equal(result.ok, true);
  assert.deepEqual(writes, [{ country_id: '179', phone: personal.phone }]);
  assert.equal(service.getSnapshot().resources.profile.data.email, 'a@server.example');
});

test('a stale form cannot change a phone filled on another device; protected fields never dispatch', async () => {
  let writes = 0;
  const service = new LiveAccountService(async (path, options) => { if (options.write) writes++; return baseline(path, options); }, storage(), () => NOW);
  await service.start(); await flush();
  const result = await service.mutate({ kind: 'profile.save', input: { phone: '60000099' } });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.fieldErrors.phone, 'profileIdentity.phoneProtected');
  assert.equal((await service.mutate({ kind: 'profile.save', input: { name: 'Changed' } })).ok, false);
  assert.equal(writes, 0);
});

test('logout during profile preflight cancels before dispatching a write', async () => {
  const current = deferred(); let pending = false; let writes = 0;
  const service = new LiveAccountService(async (path, options) => { if (options.write) writes++; if (pending && path === '/api/member/personal-data') return current.promise; return baseline(path, options); }, storage(), () => NOW);
  await service.start(); await flush(); pending = true;
  const saving = service.mutate({ kind: 'profile.save', input: { country_id: '179' } });
  await flush(); await service.logout(); current.resolve(personal);
  assert.equal((await saving).outcome, 'rejected');
  assert.equal(writes, 0);
});
