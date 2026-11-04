import { ApiContractError } from './normalize.ts';
import { MutationInputError, type MutationPlan, type ReadPlan } from './mutations.ts';
import { normalizeCarrierLogo } from './carrier-assets.ts';
import { packingAddresses, packingLocal, type PackingAddresses, type PackingLocal } from './packing-normalize.ts';
import { serverText } from '../domain/server-text.ts';

type Row = Record<string, unknown>;
const contract = () => new ApiContractError('setările expedierii automate');
const object = (value: unknown): Row => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw contract(); return value as Row; };
const list = (value: unknown): unknown[] => { if (!Array.isArray(value)) throw contract(); return value; };
const text = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const display = (value: unknown): string | null => { const valueText = text(value); return valueText ? serverText(valueText) || null : null; };
const numeric = (value: unknown): number | null => { if (value == null || value === '') return null; if (typeof value === 'boolean' || typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))) throw contract(); const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw contract(); return parsed; };
const flag = (value: unknown): boolean | null => { if (value == null || value === '') return null; if ([true, 1, '1'].includes(value as never)) return true; if ([false, 0, '0'].includes(value as never)) return false; throw contract(); };
const identifier = (value: unknown): string | null => { if (value == null || value === '' || value === '0' || value === 0) return null; if (typeof value !== 'string' && typeof value !== 'number' || !/^[1-9]\d*$/.test(String(value))) throw contract(); return String(value); };
const requiredId = (value: unknown): string => { const id = identifier(value); if (!id) throw new MutationInputError('errors.validation'); return id; };
const serviceKey = (value: unknown): string => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new MutationInputError('errors.validation'); return value; };

export type AutoPackingService = { key: string; title: string; description: string | null; selected: boolean | null; price: number | null; oldPrice: number | null };
export type AutoPackingSettings = {
  enabled: boolean | null; insurance: boolean | null; autoDeclaration: boolean | null;
  addressId: string | null; addressName: string | null; shipperId: string | null; shipperName: string | null;
  localDeliveryId: string | null; localAddonId: string | null; localName: string | null;
  serviceFee: number | null; services: AutoPackingService[];
};
export type AutoPackingCarrier = { id: string; title: string; logoUrl: string | null; description: string | null; time: string | null; selfSend: boolean; localDelivery: boolean; insurance: boolean; consolidation?: boolean | null };
export type AutoPackingInsurance = { available: boolean; free: boolean; freeLimit: number | null; percent: number | null; minimum: number | null; maximum: number | null; currency: string | null; services: AutoPackingService[]; notifications: string[] };
export function normalizeAutoPackingSettings(raw: unknown): AutoPackingSettings {
  const row = object(raw);
  const services = Array.isArray(row.additionServices) && row.additionServices.length === 0 ? {} : object(row.additionServices);
  return {
    enabled: flag(row.autoPacking), insurance: flag(row.autoInsurance), autoDeclaration: flag(row.autoDeclaration),
    addressId: identifier(row.autoPackingAddressId), addressName: display(row.autoPackingAddressName), shipperId: identifier(row.autoPackingShippingId), shipperName: display(row.autoPackingShippingName),
    localDeliveryId: identifier(row.autoLocalDeliveryId), localAddonId: identifier(row.autoLocalDeliveryAddonId), localName: display(row.autoLocalDeliveryName),
    // This field is priced by order-declaration in MemberController. It is not a shipping quote.
    serviceFee: numeric(row.autoPackingPrice), services: Object.entries(services).map(([key, rawService]) => { const service = normalizeService(rawService, key); if (service.selected === null) throw contract(); return service; }),
  };
}
function normalizeService(raw: unknown, key?: string): AutoPackingService {
  const row = object(raw); const title = display(row.title); if (!title) throw contract();
  return { key: serviceKey(key ?? row.keyName), title, description: display(row.description), selected: flag(row.selected), price: numeric(row.price), oldPrice: numeric(row.oldPrice) };
}
export function normalizeAutoPackingCarriers(raw: unknown): AutoPackingCarrier[] {
  return list(object(raw).items).map(value => {
    const row = object(value); const title = display(row.title); const selfSend = flag(row.self_send), localDelivery = flag(row.local_delivery), insurance = flag(row.insurance);
    if (!title || selfSend === null || localDelivery === null || insurance === null) throw contract();
    return { id: requiredId(row.id), title, logoUrl: normalizeCarrierLogo(row.flag), description: display(row.description), time: display(row.time), selfSend, localDelivery, insurance, ...(row.consolidation === undefined ? {} : { consolidation: flag(row.consolidation) }) };
  });
}
export function normalizeAutoPackingInsurance(raw: unknown): AutoPackingInsurance {
  const row = object(raw); const available = flag(row.insurance_available), free = flag(row.insurance_free);
  if (available === null || free === null) throw contract();
  return { available, free, freeLimit: numeric(row.insurance_free_limit), percent: numeric(row.insurance_percent), minimum: numeric(row.insurance_min), maximum: numeric(row.insurance_max), currency: text(row.currency), services: list(row.services).map(value => normalizeService(value)), notifications: row.notifications == null ? [] : list(row.notifications).map(value => display(object(value).text)).filter((value): value is string => value !== null) };
}
export type AutoPackingReadCommand =
  | { kind: 'autoPacking.settings'; storageId: string }
  | { kind: 'autoPacking.addresses'; storageId: string; page?: number; search?: string; localDeliveryId?: string }
  | { kind: 'autoPacking.shipping'; storageId: string; addressId: string }
  | { kind: 'autoPacking.localShipping' | 'autoPacking.insurance'; storageId: string; addressId: string; shipperId: string };
