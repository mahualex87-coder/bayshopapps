import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as preferences from '../src/api/account-operations.ts';
import * as links from '../src/api/telegram-link.ts';

const scripts = ['TelegramChannel', 'PreferencesEditor'].map(name => {
  const file = new URL(`../src/features/accountops/${name}.tsx`, import.meta.url);
  return new vm.Script(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { filename: file.pathname });
});
const response = overrides => ({
  ...Object.fromEntries(preferences.preferenceKeys.map(key => [key, 0])),
  obtainMass: 0, hasTelegram: 0, telegramBotLink: 'https://t.me/BayShopTestBot?start=fixture', ...overrides,
});

// Keep hooks and cleanup scoped to keyed component instances, including the actual
// editor → form → Telegram channel. Network, navigation and native handoff are fakes.
function harness(initial = response()) {
  const reads = [], opens = [], writes = [], listeners = new Set(), timers = new Map(), instances = new Map();
  const state = { accountId: 'first', authRevision: 1, accountRevision: 1, authenticated: true, canMutate: true, language: 'ro', focused: true, initial };
  const appState = { currentState: 'active', addEventListener(event, listener) {
    assert.equal(event, 'change'); listeners.add(listener); return { remove: () => listeners.delete(listener) };
  } };
  const readView = (query, { signal }) => {
    assert.equal(query.kind, 'preferences.read');
    return new Promise((resolve, reject) => reads.push({ signal, resolve, reject }));
  };
  let frame, cursor, effects, nodes, timerId = 0;
  const slot = () => frame[cursor++] ??= {};
  function effect(run, deps) {
    const value = slot();
    if (!value.deps || deps.some((dep, index) => !Object.is(dep, value.deps[index]))) {
      value.deps = deps;
      effects.push(() => { value.cleanup?.(); value.cleanup = run(); });
    }
  }
  const react = {
    useState(initialValue) {
      const value = slot();
      if (!('current' in value)) value.current = initialValue;
      return [value.current, next => { value.current = typeof next === 'function' ? next(value.current) : next; }];
    },
    useRef(initialValue) { const value = slot(); if (!('current' in value)) value.current = initialValue; return value; },
    useCallback(callback, deps) {
      const value = slot();
      if (!value.deps || deps.some((dep, i) => !Object.is(dep, value.deps[i]))) Object.assign(value, { deps, callback });
      return value.callback;
    },
    useEffect: effect, useLayoutEffect: effect,
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { AppState: appState, Text: 'Text', View: 'View', Switch: 'Switch' },
    'expo-router': { router: {}, useIsFocused: () => state.focused },
    'expo-linking': { openURL: async url => { opens.push(url); return state.openURL?.(url); } },
    '@/api/context': { useLiveAccount: () => ({ ...state, readView, mutate: async command => { writes.push(command); return { ok: true }; } }) },
    '@/api/account-operations': preferences, '@/api/telegram-link': links,
    '@/i18n/context': { useI18n: () => ({ t: key => key }) },
    '@/ui': { Button: 'Button', Screen: 'Screen', Notice: 'Notice', useUi: () => ({ s: {}, colors: {} }) },
    '@/navigation/GlassSurface': { GlassSurface: 'GlassSurface' },
    '@/navigation/useDraftGuard': { useDraftGuard: () => ({}) },
    '@/features/push/PushProvider': { PushSettings: 'PushSettings' },
    '@/features/live/shared': { ResourceStatus: 'ResourceStatus' },
    './shared': { MutationFeedback: 'MutationFeedback', useAccountView: () => ({
      resource: { data: preferences.preferencesData(state.initial), updatedAt: 1 }, reload() {},
    }) },
  };
  function load(script) {
    const output = {};
    script.runInNewContext({ exports: output, AbortController,
      require: name => { assert(Object.hasOwn(imports, name), name); return imports[name]; },
      setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
      clearTimeout: id => timers.delete(id),
    });
    return output;
  }
  imports['./TelegramChannel'] = load(scripts[0]);
  const { LivePreferencesEditor } = load(scripts[1]);
  function render(mounted = true) {
    nodes = []; effects = [];
    const alive = new Set();
    function visit(node, path) {
      if (Array.isArray(node)) { node.forEach((child, index) => visit(child, path + '/' + index)); return; }
      if (!node || typeof node !== 'object') return;
      if (typeof node.type === 'function') {
        const id = path + '/' + node.type.name + ':' + (node.key ?? '');
        alive.add(id);
        if (!instances.has(id)) instances.set(id, []);
        frame = instances.get(id); cursor = 0;
        visit(node.type(node.props), id);
      } else { nodes.push(node); visit(node.props.children, path + '/' + node.type); }
    }
    if (mounted) visit(jsx(LivePreferencesEditor, {}), '');
    for (const [id, slots] of instances) if (!alive.has(id)) {
      for (const value of slots) value.cleanup?.();
      instances.delete(id);
    }
    for (const run of effects) run();
  }
  const button = label => nodes.find(node => node.type === 'Button' && node.props.children === label)?.props;
  const toggle = key => nodes.find(node => node.type === 'Switch' && node.props.accessibilityLabel === `accountOps.preference.${key}`)?.props;
  function status(value) { appState.currentState = value; for (const handle of listeners) handle(value); }
  async function reply(index, raw, mounted = true) { reads[index].resolve(raw); await setImmediate(); render(mounted); }
  render();
  return { state, reads, opens, writes, timers, render, reply, button, toggle, status,
    text: label => nodes.some(node => node.type === 'Text' && node.props.children === label),
  };
}

