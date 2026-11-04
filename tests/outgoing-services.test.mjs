import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOutgoingServices, outgoingServiceReview, validateOutgoingServiceMutation, planOutgoingServicesRead, planOutgoingServiceMutation, outgoingServiceConfirmed, changeOutgoingService } from '../src/api/outgoing-services.ts';
import { planRead, planMutation } from '../src/api/operations-contracts.ts';
import { LiveAccountService } from '../src/api/service.ts';
import { API_ORIGIN } from '../src/api/client.ts';

const fixture = (changes = {}) => ({ keyName: 'invoice-creation', title: 'Factura &amp; documente', description: '<p>Prețul &icirc;n cont</p>', price: '30.00', currency: 'ron', state: 'available', enabled: false, canRequest: true, canCancel: false, mutationMode: 'state-v1', revision: 'a'.repeat(64), ...changes });
const item = changes => normalizeOutgoingServices([fixture(changes)])[0];
const command = (changes = {}, enabled = true) => ({ kind: 'outgoing.service.set', id: '123', service: 'invoice-creation', enabled, review: outgoingServiceReview(item(changes)) });
const requested = changes => item({ state: 'requested', enabled: true, canRequest: false, canCancel: true, revision: 'b'.repeat(64), ...changes });

test('legacy catalog stays visible and strictly read-only; translated descriptions/prices are preserved', () => {
  const data = normalizeOutgoingServices([{ keyName: 'hold-parcel', title: 'Hold', description: '<b>Every 30 days</b>', price: '0', currency: 'usd' }, fixture(), { keyName: 'future-service', price: 'unknown' }]);
  assert.equal(data.length, 2); assert.equal(data[0].price, 0); assert.equal(data[0].currency, 'USD');
  assert.equal(data[0].state, 'unknown'); assert.equal(data[0].canRequest, false); assert.equal(data[0].canCancel, false);
  assert.equal(data[1].title, 'Factura & documente'); assert.equal(data[1].description, 'Prețul în cont');
  assert.equal(data[1].price, 30); assert.equal(data[1].currency, 'RON');
  assert.equal(item({ price: null }).price, null);
});

test('malformed identity/state/price cannot become an enabled paid service', () => {
  for (const change of [{ price: '30x' }, { price: -1 }, { currency: 'RON & USD' }, { revision: 'bad' }, { state: 'future' }, { enabled: null }, { enabled: true }, { state: 'completed', canRequest: true }]) assert.throws(() => item(change));
  assert.throws(() => normalizeOutgoingServices([fixture(), fixture()]));
  assert.throws(() => validateOutgoingServiceMutation(command({ price: null }), [item({ price: null })]));
});

test('registered commands use opt-in reads and absolute form writes; never a legacy toggle', () => {
  const read = planRead({ kind: 'outgoing.services', id: '123' }); assert.equal(read.path, '/api/outgoing-service/123?state=1');
  assert.equal(planOutgoingServicesRead({ kind: 'outgoing.services', id: '123' }).path, read.path);
  const write = planMutation(command());
  assert.equal(write.path, '/api/outgoing-service/123'); assert.equal(write.method, 'POST'); assert.equal(write.encoding, 'form');
  assert.deepEqual(write.fields, { serviceKey: 'invoice-creation', enabled: '1', expectedRevision: 'a'.repeat(64) });
  assert.deepEqual(write.invalidate, ['sent', 'received', 'balance']);
  assert.equal(planOutgoingServiceMutation(command({}, false)).fields.enabled, '0');
  assert.throws(() => planRead({ kind: 'outgoing.services', id: '123&member=5' }));
  assert.throws(() => planOutgoingServiceMutation({ ...command(), service: 'invented' }));
  assert.throws(() => write.normalize({ code: 200, error: false, message: 'Error' }));
  assert.deepEqual(write.normalize({ code: '200', error: '0', message: 'Ok' }), { success: true });
});

