import type { MutationResult } from '../api/mutations.ts';
import type { StockDetail } from '../api/operations-normalize.ts';
import { canCancelStockService, stockServiceCancellationConfirmed, type StockServiceKind } from './stock-service-state.ts';

export type StockCancellationResult = { status: 'cancelled' | 'changed' | 'unknown' | 'rejected'; error?: string };

/** A cached pending label cannot authorize a cancellation. Re-read before the
 * write and after its acknowledgement: several legacy handlers return Ok even
 * when the warehouse has already completed the service. */
export async function cancelPendingStockService({ service, readCurrent, send, describeError }: {
  service: StockServiceKind;
  readCurrent: () => Promise<StockDetail | undefined>;
  send: () => Promise<MutationResult>;
  describeError: (error: unknown) => string;
}): Promise<StockCancellationResult> {
  let dispatched = false;
  try {
    const before = await readCurrent();
    if (!before || !canCancelStockService(before, service)) return { status: 'changed' };
    dispatched = true;
    const result = await send();
    if (!result.ok) return { status: result.outcome === 'unknown' ? 'unknown' : 'rejected', error: result.error };
    const after = await readCurrent();
    if (!after) return { status: 'unknown' };
    if (stockServiceCancellationConfirmed(after, service)) return { status: 'cancelled' };
    return { status: canCancelStockService(after, service) ? 'unknown' : 'changed' };
  } catch (error) {
    return { status: dispatched ? 'unknown' : 'rejected', error: describeError(error) };
  }
}
