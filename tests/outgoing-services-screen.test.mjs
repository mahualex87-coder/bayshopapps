import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as services from '../src/api/outgoing-services.ts';

const available = () => services.normalizeOutgoingServices([{ keyName: 'invoice-creation', title: 'Invoice', description: '<p>Server description</p>', price: '30', currency: 'RON', state: 'available', enabled: false, canRequest: true, canCancel: false, mutationMode: 'state-v1', revision: 'a'.repeat(64) }])[0];
function harness(initial = [available()], behavior = 'confirm') {
  let data = initial, cursor = 0, dirty = false, tree, refreshes = 0; const slots = [], writes = [], reads = [], changed = [];
  const jsx = (type, props) => typeof type === 'function' ? type(props || {}) : ({ type, props: props || {} });
  const imports = {
    react: { useEffect() {}, useRef: initial => { const index = cursor++; return slots[index] ??= { current: initial }; }, useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; dirty = true; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { View: 'View', Text: 'Text' }, '@expo/vector-icons/Ionicons': { __esModule: true, default: 'Icon' },
    '@/api/outgoing-services': services, '@/api/client': { errorMessage: () => 'errors.loadFailed' },
    '@/api/context': { useLiveAccount: () => ({ accountId: '7', accountRevision: 1, canMutate: true, mutationPending: false, mutate: async command => { writes.push(command); if (behavior === 'confirm') data = data.map(item => item.key === command.service ? { ...item, enabled: command.enabled, state: command.enabled ? 'requested' : 'cancelled', canRequest: !command.enabled, canCancel: command.enabled, revision: 'b'.repeat(64) } : item); return behavior === 'timeout' ? { ok: false, outcome: 'unknown' } : { ok: true }; }, readView: async query => { reads.push(query); return data; } }) },
    '@/i18n/context': { useI18n: () => ({ language: 'ro', t: key => key, formatNumber: String }) },
    '@/ui': { Button: 'Button', Notice: 'Notice', useUi: () => ({ s: {}, colors: {} }) },
    '@/features/live/shared': { ResourceStatus: 'ResourceStatus', displayMoney: (n, c) => `${n} ${c}` },
    '@/features/live/ParcelDetailSection': { ParcelDetailSection: 'Section' },
    '@/features/live/forms/useOperationView': { useOperationView: () => ({ resource: { data, loading: false, error: null }, refresh: async () => { refreshes++; } }) },
  };
  const exports = {}; const code = ts.transpileModule(readFileSync(new URL('../src/features/shipments/OutgoingServices.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: key => { assert(key in imports, key); return imports[key]; }, AbortController });
  const render = () => { let count = 0; do { dirty = false; cursor = 0; tree = exports.OutgoingServices({ id: '123', fresh: true, onPending() {}, onDirty() {}, onChanged: () => changed.push(true) }); assert(++count < 10); } while (dirty); };
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : [];
  const all = () => walk(tree); const button = key => all().find(node => node.type === 'Button' && node.props.children === key);
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); render(); };
  render(); return { render, all, button, settle, writes, reads, changed, setData: next => { data = next; }, refreshes: () => refreshes };
}

test('request opens confirmation inside same service card with server details, without writing on selection', async () => {
  const h = harness(); assert.equal(h.writes.length, 0);
  assert(h.all().some(n => n.type === 'Text' && n.props.children === 'Server description'));
  assert(h.all().some(n => n.type === 'Text' && n.props.children === '30 RON'));
  h.button('outgoingServices.request').props.onPress(); h.render(); assert.equal(h.writes.length, 0);
  const confirm = h.button('outgoingServices.confirm'); assert(confirm); assert.equal(h.all().filter(n => n.type === 'Section').length, 1);
  confirm.props.onPress(); confirm.props.onPress(); await h.settle();
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].enabled, true); assert.equal(h.reads.length, 1);
  assert.equal(h.changed.length, 1); assert(h.button('outgoingServices.cancel'));
});

test('pending service cancellation needs inline confirmation; completed and legacy entries have no active action', async () => {
  const h = harness([{ ...available(), enabled: true, state: 'requested', canRequest: false, canCancel: true }]);
  h.button('outgoingServices.cancel').props.onPress(); h.render(); assert.equal(h.writes.length, 0);
  h.button('outgoingServices.confirmCancellation').props.onPress(); await h.settle();
  assert.equal(h.writes[0].enabled, false); assert(h.button('outgoingServices.request'));
  for (const state of [{ ...available(), enabled: true, state: 'completed', canRequest: false }, { ...available(), mutationMode: null, state: 'unknown', canRequest: false, canCancel: false }]) {
    const blocked = harness([state]); assert.equal(blocked.button('outgoingServices.request'), undefined); assert.equal(blocked.button('outgoingServices.cancel'), undefined);
  }
});

test('uncertain request blocks additional writes and its check button only reads until server confirms', async () => {
  const h = harness([available()], 'timeout');
  h.button('outgoingServices.request').props.onPress(); h.render(); h.button('outgoingServices.confirm').props.onPress(); await h.settle();
  assert.equal(h.writes.length, 1); assert.equal(h.button('outgoingServices.request').props.disabled, true);
  h.button('outgoingServices.check').props.onPress(); await h.settle(); assert.equal(h.writes.length, 1); assert.equal(h.reads.length, 2);
  h.setData([{ ...available(), enabled: true, state: 'requested', canRequest: false, canCancel: true }]);
  h.button('outgoingServices.check').props.onPress(); await h.settle();
  assert.equal(h.writes.length, 1); assert.equal(h.reads.length, 3); assert.equal(h.button('outgoingServices.check'), undefined); assert.equal(h.changed.length, 1);
});
