/** Values in these views come from the API. null means unknown, never zero. */
export type LiveProfile = {
  id: string;
  clientCode: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  /** Email is read separately; a partial failure must not hide the profile. */
  emailError?: string | null;
  phone: string | null;
  /** Server profile preferences; these do not change the app's local language. */
  countryId?: string | null;
  countryCode?: string | null;
  languageId?: string | null;
  languageCode?: string | null;
  languages?: Record<string, string> | null;
};

export type LiveAuthSession = {
  accessToken: string;
  expiresInSeconds: number;
  tokenType: 'Bearer';
  profile: LiveProfile;
};

export type LiveWarehouse = { id: string; code: string; title: string; sourceTitle?: string | null; requireInvoiceUpload?: boolean | null; currencyId?: string | null; availableCurrencies?: { id: string; title: string; sign: string | null }[] };
export type LiveCounters = { awaiting: number; incoming: number; outgoing: number; received: number };
export type LiveAddressLabelKey = 'field.fullName' | 'field.firstName' | 'field.lastName' | 'field.company' | 'field.addressLine1' | 'field.addressLine2' | 'field.address' | 'field.city' | 'field.region' | 'field.postalCode' | 'field.country' | 'field.phone';
export type LiveAddressField = { label: string; labelKey?: LiveAddressLabelKey; value: string; personal: boolean };
export type LiveWarehouseAddress = {
  id: string;
  countryCode: string;
  title: string;
  /** Server text, separate from the app-owned storage/private label. */
  countryTitle?: string;
  fields: LiveAddressField[];
  kind?: 'storage' | 'private';
  storageId?: string | null;
  rank?: number | null;
  notifications?: { type: string | null; text: string }[];
  active?: boolean | null;
};
export type LiveRecipientAddress = {
  id: string;
  name: string | null;
  fields: LiveAddressField[];
  /** Explicit server permission. Missing metadata never grants editing. */
  isEditable: boolean | null;
};

export type LiveParcelStage = 'waiting' | 'warehouse' | 'sent' | 'received';
export type LiveStockRestrictions = {
  heldByProhibition: boolean | null;
  prohibitionComment: string | null;
  heldByDamage: boolean | null;
  damageComment: string | null;
  packingDenied: boolean | null;
};
export type LiveParcel = {
  id: string;
  uid: string | null;
  title: string | null;
  tracking: string | null;
  storageId: string | null;
  countryCode: string | null;
  countryTitle?: string | null;
  shipperTitle?: string | null;
  trackingStatus?: string | null;
  serviceName?: string | null;
  /** mf-list/in-stock list-only comment; detail endpoint does not return it. */
  verificationComment?: string | null;
  verificationRequestStatus?: string | null;
  serviceStates?: Partial<Record<'photos' | 'verification' | 'declaration' | 'division' | 'label', string | null>>;
  stage: LiveParcelStage;
  status: string | null;
  statusLabel: string | null;
  createdAt: string | null;
  /** List fieldTime is not documented as a creation date. */
  updatedAt?: string | null;
  weightKg: number | null;
  declared: boolean | null;
  currency: string | null;
  amount: number | null;
  amountKind?: 'productValue' | 'shippingCost';
  restrictions?: LiveStockRestrictions;
};

export type LiveMoney = { currency: string; amount: number };
export type LiveTransaction = {
  /** Server reference may be absent in legacy history; never invent a financial reference. */
  id: string | null;
  date: string | null;
  label: string | null;
  amount: number;
  currency: string;
  balanceAfter: number | null;
  /** The API includes unpaid records too; an amount alone is not proof of payment. */
  status?: string | null;
};
export type LiveBalance = {
  /** Current balances must not be inferred from historical transactions. */
  balances: LiveMoney[] | null;
  transactions: LiveTransaction[];
  /** A failed panel is unavailable, not an empty result. Omitted on success. */
  balancesError?: string;
  historyError?: string;
};

export type LiveParcelDimensions = { x: number | null; y: number | null; z: number | null };
/** Exact web progress metadata. 100% can also represent a hold, not delivery. */
export type LiveShipmentProgress = {
  type: string | null;
  percent: number | null;
  inProgress: boolean | null;
  label: string | null;
  storageDaysLabel: string | null;
};
export type LiveShipmentTracking = {
  serviceName: string | null;
  trackingStatus: string | null;
  /** Already newest-first on the server, including courier and hold events. */
  checkpoints: {
    status: string | null;
    dateTime: string | null;
    time: string | null;
    location: string | null;
    courier: { name: string | null; title: string | null } | null;
  }[];
  sentAt: string | null;
  updatedAt: string | null;
};
export type LiveParcelDetail = LiveParcel & {
  progress?: LiveShipmentProgress | null;
  /** Source volume dimensions are stored in centimetres, not warehouse display inches. */
  dimensionsCm?: LiveParcelDimensions | null;
  customsCause?: string | null;
  /** A detailed view of existing service charges, never added again to shippingTotal. */
  additionalServices?: { key: string | null; title: string | null; description: string | null; amount: number | null; active: boolean | null }[];
  /** Outgoing API volume_weight is grams; UI/web display volumetric kg. */
  volumeWeightKg?: number | null;
  /** Actual final delivery/pickup destination; never copied from recipient. */
  localDelivery?: {
    key: string | null; type: string | null; title: string | null;
    address: string | null; country: string | null; phone: string | null;
    addressFields: LiveAddressField[];
    coordinates: { latitude: number | null; longitude: number | null } | null;
    weekdaysHours: string | null; weekendHours: string | null;
    status: string | null; postCode: string | null; qrCode: string | null; qrImageUrl: string | null;
  } | null;
  /** Goods values are distinct from transport, services, and import taxes. */
  goodsValue?: number | null;
  declaredValue?: number | null;
  /** Authoritative price_total; never inferred from the goods value. */
  shippingTotal?: number | null;
  importTaxes?: {
    total: number;
    currency: string;
    lines: { title: string; amount: number; description: string | null }[];
    estimated: boolean;
  } | null;
  events: { label: string; labelKey?: string; date: string }[];
  shippingMethod: string | null;
  /** Description of this shipment's selected carrier, returned by the server. */
  shippingDescription?: string | null;
  recipientFields: LiveAddressField[];
  items: { id: string; title: string | null; tracking: string | null }[];
  costs: { label: string; labelKey?: string; amount: number; currency: string | null }[];
};
