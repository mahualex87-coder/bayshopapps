import assert from 'node:assert/strict';
import test from 'node:test';
import { API_ORIGIN, ApiError } from '../src/api/client.ts';
import { planMutation, OperationValidationError } from '../src/api/operations-contracts.ts';
import { LiveAccountService } from '../src/api/service.ts';

const NOW = 1790000000000;
const ack = { code: 200, error: false, message: 'Ok' };
const command = { kind: 'waiting.passcode.save', id: '10', passcode: '001-ABC' };
const detail = permission => ({ id: '10', declarations: [], passcodeAllowed: permission, passcode: null });
async function harness(permission, readOverride, writeOverride) {
  const calls = [];
  const service = new LiveAccountService(async (path, options) => {
    calls.push({ path, options });
    if (options.write) return writeOverride ? writeOverride(options) : ack;
    if (path === '/api/waiting-mf/10') return readOverride ? readOverride(options) : detail(permission);
    if (path === '/api/auth') return { id: '1', name: 'Synthetic' };
    if (path === '/api/member/personal-data') return {};
    if (path === '/api/member/counters') return { awaiting: '0', incoming: '0', outgoing: '0', received: '0' };
    if (path.startsWith('/api/balance?')) return { balanceList: {} };
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-token', expiresAt: NOW + 3600000 }), write: async () => {}, clear: async () => {} }, () => NOW);
  await service.start(); await new Promise(resolve => setImmediate(resolve)); calls.length = 0;
  return { service, calls };
}

test('passcode uses exactly the source-confirmed form field and preserves leading zeros and literal text', () => {
  const plan = planMutation(command);
  assert.equal(plan.path, '/api/waiting-mf-passcode/10'); assert.equal(plan.method, 'POST'); assert.equal(plan.encoding, 'form');
  assert.deepEqual(plan.fields, { passcode: '001-ABC' }); assert.deepEqual(plan.normalize(ack), { success: true });
  assert.deepEqual(planMutation({ ...command, passcode: '' }).fields, { passcode: '' }, 'explicit empty value removes existing code');
  for (const value of ['0', '  ', '12\n34', null, 123]) assert.throws(() => planMutation({ ...command, passcode: value }), OperationValidationError);
  assert.throws(() => plan.normalize({ ...ack, error: true }));
});

test('fresh false, absent or malformed passcode permission never dispatches a write', async () => {
  for (const permission of [false, undefined, 'yes']) {
    const h = await harness(permission); const result = await h.service.mutate(command);
    assert.equal(result.ok, false); assert.equal(result.outcome, 'rejected');
    assert.equal(h.calls.filter(x => x.options.write).length, 0);
  }
  const h = await harness(true, async () => { throw new ApiError(0, 'errors.network'); });
  assert.equal((await h.service.mutate(command)).outcome, 'rejected'); assert.equal(h.calls.filter(x => x.options.write).length, 0);
});

test('fresh passcode permission precedes exactly one explicit write and validates response identity', async () => {
  const h = await harness(true); const result = await h.service.mutate(command);
  assert.equal(result.ok, true); assert.equal(h.calls[0].path, '/api/waiting-mf/10'); assert.equal(h.calls.filter(x => x.options.write).length, 1);
  const mismatch = await harness(true, async () => ({ ...detail(true), id: '11' }));
  assert.equal((await mismatch.service.mutate(command)).ok, false); assert.equal(mismatch.calls.filter(x => x.options.write).length, 0);
});

test('passcode permission read locks duplicate mutation and cancellation cannot become a later POST', async () => {
  let resolve; let signal; const pending = new Promise(r => { resolve = r; });
  const h = await harness(true, options => { signal = options.signal; return pending; });
  const saving = h.service.mutate(command);
  assert.equal((await h.service.mutate(command)).error, 'errors.mutationInProgress');
  await h.service.logout(); assert.equal(signal.aborted, true); resolve(detail(true));
  assert.equal((await saving).outcome, 'rejected'); assert.equal(h.calls.filter(x => x.options.write).length, 0);
});

test('explicit removal keeps its empty form field and an uncertain acknowledgement is never retried', async () => {
  const h = await harness(true, undefined, async () => ({ code: 200, error: false, message: 'unexpected' }));
  const result = await h.service.mutate({ ...command, passcode: '' });
  assert.equal(result.ok, false); assert.equal(result.outcome, 'unknown');
  await new Promise(resolve => setImmediate(resolve));
  const writes = h.calls.filter(x => x.options.write);
  assert.equal(writes.length, 1); assert.deepEqual(writes[0].options.write.fields, { passcode: '' });
});
