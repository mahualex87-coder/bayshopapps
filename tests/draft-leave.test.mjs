import assert from 'node:assert/strict';
import test from 'node:test';
import { requestDraftLeave } from '../src/navigation/draft-leave.ts';

test('pending writes block route departure without showing an abandon dialog, even if the draft is clean', () => {
  for (const dirty of [false, true]) {
    let confirms = 0; let departures = 0;
    requestDraftLeave(() => ({ dirty, pending: true }), () => confirms++, () => departures++);
    assert.equal(confirms, 0); assert.equal(departures, 0);
  }
});

test('a write started after an abandon dialog opened still prevents its delayed confirmation from leaving', () => {
  let state = { dirty: true, pending: false }; let confirm; let departures = 0;
  requestDraftLeave(() => state, action => { confirm = action; }, () => departures++);
  state = { dirty: true, pending: true }; confirm();
  assert.equal(departures, 0);
  state = { dirty: true, pending: false };
  assert.equal(departures, 0, 'completion does not replay an earlier blocked navigation');
  requestDraftLeave(() => state, action => action(), () => departures++);
  assert.equal(departures, 1, 'the user can deliberately leave after the result is known');
});

test('idle clean pages leave immediately, while idle changed pages wait for explicit confirmation', () => {
  let confirms = 0; let departures = 0; let confirm;
  requestDraftLeave(() => ({ dirty: false, pending: false }), () => confirms++, () => departures++);
  assert.equal(confirms, 0); assert.equal(departures, 1);
  requestDraftLeave(() => ({ dirty: true, pending: false }), action => { confirms++; confirm = action; }, () => departures++);
  assert.equal(confirms, 1); assert.equal(departures, 1);
  confirm(); assert.equal(departures, 2);
});
