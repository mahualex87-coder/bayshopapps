import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as currency from '../src/domain/account-currency-visibility.ts';
import * as historyDomain from '../src/domain/transaction-history.ts';
import * as optionOrder from '../src/domain/option-order.ts';
import { normalizeBalanceHistoryData } from '../src/api/normalize.ts';

function harness(rows = Array.from({ length: 31 }, (_, i) => ({ id: String(i + 1), currency: i < 29 ? 'USD' : 'MDL', amount: i + 1, balanceAfter: 777777, status: i % 2 ? 'unpaid' : 'paid', date: '2026-11-03', label: `Transaction ${i + 1}` })), balances = [{ currency: 'USD', amount: 999999 }]) {
  const slots = [], periods = [];
  let cursor = 0, dirty, tree, scopePrefix = 'account1';
  const jsx = (type, props) => typeof type === 'function' ? type(props || {}) : ({ type, props: props || {} });
  const imports = {
    react: { useMemo: fn => fn(), useRef: value => { const i = cursor++; return slots[i] ??= { current: value }; }, useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; dirty = true; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', StyleSheet: { create: s => s, hairlineWidth: 1 }, Text: 'Text', View: 'View' },
    '@/domain/account-currency-visibility': currency,
    '@/domain/presentation-labels': { currencyDisplayLabel: value => value },
    '@/domain/option-order': optionOrder,
    '@/theme/context': { useThemeStyles: fn => fn({}) },
    'expo-router': { router: { push() {} } },
    '@expo/vector-icons/Ionicons': { default: 'Icon', __esModule: true },
    '@/domain/transaction-history': historyDomain,
    '@/features/accountops/shared': { OptionPicker: 'OptionPicker' },
    '@/navigation/GlassSurface': { GlassSurface: 'GlassSurface' },
    '@/ui': { Button: 'Button', Notice: 'Notice', Screen: 'Screen', minTouchTarget: 44, useUi: () => ({ s: {}, colors: {} }) },
    '@/i18n/context': { useI18n: () => ({ t: key => key, countt: (key, count) => `${key}:${count}`, formatNumber: String, formatUpdatedAt: String, formatDate: String, formatTime: String }) },
    './shared': { EmptyState: 'EmptyState', displayMoney: (amount, currency) => `${amount}${currency ? ` ${currency}` : ''}` },
    './useBalanceHistory': { useBalanceHistory: period => { periods.push(period); return { scope: `${scopePrefix}:${period}`, refresh() {}, resource: { data: { transactions: rows }, error: null, loading: false, updatedAt: 1 } }; } },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/live/LiveBalance.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: k => { assert(k in imports, k); return imports[k]; }, Set });
  const render = () => { let times = 0; do { dirty = false; cursor = 0; tree = exports.LiveBalanceScreen({ resource: { data: { balances, balancesError: null }, loading: false, error: null }, onRefresh() {} }); assert(++times < 10); } while (dirty); };
  const walk = node => Array.isArray(node) ? node.flatMap(walk) : !node || typeof node !== 'object' ? [] : [node, ...walk(node.props?.children)];
  const all = () => walk(tree);
  const pick = name => all().find(n => n.type === 'OptionPicker' && n.props.label === name);
  render(); return { render, all, pick, periods, setScope: value => { scopePrefix = value; } };
}

test('history shows operations only, retains currency scope, filters, last week and pagination', () => {
  const h = harness();
  const text = () => JSON.stringify(h.all().filter(n => n.type === 'Text').map(n => n.props.children));
  assert(!text().includes('999999'), 'Current balance must not render');
  assert(!text().includes('777777'), 'Per-record balance must not render');
  assert(!text().includes('live.balance.balances'));
  assert.equal(h.all().find(n => n.type === 'Screen').props.title, 'live.balance.title');
  assert.equal(h.pick('live.balance.currency').props.value, 'all');
  assert.deepEqual(Array.from(h.pick('live.balance.currency').props.options, v => v.id), ['all', 'USD']);
  const next = h.all().find(n => n.props.accessibilityLabel === 'balanceHistory.next');
  assert.equal(next.props.disabled, false);
  next.props.onPress(); h.render();
  assert(text().includes('Transaction 26')); assert(!text().includes('Transaction 1"'));
  h.pick('balanceHistory.status').props.onChange('unpaid'); h.render();
  assert(text().includes('Transaction 2')); assert(!text().includes('Transaction 1"'));
  assert(h.pick('balanceHistory.period').props.options.some(v => v.id === '7'));
  h.pick('balanceHistory.period').props.onChange('7'); h.render();
  assert.equal(h.periods.at(-1), '7');
  assert.equal(h.pick('balanceHistory.status').props.value, 'all');
});

