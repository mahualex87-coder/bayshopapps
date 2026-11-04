import { ApiContractError } from './normalize.ts';
import { MutationInputError, type WriteRequest } from './mutations.ts';
export const PUSH_APP_ID = 'com.bayshop.mobile.demo';
export const PUSH_DEVICE_PATH = '/api/member/push-device';
export type PushDeviceBinding = { release(): Promise<void> };
export function pushToken(value: unknown): string {
  if (typeof value !== 'string' || value.length < 20 || value.length > 4096 || !/^[A-Za-z0-9_:.-]+$/.test(value)) throw new MutationInputError('push.unavailable');
  return value;
}
export function validatePushCapability(raw: unknown): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new MutationInputError('push.serverUpdate');
  const data = raw as Record<string, unknown>;
  if (data.version !== 1 || data.provider !== 'fcm' || data.appId !== PUSH_APP_ID) throw new MutationInputError('push.serverUpdate');
}
export function pushDeviceWrite(token: string, enabled: boolean, previousToken?: string): WriteRequest {
  return { method: 'POST', encoding: 'form', fields: { appId: PUSH_APP_ID, token: pushToken(token), enabled: enabled ? '1' : '0', ...(previousToken && previousToken !== token ? { previousToken: pushToken(previousToken) } : {}) } };
}
export function validatePushAcknowledgement(raw: unknown, accountId: string, enabled: boolean): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiContractError('push');
  const envelope = raw as Record<string, unknown>;
  const data = envelope.data as Record<string, unknown> | null;
  if (![false, 0, '0'].includes(envelope.error as never) || Number(envelope.code) !== 200 || !data || data.version !== 1 || String(data.accountId) !== accountId || data.enabled !== enabled) throw new ApiContractError('push');
}
