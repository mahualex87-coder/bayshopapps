import { serverText } from '../domain/server-text.ts';
import type { LiveAddressField, LiveAddressLabelKey, LiveAuthSession, LiveBalance, LiveCounters, LiveMoney, LiveParcel, LiveParcelDetail, LiveParcelStage, LiveProfile, LiveRecipientAddress, LiveTransaction, LiveWarehouse, LiveWarehouseAddress } from './contracts';

/** A contract failure is distinct from an empty account or a zero balance. */
export class ApiContractError extends Error {
  readonly resource: string;
  readonly key = 'errors.contract';
  readonly params = {};
  constructor(resource: string) {
    super(`Formatul datelor pentru ${resource} nu este încă acceptat. Încearcă din nou sau consultă cabinetul BayShop.`);
    this.name = 'ApiContractError';
    this.resource = resource;
  }
}

type RecordData = Record<string, unknown>;
const isObject = (value: unknown): value is RecordData => typeof value === 'object' && value !== null && !Array.isArray(value);
function object(value: unknown, resource: string): RecordData {
  if (!isObject(value)) throw new ApiContractError(resource);
  return value;
}
function list(value: unknown, resource: string): unknown[] {
  if (!Array.isArray(value)) throw new ApiContractError(resource);
  return value;
}
function optionalText(value: unknown, resource: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new ApiContractError(resource);
  return value;
}
function requiredText(value: unknown, resource: string): string {
  const result = optionalText(value, resource);
  if (!result || !result.trim()) throw new ApiContractError(resource);
  return result;
}
function amount(value: unknown, resource: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value))) throw new ApiContractError(resource);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new ApiContractError(resource);
  return result;
}
function requiredAmount(value: unknown, resource: string): number {
  const result = amount(value, resource);
  if (result === null) throw new ApiContractError(resource);
  return result;
}
function gramsToKg(value: unknown, resource: string): number | null {
  const grams = amount(value, resource);
  if (grams !== null && grams < 0) throw new ApiContractError(resource);
  return grams === null ? null : grams / 1000;
}
function uniqueIds<T extends { id: string }>(values: T[], resource: string): T[] {
  if (new Set(values.map(value => value.id)).size !== values.length) throw new ApiContractError(resource);
  return values;
}

function optionalStringFlag(value: unknown, resource: string): boolean | null {
  if (value == null) return null;
  if (value !== '0' && value !== '1') throw new ApiContractError(resource);
  return value === '1';
}

function optionalBoolean(value: unknown, resource: string): boolean | null {
  if (value == null) return null;
  if (typeof value !== 'boolean') throw new ApiContractError(resource);
  return value;
}

/** API history supplies wall-clock SQL timestamps without an offset. Compare
 * their calendar components, never invent a timezone. Unknown dates stay last
 * in their original order. */
function historyDateKey(value: string | null): number | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return null;
  return Number(match.slice(1).join(''));
}

/** All normalizers accept the already-unwrapped response.data, never an envelope. */
export function normalizeProfileData(data: unknown): LiveProfile {
  const resource = 'profil';
  const row = object(data, resource);
  // Exact GET /api/auth contract; personal-data has a separate response shape.
  return { id: requiredText(row.id, resource), clientCode: optionalText(row.uid, resource), firstName: optionalText(row.name, resource), lastName: optionalText(row.surname, resource), email: null, phone: null };
}

export function normalizeAuthData(data: unknown): LiveAuthSession {
  const resource = 'autentificare';
  const row = object(data, resource);
  const accessToken = requiredText(row.access_token, resource);
  if (/[^\x21-\x7e]/.test(accessToken) || requiredText(row.token_type, resource).toLowerCase() !== 'bearer') throw new ApiContractError(resource);
  const expiresInSeconds = requiredAmount(row.expires_in, resource);
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0) throw new ApiContractError(resource);
  return { accessToken, expiresInSeconds, tokenType: 'Bearer', profile: normalizeProfileData(row) };
}

/** GET /api/member/counters: current responses encode counts as numeric strings. */
export function normalizeCountersData(data: unknown): LiveCounters {
  const resource = 'numărul coletelor';
  const row = object(data, resource);
  function count(key: keyof LiveCounters): number {
    const value = row[key];
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) throw new ApiContractError(resource);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new ApiContractError(resource);
    return parsed;
  }
  return { awaiting: count('awaiting'), incoming: count('incoming'), outgoing: count('outgoing'), received: count('received') };
}

