import assert from 'node:assert/strict';
import test from 'node:test';
import { TRANSACTION_HISTORY_PAGE_SIZE, transactionDirection, transactionHistoryPage } from '../src/domain/transaction-history.ts';

const transaction = (id, extra = {}) => ({ id, currency: 'USD', status: 'paid', amount: 12.5, balanceAfter: null, date: '2026-11-02 12:30:00', label: 'Exact server text', ...extra });

test('25,001 transactions are bounded to 25 per page without truncating the available total', () => {
  const rows = Array.from({ length: 25001 }, (_, index) => transaction(`T${index}`));
  const first = transactionHistoryPage(rows);
  const middle = transactionHistoryPage(rows, { page: 501 });
  const last = transactionHistoryPage(rows, { page: 1001 });
  assert.equal(TRANSACTION_HISTORY_PAGE_SIZE, 25);
  assert.deepEqual([first.total, first.page, first.pageCount, first.items.length], [25001, 1, 1001, 25]);
  assert.deepEqual(first.items.map(row => row.id), rows.slice(0, 25).map(row => row.id));
  assert.equal(middle.items.length, 25);
  assert.equal(middle.items[0], rows[12500]);
  assert.equal(middle.items.at(-1), rows[12524]);
  assert.deepEqual(last.items, [rows[25000]]);
  assert.equal(new Set([...first.itemKeys, ...middle.itemKeys, ...last.itemKeys]).size, 51);
});

test('currency and exact raw status filters combine while all filter choices stay available', () => {
  const rows = [
    transaction('1', { currency: 'RON', status: 'unpaid', amount: -3 }),
    transaction('2', { status: 'pending-review' }),
    transaction('3', { currency: 'RON' }),
    transaction('4', { currency: 'EUR', status: null }),
    transaction('5', { currency: 'RON', status: 'unpaid', amount: 0 }),
    transaction('6', { status: undefined }),
  ];
  const result = transactionHistoryPage(rows, { currency: 'RON', status: 'unpaid' });
  assert.deepEqual(result.items, [rows[0], rows[4]]);
  assert.equal(result.total, 2);
  assert.deepEqual(result.currencies, ['USD', 'EUR', 'RON']);
  assert.deepEqual(result.statuses, ['unpaid', 'pending-review', 'paid']);
  assert.deepEqual(transactionHistoryPage(rows, { status: 'pending-review' }).items, [rows[1]]);
  assert.deepEqual(transactionHistoryPage(rows, { status: 'PAID' }).items, [], 'server statuses are not guessed or recased');
});

test('null and all include unknown statuses, zero amounts and negative amounts without classifying them', () => {
  const rows = [transaction('1', { amount: 0, status: null }), transaction('2', { amount: -0.01, status: 'paid' }), transaction('3', { amount: 100, status: 'unpaid' }), transaction('4', { status: 'server-new-status' })];
  for (const query of [{}, { currency: null, status: null }, { currency: 'all', status: 'all' }]) {
    const result = transactionHistoryPage(rows, query);
    assert.deepEqual(result.items, rows);
    assert.equal(result.total, 4);
  }
  assert.deepEqual(transactionHistoryPage(rows, { status: 'unpaid' }).items, [rows[2]], 'positive amount does not imply paid');
});

test('page clamps after filtering or refresh; an unsupported selected filter never becomes all', () => {
  const rows = Array.from({ length: 60 }, (_, index) => transaction(`T${index}`, { currency: index < 27 ? 'EUR' : 'USD' }));
  const filtered = transactionHistoryPage(rows, { page: 9, currency: 'EUR' });
  assert.deepEqual([filtered.total, filtered.page, filtered.pageCount], [27, 2, 2]);
  assert.deepEqual(filtered.items, [rows[25], rows[26]]);
  const empty = transactionHistoryPage(rows, { page: 9, currency: 'GBP' });
  assert.deepEqual([empty.total, empty.page, empty.pageCount, empty.items, empty.itemKeys], [0, 1, 1, [], []]);
  assert.deepEqual(transactionHistoryPage([], { page: 99 }), { items: [], itemKeys: [], total: 0, page: 1, pageCount: 1, currencies: [], statuses: [], directionCounts: { all: 0, debit: 0, credit: 0 } });
  const refreshed = transactionHistoryPage(rows.slice(0, 5), { page: 3 });
  assert.equal(refreshed.page, 1);
  assert.equal(refreshed.items.length, 5);
});