test('fresh-state preflight rejects completed, unauthorized, differently priced, stale or legacy service', () => {
  validateOutgoingServiceMutation(command(), [item()]);
  for (const current of [[], [requested()], [item({ price: '31' })], [item({ currency: 'EUR' })], [item({ canRequest: false })], [item({ revision: 'c'.repeat(64) })], [item({ mutationMode: undefined, revision: undefined })]]) assert.throws(() => validateOutgoingServiceMutation(command(), current));
  const before = requested(); validateOutgoingServiceMutation(command({ ...fixture(), ...{ state: 'requested', enabled: true, canRequest: false, canCancel: true, revision: 'b'.repeat(64) } }, false), [before]);
});

test('acknowledgement alone is not success; readback verifies all three services without repeating a write', async () => {
  for (const service of ['invoice-creation', 'reinclude-request', 'hold-parcel']) {
    const input = { ...command(), service }; let writes = 0, reads = 0;
    const result = await changeOutgoingService(input, async () => { writes++; return { ok: true }; }, async () => { reads++; return [{ ...requested(), key: service }]; });
    assert.equal(result.outcome, 'confirmed'); assert.equal(writes, 1); assert.equal(reads, 1);
    assert.equal(outgoingServiceConfirmed(input, []), false);
  }
});

test('timeout reconciles read-only; unchanged or failed read stays unknown; a rejected write never reads as success', async () => {
  let writes = 0, reads = 0;
  const send = async () => { writes++; return { ok: false, outcome: 'unknown' }; };
  assert.equal((await changeOutgoingService(command(), send, async () => { reads++; return [requested()]; })).outcome, 'confirmed');
  assert.equal((await changeOutgoingService(command(), send, async () => { reads++; return [item()]; })).outcome, 'unknown');
  assert.equal((await changeOutgoingService(command(), send, async () => { reads++; throw Error('offline'); })).outcome, 'unknown');
  assert.equal((await changeOutgoingService(command(), async () => ({ ok: false, outcome: 'rejected', error: 'denied' }), async () => { throw Error('must not read'); })).outcome, 'rejected');
  assert.equal(writes, 3); assert.equal(reads, 3);
  assert.equal(outgoingServiceConfirmed({ ...command(), enabled: false }, [item({ state: 'cancelled', canRequest: true })]), true);
  assert.equal(outgoingServiceConfirmed({ ...command(), enabled: false }, [requested()]), false);
});

test('live service performs authenticated fresh preflight and blocks a stale request before any POST', async () => {
  const now = 1790000000000; const calls = []; let current = fixture({ revision: 'b'.repeat(64) });
  const service = new LiveAccountService(async (path, options = {}) => {
    if (path.startsWith('/api/outgoing-service/')) {
      calls.push({ path, write: options.write, token: options.token });
      return options.write ? { code: 200, error: false, message: 'Ok' } : [current];
    }
    if (path === '/api/member/me') return { member: { id: '7', email: 'test@example.test' } };
    if (path === '/api/member/personal-data') return { name: 'First', surname: 'Last', countryId: '143', countries: [{ id: '143', title: 'Moldova' }], phoneCode: '+373', phone: '60000000' };
    if (path === '/api/member/counters') return { awaiting: 0, incoming: 0, outgoing: 0, received: 0 };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-outgoing', expiresAt: now + 3600000 }), write: async () => {}, clear: async () => {} }, () => now);
  await service.start();
  const rejected = await service.mutate(command()); assert.equal(rejected.ok, false); assert.equal(rejected.outcome, 'rejected'); assert.equal(calls.filter(call => call.write).length, 0);
  current = fixture(); const confirmed = await service.mutate(command()); assert.equal(confirmed.ok, true);
  assert.equal(calls.filter(call => call.write).length, 1); assert(calls.every(call => call.token === 'synthetic-outgoing'));
  assert.equal(calls.at(-2).path, '/api/outgoing-service/123?state=1'); assert.equal(calls.at(-1).write.fields.enabled, '1');
});
