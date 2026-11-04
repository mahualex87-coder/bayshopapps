import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePaymentAttempt, paymentAttemptStorageKey, isUnopenedCardAttempt } from '../src/features/payments/payment-attempt.ts';
const attempt = { version: 1, attemptKey: '11111111-2222-4333-8444-555555555555', paymentId: null, createdAt: 12345 };

test('payment recovery retains identifiers only and isolates accounts/environments', () => {
  assert.equal(parsePaymentAttempt(null), null);
  assert.deepEqual(parsePaymentAttempt(JSON.stringify(attempt)), attempt);
  assert.notEqual(paymentAttemptStorageKey('https://bayshop.com', '10'), paymentAttemptStorageKey('https://dev.bayshop.com', '10'));
  assert.notEqual(paymentAttemptStorageKey('https://bayshop.com', '10'), paymentAttemptStorageKey('https://bayshop.com', '11'));
});

test('PayPal resume capability is encrypted-ledger-only and bound to an exact approval URL', () => {
  const row = scoped({ paymentType: 'paypal', resumeUrl: 'https://www.paypal.com/checkoutnow?token=ORDER123456' });
  assert.equal(parsePaymentAttempt(JSON.stringify(row)).resumeUrl, row.resumeUrl);
  for (const resumeUrl of ['http://www.paypal.com/checkoutnow?token=ORDER123456', 'https://paypal.com/checkoutnow?token=ORDER123456', 'https://www.paypal.com.evil.example/checkoutnow?token=ORDER123456', 'https://user:pass@www.paypal.com/checkoutnow?token=ORDER123456', 'https://www.paypal.com/checkoutnow?token=ORDER123456&redirect_uri=https://evil.example', 'https://www.paypal.com/checkoutnow?token=A&token=B', 'https://www.paypal.com/checkoutnow?token=ORDER123456#x', 'https://www.paypal.com/login?token=ORDER123456']) assert.throws(() => parsePaymentAttempt(JSON.stringify({ ...row, resumeUrl })));
  assert.throws(() => parsePaymentAttempt(JSON.stringify({ ...row, paymentType: 'platescro' })));
  assert.throws(() => parsePaymentAttempt(JSON.stringify({ ...row, phase: 'preparing' })));
});

test('a bPay cash code does not reserve the invoice against another payment method', () => {
  const cash = scoped({ paymentType: 'terminals' });
  const card = scoped({ attemptKey: otherKey, paymentId: '43' });
  assert.deepEqual(attemptsBlockingBills([cash], ['3191122']), []);
  assert.doesNotThrow(() => parseLedger(ledger([cash, card])));
  assert.deepEqual(attemptsBlockingBills([cash, card], ['3191122']).map(a => a.attemptKey), [card.attemptKey]);
  assert.deepEqual(legacyUnscopedAttempts([{ ...attempt, paymentType: 'terminals' }]), []);
});

test('EuPlatesc resume URL is bound to the original hosted wallet payment', () => {
  const row = scoped({ hostedChannel: 'APAY', processorResumeUrl: 'https://secure.euplatesc.ro/payment?epid=synthetic' });
  assert.deepEqual(parsePaymentAttempt(JSON.stringify(row)), row);
  assert.equal(parsePaymentAttempt(JSON.stringify({ ...row, hostedChannel: 'GPAY' })).processorResumeUrl, row.processorResumeUrl);
  for (const patch of [{ paymentId: null }, { phase: 'preparing' }, { paymentType: 'paypal' }, { paymentType: 'terminals' }, { hostedChannel: 'CC' }, { hostedChannel: undefined }, { resumeUrl: 'https://www.paypal.com/checkoutnow?token=ORDER123456' }]) {
    assert.throws(() => parsePaymentAttempt(JSON.stringify({ ...row, ...patch })));
  }
  for (const processorResumeUrl of ['http://secure.euplatesc.ro/pay', 'https://secure.euplatesc.ro.evil.example/pay', 'https://user:pass@secure.euplatesc.ro/pay', 'https://secure.euplatesc.ro:443/pay', 'https://secure.euplatesc.ro/pay#fragment', 'https://www.paypal.com/checkoutnow?token=ORDER123456']) {
    assert.throws(() => parsePaymentAttempt(JSON.stringify({ ...row, processorResumeUrl })));
  }
});

test('invoice settlement is separate from provider success and permits retained audit history', () => {
  const resolved = scoped({ paymentType: 'paypal', resolution: { kind: 'invoices_paid', checkedAt: 123456 } });
  assert.deepEqual(parsePaymentAttempt(JSON.stringify(resolved)), resolved);
  assert.deepEqual(attemptsBlockingBills([resolved], ['3191122']), []);
  for (const resolution of [{kind:'cancelled',checkedAt:123}, {kind:'invoices_paid',checkedAt:0}, {kind:'invoices_paid',checkedAt:Infinity}, {kind:'invoices_paid',checkedAt:123,token:'secret'}]) assert.throws(() => parsePaymentAttempt(JSON.stringify({...resolved,resolution})));
});

