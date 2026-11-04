import type { PaymentMethod } from '../../api/payments-catalog.ts';

const positiveDecimal = (value: string | null | undefined): value is string => typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && /[1-9]/.test(value);
const compactDecimal = (value: string): string => value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;

/** Display the server's fee conditions, never a client-authorized total. The
 * legacy API clears percent/fixed when the merchant pays but leaves minimum;
 * an isolated minimum must therefore not be presented as a customer fee. */
export function paymentFeeConditions(method: PaymentMethod | undefined): { percent: string | null; fixed: string | null; minimum: string | null } | null {
  if (!method) return null;
  const percent = positiveDecimal(method.percent) ? compactDecimal(method.percent) : null;
  const fixed = positiveDecimal(method.additionalFixedCommission) ? compactDecimal(method.additionalFixedCommission) : null;
  if (percent === null && fixed === null) return null;
  const minimum = positiveDecimal(method.minimalCommission) ? compactDecimal(method.minimalCommission) : null;
  return { percent, fixed, minimum };
}
