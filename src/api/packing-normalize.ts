import { serverText } from '../domain/server-text.ts';
import type { LiveParcel } from './contracts.ts';
import { ApiContractError } from './normalize.ts';
import { normalizeCarrierLogo } from './carrier-assets.ts';
import { pickupCoordinates, type Coordinates } from '../domain/pickup-points.ts';

type Row = Record<string, unknown>;
const object = (raw: unknown): Row => { if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiContractError('pregătirea expedierii'); return raw as Row; };
const array = (raw: unknown): unknown[] => { if (!Array.isArray(raw)) throw new ApiContractError('opțiunile expedierii'); return raw; };
const text = (raw: unknown): string | null => typeof raw === 'string' && raw.trim() ? raw : null;
const id = (raw: unknown): string => { const value = typeof raw === 'number' ? String(raw) : text(raw); if (!value || !/^[1-9]\d*$/.test(value)) throw new ApiContractError('identificatorul opțiunii'); return value; };
const bool = (raw: unknown): boolean => { if ([true, 1, '1'].includes(raw as never)) return true; if ([false, 0, '0'].includes(raw as never)) return false; throw new ApiContractError('disponibilitatea opțiunii'); };
const number = (raw: unknown): number | null => { if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null; if (typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw)) return Number(raw); return null; };
const integer = (raw: unknown): number => { const value = number(raw); if (value === null || !Number.isSafeInteger(value) || value < 0) throw new ApiContractError('paginarea destinatarilor'); return value; };
export function packingText(raw: unknown): string | null { return text(raw) ? serverText(raw) || null : null; }
const notifications = (row: Row): string[] => row.notifications === undefined ? [] : array(row.notifications).map(value => packingText(object(value).text)).filter((value): value is string => value !== null);

export type PackingAddress = { id: string; name: string | null; address: string | null; city: string | null; country: string | null; phone: string | null; completed: boolean; price: number | null; currency: string | null };
export type PackingAddresses = { items: PackingAddress[]; page: number; pages: number; total: number; notifications: string[] };
/** Reuse the current API row, never a stale selected address snapshot. Missing,
 * loading and failed pages cannot authorize continuation or a final submission. */
