import assert from 'node:assert/strict';
import test from 'node:test';
import { countt, pluralCategory } from '../src/i18n/core.ts';

const nativeRules = Intl.PluralRules;
const restoreDescriptor = Object.getOwnPropertyDescriptor(Intl, 'PluralRules');
const languages = ['ro', 'ru', 'en'];
const values = [...Array.from({ length: 1001 }, (_, n) => n), -1, -21, -22, 10000, 10021, 111111, 0.1, 1.2, 1.0001, 1.0005, 1.9995, 21.2, NaN, Infinity];
const expected = Object.fromEntries(languages.map(language => {
  const rules = new nativeRules(language);
  return [language, values.map(value => rules.select(value))];
}));

test('post-login counter labels work when Hermes has no Intl.PluralRules constructor', () => {
  const before = Object.fromEntries(languages.map(language => [language, [0, 1, 3, 6, 111].map(value => countt(language, 'navigation.parcels', value))]));
  try {
    Object.defineProperty(Intl, 'PluralRules', { configurable: true, writable: true, value: undefined });
    for (const language of languages) {
      assert.deepEqual([0, 1, 3, 6, 111].map(value => countt(language, 'navigation.parcels', value)), before[language]);
      assert.deepEqual(values.map(value => pluralCategory(language, value)), expected[language], language);
    }
  } finally { Object.defineProperty(Intl, 'PluralRules', restoreDescriptor); }
});

test('a partial Intl constructor rejecting a locale falls back without interrupting rendering', () => {
  try {
    Object.defineProperty(Intl, 'PluralRules', { configurable: true, writable: true, value: class { constructor() { throw new RangeError('Unsupported locale'); } } });
    for (const language of languages) assert.deepEqual(values.map(value => pluralCategory(language, value)), expected[language]);
  } finally { Object.defineProperty(Intl, 'PluralRules', restoreDescriptor); }
});