test('direction counts follow currency and status before direction filtering and include zero only in all', () => {
  const rows = [
    transaction('same', { amount: -1 }),
    transaction('same', { amount: 1 }),
    transaction(null, { amount: 0 }),
    transaction('negative-zero', { amount: -0 }),
    transaction('unpaid-debit', { amount: -2, status: 'unpaid' }),
    transaction('unpaid-credit', { amount: 2, status: 'unpaid' }),
    transaction('eur-debit', { amount: -3, currency: 'EUR' }),
    transaction('eur-credit', { amount: 3, currency: 'EUR' }),
  ];
  for (const direction of ['all', 'debit', 'credit']) {
    const result = transactionHistoryPage(rows, { direction, currency: 'USD', status: 'paid' });
    assert.deepEqual(result.directionCounts, { all: 4, debit: 1, credit: 1 });
    assert.deepEqual(result.items, direction === 'all' ? rows.slice(0, 4) : direction === 'debit' ? [rows[0]] : [rows[1]]);
    assert.deepEqual(result.currencies, ['USD', 'EUR']);
    assert.deepEqual(result.statuses, ['paid', 'unpaid']);
  }
  assert.deepEqual(transactionHistoryPage(rows).directionCounts, { all: 8, debit: 3, credit: 3 });
  assert.equal(transactionDirection(-0), 'neutral');
  assert.equal(transactionDirection(0), 'neutral');
  assert.equal(transactionDirection(-0.01), 'debit');
  assert.equal(transactionDirection(0.01), 'credit');
});

test('direction pagination preserves every debit and stable reference keys without changing server data', () => {
  const rows = Object.freeze(Array.from({ length: 61 }, (_, index) => Object.freeze(transaction('duplicate', { amount: index === 60 ? 0 : index % 2 ? -(index + 1) : index + 1 }))));
  const first = transactionHistoryPage(rows, { direction: 'debit' });
  const second = transactionHistoryPage(rows, { direction: 'debit', page: 2 });
  assert.deepEqual([first.total, first.items.length, second.items.length, second.pageCount], [30, 25, 5, 2]);
  assert.deepEqual([...first.items, ...second.items], rows.filter(row => row.amount < 0));
  assert.equal(new Set([...first.itemKeys, ...second.itemKeys]).size, 30);
  for (const page of [first, second]) page.items.forEach((row, index) => {
    const original = rows.indexOf(row);
    const all = transactionHistoryPage(rows, { page: Math.floor(original / 25) + 1 });
    assert.equal(page.itemKeys[index], all.itemKeys[original % 25]);
  });
  assert.deepEqual(first.directionCounts, { all: 61, debit: 30, credit: 30 });
  assert.deepEqual(second.directionCounts, first.directionCounts);
});

test('invalid page numbers are bounded and fractions choose an existing whole page', () => {
  const rows = Array.from({ length: 51 }, (_, index) => transaction(`T${index}`));
  for (const page of [NaN, Infinity, -Infinity, -5, 0]) assert.equal(transactionHistoryPage(rows, { page }).page, 1);
  assert.equal(transactionHistoryPage(rows, { page: 2.9 }).page, 2);
  assert.equal(transactionHistoryPage(rows, { page: Number.MAX_VALUE }).page, 3);
});

test('identical dates preserve normalizer order and exact amounts, balance, date and text references', () => {
  const rows = Object.freeze([
    Object.freeze(transaction('z', { amount: -0, date: 'unparsed server date', label: 'Comision – 0,80%', balanceAfter: -1.2345 })),
    Object.freeze(transaction('a', { amount: 0.123456, date: null })),
    Object.freeze(transaction('b', { amount: -9.876543, date: '2026-11-02 12:30:00', status: 'unpaid' })),
    Object.freeze(transaction('c', { date: '2026-11-02 12:30:00' })),
  ]);
  const before = structuredClone(rows);
  const result = transactionHistoryPage(rows);
  assert.deepEqual(result.items.map(row => row.id), ['z', 'a', 'b', 'c']);
  result.items.forEach((row, index) => assert.equal(row, rows[index]));
  assert.ok(Object.is(result.items[0].amount, -0));
  assert.deepEqual(rows, before);
});

test('duplicate TRIDs remain distinct and presentation keys are stable when pages and filters change', () => {
  const rows = Array.from({ length: 28 }, (_, index) => transaction('same-id', { currency: index === 0 ? 'EUR' : 'USD', status: index % 2 ? 'unpaid' : 'paid', amount: index }));
  const first = transactionHistoryPage(rows);
  const second = transactionHistoryPage(rows, { page: 2 });
  assert.equal(first.total, 28);
  assert.equal(new Set([...first.itemKeys, ...second.itemKeys]).size, 28);
  const paid = transactionHistoryPage(rows, { currency: 'USD', status: 'paid' });
  paid.items.forEach((row, index) => {
    const sourcePage = rows.indexOf(row) < 25 ? first : second;
    assert.equal(paid.itemKeys[index], sourcePage.itemKeys[sourcePage.items.indexOf(row)]);
  });
  assert.equal(second.items[0], rows[25]);
  assert.equal(second.items[2], rows[27]);
});