test('wallet display channel cannot masquerade as another server payment type', () => {
  for (const hostedChannel of ['CC','APAY','GPAY']) assert.equal(parsePaymentAttempt(JSON.stringify(scoped({hostedChannel}))).hostedChannel,hostedChannel);
  for (const fields of [{hostedChannel:'UNKNOWN'},{hostedChannel:'APAY',paymentType:'paypal'},{hostedChannel:'GPAY',paymentType:'terminals'}]) assert.throws(() => parsePaymentAttempt(JSON.stringify(scoped(fields))));
});
test('resume selection fingerprint stores a digest, never the raw billing revision', () => {
  const selectionDigest = 'ab'.repeat(32);
  assert.equal(parsePaymentAttempt(JSON.stringify(scoped({ selectionDigest }))).selectionDigest, selectionDigest);
  for (const value of ['a'.repeat(63), 'A'.repeat(64), '{"billing":"private"}', '', null, 42]) {
    assert.throws(() => parsePaymentAttempt(JSON.stringify(scoped({ selectionDigest: value }))));
  }
});
test('malformed or secret-bearing recovery state does not authorize a new attempt', () => {
  for (const row of [{ ...attempt, token: 'forbidden' }, { ...attempt, version: 2 }, { ...attempt, paymentId: '-1' }, { ...attempt, attemptKey: 'bad' }, { ...attempt, createdAt: NaN }]) assert.throws(() => parsePaymentAttempt(JSON.stringify(row)));
  assert.throws(() => parsePaymentAttempt('invalid'));
  assert.throws(() => paymentAttemptStorageKey('http://bayshop.com', '10'));
  assert.throws(() => paymentAttemptStorageKey('https://bayshop.com', '../10'));
});

test('old v1 records remain compatible without inferring an unopened PayPal or unknown method', () => {
  for (const [fields, unopened] of [
    [{ paymentType: 'platescro' }, true],
    [{ paymentType: 'platescro', paymentId: '42' }, false],
    [{ paymentType: 'paypal' }, false],
    [{ paymentType: 'terminals' }, false],
    [{}, false],
  ]) {
    const row = { ...attempt, ...fields };
    const parsed = parsePaymentAttempt(JSON.stringify(row));
    assert.deepEqual(parsed, row); assert.equal(isUnopenedCardAttempt(parsed), unopened);
  }
  assert.equal(isUnopenedCardAttempt(null), false);
});

test('phase and safe error code survive serialization, while checkout can never be treated as unopened', () => {
  const row = { ...attempt, paymentType: 'platescro', paymentId: '42', phase: 'preparing', issue: 'fname' };
  const parsed = parsePaymentAttempt(JSON.stringify(row));
  assert.deepEqual(parsed, row); assert.equal(isUnopenedCardAttempt(parsed), true);
  for (const paymentId of [null, '42']) {
    assert.equal(isUnopenedCardAttempt(parsePaymentAttempt(JSON.stringify({ ...row, paymentId, phase: 'checkout' }))), false);
  }
  for (const issue of ['requestUrl', 'http_422', 'errors_timeout', 'currency']) {
    assert.equal(parsePaymentAttempt(JSON.stringify({ ...row, issue })).issue, issue);
  }
});

test('recovery rejects invalid phases, raw errors, signed forms and invalid timestamps instead of enabling retry', () => {
  for (const patch of [
    { phase: 'paid' }, { phase: null }, { phase: true }, { issue: '' }, { issue: 'x'.repeat(65) },
    { issue: 'https://private.invalid/path' }, { issue: 'fname\nprivate' }, { issue: { field: 'fname' } },
    { paymentType: 'google-pay' }, { form: { fp_hash: 'forbidden' } }, { providerUrl: 'https://private.invalid/' },
    { createdAt: 0 }, { createdAt: 1.5 }, { createdAt: Number.MAX_SAFE_INTEGER }, { createdAt: Number.MAX_SAFE_INTEGER + 1 },
  ]) assert.throws(() => parsePaymentAttempt(JSON.stringify({ ...attempt, ...patch })), /payments.recoveryFailed/);
});

