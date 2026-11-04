import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiContractError, normalizeShipmentDetailData } from '../src/api/normalize.ts';
import { normalizeShipmentTracking } from '../src/api/shipment-tracking.ts';
import { OperationValidationError, planRead } from '../src/api/operations-contracts.ts';
import { API_ORIGIN } from '../src/api/client.ts';
import { LiveAccountService } from '../src/api/service.ts';

const checkpoint = (status, date_time, more = {}) => ({ status, date_time, location: 'Warehouse address', courier: { name: 'Road Express', title: 'Road Express' }, ...more });
const payload = { service_name: null, tracking_status: 'TRACKED', checkpoints: [
  checkpoint('În tranzit', '2026-10-29 15:41:00'),
  checkpoint('Gata pentru expediere', '2026-10-26 21:37:00'),
  checkpoint('Creat', '2026-10-26 20:43:00'),
] };

test('shipment progress preserves server percent, hold color and loading independently', () => {
  const progressData = { type: 'success', percent: 40, inProgress: true, label: 'În tranzit', storageDaysLabel: '' };
  const sent = normalizeShipmentDetailData({ id: '1', status: 'sent', progressData });
  assert.deepEqual(sent.progress, { ...progressData, storageDaysLabel: null });
  assert.equal(sent.statusLabel, sent.progress.label);
  const hold = normalizeShipmentDetailData({ id: '1', status: 'sent', currentStatus: 'customs-held', progressData: { ...progressData, type: 'danger', percent: 100, inProgress: false, label: 'Documente necesare' } });
  assert.equal(hold.progress.percent, 100);
  assert.equal(hold.stage, 'sent', '100% is not proof that the parcel was received');
  assert.equal(hold.progress.type, 'danger');
  const storage = normalizeShipmentDetailData({ id: '1', status: 'sent', progressData: { ...progressData, type: 'danger', percent: 60, inProgress: true, storageDaysLabel: 'Depozitare plătită, 2 zile' } });
  assert.equal(storage.progress.inProgress, true, 'backend can set storage danger after calculating loading');
  assert.equal(storage.progress.storageDaysLabel, 'Depozitare plătită, 2 zile');
});

test('absent progress remains unknown and malformed values cannot create a false percentage', () => {
  assert.equal(normalizeShipmentDetailData({ id: '1', status: 'sent' }).progress, null);
  const partial = normalizeShipmentDetailData({ id: '1', status: 'sent', progressData: { label: 'A&nbsp;&amp;&nbsp;B' } }).progress;
  assert.equal(partial.label, 'A & B');
  assert.equal(partial.percent, null);
  assert.equal(partial.inProgress, null);
  for (const percent of [-1, 101, 'NaN', {}, Infinity]) assert.throws(() => normalizeShipmentDetailData({ id: '1', status: 'sent', progressData: { percent } }), ApiContractError);
  assert.throws(() => normalizeShipmentDetailData({ id: '1', status: 'sent', progressData: { inProgress: 'yes' } }), ApiContractError);
});

test('tracking retains exact newest-first server history including distinct same-time events', () => {
  const raw = { ...payload, checkpoints: [checkpoint('Reținut', '2026-10-30 15:41:00'), checkpoint('Eliberat', '2026-10-30 15:41:00'), ...payload.checkpoints] };
  const result = normalizeShipmentTracking(raw);
  assert.deepEqual(result.checkpoints.map(item => item.status), ['Reținut', 'Eliberat', 'În tranzit', 'Gata pentru expediere', 'Creat']);
  assert.equal(result.checkpoints[0].location, 'Warehouse address');
  assert.equal(result.checkpoints[0].courier.title, 'Road Express');
  assert.equal(result.checkpoints[0].dateTime, '2026-10-30 15:41:00');
  assert.equal(result.sentAt, null, 'new backend omits optional legacy summary dates');
  assert.equal(result.updatedAt, null);
  assert.equal(result.trackingStatus, 'TRACKED');
  assert.equal(raw.checkpoints.length, 5);
});

