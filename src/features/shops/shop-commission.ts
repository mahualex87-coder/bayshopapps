type Rate = number | null | undefined;

export function shopCommissionLines(account: Rate, standard: Rate) {
  const lines: { label: 'shops.accountNoPercent' | 'shops.accountPercent' | 'shops.publicPercent'; rate: number | null }[] = [];
  if (account != null) lines.push(account === 0
    ? { label: 'shops.accountNoPercent', rate: null }
    : { label: 'shops.accountPercent', rate: account });
  if (standard != null && standard !== account) lines.push({ label: 'shops.publicPercent', rate: standard });
  return lines;
}
