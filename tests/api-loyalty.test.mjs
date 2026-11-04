import assert from 'node:assert/strict';
import test from 'node:test';
import { loyaltyData } from '../src/api/account-operations.ts';
import { loyaltySummary } from '../src/domain/loyalty-summary.ts';
import { ApiContractError } from '../src/api/normalize.ts';

const program = {
  countryCode: 'PL', shipperId: '179', title: 'Carrier from server', discountPercent: '10', loyaltyReceivedPoints: 38.5, currentLevel: 1, country: 'Moldova', currencySign: '€',
  loyaltyLevels: [
    { id: '1', shipperId: '179', condition: '20.00', result: '4.70', timeLimit: 180, level: 1, discountPercent: 6, loyaltyType: 'perKg' },
    { id: '2', shipperId: '179', condition: '50.00', result: '4.30', timeLimit: '90', level: 2, remainPoints: '11.50', discountPercent: 14, loyaltyType: 'perKg' },
  ], specialPrice: null,
};

test('loyalty preserves points, all tiers, prices, periods and server remaining points separately from percentages', () => {
  const [value] = loyaltyData([program]);
  assert.equal(value.discount, 10);
  assert.equal(value.points, 38.5);
  assert.equal(value.currentLevel, 1);
  assert.equal(value.destination, 'Moldova');
  assert.equal(value.currency, '€');
  assert.deepEqual(value.levels[1], { id: '2', shipperId: '179', level: 2, threshold: 50, rate: 4.3, durationDays: 90, remainingPoints: 11.5, discount: 14, priceType: 'perKg' });
  assert.equal(value.levels[0].remainingPoints, null, 'missing remaining points never becomes zero');
  assert.equal('progressiveEnabled' in value, false, 'a points tier is not proof that progressive pricing is enabled');
  const summary = loyaltySummary(value);
  const progress = summary.progress;
  assert.equal(summary.next.id, '2');
  assert.equal(progress.fraction, 18.5 / 30);
});

test('special pricing overrides are preserved and never rewritten as a progressive discount', () => {
  const [value] = loyaltyData([{ ...program, specialPrice: { shipperId: '179', result: '3.90', timeLimit: null, discountPercent: '22', selected: true, fixedTime: '0', priceType: 'perKg' } }]);
  assert.equal(value.specialPrice.selected, true);
  assert.equal(value.specialPrice.rate, 3.9);
  assert.equal(value.specialPrice.discount, 22);
  assert.equal(value.specialPrice.durationDays, null);
  assert.equal(value.specialPrice.fixedTime, '0', 'opaque fixedTime is not converted into a guessed expiry date');
  assert.equal(value.discount, 10, 'account discount is not replaced with the individual-price percentage');
  assert.equal(value.currentLevel, 1);
});

test('points do not locally activate a higher tier and absent metadata stays unknown', () => {
  const [value] = loyaltyData([{ ...program, loyaltyReceivedPoints: 70 }]);
  assert.equal(value.currentLevel, 1, 'server currentLevel is authoritative even when a threshold is exceeded');
  assert.equal(loyaltySummary(value).progress.fraction, 1, 'display progress is bounded; it does not change membership');
  const [unknown] = loyaltyData([{ shipperId: '1', discountPercent: '0' }]);
  assert.equal(unknown.points, null); assert.equal(unknown.currentLevel, null); assert.equal(unknown.levels, null); assert.equal(unknown.currency, null);
  assert.equal(loyaltySummary(unknown).progress.state, 'unavailable');
  assert.deepEqual(loyaltyData([]), []);
});

test('loyalty rejects coercible amounts, malformed nested flags and cross-carrier tier data', () => {
  for (const bad of [true, false, '', ' ', [], {}, '1,5', 'Infinity', -1]) assert.throws(() => loyaltyData([{ ...program, loyaltyReceivedPoints: bad }]), ApiContractError);
  for (const bad of [true, '101', -1]) assert.throws(() => loyaltyData([{ ...program, loyaltyLevels: [{ ...program.loyaltyLevels[0], discountPercent: bad }] }]), ApiContractError);
  assert.throws(() => loyaltyData([{ ...program, loyaltyLevels: [{ ...program.loyaltyLevels[0], shipperId: '180' }] }]), ApiContractError);
  assert.throws(() => loyaltyData([{ ...program, loyaltyLevels: [program.loyaltyLevels[0], program.loyaltyLevels[0]] }]), ApiContractError);
  assert.throws(() => loyaltyData([{ ...program, specialPrice: { shipperId: '179', selected: 'yes' } }]), ApiContractError);
});

test('explicit server expiry is additive and never inferred from legacy timeLimit', () => {
  const currentValidity = { validityKind: 'remaining', serverNow: '2026-11-02T12:00:00+02:00', expiresAt: '2026-11-14T20:15:00+02:00', remainingDays: 12, configuredDurationDays: 90 };
  const special = { shipperId: '179', selected: true, result: '3.90', priceType: 'perKg', timeLimit: '90', validity: { ...currentValidity, expiresAt: '2026-11-02T20:00:00+02:00', remainingDays: 0 } };
  const [value] = loyaltyData([{ ...program, currentValidity, specialPrice: special }]);
  assert.deepEqual(value.currentValidity, currentValidity);
  assert.equal(value.specialPrice.validity.remainingDays, 0, 'zero days still has a future timestamp');
  assert.equal(value.specialPrice.validity.expiresAt, special.validity.expiresAt);
  assert.equal(value.specialPrice.durationDays, 90, 'legacy period remains untouched');
  const [legacy] = loyaltyData([program]);
  assert.equal(legacy.currentValidity, undefined, 'no deadline guessed from legacy duration');
  for (const kind of ['configured', 'none', 'unknown']) {
    const metadata = { validityKind: kind, serverNow: currentValidity.serverNow, expiresAt: null, remainingDays: null, configuredDurationDays: kind === 'configured' ? 90 : null };
    assert.deepEqual(loyaltyData([{ ...program, currentValidity: metadata }])[0].currentValidity, metadata);
  }
});

test('invalid expiry metadata cannot hide valid account discount or produce a countdown', () => {
  const valid = { validityKind: 'remaining', serverNow: '2026-11-02T12:00:00+02:00', expiresAt: '2026-11-14T20:15:00+02:00', remainingDays: 12, configuredDurationDays: 90 };
  const invalid = [true, [], {}, { ...valid, validityKind: 'permanent' }, { ...valid, expiresAt: '2026-02-30T20:15:00+02:00' }, { ...valid, serverNow: '2026-11-02 12:00:00' }, { ...valid, expiresAt: '2026-11-14 20:15:00' }, { ...valid, expiresAt: null }, { ...valid, remainingDays: -1 }, { ...valid, remainingDays: null }, { ...valid, remainingDays: 12.5 }, { ...valid, validityKind: 'none' }, { ...valid, validityKind: 'configured', expiresAt: null, remainingDays: null, configuredDurationDays: null }];
  for (const currentValidity of invalid) {
    const [value] = loyaltyData([{ ...program, currentValidity }]);
    assert.equal(value.currentValidity, null);
    assert.equal(value.discount, 10);
    assert.equal(value.points, 38.5);
  }
});