/** Legacy official Apiary: GET /api/member/personal-data. This response does
 * not contain an account ID, so the authenticated identity is passed separately. */
export function normalizePersonalProfileData(data: unknown, profile: LiveProfile): LiveProfile {
  const resource = 'datele personale';
  const row = object(data, resource);
  const phone = optionalText(row.phone, resource);
  const phoneCode = optionalText(row.phoneCode, resource);
  const languages = row.languages == null ? row.languages : Object.fromEntries(Object.entries(object(row.languages, resource)).map(([id, title]) => [id, requiredText(title, resource)]));
  return {
    ...profile, firstName: optionalText(row.name, resource), lastName: optionalText(row.surname, resource), phone: phone === null ? null : phone.startsWith('+') || phoneCode === null ? phone : `${phoneCode}${phone}`,
    ...(row.countryId !== undefined ? { countryId: optionalText(row.countryId, resource) } : {}),
    ...(row.languageId !== undefined ? { languageId: optionalText(row.languageId, resource) } : {}),
    ...(row.languageCode !== undefined ? { languageCode: optionalText(row.languageCode, resource) } : {}),
    ...(languages !== undefined ? { languages } : {}),
  };
}

/** Current balances are also explicitly present in the legacy personal-data
 * response, independent of transaction history. This is not a history fallback. */
export function normalizePersonalBalancesData(data: unknown): LiveMoney[] {
  const resource = 'soldurile profilului';
  const values = object(object(data, resource).balance, resource);
  const balances = Object.entries(values).map(([code, value]) => {
    if (!/^[A-Za-z]{3}$/.test(code)) throw new ApiContractError(resource);
    return { currency: code.toUpperCase(), amount: requiredAmount(value, resource) };
  });
  if (new Set(balances.map(balance => balance.currency)).size !== balances.length) throw new ApiContractError(resource);
  return balances;
}

export function normalizeStockData(data: unknown): LiveParcel[] {
  const resource = 'coletele în stoc';
  const rows = list(object(data, resource).list, resource);
  return uniqueIds(rows.map(value => {
    const row = object(value, resource);
    if (row.isDeclarationFilled !== undefined && row.isDeclarationFilled !== null && row.isDeclarationFilled !== '0' && row.isDeclarationFilled !== '1') throw new ApiContractError(resource);
    return {
      id: requiredText(row.id, resource), uid: optionalText(row.uid, resource), title: optionalText(row.title, resource), tracking: optionalText(row.tracking, resource),
      storageId: optionalText(row.storageId, resource), countryCode: null, stage: 'warehouse' as const, status: null, statusLabel: null,
      createdAt: optionalText(row.createdDate, resource) ?? optionalText(row.created, resource), weightKg: gramsToKg(row.weight, resource),
      declared: row.isDeclarationFilled == null ? null : row.isDeclarationFilled === '1', currency: optionalText(row.currency, resource), amount: amount(row.price, resource), amountKind: 'productValue' as const,
      verificationComment: optionalText(row.verificationPackageRequestedComments, resource),
      verificationRequestStatus: optionalText(row.verificationPackageRequestStatus, resource),
      serviceStates: Object.fromEntries(Object.entries({ photos: 'photosPackageRequestStatus', verification: 'verificationPackageRequestStatus', declaration: 'declarationRequestStatus', division: 'divideRequestedStatus', label: 'labelRequestStatus' }).filter(([, key]) => Object.prototype.hasOwnProperty.call(row, key)).map(([kind, key]) => [kind, optionalText(row[key], resource)])),
      restrictions: {
        heldByProhibition: optionalStringFlag(row.isHeldByProhibition, resource), prohibitionComment: optionalText(row.heldByProhibitionComment, resource),
        heldByDamage: optionalStringFlag(row.isHeldByDamage, resource), damageComment: optionalText(row.heldByDamageComment, resource),
        packingDenied: optionalBoolean(row.packingDenied, resource),
      },
    };
  }), resource);
}

