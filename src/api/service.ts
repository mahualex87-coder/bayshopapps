import { API_ORIGIN, ApiError, errorMessage, type ApiTransport } from './client.ts';
import type { LiveAuthSession, LiveBalance, LiveParcel, LiveParcelStage, LiveProfile, LiveRecipientAddress, LiveWarehouseAddress } from './contracts.ts';
import { normalizeAuthData, normalizeCountersData, normalizeCurrentBalancesData, normalizePersonalProfileData, normalizeProfileData, normalizeRecipientAddressesData, normalizeShipmentsData, normalizeStockData, normalizeWaitingData, normalizeWarehouseAddressesData, normalizeWarehousesData } from './normalize.ts';
import { isLanguage, type Language } from '../i18n/core.ts';
import { emptyMutation, MutationInputError, type MutationResult, type MutationState } from './mutations.ts';
import { planMutation, planRead, type MutationCommand, type ReadCommand, type ReadResult } from './operations-contracts.ts';
import { normalizeWaitingDetail } from './operations-normalize.ts';
import { normalizeParcelReview, validateReviewAgainstCurrent } from './parcel-review.ts';
import { normalizeCartLinkData } from './cart-link.ts';
import { planShopDirectoryRead, requireShopMatch } from './shop-directory.ts';
import { planFinancialRead, validateFinancialMutation } from './account-financial-actions.ts';
import { planOutgoingServicesRead, validateOutgoingServiceMutation } from './outgoing-services.ts';
import { PUSH_DEVICE_PATH, pushDeviceWrite, validatePushCapability, validatePushAcknowledgement, type PushDeviceBinding } from './push-device.ts';
import { normalizePaymentsData, normalizePaymentQuote, paymentSelectionRevision, validatePaymentSelection, validatePaymentQuoteSelection, validatePaymentStart, type PaymentQuote } from './payments.ts';
import { normalizeLegacyPaymentsData, legacyPaymentSelectionRevision, validateLegacyPaymentSelection, LegacyPaymentPreparationError, legacyCardPaymentId, type LegacyPaymentStartResult } from './payment-legacy.ts';
import { profileFormData } from './account-operations.ts';
import { normalizeMemberEmailData, validateProfileUpdate } from './profile-identity.ts';
import { normalizeAccountSettings, validateSettingsMutation, type SettingsMutationCommand } from './account-settings.ts';
import { emptyParcelPages, emptyParcelPage, localParcelPage, parcelStages, updateParcelQuery, type ParcelPages, type ParcelQuery } from './parcel-pagination.ts';

export type Resource<T> = { data: T | null; loading: boolean; error: string | null; updatedAt: number | null };
export type DataMap = { profile: LiveProfile; waiting: LiveParcel[]; warehouse: LiveParcel[]; sent: LiveParcel[]; received: LiveParcel[]; addresses: LiveWarehouseAddress[]; recipients: LiveRecipientAddress[]; balance: LiveBalance };
export type ResourceKey = keyof DataMap;
export type AccountSnapshot = { authRevision: number; accountId: string | null; accountRevision: number; ready: boolean; authenticated: boolean; signingIn: boolean; language: Language; notice: string | null; mutation: MutationState; parcelPages: ParcelPages; resources: { [K in ResourceKey]: Resource<DataMap[K]> } };
export type SessionStorage = { read(): Promise<string | null>; write(value: string): Promise<void>; clear(): Promise<void> };
type Session = { origin: typeof API_ORIGIN; token: string; expiresAt: number };
type RequestContext = { session: Session; generation: number; language: Language };
const keys: ResourceKey[] = ['profile', 'waiting', 'warehouse', 'sent', 'received', 'addresses', 'recipients', 'balance'];
const emptyResource = <T>(): Resource<T> => ({ data: null, loading: false, error: null, updatedAt: null });
const emptyResources = (): AccountSnapshot['resources'] => ({ profile: emptyResource(), waiting: emptyResource(), warehouse: emptyResource(), sent: emptyResource(), received: emptyResource(), addresses: emptyResource(), recipients: emptyResource(), balance: emptyResource() });

/** Per-type counters are explicitly scoped by country. The generic received
 * summary and /all/received response omit records and cannot replace this map. */
export function normalizeCountryCounts(raw: unknown): { code: string; total: number }[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(0, 'errors.contract');
  const countries = Object.entries(raw).map(([code, value]) => {
    if (!/^[a-z]{2}$/.test(code) || (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value)))) throw new ApiError(0, 'errors.contract');
    const total = Number(value);
    if (!Number.isSafeInteger(total) || total < 0) throw new ApiError(0, 'errors.contract');
    return { code: code.toUpperCase(), total };
  });
  if (!Number.isSafeInteger(countries.reduce((sum, country) => sum + country.total, 0))) throw new ApiError(0, 'errors.contract');
  return countries;
}

export function readSession(raw: string | null, now = Date.now()): Session | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const session = value as Partial<Session>;
    if (session.origin !== API_ORIGIN || typeof session.token !== 'string' || !/^[\x21-\x7e]+$/.test(session.token) || typeof session.expiresAt !== 'number' || !Number.isFinite(session.expiresAt) || session.expiresAt <= now) return null;
    return session as Session;
  } catch { return null; }
}

