import type { PaymentInvoiceGroup } from '../../api/payments-catalog.ts';

/** Only user exclusions are remembered. Current owned unpaid rows remain the
 * source of truth, so a paid/removed invoice cannot survive a catalog refresh. */
export type InvoiceSelectionIntent = Record<string, readonly string[]>;

export function invoiceSelectionKey(group: PaymentInvoiceGroup | undefined): string {
  return group ? `${group.currencyId ?? ''}:${group.currency}` : '';
}

export function eligibleInvoiceIds(groups: readonly PaymentInvoiceGroup[] | null | undefined, group: PaymentInvoiceGroup | undefined): string[] {
  if (!group || !group.currencyId || !/^[A-Z]{3}$/.test(group.currency) || !groups?.includes(group)) return [];
  const occurrences = new Map<string, number>();
  for (const candidate of groups) for (const invoice of candidate.invoices ?? []) occurrences.set(invoice.id, (occurrences.get(invoice.id) ?? 0) + 1);
  return (group.invoices ?? []).filter(invoice => /^[1-9]\d*$/.test(invoice.id)
    && /^\d+(?:\.\d+)?$/.test(invoice.amount) && /[1-9]/.test(invoice.amount)
    && occurrences.get(invoice.id) === 1).map(invoice => invoice.id);
}

export function selectedInvoiceIds(eligible: readonly string[], intent: InvoiceSelectionIntent, key: string): string[] {
  const excluded = new Set(intent[key] ?? []);
  return eligible.filter(id => !excluded.has(id));
}

export function toggleInvoice(intent: InvoiceSelectionIntent, key: string, eligible: readonly string[], id: string): InvoiceSelectionIntent {
  if (!key || !eligible.includes(id)) return intent;
  const excluded = new Set(intent[key] ?? []);
  if (excluded.has(id)) excluded.delete(id); else excluded.add(id);
  return { ...intent, [key]: [...excluded] };
}

export function toggleAllInvoices(intent: InvoiceSelectionIntent, key: string, eligible: readonly string[]): InvoiceSelectionIntent {
  if (!key || !eligible.length) return intent;
  const allSelected = selectedInvoiceIds(eligible, intent, key).length === eligible.length;
  const excluded = new Set(intent[key] ?? []);
  for (const id of eligible) { if (allSelected) excluded.add(id); else excluded.delete(id); }
  return { ...intent, [key]: [...excluded] };
}