test('tracking decodes server text while preserving missing address/status and original wall-clock time', () => {
  const result = normalizeShipmentTracking({ ...payload, sent_time: '2026-10-29 15:41', update_time: '2026-10-30 16:12', checkpoints: [
    checkpoint('<b>Livrat</b> &amp; primit', '2026-10-30 15:41:00', { time: '15:41', location: 'A&nbsp;&amp;&nbsp;B', courier: { name: 'dpd', title: 'DPD &amp; Partner' } }),
    { status: '', location: null, date: '2026-10-28 13:00:00', courier: null },
  ] });
  assert.equal(result.checkpoints[0].status, 'Livrat & primit');
  assert.equal(result.checkpoints[0].location, 'A & B');
  assert.equal(result.checkpoints[0].courier.title, 'DPD & Partner');
  assert.equal(result.checkpoints[0].dateTime, '2026-10-30 15:41:00');
  assert.equal(result.checkpoints[0].time, '15:41');
  assert.deepEqual(result.checkpoints[1], { status: null, location: null, dateTime: '2026-10-28 13:00:00', time: null, courier: null });
  assert.equal(result.sentAt, '2026-10-29 15:41');
});

test('missing tracking data fails distinctly from an explicit empty history', () => {
  assert.deepEqual(normalizeShipmentTracking({ ...payload, checkpoints: [] }).checkpoints, []);
  for (const raw of [null, [], {}, { checkpoints: null }, { checkpoints: {} }, { checkpoints: [null] }, { checkpoints: [{ status: {} }] }, { checkpoints: [{ courier: [] }] }, { checkpoints: [{ date_time: 123 }] }]) assert.throws(() => normalizeShipmentTracking(raw), ApiContractError);
});

test('tracking route accepts parcel UIDs and rejects path/query injection', () => {
  const plan = planRead({ kind: 'shipment.tracking.read', uid: 'R8157261' });
  assert.equal(plan.path, '/api/parcel-tracking/R8157261');
  assert.equal(plan.normalize(payload).checkpoints.length, 3);
  for (const uid of ['', '../member', 'R1?x=1', 'R1/2', 'R1#x', 'R1%2F2', 'R1\n', 'R 1', 'a'.repeat(101), 123]) assert.throws(() => planRead({ kind: 'shipment.tracking.read', uid }), OperationValidationError);
});

test('tracking is requested only on demand with account and language scope; late language results are discarded', async () => {
  const now = 1790000000000, calls = [];
  let pendingResolve = null;
  const saved = JSON.stringify({ origin: API_ORIGIN, token: 'synthetic-tracking-session', expiresAt: now + 3600000 });
  const service = new LiveAccountService(async (path, options) => {
    if (path.startsWith('/api/parcel-tracking/')) {
      calls.push({ path, options });
      if (pendingResolve === false) return new Promise(resolve => { pendingResolve = resolve; });
      return payload;
    }
    if (path === '/api/auth') return { id: '123', name: 'Synthetic' };
    if (path === '/api/member/me') return { id: '123', email: 'synthetic@example.test' };
    if (path === '/api/member/personal-data') return {};
    if (path === '/api/refund-request') return { memberBalance: [] };
    return [];
  }, { read: async () => saved, write: async () => {}, clear: async () => {} }, () => now, 'ru');
  await service.start(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 0, 'opening account/detail must not fetch timeline eagerly');
  assert.equal((await service.readView({ kind: 'shipment.tracking.read', uid: 'R8157261' })).checkpoints.length, 3);
  assert.equal(calls[0].options.token, 'synthetic-tracking-session');
  assert.equal(calls[0].options.language, 'ru');
  assert.equal(calls[0].options.write, undefined);
  pendingResolve = false;
  const pending = service.readView({ kind: 'shipment.tracking.read', uid: 'R8157261' });
  service.setLanguage('en');
  assert.equal(calls[1].options.signal.aborted, true);
  pendingResolve(payload);
  await assert.rejects(pending, error => error.key === 'errors.cancelled');
  await service.logout();
  await assert.rejects(service.readView({ kind: 'shipment.tracking.read', uid: 'R8157261' }), error => error.status === 401);
  assert.equal(calls.length, 2, 'signed-out account cannot fetch parcel history');
});