/** The documented endpoint is payment HISTORY, not the current balance. */
export function normalizeBalanceHistoryData(data: unknown): LiveBalance {
  const resource = 'istoricul soldului';
  const raw = object(data, resource).balanceList;
  // PHP serializes an empty associative collection as []; it is a valid empty history.
  const balances = Array.isArray(raw) && raw.length === 0 ? {} : object(raw, resource);
  const transactions: LiveTransaction[] = [];
  for (const [code, values] of Object.entries(balances)) {
    if (!/^[a-zA-Z]{3}$/.test(code)) throw new ApiContractError(resource);
    const currency = code.toUpperCase();
    for (const value of list(values, resource)) {
      const row = object(value, resource);
      if (row.type !== 'plus' && row.type !== 'minus') throw new ApiContractError(resource);
      const absolute = requiredAmount(row.summ, resource);
      if (absolute < 0) throw new ApiContractError(resource);
      transactions.push({ id: optionalText(row.trid, resource), date: optionalText(row.created, resource), label: row.comment == null ? null : serverText(optionalText(row.comment, resource)), amount: row.type === 'minus' ? -absolute : absolute, currency, balanceAfter: amount(row.total_amount, resource), status: optionalText(row.status, resource) });
    }
  }
  // Legacy references are not a row identity guarantee. Keep every financial
  // row, including missing/repeated TRIDs; presentation supplies separate keys.
  const ordered = transactions.map((transaction, index) => ({ transaction, index, date: historyDateKey(transaction.date) }));
  ordered.sort((a, b) => a.date === null ? b.date === null ? a.index - b.index : 1 : b.date === null ? -1 : b.date - a.date || a.index - b.index);
  return { balances: null, transactions: ordered.map(item => item.transaction) };
}

/** GET /api/refund-request returns the current memberBalance alongside options.
 * This reads the withdrawal screen's data; it does not create a withdrawal. */
export function normalizeCurrentBalancesData(data: unknown): LiveMoney[] {
  const resource = 'soldul curent';
  const rows = list(object(data, resource).memberBalance, resource);
  const balances = rows.map(value => {
    const row = object(value, resource);
    const currency = requiredText(row.currency_code, resource).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ApiContractError(resource);
    return { currency, amount: requiredAmount(row.amount, resource) };
  });
  if (new Set(balances.map(balance => balance.currency)).size !== balances.length) throw new ApiContractError(resource);
  return balances;
}

/** Documented warehouse metadata from GET /api/calculator. This may describe
 * only calculator-supported warehouses, not every warehouse in the account. */
export function normalizeCalculatorWarehousesData(data: unknown): LiveWarehouse[] {
  const resource = 'depozitele calculatorului';
  return uniqueIds(list(object(data, resource).storageList, resource).map(value => {
    const row = object(value, resource);
    const code = requiredText(row.code, resource).toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) throw new ApiContractError(resource);
    return { id: requiredText(row.id, resource), code, title: requiredText(row.title, resource) };
  }), resource);
}

const addressLabelKeys: Record<string, LiveAddressLabelKey> = {
  fullName: 'field.fullName', userName: 'field.fullName', first_name: 'field.firstName', last_name: 'field.lastName', companyName: 'field.company', company_name: 'field.company',
  address1: 'field.addressLine1', address2: 'field.addressLine2', address: 'field.address', city: 'field.city', state: 'field.region', zipCode: 'field.postalCode', zip: 'field.postalCode',
  countryTitle: 'field.country', country_title: 'field.country', country: 'field.country', phone: 'field.phone',
};

function addressFields(row: RecordData, resource: string, definitions: [string, string, boolean][]): LiveAddressField[] {
  return definitions.flatMap(([key, label, personal]) => {
    const value = optionalText(row[key], resource);
    return value === null ? [] : [{ label, labelKey: addressLabelKeys[key], value, personal }];
  });
}

