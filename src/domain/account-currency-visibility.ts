/** Current balance currencies are the server's member-country currency scope.
 * This controls picker choices only. Ledger rows must never be removed here. */
export function accountCurrencyChoices(historyCurrencies: readonly string[], balances: readonly { currency: string }[] | null) {
  if (balances === null) return [];
  const allowed = new Set(balances.map(balance => balance.currency.toUpperCase()));
  return historyCurrencies.filter(currency => allowed.has(currency.toUpperCase()));
}
export function visibleCurrencySelection(requested: string, choices: readonly string[]) {
  return requested === 'all' || choices.includes(requested) ? requested : 'all';
}

export function defaultAccountCurrency(choices: readonly string[]) { return ['USD', 'EUR', 'RON', 'GBP'].find(code => choices.includes(code)) || 'all'; }
