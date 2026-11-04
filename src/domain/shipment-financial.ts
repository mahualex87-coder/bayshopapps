import type { LiveParcelDetail } from '../api/contracts.ts';

export function positiveCharge(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Presentation only: never mutate/recompute the server's ledger or total. */
export function shipmentFinancialDisplay(data: LiveParcelDetail) {
  const costs = data.costs.filter(cost => positiveCharge(cost.amount));
  const services = data.additionalServices?.filter(service => positiveCharge(service.amount)) || [];
  const taxLines = data.importTaxes?.lines.filter(line => positiveCharge(line.amount)) || [];
  const hasTaxes = positiveCharge(data.importTaxes?.total) || taxLines.length > 0;
  return { costs, services, taxLines, hasTaxes, visible: costs.length > 0 || services.length > 0 || hasTaxes || positiveCharge(data.shippingTotal) || positiveCharge(data.goodsValue) || positiveCharge(data.declaredValue) };
}

/** Show the recorded charges once; a tax breakdown may be the only tax source. */
export function shipmentSummaryCosts(data: LiveParcelDetail): LiveParcelDetail['costs'] {
  const costs = shipmentFinancialDisplay(data).costs;
  if (data.importTaxes && positiveCharge(data.importTaxes.total) && !costs.some(cost => cost.labelKey === 'parcel.cost.importTaxes')) {
    costs.push({ label: 'Import taxes', labelKey: 'parcel.cost.importTaxes', amount: data.importTaxes.total, currency: data.importTaxes.currency });
  }
  return costs;
}