/** Only for GET /api/get-member-mf-addresses (explicitly marked Old in OpenAPI). */
export function normalizeLegacyWarehouseAddressData(data: unknown): LiveWarehouseAddress[] {
  const resource = 'adresele depozitelor';
  return list(data, resource).map((value, index) => {
    const row = object(value, resource);
    const countryCode = requiredText(row.countryCode, resource);
    const countryTitle = requiredText(row.countryTitle, resource);
    return { id: `${countryCode}:${index}`, countryCode, title: countryTitle, countryTitle, fields: addressFields(row, resource, [
      ['fullName', 'Nume / Prenume', true], ['address1', 'Adresa, linia 1', true], ['address2', 'Adresa, linia 2', true], ['city', 'Oraș', false], ['state', 'Regiune', false], ['zipCode', 'Cod poștal', false], ['countryTitle', 'Țară', false], ['phone', 'Telefon', false],
    ]) };
  });
}

/** getVolumeData returns stored cm; WpPackage.getVolumeDataInStorageSize
 * converts those values to inches only for the warehouse display. */
export function normalizeParcelDimensions(value: unknown): NonNullable<LiveParcelDetail['dimensionsCm']> | null {
  const resource = 'dimensiunile coletului';
  if (value == null) return null;
  const source = object(value, resource);
  const x = amount(source.x, resource), y = amount(source.y, resource), z = amount(source.z, resource);
  if ([x, y, z].some(axis => axis !== null && axis < 0)) throw new ApiContractError(resource);
  return x === null && y === null && z === null ? null : { x, y, z };
}

export function normalizeLocalDeliveryData(value: unknown): LiveParcelDetail['localDelivery'] {
  const resource = 'destinația locală';
  const delivery = value == null ? null : object(value, resource);
  const deliveryAddress = delivery?.address_array == null ? null : object(delivery.address_array, resource);
  const coordinates = delivery?.coordinates == null ? null : object(delivery.coordinates, resource);
  const latitude = coordinates ? amount(coordinates.lat, resource) : null;
  const longitude = coordinates ? amount(coordinates.lng, resource) : null;
  if (latitude !== null && Math.abs(latitude) > 90 || longitude !== null && Math.abs(longitude) > 180) throw new ApiContractError(resource);
  return delivery === null ? null : {
    key: optionalText(delivery.key, resource), type: optionalText(delivery.type, resource), title: optionalText(delivery.title, resource),
    address: optionalText(delivery.address, resource), country: optionalText(delivery.country, resource), phone: optionalText(delivery.phone, resource),
    addressFields: deliveryAddress ? addressFields(deliveryAddress, resource, [['first_name', 'Prenume', true], ['last_name', 'Nume', true], ['company_name', 'Companie', true], ['address', 'Adresa', true], ['city', 'Oraș', true], ['state', 'Regiune', true], ['zip', 'Cod poștal', true], ['country', 'Țară', true], ['phone', 'Telefon', true]]) : [],
    coordinates: coordinates ? { latitude, longitude } : null,
    weekdaysHours: optionalText(delivery.weekdaysHours, resource), weekendHours: optionalText(delivery.weekendHours, resource),
    status: optionalText(delivery.status, resource), postCode: optionalText(delivery.post_code, resource), qrCode: optionalText(delivery.qr_code, resource), qrImageUrl: optionalText(delivery.img, resource),
  };
}