test('history currency choices keep USD EUR RON GBP order regardless of latest transaction currency', () => {
  const codes = ['RON', 'GBP', 'USD', 'EUR'];
  const h = harness(codes.map((currency, index) => ({ id: `T${index}`, currency, amount: -index, date: '2026-11-03', label: currency, status: 'paid', balanceAfter: 0 })), codes.map(currency => ({ currency, amount: 0 })));
  assert.deepEqual(Array.from(h.pick('live.balance.currency').props.options, value => value.id), ['all', 'USD', 'EUR', 'RON', 'GBP']);
  assert.equal(h.pick('live.balance.currency').props.value, 'all');
});

test('direction filters show scoped counts, reset pages and reset with account or period changes', () => {
  const rows = Array.from({ length: 61 }, (_, index) => ({
    id: `T${index}`, currency: index < 57 ? 'USD' : 'EUR', amount: index === 60 ? 0 : index % 2 ? -(index + 1) : index + 1,
    balanceAfter: 0, date: '2026-11-03', status: index % 3 ? 'paid' : 'unpaid', label: `Ledger row ${index}`,
  }));
  const h = harness(rows);
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null ? '' : String(node);
  const displayed = () => h.all().filter(node => node.type === 'Text' && node.props.selectable).map(text);
  const choice = value => h.all().find(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel.startsWith(`balanceHistory.filter.${value},`));
  const assertCounts = (all, debit, credit) => {
    for (const [value, count] of Object.entries({ all, debit, credit })) assert.equal(choice(value).props.accessibilityLabel, `balanceHistory.filter.${value}, balanceHistory.count:${count}`);
  };
  const click = value => { choice(value).props.onPress(); h.render(); };
  const next = () => { h.all().find(node => node.props.accessibilityLabel === 'balanceHistory.next').props.onPress(); h.render(); };
  assert.equal(h.pick('live.balance.currency').props.value, 'all');
  assert.equal(choice('all').props.accessibilityState.checked, true);
  assertCounts(61, 30, 30);
  next();
  assert(displayed().includes('Ledger row 25'));
  click('debit');
  assert(displayed().includes('Ledger row 1'), 'Changing direction returns to the first page');
  assert(!displayed().includes('Ledger row 0'));
  assert.equal(choice('debit').props.accessibilityState.checked, true);
  assertCounts(61, 30, 30);
  next();
  assert(displayed().includes('Ledger row 51'));
  click('credit');
  assert(displayed().includes('Ledger row 0'));
  assert(!displayed().includes('Ledger row 1'));
  h.pick('live.balance.currency').props.onChange('USD'); h.render();
  assertCounts(57, 28, 29);
  h.pick('balanceHistory.status').props.onChange('unpaid'); h.render();
  assertCounts(19, 9, 10);
  click('debit');
  assert(displayed().includes('Ledger row 3'));
  assert(!displayed().includes('Ledger row 1'));
  h.pick('balanceHistory.period').props.onChange('7'); h.render();
  assert.equal(h.pick('live.balance.currency').props.value, 'all');
  assert.equal(h.pick('balanceHistory.status').props.value, 'all');
  assert.equal(choice('all').props.accessibilityState.checked, true);
  assertCounts(61, 30, 30);
  next(); next();
  assert(displayed().includes('Ledger row 60'), 'Zero remains in the All view');
  assert(!h.all().some(node => node.type === 'Text' && text(node).startsWith('balanceHistory.direction.')), 'Rows remain compact without extra direction labels');
  click('credit');
  assert(!displayed().includes('Ledger row 60'));
  h.pick('live.balance.currency').props.onChange('USD'); h.render();
  h.setScope('account2'); h.render();
  assert.equal(h.pick('live.balance.currency').props.value, 'all');
  assert.equal(choice('all').props.accessibilityState.checked, true);
  assert(displayed().includes('Ledger row 0'));
});