/** One account at a time. All responses are discarded after logout/account change. */
export class LiveAccountService {
  private transport: ApiTransport;
  private storage: SessionStorage;
  private now: () => number;
  private session: Session | null = null;
  private language: Language;
  private generation = 0;
  private accountGeneration = 0;
  private listeners = new Set<() => void>();
  private requests = new Set<AbortController>();
  private receivedRequest: AbortController | null = null;
  private dispatchedMutation: AbortController | null = null;
  // Quotes are account/locale-scoped ephemeral data. Neither provider actions
  // nor wallet tokens enter snapshots, persistent storage, or resource caches.
  private paymentQuotes = new Map<string, { quote: PaymentQuote; selectionRevision: string }>();
  private dispatchedPaymentQuotes = new Set<string>();
  private dispatchedPaymentAttempts = new Set<string>();
  // PayPal and terminal initiation must not replay. Card preparation only
  // creates an unpaid row; its separate provider handoff is guarded durably
  // by usePaymentFlow, including recovery when storage fails before opening it.
  private versions: Partial<Record<ResourceKey, number>> = {};
  private writes: Promise<void> = Promise.resolve();
  private started = false;
  private pushWrites: Promise<unknown> = Promise.resolve();
  private pushLeases = new Map<string, symbol>();
  private snapshot: AccountSnapshot;
  constructor(transport: ApiTransport, storage: SessionStorage, now: () => number = Date.now, language: Language = 'ro') { this.transport = transport; this.storage = storage; this.now = now; this.language = language; this.snapshot = { authRevision: 0, accountId: null, accountRevision: 0, ready: false, authenticated: false, signingIn: false, language, notice: null, mutation: emptyMutation(), parcelPages: emptyParcelPages(), resources: emptyResources() }; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(patch: Partial<AccountSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()); }
  private resource<K extends ResourceKey>(key: K, patch: Partial<Resource<DataMap[K]>>) {
    const resource = { ...this.snapshot.resources[key], ...patch };
    const resources = { ...this.snapshot.resources, [key]: resource };
    if (!parcelStages.includes(key as LiveParcelStage)) { this.emit({ resources, ...(key === 'profile' && resource.data ? { accountId: (resource.data as LiveProfile).id } : {}) }); return; }
    const stage = key as LiveParcelStage;
    const previous = this.snapshot.parcelPages[stage];
    const page = resource.data === null ? { ...previous, items: null } : localParcelPage(resource.data as LiveParcel[], previous.query, resource.updatedAt, { language: this.language, ...(stage === 'received' ? { overallTotal: previous.overallTotal ?? undefined, countries: previous.countries } : {}) });
    this.emit({ resources, parcelPages: { ...this.snapshot.parcelPages, [stage]: { ...page, loading: resource.loading, error: resource.error, updatedAt: resource.updatedAt } } });
  }
  private cancel() { this.generation++; this.paymentQuotes.clear(); this.receivedRequest?.abort(); this.receivedRequest = null; this.requests.forEach(controller => controller.abort()); this.requests.clear(); this.versions = {}; }
  setParcelQuery = (stage: LiveParcelStage, patch: Partial<ParcelQuery>): void => {
    if (!this.session || !parcelStages.includes(stage)) return;
    const previous = this.snapshot.parcelPages[stage];
    const query = updateParcelQuery(previous.query, patch);
    if (!query || JSON.stringify(query) === JSON.stringify(previous.query)) return;
    if (stage === 'received' && query.countryCode === 'all' && previous.countries.length) return;
    const countryChanged = stage === 'received' && query.countryCode !== previous.query.countryCode;
    if (countryChanged) {
      if (previous.countries.length && !previous.countries.some(country => country.code === query.countryCode)) return;
      this.receivedRequest?.abort(); this.versions.received = (this.versions.received ?? 0) + 1;
      this.emit({ parcelPages: { ...this.snapshot.parcelPages, received: { ...emptyParcelPage('received', query), mode: 'local', searchScope: 'collection', countries: previous.countries, overallTotal: previous.overallTotal } } });
      this.resource('received', { data: null, loading: true, error: null, updatedAt: null });
      void this.refresh(['received']);
      return;
    }
    this.emit({ parcelPages: { ...this.snapshot.parcelPages, [stage]: { ...previous, query } } });
    this.resource(stage, {});
  };
  loadParcelPage = (stage: LiveParcelStage, page: number): void => this.setParcelQuery(stage, { page });
  private queueWrite(operation: () => Promise<void>) { this.writes = this.writes.catch(() => {}).then(operation); return this.writes; }
  private isCurrent(context: RequestContext) { return this.session === context.session && this.generation === context.generation && this.language === context.language; }
  /** Device registration is independent of the financial mutation lock. Each
   * lease retains only the session needed to remove its own device on logout;
   * it never invalidates the web or the previous mobile application's login. */
  bindPushDevice = (token: string, previousToken: string | undefined, expectedAuthRevision: number): Promise<PushDeviceBinding> => {
    const session = this.session;
    const accountId = this.snapshot.accountId;
    const language = this.language;
    const write = pushDeviceWrite(token, true, previousToken);
    const current = () => !!session && this.session === session && this.snapshot.authRevision === expectedAuthRevision && this.snapshot.accountId === accountId && session.expiresAt > this.now();
    const run = async (): Promise<PushDeviceBinding> => {
      if (!session || !accountId || !current()) throw new ApiError(0, 'errors.cancelled');
      const capability = await this.transport(PUSH_DEVICE_PATH, { token: session.token, language, timeoutMs: 10000 });
      validatePushCapability(capability);
      if (!current()) throw new ApiError(0, 'errors.cancelled');
      const lease = Symbol('device');
      this.pushLeases.set(token, lease);
      const remove = async () => {
        if (this.pushLeases.get(token) !== lease) return;
        const raw = await this.transport(PUSH_DEVICE_PATH, { token: session.token, language, timeoutMs: 8000, write: pushDeviceWrite(token, false), responseMode: 'envelope' });
        validatePushAcknowledgement(raw, accountId, false);
        if (this.pushLeases.get(token) === lease) this.pushLeases.delete(token);
      };
      try {
        const raw = await this.transport(PUSH_DEVICE_PATH, { token: session.token, language, timeoutMs: 10000, write, responseMode: 'envelope' });
        validatePushAcknowledgement(raw, accountId, true);
        if (!current()) throw new ApiError(0, 'errors.cancelled');
      } catch (error) {
        // An uncertain registration is removed rather than replayed for a
        // different account. Native cleanup also invalidates the FCM token.
        try { await remove(); } catch { /* Caller also deletes the native token. */ }
        throw error;
      }
      return { release: () => { const pending = this.pushWrites.catch(() => {}).then(remove); this.pushWrites = pending; return pending; } };
    };
    const pending = this.pushWrites.catch(() => {}).then(run);
    this.pushWrites = pending;
    return pending;
  };
  private request(path: string, context: RequestContext, options: { signal?: AbortSignal; responseMode?: 'data' | 'envelope'; timeoutMs?: number } = {}) {
    if (!this.isCurrent(context) || options.signal?.aborted) return Promise.reject(new ApiError(0, 'errors.cancelled'));
    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    this.requests.add(controller);
    return this.transport(path, { token: context.session.token, signal: controller.signal, language: context.language, responseMode: options.responseMode, timeoutMs: options.timeoutMs }).finally(() => { this.requests.delete(controller); options.signal?.removeEventListener('abort', cancel); });
  }
  private invalidate(selection: ResourceKey[]) {
    for (const key of new Set(selection)) {
      this.versions[key] = (this.versions[key] ?? 0) + 1;
      this.resource(key, emptyResource());
    }
  }
  readView = async <Q extends ReadCommand>(query: Q, options: { signal?: AbortSignal } = {}): Promise<ReadResult<Q>> => {
    const session = this.session;
    if (!session) throw new ApiError(401, 'errors.sessionExpired');
    if (session.expiresAt <= this.now()) { await this.logout('errors.sessionExpired'); throw new ApiError(401, 'errors.sessionExpired'); }
    const context: RequestContext = { session, generation: this.generation, language: this.language };
    const plan = planRead(query);
    try {
      const payments = query.kind === 'payments.quote' ? normalizePaymentsData(await this.request('/api/payments', context, options)) : null;
      if (!this.isCurrent(context) || options.signal?.aborted) throw new ApiError(0, 'errors.cancelled');
      if (query.kind === 'payments.quote' && payments) validatePaymentSelection(query, payments);
      const raw = await this.request(plan.path, context, { ...options, responseMode: plan.responseMode, timeoutMs: plan.timeoutMs });
      if (!this.isCurrent(context) || options.signal?.aborted) throw new ApiError(0, 'errors.cancelled');
      const result = plan.normalize(raw);
      if (query.kind === 'payments.quote' && payments) {
        const quote = result as PaymentQuote;
        validatePaymentQuoteSelection(quote, query, payments);
        // Bound the cache without making an old quote valid again after use.
        if (this.paymentQuotes.size >= 16) this.paymentQuotes.delete(this.paymentQuotes.keys().next().value!);
        this.paymentQuotes.set(quote.quoteId, { quote: normalizePaymentQuote(quote), selectionRevision: paymentSelectionRevision(query, payments) });
      }
      return result;
    } catch (error) {
      if (!this.isCurrent(context) || options.signal?.aborted) throw new ApiError(0, 'errors.cancelled');
      if (error instanceof ApiError && error.status === 401) await this.logout('errors.sessionExpired');
      if (query.kind === 'settings.read' && error instanceof ApiError && error.status === 404) throw new ApiError(404, 'accountSettings.serverUpdateRequired');
      if ((query.kind === 'purchases.list' || query.kind === 'purchases.detail') && error instanceof ApiError && error.status === 404) throw new ApiError(404, 'purchases.serverUpdateRequired');
      if ((query.kind === 'payments.quote' || query.kind === 'payments.status') && error instanceof ApiError && error.status === 404) throw new ApiError(404, query.kind === 'payments.status' ? 'payments.recoveryFailed' : 'payments.serverUpdateRequired');
      throw error;
    }
  };
  mutate = async (command: MutationCommand, options: { signal?: AbortSignal } = {}): Promise<MutationResult> => {
    if (options.signal?.aborted) return { ok: false, error: 'errors.cancelled', outcome: 'rejected' };
    if (this.snapshot.mutation.pending || this.snapshot.signingIn) return { ok: false, error: 'errors.mutationInProgress', outcome: 'rejected' };
    const session = this.session;
    if (!session) return { ok: false, error: 'errors.sessionExpired', outcome: 'rejected' };
    if (session.expiresAt <= this.now()) { await this.logout('errors.sessionExpired'); return { ok: false, error: 'errors.sessionExpired', outcome: 'rejected' }; }
    const context: RequestContext = { session, generation: this.generation, language: this.language };
    let plan: ReturnType<typeof planMutation>;
    try {
      plan = planMutation(command);
      if (command.kind === 'payments.start') command = { kind: 'payments.start', input: { ...command.input, billIds: [...command.input.billIds] } };
      if (command.kind === 'payments.legacy.start') command = { kind: 'payments.legacy.start', input: { ...command.input, billIds: [...command.input.billIds] } };
    }
    catch (error) {
      const fields = error && typeof error === 'object' && 'fieldErrors' in error ? (error as { fieldErrors: Record<string, string> }).fieldErrors : undefined;
      return { ok: false, error: errorMessage(error), fieldErrors: fields, outcome: 'rejected' };
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    this.requests.add(controller);
    this.emit({ mutation: { pending: true, operation: command.kind, error: null, outcome: null } });
    let writeStarted = false;
    let legacyPaymentCurrency: string | null = null;
    let preparedCardPaymentId: string | null = null;
    const advanceRegionScope = () => {
      // A confirmed or uncertain region write can change every catalog. Keep
      // this mutation alive, but cancel all reads of the previous region.
      this.requests.delete(controller);
      this.cancel();
      context.generation = this.generation;
      this.requests.add(controller);
      this.emit({ accountRevision: this.snapshot.accountRevision + 1, parcelPages: emptyParcelPages() });
    };
    try {
      if (command.kind === 'refund.create' || command.kind === 'refund.cancel' || command.kind === 'order.cancel') {
        const lookup = command.kind === 'order.cancel' ? planFinancialRead({ kind: 'order.cancellation', id: command.id }) : planFinancialRead({ kind: 'refunds.read' });
        const current = lookup.normalize(await this.request(lookup.path, context, { signal: controller.signal }));
        if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        validateFinancialMutation(command, current);
      }
      if (command.kind === 'outgoing.service.set') {
        const lookup = planOutgoingServicesRead({ kind: 'outgoing.services', id: command.id });
        const current = lookup.normalize(await this.request(lookup.path, context, { signal: controller.signal }));
        if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        validateOutgoingServiceMutation(command, current);
      }
      if (command.kind === 'payments.legacy.start') {
        const current = normalizeLegacyPaymentsData(await this.request('/api/payments', context, { signal: controller.signal }));
        if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        if (legacyPaymentSelectionRevision(command.input, current) !== command.input.selectionRevision) throw new ApiError(0, 'payments.quoteChanged');
        legacyPaymentCurrency = validateLegacyPaymentSelection(command.input, current).group.currency;
      }
      if (command.kind === 'payments.start') {
        const saved = this.paymentQuotes.get(command.input.quoteId);
        if (!saved || this.dispatchedPaymentQuotes.has(saved.quote.quoteId) || this.dispatchedPaymentAttempts.has(command.input.idempotencyKey)) throw new ApiError(0, 'payments.quoteChanged');
        const current = normalizePaymentsData(await this.request('/api/payments', context, { signal: controller.signal }));
        if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        validatePaymentStart(command.input, saved.quote, current, this.now());
        if (paymentSelectionRevision(command.input, current) !== saved.selectionRevision) throw new ApiError(0, 'payments.quoteChanged');
      }
      if (command.kind === 'cart.create' || command.kind === 'cart.edit') {
        const lookup = planRead({ kind: 'cart.link', url: command.input.url, storageId: command.input.storage_id });
        const current = normalizeCartLinkData(await this.request(lookup.path, context, { signal: controller.signal }));
        if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        const legacyCreate = command.kind === 'cart.create' && current.writeMode === 'legacy-matched' && current.storageId === command.input.storage_id;
        if (current.writeMode !== 'verified' && !legacyCreate) throw new ApiError(0, 'cartLink.serverUpdateRequired');
        if (command.input.selectedShop) {
          const match = planShopDirectoryRead({ kind: 'shops.match', ...command.input.selectedShop, url: command.input.url });
          const directory = match.normalize(await this.request(match.path, context, { signal: controller.signal }));
          if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
          requireShopMatch(directory, command.input.selectedShop.id, command.input.storage_id);
        }
      }
      if (command.kind === 'autoPacking.save') {
        const current = normalizeAccountSettings(await this.request('/api/member-settings', context, { signal: controller.signal }));
        if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        if (!current.capabilities.autoPackingPolicyPreserved) throw new ApiError(0, 'accountSettings.serverUpdateRequired');
      }
      if (command.kind === 'password.change' || command.kind.startsWith('settings.')) {
        const current = normalizeAccountSettings(await this.request('/api/member-settings', context, { signal: controller.signal }));
        if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        validateSettingsMutation(command as SettingsMutationCommand, current);
      }
      if (command.kind === 'preferences.save' && command.input.obtainMass !== undefined) {
        const current = await this.request('/api/member/mail-options/', context, { signal: controller.signal });
        if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        const flag = current && typeof current === 'object' ? (current as Record<string, unknown>).obtainMass : undefined;
        if (![false, true, 0, 1, '0', '1'].includes(flag as never)) throw new ApiError(0, 'accountSettings.serverUpdateRequired');
      }
      if (command.kind === 'profile.save') {
        const current = profileFormData(await this.request('/api/member/personal-data', context, { signal: controller.signal }));
        if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        const checked = validateProfileUpdate(command.input, current);
        if (Object.keys(checked.errors).length) throw new ApiError(0, 'errors.validation', {}, { fieldErrors: checked.errors, outcome: 'rejected' });
        plan = { ...plan, fields: checked.fields };
      }
      if (command.kind === 'waiting.passcode.save') {
        const detail = normalizeWaitingDetail(await this.request(`/api/waiting-mf/${command.id}`, context, { signal: controller.signal }));
        if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        if (detail.id !== command.id || detail.passcodeAllowed !== true) throw new ApiError(403, 'passcode.notAllowed');
      }
      if (command.kind === 'shipment.review.save') {
        // The owned detail read is checked again immediately before this single
        // explicit POST. It prevents stale state and replacing an existing photo.
        const current = normalizeParcelReview(await this.request(`/api/parcels/view/${command.id}`, context, { signal: controller.signal }));
        if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        validateReviewAgainstCurrent(command.id, command.input, current);
      }
      if (command.kind === 'recipient.delete' || command.kind === 'recipient.save' && command.id) {
        // A direct route or stale form must not bypass the account's permission.
        // Refresh from the read-only list immediately before the explicit write.
        const recipients = normalizeRecipientAddressesData(await this.request('/api/member-address', context, { signal: controller.signal }));
        if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        const recipient = recipients.find(value => value.id === command.id);
        if (recipient?.isEditable !== true) throw new ApiError(403, recipient?.isEditable === false ? 'accountOps.recipientReadOnly' : 'accountOps.recipientPermissionUnavailable');
      }
      if (!this.isCurrent(context) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
      if (command.kind === 'payments.start') {
        // Never replay even an uncertain POST. Recovery is an owned status GET;
        // the durable attempt identifier is held by the payment screen alone.
        this.dispatchedPaymentQuotes.add(command.input.quoteId);
        this.dispatchedPaymentAttempts.add(command.input.idempotencyKey);
        this.paymentQuotes.delete(command.input.quoteId);
      }
      writeStarted = true;
      this.dispatchedMutation = controller;
      const raw = await this.transport(plan.path, { token: session.token, signal: controller.signal, language: context.language, write: plan, responseMode: plan.responseMode });
      if (command.kind === 'payments.legacy.start' && command.input.paymentType === 'platescro') preparedCardPaymentId = legacyCardPaymentId(raw);
      if (!this.isCurrent(context)) return { ok: false, error: 'errors.mutationUnknown', outcome: 'unknown' };
      if (controller.signal.aborted) throw new ApiError(0, 'errors.cancelled', {}, { outcome: 'unknown' });
      // Each operation confirms its own acknowledgement; HTTP 200 alone is not a save.
      if (!plan.normalize) throw new ApiError(0, 'errors.contract', {}, { outcome: 'unknown' });
      const data = plan.normalize(raw);
      if (command.kind === 'payments.legacy.start') {
        const result = data as LegacyPaymentStartResult;
        if (result.action.kind === 'form' && result.action.fields.curr.toUpperCase() !== legacyPaymentCurrency) throw new LegacyPaymentPreparationError(result.paymentId, 'currency');
      }
      if (command.kind === 'settings.region.save') advanceRegionScope();
      this.invalidate(plan.invalidate);
      await this.refresh(plan.invalidate);
      if (!this.isCurrent(context)) return { ok: false, error: 'errors.mutationUnknown', outcome: 'unknown' };
      if (controller.signal.aborted) throw new ApiError(0, 'errors.cancelled', {}, { outcome: 'unknown' });
      this.emit({ mutation: emptyMutation() });
      return { ok: true, data };
    } catch (error) {
      const cardPreparation = command.kind === 'payments.legacy.start' && command.input.paymentType === 'platescro' && writeStarted;
      // This API only prepares an unpaid row; no card request reaches EuPlatesc
      // until the UI opens the returned form. Keep its reference and diagnosis,
      // but do not permanently lock invoices because preparation failed.
      const paymentPreparation = cardPreparation ? {
        paymentId: error instanceof LegacyPaymentPreparationError ? error.paymentId : preparedCardPaymentId,
        reason: error instanceof LegacyPaymentPreparationError ? error.reason : error instanceof ApiError ? (error.status ? `http_${error.status}` : error.key.replace(/[^A-Za-z0-9_]/g, '_')) : 'response',
      } : undefined;
      if (!this.isCurrent(context)) return { ok: false, error: writeStarted ? 'errors.mutationUnknown' : 'errors.cancelled', outcome: writeStarted ? 'unknown' : 'rejected' };
      const outcome = !writeStarted ? 'rejected' : command.kind === 'payments.legacy.start' ? 'unknown' : error instanceof ApiError ? error.outcome ?? 'unknown' : 'unknown';
      const key = cardPreparation ? 'payments.checkoutFailed' : outcome === 'unknown' ? 'errors.mutationUnknown' : errorMessage(error);
      const fieldErrors = error instanceof ApiError || error instanceof MutationInputError ? error.fieldErrors : undefined;
      if (error instanceof ApiError && error.status === 401) { await this.logout('errors.sessionExpired'); return { ok: false, error: 'errors.sessionExpired', outcome: command.kind === 'payments.legacy.start' && writeStarted ? 'unknown' : 'rejected' }; }
      // Refreshing after an uncertain result is read-only. Never replay the write.
      if (outcome === 'unknown') {
        if (command.kind === 'settings.region.save') advanceRegionScope();
        this.invalidate(plan.invalidate);
      }
      this.emit({ mutation: { pending: false, operation: command.kind, error: key, outcome } });
      if (outcome === 'unknown') void this.refresh(plan.invalidate);
      return { ok: false, error: key, fieldErrors, outcome, ...(paymentPreparation ? { paymentPreparation } : {}) };
    } finally { options.signal?.removeEventListener('abort', cancel); this.requests.delete(controller); if (this.dispatchedMutation === controller) this.dispatchedMutation = null; }
  };
  /** The locale is local to this device. Changing it never edits the account,
   * replays credentials, clears the token, or lets an old read start its next step. */
  setLanguage = (language: Language): boolean => {
    if (!isLanguage(language) || this.snapshot.signingIn || this.snapshot.mutation.pending) return false;
    if (language === this.language) return true;
    this.language = language;
    if (!this.snapshot.ready) { this.emit({ language }); return true; }
    this.cancel();
    this.emit({ language, resources: emptyResources(), parcelPages: Object.fromEntries(parcelStages.map(stage => [stage, emptyParcelPage(stage, { ...this.snapshot.parcelPages[stage].query, page: 1 })])) as ParcelPages });
    if (this.session) void this.refresh();
    return true;
  };
  start = async () => {
    if (this.started) return;
    this.started = true;
    const generation = this.generation;
    try {
      const raw = await this.storage.read();
      if (generation !== this.generation) return;
      this.session = readSession(raw, this.now());
      if (raw && !this.session) await this.queueWrite(() => this.storage.clear());
      if (generation !== this.generation) return;
      this.emit({ ready: true, authenticated: !!this.session });
      if (this.session) void this.refresh();
    } catch {
      if (generation === this.generation) this.emit({ ready: true, notice: 'errors.sessionRead' });
    }
  };
  login = async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    if (this.snapshot.mutation.pending) return { ok: false, error: 'errors.mutationInProgress' };
    if (this.snapshot.signingIn) return { ok: false, error: 'errors.loginInProgress' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) return { ok: false, error: 'errors.loginRequiredFields' };
    this.cancel();
    this.accountGeneration++;
    const generation = this.generation;
    const controller = new AbortController();
    this.requests.add(controller);
    this.session = null;
    this.emit({ authRevision: this.accountGeneration, accountId: null, signingIn: true, authenticated: false, notice: null, mutation: emptyMutation(), parcelPages: emptyParcelPages(), resources: emptyResources() });
    try {
      // A failed new sign-in must never restore the previous account later.
      try { await this.queueWrite(() => this.storage.clear()); }
      catch { throw new ApiError(0, 'errors.sessionClear'); }
      if (generation !== this.generation) return { ok: false };
      const auth = normalizeAuthData(await this.transport('/api/auth', { login: { email: email.trim(), password }, signal: controller.signal, language: this.language }));
      if (generation !== this.generation) return { ok: false };
      const session: Session = { origin: API_ORIGIN, token: auth.accessToken, expiresAt: this.now() + auth.expiresInSeconds * 1000 };
      if (!Number.isSafeInteger(session.expiresAt)) throw new ApiError(0, 'errors.sessionDuration');
      // Native secure storage is the only persistent location for the token.
      try { await this.queueWrite(async () => { if (generation === this.generation) await this.storage.write(JSON.stringify(session)); }); }
      catch { if (generation === this.generation) this.emit({ notice: 'errors.sessionSave' }); }
      if (generation !== this.generation) return { ok: false };
      this.session = session;
      this.resource('profile', { data: auth.profile, updatedAt: this.now() });
      this.emit({ authenticated: true, signingIn: false, ready: true });
      void this.refresh();
      return { ok: true };
    } catch (error) {
      if (generation !== this.generation) return { ok: false };
      this.emit({ signingIn: false });
      return { ok: false, error: errorMessage(error) };
    } finally { this.requests.delete(controller); }
  };
  /** Adopt only the completed BayShop session, never an OAuth/pending token.
   * The caller captures authRevision before opening the provider flow. */
  adoptSocialSession = async (input: LiveAuthSession, expectedAuthRevision: number): Promise<{ ok: boolean; error?: string }> => {
    if (this.snapshot.mutation.pending) return { ok: false, error: 'errors.mutationInProgress' };
    if (this.snapshot.signingIn) return { ok: false, error: 'errors.loginInProgress' };
    if (expectedAuthRevision !== this.accountGeneration) return { ok: false, error: 'errors.cancelled' };
    let auth: LiveAuthSession;
    let expiresAt: number;
    try {
      // A narrow reconstruction validates even a caller crossing a JS boundary
      // and prevents unexpected fields from entering account state or storage.
      auth = normalizeAuthData({ access_token: input.accessToken, expires_in: input.expiresInSeconds, token_type: input.tokenType, id: input.profile.id, uid: input.profile.clientCode, name: input.profile.firstName, surname: input.profile.lastName });
      expiresAt = this.now() + auth.expiresInSeconds * 1000;
      if (!Number.isSafeInteger(expiresAt)) throw new ApiError(0, 'errors.sessionDuration');
    } catch (error) { return { ok: false, error: errorMessage(error) }; }
    this.cancel(); this.accountGeneration++;
    const generation = this.generation;
    this.session = null;
    this.emit({ authRevision: this.accountGeneration, accountId: null, signingIn: true, authenticated: false, notice: null, mutation: emptyMutation(), parcelPages: emptyParcelPages(), resources: emptyResources() });
    try {
      try { await this.queueWrite(() => this.storage.clear()); }
      catch { throw new ApiError(0, 'errors.sessionClear'); }
      if (generation !== this.generation) return { ok: false, error: 'errors.cancelled' };
      const session: Session = { origin: API_ORIGIN, token: auth.accessToken, expiresAt };
      try { await this.queueWrite(async () => { if (generation === this.generation) await this.storage.write(JSON.stringify(session)); }); }
      catch { if (generation === this.generation) this.emit({ notice: 'errors.sessionSave' }); }
      if (generation !== this.generation) return { ok: false, error: 'errors.cancelled' };
      this.session = session;
      this.resource('profile', { data: auth.profile, updatedAt: this.now() });
      this.emit({ authenticated: true, signingIn: false, ready: true });
      void this.refresh();
      return { ok: true };
    } catch (error) {
      if (generation !== this.generation) return { ok: false, error: 'errors.cancelled' };
      this.emit({ signingIn: false });
      return { ok: false, error: errorMessage(error) };
    }
  };
  logout = async (notice: string | null = null) => {
    const uncertainWrite = this.snapshot.mutation.pending && this.dispatchedMutation !== null;
    this.cancel(); this.session = null;
    const accountGeneration = ++this.accountGeneration;
    this.emit({ authRevision: this.accountGeneration, accountId: null, ready: true, authenticated: false, signingIn: false, notice: notice ?? (uncertainWrite ? 'errors.mutationUnknown' : null), mutation: emptyMutation(), parcelPages: emptyParcelPages(), resources: emptyResources() });
    try { await this.queueWrite(() => this.storage.clear()); }
    // A locale change must not hide a failed secure-session cleanup. A newer
    // account operation may supersede it; a presentation change may not.
    catch { if (accountGeneration === this.accountGeneration) this.emit({ notice: 'errors.sessionCleanup' }); }
  };
  refresh = async (selection: ResourceKey[] = keys) => {
    const session = this.session;
    if (!session) return;
    if (session.expiresAt <= this.now()) { await this.logout('errors.sessionExpired'); return; }
    const generation = this.generation;
    const receivedMetadataOnly = selection === keys && this.snapshot.resources.received.data === null;
    const requestContext: RequestContext = { session, generation, language: this.language };
    let counters: Promise<ReturnType<typeof normalizeCountersData> | null> | undefined;
    const counts = () => counters ??= this.request('/api/member/counters', requestContext).then(normalizeCountersData).catch(error => {
      if (error instanceof ApiError && error.status === 401) throw error;
      return null;
    });
    let warehouseList: Promise<ReturnType<typeof normalizeWarehousesData>> | undefined;
    const warehouses = () => warehouseList ??= this.request('/api/warehouse-list', requestContext).then(normalizeWarehousesData);
    const sent = async () => {
      const total = await counts();
      if (!total) throw new ApiError(0, 'errors.shipmentCompleteness');
      if (total?.outgoing === 0) return [];
      // This verified aggregate route has no reliable paging in production.
      // Read it once; an incomplete response is never declared complete.
      const rows = normalizeShipmentsData(await this.request('/api/parcels/all', requestContext), 'sent');
      if (rows.some(row => row.stage !== 'sent')) throw new ApiError(0, 'errors.shipmentStates');
      if (total && rows.length !== total.outgoing) throw new ApiError(0, 'errors.shipmentCompleteness');
      const knownWarehouses = await warehouses().catch(error => { if (error instanceof ApiError && error.status === 401) throw error; return []; });
      return rows.map(row => ({ ...row, countryCode: knownWarehouses.find(warehouse => warehouse.id === row.storageId)?.code ?? null }));
    };
    const received = async () => {
      this.receivedRequest?.abort();
      const controller = new AbortController(); this.receivedRequest = controller;
      const read = (path: string) => this.request(path, requestContext, { signal: controller.signal });
      try {
        const raw = await read('/api/member/counters?parcelType=received');
        const countries = normalizeCountryCounts(raw);
        if (!this.isCurrent(requestContext) || controller.signal.aborted) throw new ApiError(0, 'errors.cancelled');
        const previous = this.snapshot.parcelPages.received;
        const country = countries.find(item => item.code === previous.query.countryCode) ?? countries.find(item => item.total > 0) ?? countries[0];
        const overallTotal = countries.reduce((sum, item) => sum + item.total, 0);
        const countryCode = country?.code ?? 'all';
        const scopeChanged = countryCode !== previous.query.countryCode;
        const query = { ...previous.query, countryCode, ...(scopeChanged ? { page: 1 } : {}) };
        this.emit({ ...(scopeChanged ? { resources: { ...this.snapshot.resources, received: { ...this.snapshot.resources.received, data: null, updatedAt: null } } } : {}), parcelPages: { ...this.snapshot.parcelPages, received: { ...previous, query, countries, overallTotal, total: country?.total ?? 0, ...(scopeChanged ? { items: null, loaded: 0, updatedAt: null } : {}), mode: 'local', searchScope: 'collection' } } });
        if (receivedMetadataOnly) return [];
        if (!country || country.total === 0) return [];
        // Authenticated probes confirmed page/perPage are ignored. Cache only
        // the selected country and paginate its display, without looping over
        // every country/history on login or inventing server-page semantics.
        const rows = normalizeShipmentsData(await read(`/api/parcels/${country.code.toLowerCase()}/received`), 'received');
        if (rows.some(row => row.stage !== 'received')) throw new ApiError(0, 'errors.shipmentStates');
        if (rows.length !== country.total) throw new ApiError(0, 'errors.shipmentCompleteness');
        return rows.map(row => ({ ...row, countryCode: country.code }));
      } finally { if (this.receivedRequest === controller) this.receivedRequest = null; }
    };
    const loaders: { [K in ResourceKey]: () => Promise<DataMap[K]> } = {
      profile: async () => {
        const profile = normalizeProfileData(await this.request('/api/auth', requestContext));
        const personal = normalizePersonalProfileData(await this.request('/api/member/personal-data', requestContext), profile);
        let email: string | null = null;
        let emailError: string | null = null;
        try { email = normalizeMemberEmailData(await this.request('/api/member/me', requestContext), profile.id); }
        catch (error) {
          if (!this.isCurrent(requestContext) || error instanceof ApiError && error.status === 401) throw error;
          emailError = errorMessage(error);
        }
        return { ...personal, firstName: profile.firstName ?? personal.firstName, lastName: profile.lastName ?? personal.lastName, email, emailError };
      },
      waiting: async () => {
        const rows = normalizeWaitingData(await this.request('/api/waiting-mf-list', requestContext));
        const knownWarehouses = await warehouses().catch(error => { if (error instanceof ApiError && error.status === 401) throw error; return []; });
        return rows.map(row => ({ ...row, countryCode: knownWarehouses.find(warehouse => warehouse.id === row.storageId)?.code ?? null }));
      },
      warehouse: async () => {
        const list = await warehouses();
        const batches = await Promise.all(list.map(async warehouse => {
          // Production accepts numeric warehouse IDs, despite the old enum in docs.
          const parcels = normalizeStockData(await this.request(`/api/mf-list/in-stock/${encodeURIComponent(warehouse.id)}`, requestContext));
          return parcels.map(parcel => ({ ...parcel, countryCode: warehouse.code }));
        }));
        return batches.flat();
      },
      sent,
      received,
      addresses: async () => normalizeWarehouseAddressesData(await this.request('/api/member-storage-address', requestContext)),
      recipients: async () => normalizeRecipientAddressesData(await this.request('/api/member-address', requestContext)),
      // Current balances are lightweight and independent of history. History
      // is loaded through readView only when its screen is focused.
      balance: async () => ({
        balances: normalizeCurrentBalancesData(await this.request('/api/refund-request', requestContext)),
        transactions: [],
      }),
    };
    const load = async <K extends ResourceKey>(key: K) => {
      const version = (this.versions[key] ?? 0) + 1;
      this.versions[key] = version;
      this.resource(key, { loading: true, error: null });
      try {
        const data = await loaders[key]();
        if (generation === this.generation && version === this.versions[key]) {
          if (key === 'received' && receivedMetadataOnly) this.resource(key, { loading: false, error: null });
          else this.resource(key, { data, loading: false, error: null, updatedAt: this.now() });
        }
      } catch (error) {
        if (generation !== this.generation || version !== this.versions[key]) return;
        if (error instanceof ApiError && error.status === 401) { await this.logout('errors.sessionExpired'); return; }
        this.resource(key, { loading: false, error: errorMessage(error) });
      }
    };
    await Promise.all([...new Set(selection)].map(key => load(key)));
  };
}