export function normalizeShipmentDetailData(data: unknown): LiveParcelDetail {
  const resource = 'detaliile coletului';
  const row = object(data, resource);
  const status = requiredText(row.status, resource);
  const currentStatus = optionalText(row.currentStatus, resource) ?? status;
  const currency = optionalText(row.currency, resource);
  const events = ([
    ['created', 'Creat', 'parcel.event.created'], ['packedTime', 'Ambalat', 'parcel.event.packed'], ['sentTime', 'Trimis', 'parcel.event.sent'], ['arriveDate', 'Sosit', 'parcel.event.arrived'], ['customsHeldTime', 'Reținut în vamă', 'parcel.event.customsHeld'], ['heldByDamageTime', 'Reținut: deteriorare', 'parcel.event.damageHeld'], ['heldByProhibitionTime', 'Reținut: restricție', 'parcel.event.prohibitionHeld'], ['localDepoTime', 'La depozitul local', 'parcel.event.localDepot'], ['takenToDeliveryTime', 'Preluat pentru livrare', 'parcel.event.delivery'], ['receivedTime', 'Primit', 'parcel.event.received'],
  ] as const).flatMap(([key, label, labelKey]) => {
    const date = optionalText(row[key], resource);
    return date === null ? [] : [{ label, labelKey, date }];
  });
  // ParcelsController.getShippingData() returns [] when no carrier is assigned.
  const shipping = row.shipping == null || Array.isArray(row.shipping) && row.shipping.length === 0 ? null : object(row.shipping, resource);
  const address = row.address == null ? null : object(row.address, resource);
  const localDelivery = normalizeLocalDeliveryData(row.local_delivery);
  // Outgoing uses grams; stock detail uses kilogram-scale values.
  const volumeWeightKg = gramsToKg(row.volume_weight, resource);
  const dimensionsCm = normalizeParcelDimensions(row);
  const additionalServices = row.addition_services_list == null ? [] : list(row.addition_services_list, resource).map(value => {
    const service = object(value, resource);
    const active = service.active == null ? null : [true, 1, '1'].includes(service.active as never) ? true : [false, 0, '0'].includes(service.active as never) ? false : undefined;
    if (active === undefined) throw new ApiContractError(resource);
    return { key: optionalText(service.keyName, resource), title: optionalText(service.title, resource), description: optionalText(service.description, resource), amount: amount(service.price, resource), active };
  });
  const progressRow = row.progressData == null ? null : object(row.progressData, resource);
  const progressPercent = progressRow ? amount(progressRow.percent, resource) : null;
  if (progressPercent !== null && (progressPercent < 0 || progressPercent > 100)) throw new ApiContractError(resource);
  const progress: LiveParcelDetail['progress'] = progressRow === null ? null : {
    type: optionalText(progressRow.type, resource), percent: progressPercent,
    // Do not derive this flag from percent/type: paid storage can override
    // the server's type after it has already calculated inProgress.
    inProgress: optionalBoolean(progressRow.inProgress, resource),
    label: serverText(optionalText(progressRow.label, resource)) || null,
    storageDaysLabel: serverText(optionalText(progressRow.storageDaysLabel, resource)) || null,
  };
  const taxData = row.import_taxes == null ? null : object(row.import_taxes, resource);
  const importTaxes = taxData === null ? null : {
    total: requiredAmount(taxData.total, resource),
    currency: requiredText(taxData.currency, resource),
    lines: list(taxData.lines, resource).map(value => {
      const line = object(value, resource);
      return { title: requiredText(line.title, resource), amount: requiredAmount(line.amount, resource), description: optionalText(line.description, resource) };
    }),
    estimated: status === 'processing',
  };
  // price_boxes/price_declarations are actual/declared goods values. They are
  // not shipping charges and must never enter the cost breakdown or total.
  const shippingTotal = amount(row.price_total, resource);
  const costs = ([
    ['price_delivery', 'Transport', 'parcel.cost.delivery'], ['price_local_delivery', 'Livrare locală', 'parcel.cost.localDelivery'], ['price_insurance', 'Asigurare', 'parcel.cost.insurance'], ['price_additional_services', 'Servicii suplimentare', 'parcel.cost.services'], ['price_broker_fee', 'Servicii de brokeraj', 'parcel.cost.brokerage'], ['price_duties', 'Taxe vamale', 'parcel.cost.duties'], ['price_import_taxes', 'Taxe de import', 'parcel.cost.importTaxes'],
  ] as const).flatMap(([key, label, labelKey]) => {
    const value = amount(row[key], resource);
    return value === null ? [] : [{ label, labelKey, amount: value, currency: key === 'price_import_taxes' ? importTaxes?.currency ?? currency : currency }];
  });
  return {
    id: requiredText(row.id, resource), uid: optionalText(row.uid, resource), title: optionalText(row.description, resource), tracking: optionalText(row.tracking, resource),
    storageId: null, countryCode: null, stage: status === 'received' ? 'received' : 'sent', status: currentStatus,
    statusLabel: progress ? optionalText(progress.label, resource) : null, createdAt: optionalText(row.created, resource),
    weightKg: gramsToKg(row.realWeight, resource), volumeWeightKg, dimensionsCm, customsCause: optionalText(row.customsCause, resource), additionalServices, localDelivery, declared: null, currency, amount: shippingTotal, amountKind: 'shippingCost',
    goodsValue: amount(row.price_boxes, resource) ?? amount(row.totalPrice, resource), declaredValue: amount(row.price_declarations, resource), shippingTotal, importTaxes,
    events, progress, shippingMethod: shipping ? optionalText(shipping.title, resource) : null,
    shippingDescription: shipping ? serverText(optionalText(shipping.description, resource)) || null : null,
    recipientFields: address ? addressFields(address, resource, [['first_name', 'Prenume', true], ['last_name', 'Nume', true], ['company_name', 'Companie', true], ['address', 'Adresa', true], ['city', 'Oraș', true], ['state', 'Regiune', true], ['zip', 'Cod poștal', true], ['country', 'Țară', true], ['phone', 'Telefon', true]]) : [],
    items: row.boxes == null ? [] : uniqueIds(list(row.boxes, resource).map(value => {
      const box = object(value, resource);
      return { id: requiredText(box.id, resource), title: optionalText(box.title, resource), tracking: optionalText(box.tracking, resource) };
    }), resource), costs,
  };
}