export type AutoPackingReadResult<Q extends AutoPackingReadCommand> =
  Q extends { kind: 'autoPacking.settings' } ? AutoPackingSettings :
  Q extends { kind: 'autoPacking.addresses' } ? PackingAddresses :
  Q extends { kind: 'autoPacking.shipping' } ? AutoPackingCarrier[] :
  Q extends { kind: 'autoPacking.localShipping' } ? PackingLocal[] : AutoPackingInsurance;
export function planAutoPackingRead<Q extends AutoPackingReadCommand>(command: Q): ReadPlan<AutoPackingReadResult<Q>> {
  const params = new URLSearchParams({ storage_id: requiredId(command.storageId) });
  let route: string; let normalize: (raw: unknown) => unknown;
  switch (command.kind) {
    case 'autoPacking.settings': return { path: `/api/member/auto-packaging?${params}`, normalize: normalizeAutoPackingSettings } as ReadPlan<AutoPackingReadResult<Q>>;
    case 'autoPacking.addresses': {
      const page = command.page ?? 1; if (!Number.isSafeInteger(page) || page < 1) throw new MutationInputError();
      params.set('page', String(page)); params.set('perPage', '10');
      if (command.search?.trim()) params.set('search', command.search.trim());
      if (command.localDeliveryId) params.set('local_delivery_id', requiredId(command.localDeliveryId));
      route = 'address'; normalize = packingAddresses; break;
    }
    case 'autoPacking.shipping': params.set('address_id', requiredId(command.addressId)); route = 'shipping'; normalize = normalizeAutoPackingCarriers; break;
    case 'autoPacking.localShipping': case 'autoPacking.insurance':
      params.set('address_id', requiredId(command.addressId)); params.set('shipper_id', requiredId(command.shipperId));
      route = command.kind === 'autoPacking.localShipping' ? 'local-shipping' : 'insurance'; normalize = command.kind === 'autoPacking.localShipping' ? packingLocal : normalizeAutoPackingInsurance; break;
  }
  return { path: `/api/profile-auto-packing/${route}?${params}`, normalize } as ReadPlan<AutoPackingReadResult<Q>>;
}
export type AutoPackingSaveInput = { storageId: string; enabled: boolean; insurance: boolean; addressId: string | null; shipperId: string | null; localDeliveryId: string | null; localAddonId: string | null; serviceKeys: string[] };
export function autoPackingDraft(storageId: string, settings: AutoPackingSettings): AutoPackingSaveInput {
  return { storageId, enabled: settings.enabled === true, insurance: settings.insurance === true, addressId: settings.addressId, shipperId: settings.shipperId, localDeliveryId: settings.localDeliveryId, localAddonId: settings.localAddonId, serviceKeys: settings.services.filter(service => service.selected === true).map(service => service.key) };
}
/** Selection ordering is presentation only; it must not turn an unchanged set into an edit. */
export function autoPackingDraftKey(input: AutoPackingSaveInput): string {
  return JSON.stringify({ ...input, serviceKeys: [...input.serviceKeys].sort() });
}
/** The service must freshly verify the preservation capability before dispatch.
 * Never send admin-only policy fields or infer them from an absent legacy field. */
export function planAutoPackingSave(input: AutoPackingSaveInput): MutationPlan {
  if (typeof input.enabled !== 'boolean' || typeof input.insurance !== 'boolean' || !Array.isArray(input.serviceKeys)) throw new MutationInputError('errors.validation');
  if (input.enabled && (!input.addressId || !input.shipperId)) throw new MutationInputError('autoPacking.chooseRoute');
  if (!!input.localDeliveryId !== !!input.localAddonId) throw new MutationInputError('autoPacking.chooseLocal');
  const services = input.serviceKeys.map(serviceKey); if (new Set(services).size !== services.length) throw new MutationInputError('errors.validation');
  return {
    path: `/api/member/auto-packaging?storage_id=${requiredId(input.storageId)}`, method: 'POST', encoding: 'form', responseMode: 'envelope', invalidate: [],
    fields: { autoPacking: input.enabled ? '1' : '0', autoInsurance: input.insurance ? '1' : '0', autoDeclaration: '0', autoPackingAddressId: input.addressId ? requiredId(input.addressId) : '', autoPackingShippingId: input.shipperId ? requiredId(input.shipperId) : '', autoLocalDeliveryId: input.localDeliveryId ? requiredId(input.localDeliveryId) : '', autoLocalDeliveryAddonId: input.localAddonId ? requiredId(input.localAddonId) : '', 'additionService[]': services },
    normalize(raw) { const row = object(raw); if (row.error !== false || row.code !== 200 || row.success === false || row.data && typeof row.data === 'object' && !Array.isArray(row.data) && (row.data as Row).success === false) throw contract(); return { saved: true }; },
  };
}
