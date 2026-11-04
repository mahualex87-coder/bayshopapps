export type QuotedWallet = {
  method: 'google-pay' | 'apple-pay'; authorizationTotal: string; currency: string;
  acquirerCountryCode: string; merchantName: string;
  google?: { gatewayMerchantId: string; environment: 'TEST' | 'PRODUCTION'; networks: string[] };
  apple?: { merchantIdentifier: string; networks: string[] };
};

/** Public native merchant metadata must be explicit. The web merchant / client
 * country / OAuth configuration cannot supply missing payment authorization. */
export function normalizeQuotedWallet(value: unknown, paymentType: string): QuotedWallet | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!['apple-pay', 'google-pay'].includes(paymentType) || row.method !== undefined && row.method !== paymentType
    || typeof row.authorizationTotal !== 'string' || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(row.authorizationTotal) || !/[1-9]/.test(row.authorizationTotal)
    || typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency)
    || typeof row.acquirerCountryCode !== 'string' || !/^[A-Z]{2}$/.test(row.acquirerCountryCode)
    || typeof row.merchantName !== 'string' || !row.merchantName.trim() || row.merchantName.length > 100 || /[\u0000-\u001f\u007f]/.test(row.merchantName)) return null;
  const result: QuotedWallet = { method: paymentType as QuotedWallet['method'], authorizationTotal: row.authorizationTotal, currency: row.currency, acquirerCountryCode: row.acquirerCountryCode, merchantName: row.merchantName };
  const networkList = (input: unknown, allowed: string[]): string[] | null => Array.isArray(input) && input.length > 0 && input.length <= allowed.length && input.every(item => typeof item === 'string' && allowed.includes(item)) && new Set(input).size === input.length ? [...input] : null;
  if (paymentType === 'google-pay') {
    const config = row.google as Record<string, unknown> | null;
    const networks = networkList(config?.networks, ['VISA', 'MASTERCARD']);
    if (!config || !networks || typeof config.gatewayMerchantId !== 'string' || !/^[A-Za-z0-9_-]{8,50}$/.test(config.gatewayMerchantId) || !['TEST', 'PRODUCTION'].includes(config.environment as string) || row.apple != null) return null;
    result.google = { gatewayMerchantId: config.gatewayMerchantId, environment: config.environment as 'TEST' | 'PRODUCTION', networks };
  } else {
    const config = row.apple as Record<string, unknown> | null;
    const networks = networkList(config?.networks, ['visa', 'masterCard', 'maestro']);
    if (!config || !networks || typeof config.merchantIdentifier !== 'string' || !/^merchant\.[A-Za-z0-9.-]{1,240}$/.test(config.merchantIdentifier) || row.google != null) return null;
    result.apple = { merchantIdentifier: config.merchantIdentifier, networks };
  }
  return result;
}
