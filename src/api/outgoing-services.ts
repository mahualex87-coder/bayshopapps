import { ApiContractError } from './normalize.ts';
import { MutationInputError, type MutationPlan, type MutationResult, type ReadPlan } from './mutations.ts';
import { serverText } from '../domain/server-text.ts';

export const outgoingServiceKeys = ['invoice-creation', 'reinclude-request', 'hold-parcel'] as const;
export type OutgoingServiceKey = typeof outgoingServiceKeys[number];
export type OutgoingServiceState = 'available' | 'requested' | 'completed' | 'cancelled' | 'unknown';
export type OutgoingService = {
  key: OutgoingServiceKey; title: string; description: string | null; price: number | null; currency: string | null;
  state: OutgoingServiceState; enabled: boolean | null; canRequest: boolean; canCancel: boolean;
  mutationMode: 'state-v1' | null; revision: string | null;
};
export type OutgoingServicesData = OutgoingService[];
export type OutgoingServicesReadCommand = { kind: 'outgoing.services'; id: string };
export type OutgoingServiceReview = Pick<OutgoingService, 'revision' | 'state' | 'enabled' | 'price' | 'currency' | 'title' | 'description'>;
export type OutgoingServiceMutationCommand = { kind: 'outgoing.service.set'; id: string; service: OutgoingServiceKey; enabled: boolean; review: OutgoingServiceReview };
const fail = () => new ApiContractError('serviciile expedierii');
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(); return value as Record<string, unknown>; }
function text(value: unknown): string | null { if (value == null || value === '') return null; if (typeof value !== 'string') throw fail(); return value; }
function flag(value: unknown): boolean | null { if (value == null) return null; if ([true, 1, '1'].includes(value as never)) return true; if ([false, 0, '0'].includes(value as never)) return false; throw fail(); }
function price(value: unknown): number | null { if (value == null || value === '') return null; if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))) throw fail(); const result = Number(value); if (!Number.isFinite(result) || result < 0) throw fail(); return result; }
function parcelId(id: string): string { if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new MutationInputError(); return id; }
export function normalizeOutgoingServices(raw: unknown): OutgoingServicesData {
  if (!Array.isArray(raw)) throw fail();
  const result = raw.map(value => {
    const row = object(value); const key = text(row.keyName);
    if (!outgoingServiceKeys.includes(key as OutgoingServiceKey)) return null;
    const title = serverText(text(row.title) || ''); const description = text(row.description); const currency = text(row.currency)?.toUpperCase() ?? null;
    if (!title || currency !== null && !/^[A-Z]{3}$/.test(currency)) throw fail();
    const state = text(row.state) ?? 'unknown';
    if (!['available', 'requested', 'completed', 'cancelled', 'unknown'].includes(state)) throw fail();
    const mutationMode = row.mutationMode === 'state-v1' ? 'state-v1' : null;
    const revision = text(row.revision); const enabled = flag(row.enabled);
    if (mutationMode && (!revision || !/^[a-f0-9]{64}$/.test(revision) || enabled === null || state === 'unknown')) throw fail();
    const canRequest = mutationMode !== null && flag(row.canRequest) === true;
    const canCancel = mutationMode !== null && flag(row.canCancel) === true;
    if (canRequest && (enabled || state === 'completed') || canCancel && (!enabled || state === 'completed')) throw fail();
    return { key: key as OutgoingServiceKey, title, description: description ? serverText(description) || null : null, price: price(row.price), currency, state: state as OutgoingServiceState, enabled, canRequest, canCancel, mutationMode, revision };
  }).filter((value): value is OutgoingService => value !== null);
  if (new Set(result.map(item => item.key)).size !== result.length) throw fail();
  return result;
}
export function outgoingServiceReview(service: OutgoingService): OutgoingServiceReview {
  return { revision: service.revision, state: service.state, enabled: service.enabled, price: service.price, currency: service.currency, title: service.title, description: service.description };
}
export function validateOutgoingServiceMutation(command: OutgoingServiceMutationCommand, current: OutgoingServicesData): void {
  parcelId(command.id);
  if (!outgoingServiceKeys.includes(command.service) || typeof command.enabled !== 'boolean') throw new MutationInputError();
  const item = current.find(item => item.key === command.service);
  if (!item || item.mutationMode !== 'state-v1' || !item.revision) throw new MutationInputError('outgoingServices.unavailable');
  if (JSON.stringify(outgoingServiceReview(item)) !== JSON.stringify(command.review)) throw new MutationInputError('outgoingServices.changed');
  if (command.enabled ? !item.canRequest || item.enabled || item.price === null || !item.currency : !item.canCancel || !item.enabled) throw new MutationInputError('outgoingServices.changed');
}
export function planOutgoingServicesRead(command: OutgoingServicesReadCommand): ReadPlan<OutgoingServicesData> {
  return { path: `/api/outgoing-service/${parcelId(command.id)}?state=1`, normalize: normalizeOutgoingServices };
}
export function planOutgoingServiceMutation(command: OutgoingServiceMutationCommand): MutationPlan {
  parcelId(command.id);
  if (!outgoingServiceKeys.includes(command.service) || typeof command.enabled !== 'boolean' || !command.review || !/^[a-f0-9]{64}$/.test(command.review.revision || '')) throw new MutationInputError();
  return { path: `/api/outgoing-service/${command.id}`, method: 'POST', encoding: 'form', fields: { serviceKey: command.service, enabled: command.enabled ? '1' : '0', expectedRevision: command.review.revision }, responseMode: 'envelope', invalidate: ['sent', 'received', 'balance'], normalize(raw) { const row = object(raw); if (![false, 0, '0'].includes(row.error as never) || Number(row.code) !== 200 || row.message !== 'Ok') throw fail(); return { success: true }; } };
}
export function outgoingServiceConfirmed(command: OutgoingServiceMutationCommand, data: OutgoingServicesData): boolean {
  const item = data.find(item => item.key === command.service);
  return !!item && item.mutationMode === 'state-v1' && item.enabled === command.enabled && (command.enabled ? item.state === 'requested' || item.state === 'completed' : item.state === 'available' || item.state === 'cancelled');
}
/** Never replay a write after timeout. A fresh read alone can confirm its result. */
export async function changeOutgoingService(command: OutgoingServiceMutationCommand, send: () => Promise<MutationResult>, read: () => Promise<OutgoingServicesData>): Promise<{ outcome: 'confirmed' | 'unknown' | 'rejected'; error?: string }> {
  let result: MutationResult;
  try { result = await send(); } catch { result = { ok: false, outcome: 'unknown' }; }
  if (!result.ok && result.outcome !== 'unknown') return { outcome: 'rejected', error: result.error };
  try { if (outgoingServiceConfirmed(command, await read())) return { outcome: 'confirmed' }; } catch { /* Keep the attempt unresolved; do not repeat it. */ }
  return { outcome: 'unknown', error: result.error };
}