const { emptyPaymentLedger, parsePaymentLedger, paymentLedgerStorageKey, attemptsBlockingBills, legacyUnscopedAttempts, MAX_PAYMENT_ATTEMPTS, MAX_PAYMENT_SCOPE_INVOICES } = await import('../src/features/payments/payment-attempt.ts');
const otherKey = '22222222-3333-4444-8555-666666666666';
const thirdKey = '33333333-4444-4555-8666-777777777777';
const scoped = (patch = {}) => ({ ...attempt, version: 2, paymentType: 'platescro', phase: 'checkout', paymentId: '42', scope: { currency: 'USD', invoices: [{ id: '3191122', reference: 'T143078953', amount: '1.0000' }] }, ...patch });
const ledger = (attempts, activeAttemptKey = null) => ({ version: 2, activeAttemptKey, attempts });
const parseLedger = value => parsePaymentLedger(JSON.stringify(value));

test('v2 ledger preserves exact invoice scope and legacy uncertainty without inferring a financial state', () => {
  const old = { ...attempt, attemptKey: otherKey, paymentType: 'paypal', paymentId: null };
  const next = scoped({ reviewedLegacyKeys: [otherKey] });
  const value = ledger([old, next], next.attemptKey);
  assert.deepEqual(parseLedger(value), value);
  assert.equal(parseLedger(value).attempts[1].scope.invoices[0].amount, '1.0000');
  assert.deepEqual(parsePaymentLedger(null), emptyPaymentLedger());
  const empty = emptyPaymentLedger(); empty.attempts.push(old);
  assert.equal(emptyPaymentLedger().attempts.length, 0);
  assert.notEqual(paymentLedgerStorageKey('https://bayshop.com', '10'), paymentAttemptStorageKey('https://bayshop.com', '10'));
  assert.notEqual(paymentLedgerStorageKey('https://bayshop.com', '10'), paymentLedgerStorageKey('https://dev.bayshop.com', '10'));
  assert.notEqual(paymentLedgerStorageKey('https://bayshop.com', '10'), paymentLedgerStorageKey('https://bayshop.com', '11'));
});

test('v2 rejects empty, ambiguous, invalid or secret-bearing invoice scopes', () => {
  for (const scope of [
    null, {}, { currency: 'usd', invoices: scoped().scope.invoices }, { currency: 'US', invoices: scoped().scope.invoices },
    { currency: 'USD', invoices: [] }, { ...scoped().scope, token: 'forbidden' },
    { currency: 'USD', invoices: [scoped().scope.invoices[0], scoped().scope.invoices[0]] },
    ...['0', '0.000', '-1', '1e2', '1,00', ' 1', '1 ', '1.', '.1', 1, '1'.repeat(65)].map(amount => ({ currency: 'USD', invoices: [{ ...scoped().scope.invoices[0], amount }] })),
    ...[{ id: '0' }, { id: '1'.repeat(32) }, { reference: null }, { reference: 'private\nline' }, { reference: 'x'.repeat(129) }, { fp_hash: 'forbidden' }].map(patch => ({ currency: 'USD', invoices: [{ ...scoped().scope.invoices[0], ...patch }] })),
  ]) assert.throws(() => parsePaymentAttempt(JSON.stringify(scoped({ scope }))), /payments.recoveryFailed/);
  assert.throws(() => parsePaymentAttempt(JSON.stringify({ ...attempt, scope: scoped().scope })), /payments.recoveryFailed/);
  for (const amount of ['0.01', '1.0000', '0001.01', '999999999999999999999.123456789']) {
    const parsed = parsePaymentAttempt(JSON.stringify(scoped({ scope: { currency: 'RON', invoices: [{ id: '1', reference: '', amount }] } })));
    assert.equal(parsed.scope.invoices[0].amount, amount);
  }
});

test('ledger rejects duplicate identities, overlapping unresolved invoices, orphan active keys and unknown data', () => {
  const a = scoped();
  const b = scoped({ attemptKey: otherKey, paymentId: '43', scope: { currency: 'EUR', invoices: [{ id: '3191124', reference: 'T576765704', amount: '1' }] } });
  for (const bad of [
    { ...ledger([a]), token: 'forbidden' }, { ...ledger([a]), version: 1 }, { ...ledger([a]), activeAttemptKey: otherKey },
    { version: 2, attempts: [a] }, ledger([a, { ...b, attemptKey: a.attemptKey }]), ledger([a, { ...b, paymentId: a.paymentId }]),
    ledger([a, { ...b, scope: { ...b.scope, invoices: a.scope.invoices } }]),
    ledger([{ ...a, providerUrl: 'https://secret.example' }]), ledger([a, { ...b, attemptKey: a.attemptKey.toUpperCase() }]),
  ]) assert.throws(() => parseLedger(bad), /payments.recoveryFailed/);
  assert.deepEqual(parseLedger(ledger([a, b], b.attemptKey)), ledger([a, b], b.attemptKey));
  // A known-unopened preparation can stay in the audit history when the user
  // explicitly prepares a fresh attempt for the same invoice.
  assert.doesNotThrow(() => parseLedger(ledger([{ ...a, phase: 'preparing' }, { ...b, scope: a.scope }])));
});