test('opening the native bot and returning without sharing the contact leaves Telegram unlinked; a later server confirmation enables it', async () => {
  const h = harness();
  h.toggle('obtainSms').onValueChange(true); h.render();
  h.state.openURL = () => h.status('background');
  h.button('accountOps.telegramConnect').onPress();
  await h.reply(0, response());
  assert.deepEqual(h.opens, ['tg://resolve?domain=BayShopTestBot&start=fixture']);
  assert.equal(h.reads.length, 1, 'no verification runs in background');
  assert.equal(h.toggle('obtainTelegram'), undefined);
  h.status('active');
  assert.equal(h.reads.length, 2, 'return starts a fresh account read');
  await h.reply(1, response());
  assert.equal(h.toggle('obtainTelegram'), undefined);
  assert(h.text('telegram.waiting'));
  assert(h.button('telegram.check'));
  h.button('telegram.check').onPress();
  await h.reply(2, response({ hasTelegram: 1, obtainTelegram: 1 }));
  assert(h.text('telegram.linked'));
  assert.equal(h.toggle('obtainTelegram').value, true);
  assert.equal(h.toggle('obtainSms').value, true);
  assert.equal(h.button('telegram.check'), undefined);
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.writes, [], 'linking never saves notification settings implicitly');
  h.button('accountOps.save').onPress();
  assert.deepEqual({ ...h.writes[0].input }, { obtainSms: 1 });
});

test('re-reading an already linked account preserves an unsaved Telegram toggle and unrelated drafts', async () => {
  const linked = response({ hasTelegram: 1, obtainTelegram: 1 });
  const h = harness(linked);
  h.toggle('obtainTelegram').onValueChange(false);
  h.toggle('obtainMails').onValueChange(true); h.render();
  h.status('background'); h.status('active');
  await h.reply(0, linked);
  assert.equal(h.toggle('obtainTelegram').value, false);
  assert.equal(h.toggle('obtainMails').value, true);
  h.button('accountOps.save').onPress();
  assert.deepEqual({ ...h.writes[0].input }, { obtainMails: 1, obtainTelegram: 0 });
});

test('switching accounts, losing focus or unmounting while fetching the address prevents any handoff', async () => {
  for (const interrupt of ['account', 'blur', 'unmount']) {
    const h = harness();
    h.button('accountOps.telegramConnect').onPress();
    if (interrupt === 'account') h.state.accountId = 'second';
    if (interrupt === 'blur') h.state.focused = false;
    h.render(interrupt !== 'unmount');
    assert(h.reads[0].signal.aborted, interrupt);
    await h.reply(0, response({ hasTelegram: 1 }), interrupt !== 'unmount');
    assert.deepEqual(h.opens, [], interrupt);
    assert.equal(h.toggle('obtainTelegram'), undefined, interrupt);
  }
});

test('a late check for the previous account cannot mark the new account connected or schedule a retry', async () => {
  const h = harness();
  h.state.openURL = () => h.status('background');
  h.button('accountOps.telegramConnect').onPress();
  await h.reply(0, response());
  h.status('active');
  h.state.accountId = 'second'; h.render();
  assert(h.reads[1].signal.aborted);
  await h.reply(1, response({ hasTelegram: 1, obtainTelegram: 1 }));
  assert.equal(h.toggle('obtainTelegram'), undefined);
  assert.equal(h.timers.size, 0);
});

test('a rejected native handoff cannot launch the browser after leaving settings', async () => {
  const h = harness();
  let rejectNative;
  h.state.openURL = () => new Promise((resolve, reject) => { rejectNative = reject; });
  h.button('accountOps.telegramConnect').onPress();
  await h.reply(0, response());
  h.render(false);
  rejectNative(new Error('not installed')); await setImmediate();
  assert.equal(h.opens.length, 1);
  assert.equal(h.reads.length, 1);
});

test('failed account verification can recover automatically after returning from the bot', async () => {
  const h = harness();
  h.state.openURL = () => h.status('background');
  h.button('accountOps.telegramConnect').onPress();
  await h.reply(0, response()); h.status('active');
  h.reads[1].reject(new Error('network disconnected')); await setImmediate(); h.render();
  assert(h.text('telegram.checkError'));
  assert.equal(h.toggle('obtainTelegram'), undefined);
  assert.equal(h.timers.size, 1);
  const [[id, retry]] = h.timers;
  h.timers.delete(id); retry();
  await h.reply(2, response({ hasTelegram: 1, obtainTelegram: 0 }));
  assert(h.text('telegram.linked'));
  assert.equal(h.toggle('obtainTelegram').value, false, 'a linked account can still have its channel switched off');
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.writes, []);
});

test('unavailable addresses and failed launches show an error without connecting or writing preferences', async () => {
  const unsafe = harness();
  unsafe.button('accountOps.telegramConnect').onPress();
  await unsafe.reply(0, response({ telegramBotLink: 'https://t.me.invalid/BayShopTestBot' }));
  assert(unsafe.text('telegram.unavailable'));
  assert.deepEqual(unsafe.opens, []);
  const h = harness();
  h.state.openURL = async () => { throw new Error('cannot open'); };
  h.button('accountOps.telegramConnect').onPress();
  await h.reply(0, response());
  assert.deepEqual(h.opens, ['tg://resolve?domain=BayShopTestBot&start=fixture', 'https://t.me/BayShopTestBot?start=fixture']);
  assert(h.text('telegram.openError'));
  assert.equal(h.toggle('obtainTelegram'), undefined);
  assert.equal(h.button('telegram.check'), undefined);
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.writes, []);
});