test('settled credit omits the paid badge while debit, unpaid and unknown statuses stay visible', () => {
  const fixtures = [
    { label: 'Paid credit', amount: 1, status: 'paid', badge: null },
    { label: 'Paid debit', amount: -1, status: 'paid', badge: 'status.paid' },
    { label: 'Unpaid credit', amount: 2, status: 'unpaid', badge: 'status.unpaid' },
    { label: 'Unpaid debit', amount: -2, status: 'unpaid', badge: 'status.unpaid' },
    { label: 'Unknown credit', amount: 3, status: 'server-status', badge: 'server-status' },
    { label: 'Unknown debit', amount: -3, status: 'server-status', badge: 'server-status' },
    { label: 'Zero operation', amount: 0, status: 'paid', badge: 'status.paid' },
  ];
  const h = harness(fixtures.map(({ badge: _badge, ...row }, index) => ({ ...row, id: `T${index}`, currency: 'USD', date: '2026-11-03', balanceAfter: 0 })));
  const texts = node => Array.isArray(node) ? node.flatMap(texts) : node && typeof node === 'object' ? texts(node.props?.children) : typeof node === 'string' ? [node] : [];
  for (const fixture of fixtures) {
    const row = h.all().find(node => node.type === 'View' && Array.isArray(node.props.children) && node.props.children.some(child => child?.type === 'Text' && child.props.children === fixture.label));
    assert(row, `Missing operation ${fixture.label}`);
    const rendered = texts(row);
    if (fixture.badge === null) assert(!rendered.includes('status.paid'), 'Settled credits must not look like paid invoices');
    else assert(rendered.includes(fixture.badge), `${fixture.label} must retain its server status`);
    assert(rendered.includes(String(fixture.amount)), 'Removing a badge must not remove or change the amount');
  }
  assert.deepEqual(Array.from(h.pick('balanceHistory.status').props.options, option => option.id), ['all', 'paid', 'unpaid', 'server-status']);
  h.pick('balanceHistory.status').props.onChange('paid'); h.render();
  const paidRows = h.all().filter(node => node.type === 'Text' && node.props.selectable).map(node => node.props.children);
  assert(paidRows.includes('Paid credit'), 'Hiding the badge must not change the raw status filter');
  assert(paidRows.includes('Paid debit'));
  assert(!paidRows.includes('Unpaid credit'));
});

test('mixed server credits and debits remain visible with their signs across every history page', () => {
  const records = Array.from({ length: 31 }, (_, index) => ({
    trid: index < 2 ? 'T-SAME' : index === 2 ? null : `T-${index}`,
    type: index % 2 ? 'minus' : 'plus',
    summ: index === 2 ? '0.00' : (index + 0.25).toFixed(2),
    total_amount: '0.00',
    status: index % 3 ? 'paid' : 'unpaid',
    created: `2026-11-03 10:00:${String(59 - index).padStart(2, '0')}`,
    comment: `Ledger row ${index}`,
  }));
  const rows = normalizeBalanceHistoryData({ balanceList: { usd: records } }).transactions;
  const h = harness(rows);
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null ? '' : String(node);
  const displayed = () => h.all().filter(node => node.type === 'Text' && node.props.selectable).map(text);
  const seen = [];
  for (let index = 0; index < 2; index += 1) {
    const pageRows = rows.slice(index * 25, (index + 1) * 25);
    const visible = displayed();
    for (const row of pageRows) {
      assert(visible.includes(row.label), `Missing ${row.label}`);
      assert(visible.includes(`${row.amount > 0 ? '+' : ''}${row.amount} USD`), `Missing signed amount ${row.amount}`);
      seen.push(row.label);
    }
    const next = h.all().find(node => node.props.accessibilityLabel === 'balanceHistory.next');
    assert.equal(next.props.disabled, index === 1);
    if (index === 0) { next.props.onPress(); h.render(); }
  }
  assert.deepEqual(seen, rows.map(row => row.label));
  h.pick('balanceHistory.status').props.onChange('paid'); h.render();
  const paid = rows.filter(row => row.status === 'paid');
  assert(paid.some(row => row.amount < 0));
  for (const row of paid) assert(displayed().includes(row.label), `Paid ${row.label} must remain visible regardless of sign`);
  assert(!displayed().includes('Ledger row 0'), 'Explicit status filtering must still apply');
});
