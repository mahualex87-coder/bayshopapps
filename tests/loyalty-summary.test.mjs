import assert from 'node:assert/strict';
import test from 'node:test';
import { loyaltyCountdown, loyaltySpecialRate, loyaltySummary, loyaltyTierRate } from '../src/domain/loyalty-summary.ts';

const tier = (level, threshold, extra = {}) => ({ id: String(level), shipperId: '21', level, threshold, rate: 9.5, durationDays: 30, remainingPoints: null, discount: 15, priceType: 'perKg', ...extra });
const program = extra => ({ id: '21', title: 'Carrier', countryCode: 'US', destination: 'Moldova', iconUrl: null, currency: '$', discount: 10, points: 38.5, currentLevel: 1, levels: [tier(1, 20), tier(2, 50, { remainingPoints: 11.5 })], specialPrice: null, ...extra });
const special = extra => ({ shipperId: '21', rate: 5, durationDays: 90, discount: 25, selected: null, fixedTime: null, priceType: 'perKg', ...extra });

test('progress measures the current-to-next interval and preserves source tier IDs and server remainder', () => {
  const source = program({ levels: [tier(5, 500), tier(3, 50, { remainingPoints: 11 }), tier(1, 20)] });
  const before = structuredClone(source);
  const result = loyaltySummary(source);
  assert.equal(result.current.id, '1');
  assert.equal(result.next.id, '3', 'tier levels are identifiers, not array indexes or consecutive offsets');
  assert.deepEqual(result.progress, { state: 'interval', fraction: 18.5 / 30, from: 20, to: 50, earned: 18.5, remaining: 11, remainingSource: 'server' });
  assert.equal(result.current, source.levels[2]);
  assert.deepEqual(source, before);
});

test('level zero alone uses a zero baseline, while missing current tier metadata remains unavailable', () => {
  assert.deepEqual(loyaltySummary(program({ currentLevel: 0, points: 5 })).progress, { state: 'interval', fraction: .25, from: 0, to: 20, earned: 5, remaining: 15, remainingSource: 'calculated' });
  assert.equal(loyaltySummary(program({ currentLevel: 2, levels: [tier(3, 50)] })).progress.state, 'unavailable');
  assert.equal(loyaltySummary(program({ currentLevel: null })).progress.state, 'unavailable');
});

test('progress caps both ends without promoting the server tier and recognizes a verified maximum', () => {
  const reached = program({ points: 70, levels: [tier(1, 20), tier(2, 50)] });
  const result = loyaltySummary(reached);
  assert.equal(result.progress.state, 'thresholdReached');
  assert.equal(result.progress.fraction, 1);
  assert.equal(result.progress.earned, 30);
  assert.equal(result.progress.remaining, 0);
  assert.equal(result.current.level, 1);
  assert.equal(reached.currentLevel, 1);
  assert.equal(loyaltySummary(program({ points: 10 })).progress.fraction, 0);
  assert.equal(loyaltySummary(program({ currentLevel: 2, points: 60 })).progress.state, 'maximum');
  assert.equal(loyaltySummary(program({ currentLevel: 7, points: 100 })).progress.state, 'unavailable');
});

test('missing, ambiguous and invalid threshold metadata cannot manufacture progress', () => {
  for (const extra of [
    { points: null }, { levels: null }, { levels: [] },
    { levels: [tier(1, null), tier(2, 50)] },
    { levels: [tier(1, 20), tier(2, null), tier(3, 80)] },
    { levels: [tier(1, 20), tier(2, 20)] },
    { levels: [tier(1, 20), tier(2, 10)] },
    { levels: [tier(1, 20), tier(2, 50), tier(2, 70, { id: 'duplicate-level' })] },
    { levels: [tier(1, 20), tier(null, 50)] },
  ]) assert.equal(loyaltySummary(program(extra)).progress.state, 'unavailable');
});

test('special selection is tri-state and a full outer discount does not prove a special or progressive mode', () => {
  for (const [selected, expected] of [[true, 'applied'], [false, 'notApplied'], [null, 'unknown']]) {
    const source = program({ discount: 100, specialPrice: special({ selected, rate: 0 }) });
    const result = loyaltySummary(source);
    assert.equal(result.specialState, expected);
    assert.equal(result.current.level, 1);
    assert.equal(result.progress.state, 'interval', 'points remain informational even when special pricing applies');
    assert.equal('progressiveEnabled' in result, false);
    assert.equal(source.discount, 100);
  }
  assert.equal(loyaltySummary(program({ discount: 100 })).specialState, 'none');
});

