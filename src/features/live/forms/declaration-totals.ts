type DeclarationTotalInput = { quantity: string; price: string; currency?: string | null };

/** BayShop declarations store the total value of each row, separately from quantity. */
export function declarationTotals(items: DeclarationTotalInput[], fallbackCurrency: string, useItemCurrencies = true): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items) {
    const quantity = Number(item.quantity);
    const rawPrice = item.price.trim().replace(',', '.');
    const price = Number(rawPrice);
    if (!item.quantity.trim() || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 9_999_999 || !/^\d+(?:\.\d+)?$/.test(rawPrice) || !Number.isFinite(price) || price < 0 || price > 9_999_999) continue;
    const rawCode = useItemCurrencies && item.currency || fallbackCurrency;
    const code = /^[a-z]{3}$/i.test(rawCode) ? rawCode.toUpperCase() : rawCode;
    totals[code] = (totals[code] || 0) + price;
  }
  return totals;
}
