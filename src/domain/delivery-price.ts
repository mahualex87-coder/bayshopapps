import { currencyDisplayLabel } from './presentation-labels.ts';

export type DeliveryQuote = { price: number | null; currency: string | null; minPrice?: number | null; maxPrice?: number | null };
type FormatNumber = (value: number, options?: Intl.NumberFormatOptions) => string;
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Point/address quotes replace the method quote; they are never added to it.
 * Only the currency may inherit from the method. Zero is an actual quote. */
export function deliveryPriceLabel(quote: DeliveryQuote, formatNumber: FormatNumber, method = false): string | null {
  if (!quote.currency?.trim()) return null;
  const unit = currencyDisplayLabel(quote.currency.trim());
  const format = (value: number) => formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (method && amount(quote.minPrice) && amount(quote.maxPrice) && quote.minPrice <= quote.maxPrice) {
    return quote.minPrice === quote.maxPrice ? `${format(quote.minPrice)} ${unit}` : `${format(quote.minPrice)}–${format(quote.maxPrice)} ${unit}`;
  }
  return amount(quote.price) ? `${format(quote.price)} ${unit}` : null;
}
