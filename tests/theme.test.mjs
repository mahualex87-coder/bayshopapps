import assert from 'node:assert/strict';
import test from 'node:test';
import { ThemePreferenceStore, isThemeMode, resolveTheme } from '../src/theme/core.ts';
import { darkColors, lightColors } from '../src/theme/palette.ts';

const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
test('system appearance responds to OS changes while explicit app choices remain independent', () => {
  assert.equal(resolveTheme('system', 'light'), 'light');
  assert.equal(resolveTheme('system', 'dark'), 'dark');
  assert.equal(resolveTheme('system', null), 'light');
  assert.equal(resolveTheme('system', 'unspecified'), 'light');
  for (const system of ['light', 'dark', null]) {
    assert.equal(resolveTheme('light', system), 'light');
    assert.equal(resolveTheme('dark', system), 'dark');
  }
  for (const invalid of [null, undefined, 'auto', 'Dark', '{}', 1, true]) assert.equal(isThemeMode(invalid), false);
});

test('default follows the system; saved mode hydrates once and a remount restores the latest local selection', async () => {
  let value = null; let reads = 0;
  const storage = { read: async () => { reads++; return value; }, write: async mode => { value = mode; } };
  const store = new ThemePreferenceStore(storage);
  assert.deepEqual(store.getSnapshot(), { mode: 'system', ready: false, persistenceError: false });
  await Promise.all([store.start(), store.start()]);
  assert.equal(reads, 1);
  store.setMode('dark'); await store.whenSaved();
  assert.equal(value, 'dark');
  const restored = new ThemePreferenceStore(storage); await restored.start();
  assert.equal(restored.getSnapshot().mode, 'dark');
  restored.setMode('system'); await restored.whenSaved();
  assert.equal(value, 'system');
});

test('a late saved preference cannot overwrite a newer user choice', async () => {
  const read = deferred(); const writes = [];
  const store = new ThemePreferenceStore({ read: () => read.promise, write: async mode => { writes.push(mode); } });
  const start = store.start(); store.setMode('dark');
  read.resolve('light'); await start; await store.whenSaved();
  assert.equal(store.getSnapshot().mode, 'dark');
  assert.equal(store.getSnapshot().ready, true);
  assert.deepEqual(writes, ['dark']);
});

test('slow writes are serialized, stale failures do not replace newer feedback, and listeners unsubscribe', async () => {
  const first = deferred(); const writes = [];
  const store = new ThemePreferenceStore({ read: async () => null, write: async mode => { writes.push(mode); if (writes.length === 1) await first.promise; } });
  await store.start(); let events = 0; const unsubscribe = store.subscribe(() => events++);
  store.setMode('dark'); await Promise.resolve(); store.setMode('light');
  first.reject(new Error('storage temporarily unavailable')); await store.whenSaved();
  assert.deepEqual(writes, ['dark', 'light']);
  assert.equal(store.getSnapshot().mode, 'light');
  assert.equal(store.getSnapshot().persistenceError, false);
  assert.ok(events >= 2); unsubscribe(); const previousEvents = events;
  store.setMode('system'); await store.whenSaved(); assert.equal(events, previousEvents);
});

test('storage failure retains the applied theme and selecting again retries without losing the preference', async () => {
  let fail = true;
  const store = new ThemePreferenceStore({ read: async () => { throw new Error('read unavailable'); }, write: async () => { if (fail) throw new Error('write unavailable'); } });
  await store.start(); assert.equal(store.getSnapshot().ready, true);
  store.setMode('dark'); await store.whenSaved();
  assert.deepEqual(store.getSnapshot(), { mode: 'dark', ready: true, persistenceError: true });
  fail = false; store.setMode('dark'); await store.whenSaved();
  assert.deepEqual(store.getSnapshot(), { mode: 'dark', ready: true, persistenceError: false });
  store.setMode('invalid'); await store.whenSaved(); assert.equal(store.getSnapshot().mode, 'dark');
});

const luminance = hex => {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const contrast = (first, second) => { const a = luminance(first), b = luminance(second); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
test('body text, secondary labels, actions and semantic feedback meet 4.5:1 contrast in both palettes', () => {
  for (const [theme, colors] of Object.entries({ light: lightColors, dark: darkColors })) {
    for (const [foreground, background] of [
      ['text', 'background'], ['text', 'surface'], ['muted', 'surface'], ['muted', 'soft'], ['accent', 'surface'],
      ['onAccent', 'primaryButton'], ['onAccent', 'dangerButton'], ['error', 'soft'],
      ['success', 'successSoft'], ['warning', 'warningSoft'], ['info', 'infoSoft'], ['accentText', 'accentSoft'],
      ['heroText', 'heroSurface'], ['heroMuted', 'heroSurface'],
    ]) assert.ok(contrast(colors[foreground], colors[background]) >= 4.5, `${theme}: ${foreground} on ${background}`);
  }
  assert.equal(lightColors.brand, darkColors.brand, 'official brand color is not recolored by the theme');
});
