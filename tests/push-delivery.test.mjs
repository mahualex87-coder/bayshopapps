import test from 'node:test';
import assert from 'node:assert/strict';
import { PushDelivery } from '../src/features/push/push-delivery.ts';

const message = (accountId = '10', eventId = 'synthetic_event') => ({
  data: { bs_version: '1', bs_account_id: accountId, bs_event_id: eventId, bs_target: 'shipments', bs_id: '22' },
  notification: { title: 'BayShop', body: 'Shipment updated' },
});
test('foreground receipt displays only a banner, opening it and native delivery of the same tap navigate exactly once', () => {
  const delivery = new PushDelivery(() => ({ optedIn: true }));
  delivery.setScope({ accountId: '10', revision: 1, signedOut: false });
  delivery.message(message());
  const banner = delivery.snapshot().banner;
  assert.equal(banner.body, 'Shipment updated');
  assert.equal(delivery.take('10', 1), null);
  delivery.open(banner);
  delivery.opened(message());
  assert.equal(delivery.snapshot().banner, null);
  assert.deepEqual(delivery.take('10', 1), { pathname: '/shipment/[id]', params: { id: '22', section: 'shipments' } });
  assert.equal(delivery.take('10', 1), null);
  delivery.message(message());
  assert.equal(delivery.snapshot().banner, null);
});
test('cold tap waits for restored identity and consent without leaking another account’s message', () => {
  const status = { optedIn: false, busy: true };
  const delivery = new PushDelivery(() => status);
  delivery.opened(message('20', 'other_event'));
  delivery.opened(message());
  assert.equal(delivery.take('10', 0), null);
  delivery.setScope({ accountId: '10', revision: 0, signedOut: false });
  assert.equal(delivery.take('10', 0), null);
  status.optedIn = true;
  assert.equal(delivery.take('10', 0).params.id, '22');
  delivery.setScope({ accountId: '20', revision: 1, signedOut: false });
  assert.equal(delivery.take('20', 1), null);
});
test('sign-out clears banner, pending taps and validity of a delayed unsaved-draft confirmation', () => {
  const delivery = new PushDelivery(() => ({ optedIn: true, busy: false }));
  delivery.setScope({ accountId: '10', revision: 4, signedOut: false });
  delivery.message(message());
  delivery.opened(message('10', 'second_event'));
  assert.equal(delivery.current('10', 4), true);
  delivery.setScope({ accountId: null, revision: 5, signedOut: true });
  assert.equal(delivery.current('10', 4), false);
  assert.equal(delivery.snapshot().banner, null);
  delivery.opened(message('10', 'signed_out'));
  delivery.setScope({ accountId: '10', revision: 6, signedOut: false });
  assert.equal(delivery.take('10', 6), null);
});
test('an opted-out device ignores background taps and foreground messages', () => {
  const status = { optedIn: false, busy: false };
  const delivery = new PushDelivery(() => status);
  delivery.setScope({ accountId: '10', revision: 1, signedOut: false });
  delivery.message(message());
  delivery.opened(message());
  assert.equal(delivery.snapshot().banner, null);
  status.optedIn = true;
  assert.equal(delivery.take('10', 1), null);
});

test('a tap before a real registration controller restores its secure record survives until launch and account are ready', async () => {
  const { createPushRegistration } = await import('../src/features/push/push-registration.ts');
  let finishRead;
  const stored = new Promise(resolve => { finishRead = resolve; });
  const registration = createPushRegistration({
    read: () => stored, save: async () => {}, permission: async () => 'granted',
    request: async () => { assert.fail('restoring must not request permission'); },
    token: async () => 'current-address', bind: async () => ({ release: async () => {} }), clear: async () => {},
  });
  const delivery = new PushDelivery(registration.snapshot);
  delivery.opened(message());
  const beforeRestore = registration.snapshot();
  assert.equal(beforeRestore.busy, false);
  assert.equal(beforeRestore.optedIn, false);
  delivery.setScope({ accountId: '10', signedOut: false, revision: 0 });
  const restoring = registration.setSession({ accountId: '10', resolved: true, revision: 0 });
  assert.equal(registration.snapshot().busy, true);
  assert.equal(delivery.take('10', 0), null);
  // A duplicate native opened callback can arrive before secure storage resolves.
  delivery.opened(message());
  finishRead({ accountId: '10', token: 'current-address' });
  await restoring;
  assert.equal(delivery.take('10', 0).params.id, '22');
  assert.equal(delivery.take('10', 0), null);
});