test('tier percent rate is already money per kg, while special discount remains a configured percentage', () => {
  assert.deepEqual(loyaltyTierRate(tier(1, 20, { priceType: 'percent', rate: 8, discount: 20 }), '$'), { kind: 'perKg', amount: 8, currency: '$' });
  assert.deepEqual(loyaltyTierRate(tier(1, 20, { rate: 0 }), null), { kind: 'perKg', amount: 0, currency: null });
  assert.deepEqual(loyaltySpecialRate(special({ priceType: 'discount', rate: 100, discount: 25 }), '$'), { kind: 'percent', amount: 100, currency: null });
  assert.deepEqual(loyaltySpecialRate(special({ priceType: 'perKg', rate: 0 }), '€'), { kind: 'perKg', amount: 0, currency: '€' });
  for (const priceType of ['percent', 'unknown', null]) assert.equal(loyaltySpecialRate(special({ priceType }), '$').kind, 'unavailable');
  assert.equal(loyaltySpecialRate(special({ priceType: 'discount', rate: 101 }), '$').kind, 'unavailable');
});

test('legacy duration and fixedTime never become a guessed expiry or countdown', () => {
  const source = program({ specialPrice: special({ fixedTime: '2027-03-01T00:00:00Z' }) });
  assert.deepEqual(loyaltySummary(source).validity, {
    current: { kind: 'reported', days: 30, serverNow: null, expiresAt: null },
    special: { kind: 'reported', days: 90, serverNow: null, expiresAt: null },
  });
  assert.equal(loyaltyCountdown(source.specialPrice), null);
});

const explicit = extra => ({ validityKind: 'remaining', serverNow: '2026-11-02T10:00:00+02:00', expiresAt: '2026-11-03T12:34:00+02:00', remainingDays: 1, configuredDurationDays: 90, ...extra });

test('explicit validity wins over ambiguous legacy days without inventing an expiry for other kinds', () => {
  const source = program({ currentValidity: explicit(), specialPrice: special({ validity: explicit({ validityKind: 'configured', configuredDurationDays: 14, expiresAt: null }) }) });
  assert.deepEqual(loyaltySummary(source).validity.current, { kind: 'remaining', days: 1, serverNow: '2026-11-02T10:00:00+02:00', expiresAt: '2026-11-03T12:34:00+02:00' });
  assert.deepEqual(loyaltySummary(source).validity.special, { kind: 'configured', days: 14, serverNow: '2026-11-02T10:00:00+02:00', expiresAt: null });
  for (const kind of ['none', 'unknown']) {
    const validity = explicit({ validityKind: kind });
    assert.equal(loyaltySummary(program({ currentValidity: validity })).validity.current.days, null);
    assert.equal(loyaltySummary(program({ currentValidity: validity })).validity.current.expiresAt, null);
    assert.equal(loyaltyCountdown(validity), null);
  }
});

test('countdown uses server timestamps plus elapsed milliseconds with bounded expiry', () => {
  assert.deepEqual(loyaltyCountdown(explicit()), { days: 1, hours: 2, minutes: 34, remainingMs: 95640000, expired: false });
  assert.deepEqual(loyaltyCountdown(explicit(), 34 * 60000), { days: 1, hours: 2, minutes: 0, remainingMs: 93600000, expired: false });
  assert.deepEqual(loyaltyCountdown(explicit(), 95640001), { days: 0, hours: 0, minutes: 0, remainingMs: 0, expired: true });
  assert.equal(loyaltyCountdown(explicit({ expiresAt: '2026-11-02T08:00:00Z' })).expired, true, 'different offsets represent the same instant');
  assert.equal(loyaltyCountdown(explicit({ expiresAt: '2026-11-02T10:00:30+02:00' })).expired, false, 'less than one minute is not already expired');
});

test('countdown rejects missing or impossible dates, unzoned wall clocks and invalid elapsed time', () => {
  for (const expiresAt of [null, '', '2026-02-30T12:00:00Z', '2026-11-03 12:34:00', '2026-11-03', 'not a date']) assert.equal(loyaltyCountdown(explicit({ expiresAt })), null);
  for (const serverNow of ['2026-11-02 10:00:00', '2026-13-02T10:00:00Z', 'not a date']) assert.equal(loyaltyCountdown(explicit({ serverNow })), null);
  for (const elapsed of [-1, NaN, Infinity]) assert.equal(loyaltyCountdown(explicit(), elapsed), null);
  assert.equal(loyaltyCountdown(null), null);
  assert.equal(loyaltyCountdown(explicit({ validityKind: 'configured' })), null);
});
