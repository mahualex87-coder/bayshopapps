import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { catalog, catalogDomains } from '../src/i18n/catalog.ts';
import { LanguagePreferenceStore, countt, formatDate, formatNumber, formatTime, formatUpdatedAt, languageLocales, normalizeLanguage, parseDisplayDate, translate } from '../src/i18n/core.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('each catalog entry supplies all three languages and matching interpolation fields', () => {
  const ownership = new Set();
  for (const [domain, entries] of Object.entries(catalogDomains)) for (const [key, values] of Object.entries(entries)) {
    assert(!ownership.has(key), `Duplicate catalog key ${key} in ${domain}`); ownership.add(key);
    assert.deepEqual(Object.keys(values).sort(), ['en', 'ro', 'ru'], key);
    const placeholders = value => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]).sort();
    for (const language of ['ro', 'ru', 'en']) {
      assert.equal(typeof values[language], 'string', `${key}.${language}`);
      assert(values[language].trim().length > 0, `${key}.${language}`);
      assert.deepEqual(placeholders(values[language]), placeholders(values.ro), `${key}.${language}`);
    }
  }
});

test('translation uses semantic keys, literal interpolation and visible missing keys', () => {
  assert.equal(translate('en', 'common.updatedAt', { time: '12:30' }), 'Updated at 12:30');
  assert.equal(translate('ru', 'common.updatedAt', { time: '<user text>' }), 'Обновлено в <user text>');
  assert.equal(translate('en', 'missing.key'), 'missing.key');
  assert.equal(normalizeLanguage('ru-MD'), 'ru');
  assert.equal(normalizeLanguage('EN_gb'), 'en');
  assert.equal(normalizeLanguage('xx'), null);
});

test('Romanian and Russian plural categories handle zero, teens and compound counts', () => {
  for (const category of ['one', 'few', 'many', 'other']) catalog[`test.count.${category}`] = { ro: `${category}:{count}`, ru: `${category}:{count}`, en: `${category}:{count}` };
  try {
    for (const [count, category] of [[0, 'many'], [1, 'one'], [2, 'few'], [5, 'many'], [11, 'many'], [21, 'one'], [22, 'few'], [25, 'many']]) assert.equal(countt('ru', 'test.count', count), `${category}:${count}`);
    for (const [count, category] of [[0, 'few'], [1, 'one'], [2, 'few'], [19, 'few'], [20, 'other']]) assert.equal(countt('ro', 'test.count', count), `${category}:${count}`);
    assert.equal(countt('en', 'test.count', 1), 'one:1');
    assert.equal(countt('en', 'test.count', 0), 'other:0');
  } finally { for (const category of ['one', 'few', 'many', 'other']) delete catalog[`test.count.${category}`]; }
});

test('number formatting changes presentation, preserving signs, zero and explicit precision', () => {
  for (const language of ['ro', 'ru', 'en']) for (const value of [0, -1234.56, 0.01]) {
    const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    assert.equal(formatNumber(language, value, options), new Intl.NumberFormat(languageLocales[language], options).format(value));
  }
  assert.equal(formatNumber('en', NaN), 'Unavailable');
});

test('SQL wall-clock and calendar dates do not shift across device time zones', () => {
  const script = `import {formatDate,formatTime} from './src/i18n/core.ts'; console.log(JSON.stringify([formatDate('en','2026-01-01'),formatDate('en','2026-01-01 00:15:00'),formatTime('en','2026-01-01 00:15:00')]));`;
  const run = tz => JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], { cwd: process.cwd(), env: { ...process.env, TZ: tz }, encoding: 'utf8' }).trim());
  assert.deepEqual(run('Pacific/Honolulu'), run('Pacific/Kiritimati'));
  assert.equal(run('Pacific/Honolulu')[2], '00:15');
  const instant = parseDisplayDate('2026-01-01T00:15:00+03:00');
  assert.equal(instant.date.toISOString(), '2025-12-31T21:15:00.000Z');
  assert.equal(instant.wallClock, false);
  for (const value of ['2026-02-30', '2026-02-30T12:00:00Z', '2026-01-01 25:00:00', '01/02/2026']) assert.equal(parseDisplayDate(value), null);
  assert.equal(formatDate('ru', 'unstructured server text'), 'unstructured server text');
  assert.equal(formatTime('en', null), null);
});

test('last refresh labels include a date for previous days', () => {
  const now = new Date(2026, 10, 5, 12).getTime();
  assert.match(formatUpdatedAt('en', now - 3600000, now), /^Updated at /);
  assert.match(formatUpdatedAt('en', now - 86400000, now), /^Updated on /);
  assert.equal(formatUpdatedAt('en', null), 'Data from your BayShop account');
});

test('slow language restoration cannot overwrite a user selection', async () => {
  const read = deferred(); const writes = [];
  const store = new LanguagePreferenceStore({ read: () => read.promise, write: async language => { writes.push(language); } });
  const start = store.start();
  await store.setLanguage('en');
  read.resolve('ru'); await start;
  assert.equal(store.getSnapshot().language, 'en');
  assert.equal(store.getSnapshot().ready, true);
  assert.deepEqual(writes, ['en']);
});

test('rapid choices persist in order and stale failures do not replace the latest choice', async () => {
  const first = deferred(); const writes = [];
  const store = new LanguagePreferenceStore({ read: async () => 'ro', write: async language => { writes.push(language); if (language === 'ru') await first.promise; } });
  await store.start();
  const russian = store.setLanguage('ru'); const english = store.setLanguage('en');
  await flush(); assert.deepEqual(writes, ['ru']);
  first.reject(new Error('storage unavailable'));
  await Promise.all([russian, english]);
  assert.deepEqual(writes, ['ru', 'en']);
  assert.equal(store.getSnapshot().language, 'en');
  assert.equal(store.getSnapshot().persistenceError, null);
});

test('unsupported preferences recover and an active sign-in guard prevents a change', async () => {
  const writes = [];
  const store = new LanguagePreferenceStore({ read: async () => 'unsupported', write: async language => { writes.push(language); } });
  await store.start(); assert.equal(store.getSnapshot().language, 'ro');
  const unregister = store.registerLanguageChange(() => false);
  assert.equal(await store.setLanguage('en'), false);
  assert.equal(store.getSnapshot().language, 'ro'); assert.deepEqual(writes, []);
  unregister(); assert.equal(await store.setLanguage('en'), true);
});
test('a dirty-form preflight veto runs before the account language side effect', async () => {
  const writes = []; const applied = [];
  const store = new LanguagePreferenceStore({ read: async () => 'ro', write: async value => { writes.push(value); } });
  await store.start();
  store.registerLanguageChange(language => { applied.push(language); return true; });
  const release = store.registerLanguageGuard(() => false);
  assert.equal(await store.setLanguage('ru'), false);
  assert.equal(store.getSnapshot().language, 'ro');
  assert.deepEqual(applied, []);
  assert.deepEqual(writes, []);
  release();
  assert.equal(await store.setLanguage('ru'), true);
  assert.deepEqual(applied, ['ru']);
});