test('invoice guards apply across currency labels, while only known-unopened cards are exempt', () => {
  const a = scoped();
  const preparation = scoped({ attemptKey: otherKey, paymentId: '43', phase: 'preparing' });
  const paypalPreparation = scoped({ attemptKey: thirdKey, paymentId: null, paymentType: 'paypal', phase: 'preparing' });
  assert.deepEqual(attemptsBlockingBills([a, preparation, paypalPreparation], ['3191122']).map(value => value.attemptKey), [a.attemptKey, thirdKey]);
  assert.deepEqual(attemptsBlockingBills([a], ['3191124']), []);
  assert.deepEqual(attemptsBlockingBills([{ ...a, scope: { ...a.scope, currency: 'EUR' } }], ['3191122']).map(value => value.attemptKey), [a.attemptKey]);
  const legacy = [attempt, { ...attempt, paymentType: 'paypal' }, { ...attempt, paymentType: 'terminals' }, { ...attempt, paymentType: 'platescro' }, { ...attempt, paymentType: 'platescro', phase: 'checkout' }];
  assert.deepEqual(legacyUnscopedAttempts([...legacy, a]), [legacy[0], legacy[1], legacy[4]]);
});

test('legacy acknowledgements are exact keys and cannot waive scoped overlap or acknowledge oneself', () => {
  for (const reviewedLegacyKeys of [null, [null], ['bad'], [otherKey, otherKey], [otherKey, otherKey.toUpperCase()], [attempt.attemptKey]]) {
    assert.throws(() => parsePaymentAttempt(JSON.stringify(scoped({ reviewedLegacyKeys }))), /payments.recoveryFailed/);
  }
  const old = { ...attempt, attemptKey: otherKey };
  const acknowledged = scoped({ reviewedLegacyKeys: [otherKey] });
  assert.deepEqual(parseLedger(ledger([old, acknowledged])).attempts[1].reviewedLegacyKeys, [otherKey]);
  assert.equal(attemptsBlockingBills([acknowledged], ['3191122']).length, 1);
  assert.equal(legacyUnscopedAttempts([old, acknowledged]).length, 1);
  // A later paid cleanup may remove the old entry; the historical review
  // remains bound to its original key, not to every future legacy record.
  assert.doesNotThrow(() => parseLedger(ledger([acknowledged])));
  const otherScoped = scoped({ attemptKey: otherKey, paymentId: '43', scope: { currency: 'EUR', invoices: [{ id: '2', reference: '', amount: '1' }] } });
  assert.throws(() => parseLedger(ledger([otherScoped, acknowledged])), /payments.recoveryFailed/);
});

test('bounded ledger and invoice scope fail closed rather than silently dropping unresolved entries', () => {
  const makeKey = index => `${String(index + 1).padStart(8, '0')}-2222-4333-8444-555555555555`;
  const attempts = Array.from({ length: MAX_PAYMENT_ATTEMPTS }, (_, index) => ({ ...attempt, attemptKey: makeKey(index) }));
  assert.equal(parseLedger(ledger(attempts)).attempts.length, MAX_PAYMENT_ATTEMPTS);
  assert.throws(() => parseLedger(ledger([...attempts, { ...attempt, attemptKey: makeKey(MAX_PAYMENT_ATTEMPTS) }])), /payments.recoveryFailed/);
  const invoices = Array.from({ length: MAX_PAYMENT_SCOPE_INVOICES }, (_, index) => ({ id: String(index + 1), reference: '', amount: '1' }));
  assert.equal(parsePaymentAttempt(JSON.stringify(scoped({ scope: { currency: 'USD', invoices } }))).scope.invoices.length, MAX_PAYMENT_SCOPE_INVOICES);
  assert.throws(() => parsePaymentAttempt(JSON.stringify(scoped({ scope: { currency: 'USD', invoices: [...invoices, { id: '101', reference: '', amount: '1' }] } }))), /payments.recoveryFailed/);
});


test('legacy parsing recognizes exact secure3 hosted URLs without accepting other numbered origins', () => {
  const original = scoped({ hostedChannel: 'GPAY', processorResumeUrl: 'https://secure3.euplatesc.ro/tdsprocess/checkout.php?cart_id=SYNTHETIC&mid=SYNTHETIC' });
  assert.deepEqual(parsePaymentAttempt(JSON.stringify(original)), original);
  for (const processorResumeUrl of ['https://secure4.euplatesc.ro/pay', 'https://secure3.euplatesc.ro.evil.example/pay', 'https://secure3.euplatesc.ro:443/pay', 'https://user:pass@secure3.euplatesc.ro/pay', 'https://secure3.euplatesc.ro/pay#result']) {
    assert.throws(() => parsePaymentAttempt(JSON.stringify({ ...original, processorResumeUrl })));
  }
});
