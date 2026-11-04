import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOverviewSummary } from '../src/api/overview-summary.ts';
import { planRead } from '../src/api/operations-contracts.ts';
import { overviewBenefit, overviewBonusCountdown, visibleOverviewBonuses } from '../src/domain/overview-benefits.ts';

const now = '2026-11-03T10:00:00+02:00';
const payload = extra => ({ version: 1, serverNow: now, ...extra });
const validity = extra => ({ validityKind: 'remaining', serverNow: now, expiresAt: '2026-11-04T10:00:00+02:00', remainingDays: 1, configuredDurationDays: 30, ...extra });
const program = extra => ({ id:'1', title:'Air Post', countryCode:'US', destination:'Moldova', iconUrl:null, currency:'$', discount:25, points:40, currentLevel:1, levels:[{id:'1',shipperId:'1',level:1,threshold:20,rate:4.5,durationDays:30,remainingPoints:null,discount:25,priceType:'perKg'}], specialPrice:null, ...extra });
const special = extra => ({ shipperId:'1',rate:4, durationDays:30, discount:25, selected:true, fixedTime:null,priceType:'perKg', ...extra });

test('received overview reads exact account-wide server counter, not a country or loaded page length', () => {
  const plan = planRead({ kind: 'dashboard.counters' });
  assert.equal(plan.path, '/api/member/counters');
  assert.equal(plan.normalize({awaiting:'1',incoming:'3',outgoing:'5',received:'45231'}).received, 45231);
  assert.throws(() => plan.normalize({awaiting:'1',incoming:'3',outgoing:'5'}));
});

test('aggregate endpoint preserves unknowns and does not reinterpret balances, grants or payments', () => {
  const plan = planRead({kind:'dashboard.summary'});
  assert.equal(plan.path,'/api/member/dashboard');
  const data = plan.normalize(payload({balance:100,totalPaymentsSumUSD:1000,bonusGrant:50}));
  assert.equal(data.lifetimeSettledCharges,null);
  assert.equal(data.availableBonuses,null);
  assert.throws(() => plan.normalize({balance:100,transactions:[{amount:55}]}));
});

test('currency aggregates use USD EUR RON GBP order with uppercase codes and real reported zero', () => {
  const data = normalizeOverviewSummary(payload({lifetimeSettledCharges:[{currency:'gbp',amount:'1.23'},{currency:'ron',amount:'0.00'},{currency:'usd',amount:'93000.12'},{currency:'eur',amount:2}]}));
  assert.deepEqual(data.lifetimeSettledCharges.map(item=>item.currency),['USD','EUR','RON','GBP']);
  assert.equal(data.lifetimeSettledCharges[2].amount,0);
  assert.equal(data.lifetimeSettledCharges[0].amount,93000.12);
});

test('malformed, duplicate, hidden-currency and negative aggregates are rejected rather than rendered as money', () => {
  for(const rows of [
    [{currency:'USD',amount:-1}], [{currency:'USD',amount:'invalid'}], [{currency:'USD',amount:null}], [{currency:'USD',amount:Infinity}],
    [{currency:'USD',amount:1},{currency:'usd',amount:2}], [{currency:'MDL',amount:30}], [{currency:'EUR',amount:'1.234'}],
  ]) assert.throws(()=>normalizeOverviewSummary(payload({lifetimeSettledCharges:rows})));
});

test('no expiry means valid bonus amount remains visible without a fabricated clock', () => {
  const data=normalizeOverviewSummary(payload({availableBonuses:[{currency:'EUR',amount:'25.50'}]}));
  assert.equal(visibleOverviewBonuses(data)[0].amount,25.5);
  assert.equal(overviewBonusCountdown(data.availableBonuses[0],data),null);
  assert.equal(visibleOverviewBonuses(data,365*86400000).length,1);
});

test('bonus expiry uses offset-aware server time and elapsed duration; expired bonus no longer appears available', () => {
  const data=normalizeOverviewSummary(payload({availableBonuses:[{currency:'USD',amount:'3',expiresAt:'2026-11-03T10:03:00+02:00'}]}));
  assert.equal(overviewBonusCountdown(data.availableBonuses[0],data).minutes,3);
  assert.equal(overviewBonusCountdown(data.availableBonuses[0],data,60000).minutes,2);
  assert.equal(visibleOverviewBonuses(data,180000).length,0);
  assert.equal(visibleOverviewBonuses(null).length,0);
});

test('invalid and timezone-less timestamps omit dates/timers without hiding a valid bonus amount', () => {
  for(const date of ['not-a-date','2026-11-03 10:00:00','2026-02-30T10:00:00Z']) {
    const result=normalizeOverviewSummary(payload({availableBonuses:[{currency:'USD',amount:3,expiresAt:date}]}));
    assert.equal(result.availableBonuses[0].expiresAt,null);assert.equal(visibleOverviewBonuses(result)[0].amount,3);
    assert.equal(overviewBonusCountdown(result.availableBonuses[0],result),null);
    const missingClock=normalizeOverviewSummary(payload({serverNow:date,availableBonuses:[{currency:'USD',amount:3,expiresAt:'2026-11-04T10:00:00Z'}]}));
    assert.equal(missingClock.serverNow,null);assert.equal(overviewBonusCountdown(missingClock.availableBonuses[0],missingClock),null);
  }
});

test('points tiers, configured periods and unselected special prices never become an applied tariff or discount timer', () => {
  for(const selected of [false,null]) {
    const result=overviewBenefit(program({currentValidity:validity(),specialPrice:special({selected,validity:validity()})}));
    assert.equal(result.discount,25);assert.equal(result.rate,null);assert.equal(result.validity,null);
  }
  assert.equal(overviewBenefit(program()).rate,null);
  assert.equal(overviewBenefit(program({currentValidity:validity()})).validity,null);
});

test('selected special per-kg price preserves zero; percentage specials are not displayed as money', () => {
  const rate=overviewBenefit(program({specialPrice:special({rate:0,validity:validity()})}));
  assert.equal(rate.rate.amount,0);assert.equal(rate.rate.currency,'$');assert.equal(rate.validity.expiresAt,'2026-11-04T10:00:00+02:00');
  assert.equal(overviewBenefit(program({specialPrice:special({priceType:'discount',rate:25})})).rate,null);
});