/** The following shapes are documented by the official legacy Apiary source:
 * https://bayshopmf.docs.apiary.io/api-description-document
 * They were omitted from the OpenAPI conversion; unknown shapes still fail. */
export function normalizeWarehousesData(data: unknown): LiveWarehouse[] {
  const resource = 'lista depozitelor';
  return uniqueIds(list(data, resource).map(value => {
    const row = object(value, resource);
    const code = requiredText(row.countryCode, resource).toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) throw new ApiContractError(resource);
    return { id: requiredText(row.id, resource), code, title: optionalText(row.countryTitle, resource) ?? requiredText(row.title, resource), sourceTitle: optionalText(row.title, resource), requireInvoiceUpload: optionalStringFlag(row.requireInvoiceUpload, resource), currencyId: row.currencyId == null ? null : requiredText(String(row.currencyId), resource), availableCurrencies: row.availableCurrencies == null ? [] : uniqueIds(list(row.availableCurrencies, resource).map(value => { const item = object(value, resource); return { id: requiredText(String(item.id), resource), title: requiredText(item.title, resource), sign: optionalText(item.currency_sign, resource) }; }), resource) };
  }), resource);
}

function normalizeAddressNotifications(value: unknown, resource: string, depth = 0): { type: string | null; text: string }[] {
  if (value == null) return [];
  if (depth > 4) throw new ApiContractError(resource);
  return list(value, resource).flatMap(entry => {
    if (Array.isArray(entry)) return normalizeAddressNotifications(entry, resource, depth + 1);
    const row = object(entry, resource);
    return [{ type: optionalText(row.type, resource), text: requiredText(row.text, resource) }];
  });
}

export function normalizeWarehouseAddressesData(data: unknown): LiveWarehouseAddress[] {
  const resource = 'adresele depozitelor';
  const result: LiveWarehouseAddress[] = [];
  for (const value of list(data, resource)) {
    const country = object(value, resource);
    const countryCode = requiredText(country.countriesCode, resource).toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) throw new ApiContractError(resource);
    const countryTitle = requiredText(country.countryTitle, resource);
    const branches = object(country.addresses, resource);
    if (Object.keys(branches).length === 0 || Object.keys(branches).some(kind => kind !== 'storage' && kind !== 'private')) throw new ApiContractError(resource);
    for (const kind of ['storage', 'private'] as const) {
      if (branches[kind] === undefined) continue;
      for (const value of list(branches[kind], resource)) {
        const row = object(value, resource);
        const rank = amount(row.rank, resource);
        if (rank !== null && (!Number.isSafeInteger(rank) || rank < 0)) throw new ApiContractError(resource);
        // The authenticated response exposes this as a numeric 0/1 flag.
        if (row.isActive != null && row.isActive !== 0 && row.isActive !== 1) throw new ApiContractError(resource);
        result.push({
          id: `${countryCode}:${kind}:${requiredText(row.id, resource)}`, countryCode, title: countryTitle, countryTitle,
          kind, storageId: optionalText(row.storageId, resource), rank, notifications: normalizeAddressNotifications(row.notifications, resource), active: row.isActive == null ? null : row.isActive === 1,
          fields: addressFields(row, resource, [['userName', 'Nume / Prenume', true], ['companyName', 'Companie', true], ['address1', 'Adresa, linia 1', true], ['address2', 'Adresa, linia 2', true], ['city', 'Oraș', false], ['state', 'Regiune', false], ['zipCode', 'Cod poștal', false], ['country', 'Țară', false], ['phone', 'Telefon', false]]),
        });
      }
    }
  }
  return uniqueIds(result, resource);
}