export function packingSelectedAddress(selected: Pick<PackingAddress, 'id'> | null, resource: { data: PackingAddresses | null; loading: boolean; error: string | null }): PackingAddress | null {
  if (!selected || resource.loading || resource.error) return null;
  return resource.data?.items.find(item => item.id === selected.id) ?? null;
}
export function packingAddresses(raw: unknown): PackingAddresses {
  const row = object(raw);
  return { page: integer(row.page), pages: integer(row.pagesCount), total: integer(row.itemsCount), notifications: notifications(row), items: array(row.items).map(value => {
    const item = object(value);
    return { id: id(item.id), name: text(item.complete_name) ?? ([text(item.first_name), text(item.last_name)].filter(Boolean).join(' ') || null), address: text(item.address), city: text(item.city), country: text(item.country), phone: text(item.phone), completed: bool(item.address_completed), price: number(item.localDeliveryRegionPrice), currency: text(item.currency) };
  }) };
}
export type PackingCarrier = { id: string; title: string; logoUrl?: string | null; description: string | null; time: string | null; price: number | null; currency: string | null; overweight: boolean; selfSend: boolean; localDelivery: boolean; insurance: boolean; consolidation: boolean };
export type PackingCarriers = { items: PackingCarrier[]; notifications: string[] };
export function packingCarriers(raw: unknown): PackingCarriers {
  const row = object(raw);
  return { notifications: notifications(row), items: array(row.items).map(value => {
    const item = object(value); const title = text(item.title); if (!title) throw new ApiContractError('transportatorul');
    return { id: id(item.id), title, ...(item.flag === undefined ? {} : { logoUrl: normalizeCarrierLogo(item.flag) }), description: packingText(item.description), time: text(item.time), price: number(item.price), currency: text(item.currency), overweight: bool(item.overweight), selfSend: bool(item.self_send), localDelivery: bool(item.local_delivery), insurance: bool(item.insurance), consolidation: bool(item.consolidation) };
  }) };
}
export type PackingLocalOption = { id: string; address: string; price: number | null; currency: string | null; coordinates?: Coordinates | null; allowConsolidation?: boolean | null; consolidationMessage?: string | null };
export type PackingLocal = { minPrice?: number | null; maxPrice?: number | null; id: string; title: string; logoUrl?: string | null; description: string | null; price: number | null; currency: string | null; optionsKey: string; options: PackingLocalOption[] };
export function packingLocal(raw: unknown): PackingLocal[] {
  return array(object(raw).items).map(value => {
    const row = object(value); const title = text(row.title); const optionsKey = text(row.options_key);
    if (!title || !optionsKey) throw new ApiContractError('livrarea locală');
    return { id: id(row.id), title, ...(row.flag === undefined ? {} : { logoUrl: normalizeCarrierLogo(row.flag) }), description: packingText(row.description), price: number(row.price), currency: text(row.currency), ...(row.min_price === undefined ? {} : { minPrice: number(row.min_price) }), ...(row.max_price === undefined ? {} : { maxPrice: number(row.max_price) }), optionsKey, options: array(row.options).map(option => {
      const item = object(option); const address = text(item.address); if (!address) throw new ApiContractError('punctul de livrare');
      return { id: id(item.id), address, price: number(item.price), currency: text(item.currency), coordinates: pickupCoordinates(item.latitude, item.longitude), allowConsolidation: item.allowConsolidation == null ? null : bool(item.allowConsolidation), consolidationMessage: packingText(item.consolidationMessage) };
    }) };
  });
}
export type PackingService = { key: string; title: string; description: string | null; price: number | null };
export type PackingInsurance = { available: boolean; free: boolean; currency: string | null; percent: number | null; minimum: number | null; maximum: number | null; declaredAmount: number | null; services: PackingService[]; notifications: string[] };
export function packingInsurance(raw: unknown): PackingInsurance {
  const row = object(raw);
  return { available: bool(row.insurance_available), free: bool(row.insurance_free), currency: text(row.currency), percent: number(row.insurance_percent), minimum: number(row.insurance_min), maximum: number(row.insurance_max), declaredAmount: number(row.currency_price), notifications: notifications(row), services: array(row.services).map(value => {
    const item = object(value); const key = text(item.keyName); const title = text(item.title);
    if (!key || !/^[a-zA-Z0-9_-]+$/.test(key) || !title) throw new ApiContractError('serviciul suplimentar');
    return { key, title, description: packingText(item.description), price: number(item.price) };
  }) };
}

/** A missing safety flag is not evidence that a parcel is ready to dispatch. */
export function packingEligibility(parcel: LiveParcel): string | null {
  if (parcel.stage !== 'warehouse' || !parcel.storageId || parcel.declared !== true) return 'packing.declarationRequired';
  if (parcel.restrictions?.heldByProhibition === true || parcel.restrictions?.heldByDamage === true || parcel.restrictions?.packingDenied === true) return 'packing.restricted';
  if (!parcel.restrictions || [parcel.restrictions.heldByProhibition, parcel.restrictions.heldByDamage, parcel.restrictions.packingDenied].some(value => value !== false)) return 'packing.availabilityUnknown';
  return null;
}

export function packingLocalFields(local: PackingLocal | null, optionId: string, localAddress: PackingAddress | null): { local_delivery?: string; terminal?: string; localStorage?: string; localAddressId?: string } {
  if (!local) return {};
  if (local.optionsKey === 'localAddressId') {
    if (!localAddress?.completed) throw new ApiContractError('adresa locală');
    return { local_delivery: local.id, localAddressId: localAddress.id };
  }
  if (!local.options.some(option => option.id === optionId)) throw new ApiContractError('punctul de livrare');
  if (local.optionsKey === 'terminal') return { local_delivery: local.id, terminal: optionId };
  if (local.optionsKey.startsWith('localStorage-')) return { local_delivery: local.id, localStorage: optionId };
  throw new ApiContractError('tipul livrării locale');
}
