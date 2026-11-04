import assert from 'node:assert/strict';
import test from 'node:test';
import { API_ORIGIN, ApiError } from '../src/api/client.ts';
import { LiveAccountService } from '../src/api/service.ts';
import { normalizeRecipientAddressesData } from '../src/api/normalize.ts';
import { planRead } from '../src/api/operations-contracts.ts';

const NOW = 1790000000000;
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const recipient = (permission, recipientId = '10') => ({ id: recipientId, first_name: 'Synthetic', last_name: 'Recipient', ...(permission === undefined ? {} : { isEditable: permission }) });
const commands = [{ kind: 'recipient.save', id: '10', input: { shipping_first_name: 'Updated synthetic' } }, { kind: 'recipient.delete', id: '10' }];
function baseline(path) {
  if (path === '/api/auth') return { id: '1', name: 'Synthetic' };
  if (path === '/api/member/personal-data') return { phoneCode: '+373', phone: '00000000' };
  if (path === '/api/member/counters') return { awaiting: '0', cart: '0', orders: '0', incoming: '0', outgoing: '0', received: '0' };
  if (path.startsWith('/api/balance?')) return { balanceList: {} };
  if (path === '/api/refund-request') return { memberBalance: [] };
  return [];
}
async function harness() {
  let list = [recipient(true)]; let permissionRead = null;
  const calls = [];
  const session = JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-token', expiresAt: NOW + 3600000 });
  const service = new LiveAccountService(async (path, options) => {
    calls.push({ path, options });
    if (options.write) return { code: 200, error: false, message: 'Ok' };
    if (path === '/api/member-address') return permissionRead ? permissionRead(options) : list;
    return baseline(path);
  }, { read: async () => session, write: async () => {}, clear: async () => {} }, () => NOW);
  await service.start(); await flush(); calls.length = 0;
  return { service, calls, list: value => { list = value; }, read: value => { permissionRead = value; } };
}

test('recipient permissions preserve explicit booleans and never grant missing metadata', () => {
  assert.deepEqual(normalizeRecipientAddressesData([recipient(true), recipient(false, '11'), recipient(undefined, '12')]).map(value => value.isEditable), [true, false, null]);
  for (const value of ['true', '1', 1, [], {}]) assert.throws(() => normalizeRecipientAddressesData([recipient(value)]));
  const plan = planRead({ kind: 'recipients.read' });
  assert.equal(plan.path, '/api/member-address'); assert.equal(plan.normalize([recipient(false)])[0].isEditable, false);
});

test('existing recipient save/delete recheck server permission rather than trusting a stale editable list', async () => {
  for (const command of commands) for (const permission of [false, undefined]) {
    const h = await harness(); assert.equal(h.service.getSnapshot().resources.recipients.data[0].isEditable, true);
    h.list([recipient(permission)]);
    const result = await h.service.mutate(command);
    assert.equal(result.ok, false); assert.equal(result.outcome, 'rejected');
    assert.equal(result.error, permission === false ? 'accountOps.recipientReadOnly' : 'accountOps.recipientPermissionUnavailable');
    assert.equal(h.calls.filter(call => call.options.write).length, 0);
    assert.equal(h.calls.filter(call => call.path === '/api/member-address').length, 1);
    assert.equal(h.service.getSnapshot().mutation.pending, false);
  }
});

test('missing recipients and failed/malformed permission reads cannot dispatch a write', async () => {
  for (const failure of ['absent', 'network', 'malformed']) {
    const h = await harness();
    if (failure === 'absent') h.list([]);
    if (failure === 'network') h.read(async () => { throw new ApiError(0, 'errors.network'); });
    if (failure === 'malformed') h.list([recipient('yes')]);
    const result = await h.service.mutate(commands[0]);
    assert.equal(result.ok, false); assert.equal(result.outcome, 'rejected');
    assert.notEqual(result.error, 'errors.mutationUnknown');
    assert.equal(h.calls.filter(call => call.options.write).length, 0);
  }
});

test('explicit fresh permission allows exactly one mutation; creating a recipient needs no existing permission', async () => {
  for (const command of [...commands, { kind: 'recipient.save', input: { shipping_first_name: 'New synthetic' } }]) {
    const h = await harness(); const result = await h.service.mutate(command);
    assert.equal(result.ok, true); assert.equal(h.calls.filter(call => call.options.write).length, 1);
    const first = h.calls[0];
    assert.equal(!!first.options.write, !command.id, 'existing recipients require read before write; create does not');
  }
});

test('permission preflight locks duplicate writes and cancellation cannot escape into a later POST', async () => {
  const h = await harness(); const pending = deferred(); let signal;
  h.read(options => { signal = options.signal; return pending.promise; });
  const saving = h.service.mutate(commands[0]);
  assert.equal(h.service.getSnapshot().mutation.pending, true); assert.equal(h.service.setLanguage('ru'), false);
  assert.equal((await h.service.mutate(commands[1])).error, 'errors.mutationInProgress');
  await h.service.logout(); assert.equal(signal.aborted, true);
  assert.equal(h.service.getSnapshot().notice, null, 'a cancelled read is not an uncertain server write');
  pending.resolve([recipient(true)]);
  assert.deepEqual(await saving, { ok: false, error: 'errors.cancelled', outcome: 'rejected' });
  assert.equal(h.calls.filter(call => call.options.write).length, 0);
});
