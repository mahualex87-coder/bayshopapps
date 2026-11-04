export type WalletMethod = 'google-pay' | 'apple-pay';
export type WalletConfig = {
  method: WalletMethod;
  google?: { gatewayMerchantId: string; environment: 'TEST' | 'PRODUCTION'; networks: string[] };
  apple?: { merchantIdentifier: string; networks: string[] };
};
export type WalletRequest = WalletConfig & {
  requestId: string;
  amount: string;
  currencyCode: string;
  /** Acquirer / processing country. Never infer from the customer's delivery country. */
  countryCode: string;
  merchantName: string;
};
export type WalletToken = { requestId: string; method: WalletMethod; token: string };
export interface NativeWallet {
  protocolVersion: number;
  isReadyAsync(config: WalletConfig): Promise<boolean>;
  presentAsync(request: WalletRequest): Promise<unknown>;
  completeAsync(requestId: string, success: boolean): Promise<boolean>;
  cancelAsync(requestId: string): Promise<boolean>;
}
export type WalletErrorCode = 'unavailable' | 'invalid_request' | 'busy' | 'cancelled' | 'timeout' | 'failed' | 'expired' | 'invalid_result';
export class WalletError extends Error {
  readonly code: WalletErrorCode;
  constructor(code: WalletErrorCode) { super(`wallet.${code}`); this.name = 'WalletError'; this.code = code; }
}
const idPattern = /^[A-Za-z0-9_-]{16,64}$/;
export function validRequestId(value: unknown): value is string { return typeof value === 'string' && idPattern.test(value); }
const fail = (): never => { throw new WalletError('invalid_request'); };
function networks(value: unknown, allowed: string[]): string[] {
  if (!Array.isArray(value) || !value.length || value.length > allowed.length || value.some(x => typeof x !== 'string' || !allowed.includes(x)) || new Set(value).size !== value.length) return fail();
  return [...value];
}
/** Whitelist projection prevents extra fields (tokens, raw card data, OAuth IDs) reaching native. */
export function walletConfig(value: WalletConfig, platform: string): WalletConfig {
  if (!value || (value.method === 'google-pay' ? platform !== 'android' : value.method === 'apple-pay' ? platform !== 'ios' : true)) throw new WalletError('unavailable');
  if (value.method === 'google-pay') {
    const g = value.google;
    if (!g || typeof g.gatewayMerchantId !== 'string' || !/^[A-Za-z0-9_-]{8,50}$/.test(g.gatewayMerchantId) || !['TEST', 'PRODUCTION'].includes(g.environment)) return fail();
    return { method: value.method, google: { gatewayMerchantId: g.gatewayMerchantId, environment: g.environment, networks: networks(g.networks, ['VISA', 'MASTERCARD']) } };
  }
  const a = value.apple;
  if (!a || typeof a.merchantIdentifier !== 'string' || !/^merchant\.[A-Za-z0-9.-]{1,240}$/.test(a.merchantIdentifier)) return fail();
  return { method: value.method, apple: { merchantIdentifier: a.merchantIdentifier, networks: networks(a.networks, ['visa', 'masterCard', 'maestro']) } };
}
export function walletRequest(value: WalletRequest, platform: string): WalletRequest {
  const config = walletConfig(value, platform);
  if (!validRequestId(value.requestId) || typeof value.amount !== 'string' || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value.amount) || !/[1-9]/.test(value.amount) || !/^[A-Z]{3}$/.test(value.currencyCode) || !/^[A-Z]{2}$/.test(value.countryCode) || typeof value.merchantName !== 'string' || !value.merchantName.trim() || value.merchantName.length > 100 || /[\u0000-\u001f\u007f]/.test(value.merchantName)) return fail();
  return { ...config, requestId: value.requestId, amount: value.amount, currencyCode: value.currencyCode, countryCode: value.countryCode, merchantName: value.merchantName };
}
export function walletToken(value: unknown, expected: WalletRequest): WalletToken {
  const r = value as Partial<WalletToken> | null;
  if (!r || r.requestId !== expected.requestId || r.method !== expected.method || typeof r.token !== 'string' || !r.token.length || r.token.length > 16384 || r.token.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(r.token)) throw new WalletError('invalid_result');
  return { requestId: expected.requestId, method: expected.method, token: r.token };
}
