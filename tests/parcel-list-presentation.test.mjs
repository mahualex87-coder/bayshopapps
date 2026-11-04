import assert from 'node:assert/strict';
import test from 'node:test';
import { parcelSearchHintKey } from '../src/features/live/parcel-list-presentation.ts';
import { translate } from '../src/i18n/core.ts';

test('received search describes its loaded country collection, never an unverified lifetime history', () => {
  assert.equal(parcelSearchHintKey('received', 'collection'), 'live.pagination.searchLoadedCountry');
  assert.equal(parcelSearchHintKey('received', 'page'), 'live.pagination.searchPage');
  for (const stage of ['waiting', 'warehouse', 'sent']) assert.equal(parcelSearchHintKey(stage, 'collection'), 'live.pagination.searchCollection');
  for (const language of ['ro', 'ru', 'en']) {
    const key = parcelSearchHintKey('received', 'collection');
    assert.notEqual(translate(language, key), key);
  }
  assert.equal(translate('ro', 'live.pagination.accountTotal', { total: '111' }), 'Disponibile: 111');
  assert.equal(translate('ru', 'live.pagination.accountTotal', { total: '111' }), 'Доступно: 111');
  assert.equal(translate('en', 'live.pagination.accountTotal', { total: '111' }), 'Available: 111');
});