export function normalizeRecipientAddressesData(data: unknown): LiveRecipientAddress[] {
  const resource = 'adresele destinatarilor';
  return uniqueIds(list(data, resource).map(value => {
    const row = object(value, resource);
    const firstName = optionalText(row.first_name, resource);
    const lastName = optionalText(row.last_name, resource);
    const name = [firstName, lastName].filter(Boolean).join(' ') || optionalText(row.company_name, resource);
    return { id: requiredText(row.id, resource), name, isEditable: optionalBoolean(row.isEditable, resource), fields: addressFields(row, resource, [
      ['first_name', 'Prenume', true], ['last_name', 'Nume', true], ['company_name', 'Companie', true], ['address', 'Adresa', true], ['city', 'Oraș', true], ['zip', 'Cod poștal', true], ['country_title', 'Țară', true], ['phone', 'Telefon', true],
    ]) };
  }), resource);
}

export function normalizeWaitingData(data: unknown): LiveParcel[] {
  const resource = 'coletele în așteptare';
  return uniqueIds(list(data, resource).map(value => {
    const row = object(value, resource);
    const currency = optionalText(row.currency, resource);
    return {
      id: requiredText(row.id, resource), uid: requiredText(row.uid, resource), title: optionalText(row.title, resource), tracking: optionalText(row.tracking, resource),
      storageId: optionalText(row.storageId, resource), countryCode: null, stage: 'waiting' as const, status: optionalText(row.status, resource), statusLabel: null,
      createdAt: optionalText(row.createdDate, resource), weightKg: null, declared: null, currency: currency && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : currency,
      amount: amount(row.price, resource), amountKind: 'productValue' as const,
      trackingStatus: optionalText(row.tracking_status, resource), serviceName: optionalText(row.service_name, resource),
    };
  }), resource);
}

// Includes held-by-missing and ready-to-pickup, confirmed in the authenticated
// response of 2026-11-01 although absent from the older public examples.
const shipmentGroups = new Set(['live', 'processing', 'awaiting-invoice', 'held-by-damage', 'held-by-prohibition', 'held-by-missing', 'hold-by-user', 'packed', 'dept', 'sent', 'reinclude-request', 'customs-held', 'local-depo', 'taken-to-delivery', 'ready-to-pickup', 'received']);

export function normalizeShipmentsData(data: unknown, _stage: LiveParcelStage): LiveParcel[] {
  const resource = 'expedieri';
  // /parcels/all/{status} groups by current status; the per-storage route is flat.
  const groups: [string | null, unknown[]][] = Array.isArray(data) ? [[null, data]] : Object.entries(object(data, resource)).map(([status, values]) => {
    if (!shipmentGroups.has(status)) throw new ApiContractError(resource);
    return [status, list(values, resource)];
  });
  if (!Array.isArray(data) && groups.length === 0) throw new ApiContractError(resource);
  return uniqueIds(groups.flatMap(([group, rows]) => rows.map(value => {
    const row = object(value, resource);
    const status = requiredText(row.status, resource);
    const currentStatus = optionalText(row.currentStatus, resource) ?? group ?? status;
    const progress = row.progressData == null ? null : object(row.progressData, resource);
    return {
      id: requiredText(row.id, resource), uid: requiredText(row.codeNumber, resource), title: optionalText(row.description, resource), tracking: null,
      storageId: optionalText(row.storage_id, resource), countryCode: null, stage: status === 'received' || currentStatus === 'received' ? 'received' as const : 'sent' as const,
      countryTitle: optionalText(row.countryTitle, resource), shipperTitle: optionalText(row.shipperTitle, resource),
      status: currentStatus, statusLabel: progress ? optionalText(progress.label, resource) : null, createdAt: null, updatedAt: optionalText(row.fieldTime, resource),
      weightKg: gramsToKg(row.realWeight, resource), declared: null, currency: optionalText(row.currency, resource), amount: amount(row.totalPrice, resource), amountKind: 'productValue' as const,
    };
  })), resource);
}
