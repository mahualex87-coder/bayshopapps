import type { LiveTransaction } from '../api/contracts.ts';
import { sortCurrencies } from './option-order.ts';

export const TRANSACTION_HISTORY_PAGE_SIZE = 25;
export type TransactionHistoryDirection = 'all' | 'debit' | 'credit';

export function transactionDirection(amount: number): 'debit' | 'credit' | 'neutral' {
  return amount < 0 ? 'debit' : amount > 0 ? 'credit' : 'neutral';
}

export type TransactionHistoryQuery = {
  page?: number;
  /** null, undefined and the UI sentinel "all" select every currency. */
  currency?: string | null;
  /** Other values match the exact server status, including unknown statuses. */
  status?: string | null;
  /** Direction follows the signed ledger amount, independently of payment status. */
  direction?: TransactionHistoryDirection | null;
};

export type TransactionHistoryPage = {
  items: LiveTransaction[];
  /** Presentation keys parallel to items, stable across filters and pages of
   * this collection. A repeated server reference never drops a transaction. */
  itemKeys: string[];
  total: number;
  page: number;
  pageCount: number;
  /** Available currencies use the common display order; statuses stay first-seen. */
  currencies: string[];
  statuses: string[];
  /** Counts after currency/status filtering, before direction and pagination. */
  directionCounts: Record<TransactionHistoryDirection, number>;
};

/** Filter and page one API-period collection without changing its chronology,
 * amounts, dates, or server text. The caller resets page when changing filters;
 * this helper only clamps it to the remaining result range. */
export function transactionHistoryPage(
  transactions: readonly LiveTransaction[],
  query: TransactionHistoryQuery = {},
): TransactionHistoryPage {
  const currency = query.currency == null || query.currency === 'all' ? null : query.currency;
  const status = query.status == null || query.status === 'all' ? null : query.status;
  const direction = query.direction ?? 'all';
  const directionCounts = { all: 0, debit: 0, credit: 0 };
  const currencies = new Set<string>();
  const statuses = new Set<string>();
  const matches: number[] = [];
  transactions.forEach((transaction, index) => {
    currencies.add(transaction.currency);
    if (typeof transaction.status === 'string' && transaction.status !== '') statuses.add(transaction.status);
    if ((currency === null || transaction.currency === currency) && (status === null || transaction.status === status)) {
      const rowDirection = transactionDirection(transaction.amount);
      directionCounts.all += 1;
      if (rowDirection !== 'neutral') directionCounts[rowDirection] += 1;
      if (direction === 'all' || direction === rowDirection) matches.push(index);
    }
  });

  const total = matches.length;
  // An empty collection has one empty display page; navigation is unnecessary.
  const pageCount = Math.max(1, Math.ceil(total / TRANSACTION_HISTORY_PAGE_SIZE));
  const requestedPage = typeof query.page === 'number' && Number.isFinite(query.page) ? Math.floor(query.page) : 1;
  const page = Math.min(pageCount, Math.max(1, requestedPage));
  const indices = matches.slice((page - 1) * TRANSACTION_HISTORY_PAGE_SIZE, page * TRANSACTION_HISTORY_PAGE_SIZE);
  return {
    items: indices.map(index => transactions[index]),
    // Source position disambiguates duplicate TRIDs without changing the data.
    // Build the key from source indices, never the filtered/display position.
    itemKeys: indices.map(index => JSON.stringify([transactions[index].currency, transactions[index].id, index])),
    total,
    page,
    pageCount,
    currencies: sortCurrencies([...currencies], code => code),
    statuses: [...statuses],
    directionCounts,
  };
}
