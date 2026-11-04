import { ApiContractError } from './normalize.ts';
import { packingAddresses, packingText, type PackingAddress } from './packing-normalize.ts';
import { pickupCoordinates, type Coordinates } from '../domain/pickup-points.ts';
import { normalizeCarrierLogo } from './carrier-assets.ts';

type Row = Record<string, unknown>;
const row = (value: unknown): Row => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiContractError('livrarea locală'); return value as Row; };
const array = (value: unknown): unknown[] => { if (!Array.isArray(value)) throw new ApiContractError('opțiunile livrării'); return value; };
const text = (value: unknown): string | null => { if (value == null || value === '') return null; if (typeof value !== 'string') throw new ApiContractError('detaliile livrării'); return value; };
const required = (value: unknown): string => { const result = text(value); if (!result) throw new ApiContractError('detaliile livrării'); return result; };
const id = (value: unknown): string => { const result = String(value); if (!/^[1-9]\d*$/.test(result) || !Number.isSafeInteger(Number(result))) throw new ApiContractError('identificatorul livrării'); return result; };
const amount = (value: unknown): number | null => { if (value == null || value === '') return null; if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))) throw new ApiContractError('costul livrării'); const result = Number(value); if (!Number.isFinite(result) || result < 0) throw new ApiContractError('costul livrării'); return result; };
const bool = (value: unknown): boolean | null => { if (value == null) return null; if ([0, '0', false].includes(value as never)) return false; if ([1, '1', true].includes(value as never)) return true; throw new ApiContractError('opțiunea livrării'); };

export type DeliveryOption = { id: string; address: string; price: number | null; currency: string | null; allowConsolidation: boolean | null; consolidationMessage: string | null; coordinates?: Coordinates | null };
export type DeliveryMethod = { minPrice?: number | null; maxPrice?: number | null; id: string; title: string; logoUrl?: string | null; description: string | null; price: number | null; currency: string | null; optionsKey: string; options: DeliveryOption[]; additionalService: { title: string; price: number | null } | null };

/** OpenAPI LocalDeliveryMethod/Option and captured parcel-local-delivery reads. */
export function normalizeDeliveryMethods(raw: unknown): DeliveryMethod[] {
  const methods = array(row(raw).items).map(value => {
    const item = row(value); const extra = item.addition_service == null ? null : row(item.addition_service);
    const options = array(item.options).map(value => { const option = row(value); return { id: id(option.id), address: required(option.address), price: amount(option.price), currency: text(option.currency), allowConsolidation: bool(option.allowConsolidation), consolidationMessage: packingText(option.consolidationMessage), coordinates: pickupCoordinates(option.latitude, option.longitude) }; });
    if (new Set(options.map(option => option.id)).size !== options.length) throw new ApiContractError('opțiunile livrării');
    return { id: id(item.id), title: required(item.title), ...(item.flag === undefined ? {} : { logoUrl: normalizeCarrierLogo(item.flag) }), description: packingText(item.description), price: amount(item.price), currency: text(item.currency), ...(item.min_price === undefined ? {} : { minPrice: amount(item.min_price) }), ...(item.max_price === undefined ? {} : { maxPrice: amount(item.max_price) }), optionsKey: required(item.options_key), options, additionalService: extra ? { title: required(extra.title), price: amount(extra.price) } : null };
  });
  if (new Set(methods.map(method => method.id)).size !== methods.length) throw new ApiContractError('opțiunile livrării');
  return methods;
}
export const normalizeDeliveryAddresses = packingAddresses;
export type DeliverySelection = { local_delivery: string; localStorage?: string; terminal?: string; localAddressId?: string };
export function supportedDeliveryMethod(method: DeliveryMethod): boolean { return method.optionsKey === 'terminal' || method.optionsKey === 'localAddressId' || /^localStorage-[a-zA-Z0-9_-]+$/.test(method.optionsKey); }

/** The update endpoint uses localStorage (not the display options_key). Only
 * an option returned for this parcel can be selected; never infer address IDs. */
export function deliverySelection(method: DeliveryMethod, optionId: string, address: PackingAddress | null): DeliverySelection {
  if (!supportedDeliveryMethod(method)) throw new ApiContractError('tipul livrării locale');
  if (method.optionsKey === 'localAddressId') {
    if (!address?.completed) throw new ApiContractError('adresa livrării locale');
    return { local_delivery: method.id, localAddressId: address.id };
  }
  if (!method.options.some(option => option.id === optionId)) throw new ApiContractError('punctul de livrare');
  return method.optionsKey === 'terminal' ? { local_delivery: method.id, terminal: optionId } : { local_delivery: method.id, localStorage: optionId };
}
export function deliveryReviewKey(method: DeliveryMethod, optionId: string, address: PackingAddress | null): string {
  const selected = deliverySelection(method, optionId, address);
  return JSON.stringify({ selected, method, option: method.options.find(option => option.id === optionId) || null, address });
}
