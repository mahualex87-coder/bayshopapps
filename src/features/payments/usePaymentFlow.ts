import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import { useLiveAccount } from '@/api/context';
import { ApiError, errorMessage } from '@/api/client';
import { legacyPaymentDisplayBase, legacyPaymentSelectionRevision, legacyPreparationDiagnostic, validateLegacyPaymentSelection, type LegacyPaymentAction, type LegacyPaymentsData, type LegacyPaymentSelection, type LegacyPaymentStartResult, type LegacyPaymentStatus } from '@/api/payment-legacy';
import { reconcilePaymentInvoices, type PaymentReconciliationResult } from '@/api/payment-reconciliation';
import { HostedCheckoutError, prepareHostedCheckout } from '@/api/hosted-checkout';
import { paymentAttemptStore } from './payment-attempt-store';
import { isPayPalApprovalUrl, type PaymentAttempt } from './payment-attempt';
import type { ProviderAction } from './PaymentProvider';
import { browserFailureCode, type BrowserFailureCode } from './paypal-browser-controller';

// Only simultaneous initiations are excluded. A later deliberate tap always
// starts from the server's unpaid catalog; no failed/pending attempt is restored.
const initiations = new Map<string, object>();
type Session = { accountId: string; revision: number; loaded: boolean };
type StatusJob = { key: string; controller: AbortController; promise: Promise<boolean> };

class PaymentPresentationError extends ApiError {
  constructor(readonly diagnosticCode: 'HANDOFF_BACKGROUND' | 'HANDOFF_ABORTED' | 'HANDOFF_INACTIVE_TIMEOUT') {
    super(0, 'payments.checkoutFailed');
  }
}

/** iOS inactive is a temporary interruption, not necessarily backgrounding.
 * Keep the one prepared checkout in memory and present it only once active.
 * A real background transition, unmount or timeout discards the handoff. */
export function waitForPaymentForeground(signal: AbortSignal, deadline: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let subscription: ReturnType<typeof AppState.addEventListener> | undefined;
    const finish = (reason?: ConstructorParameters<typeof PaymentPresentationError>[0]) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      subscription?.remove();
      signal.removeEventListener('abort', onAbort);
      if (reason) reject(new PaymentPresentationError(reason)); else resolve();
    };
    const onAbort = () => finish('HANDOFF_ABORTED');
    const changed = (state: string | null | undefined) => {
      if (signal.aborted) onAbort();
      else if (state === 'background') finish('HANDOFF_BACKGROUND');
      else if (state === 'active') finish();
    };
    subscription = AppState.addEventListener('change', changed);
    signal.addEventListener('abort', onAbort, { once: true });
    const remaining = deadline - Date.now();
    if (remaining <= 0) finish('HANDOFF_INACTIVE_TIMEOUT');
    else {
      timer = setTimeout(() => finish('HANDOFF_INACTIVE_TIMEOUT'), remaining);
      changed(AppState.currentState);
    }
  });
}

export function usePaymentFlow(reload: () => void) {
  const { accountId, accountRevision, readView, mutate, canMutate, refresh } = useLiveAccount();
  const [attemptState, setAttempt] = useState<PaymentAttempt | null>(null);
  const [status, setStatus] = useState<LegacyPaymentStatus | null>(null);
  const [action, setAction] = useState<LegacyPaymentAction | null>(null);
  const [provider, setProvider] = useState<ProviderAction | null>(null);
  const [invoicesPaid, setInvoicesPaid] = useState(false);
  const [terminalOrigin, setTerminalOrigin] = useState<{ attemptKey: string; currency: string; amount: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticCode, setDiagnosticCode] = useState<string | null>(null);
  const [readyOwner, setReadyOwner] = useState<{ accountId: string; revision: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const active = useRef(true);
  const viewRevision = useRef(0);
  const session = useRef<Session | null>(null);
  const currentAttempt = useRef<PaymentAttempt | null>(null);
  const currentProvider = useRef<ProviderAction | null>(null);
  const currentStatus = useRef<{ key: string; value: LegacyPaymentStatus } | null>(null);
  const settled = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const statusJob = useRef<StatusJob | null>(null);
  const isCurrent = useCallback((owner: Session) => active.current && session.current === owner, []);
  const clearTransient = useCallback((clearDiagnostic = true) => {
    viewRevision.current++;
    statusJob.current?.controller.abort(); statusJob.current = null;
    currentAttempt.current = null; currentProvider.current = null; currentStatus.current = null; settled.current = null;
    setAttempt(null); setStatus(null); setAction(null); setProvider(null); setInvoicesPaid(false); setTerminalOrigin(null); setChecking(false);
    if (clearDiagnostic) setDiagnosticCode(null);
  }, []);
  useEffect(() => {
    session.current = null;
    active.current = true;
    if (!accountId) return () => { active.current = false; request.current?.abort(); statusJob.current?.controller.abort(); };
    const owner: Session = { accountId, revision: accountRevision, loaded: false }; session.current = owner;
    // Deletion is local and account/origin scoped. It neither cancels a server
    // payment nor declares it paid. Corrupt old data is deleted without parsing.
    void paymentAttemptStore.clearLegacyAttempts(accountId).then(() => {
      if (isCurrent(owner)) setError(null);
    }).catch(() => { if (isCurrent(owner)) setError('payments.localCleanupFailed'); }).finally(() => {
      owner.loaded = true;
      if (isCurrent(owner)) { clearTransient(); setBusy(false); setReadyOwner({ accountId: owner.accountId, revision: owner.revision }); }
    });
    return () => { active.current = false; request.current?.abort(); statusJob.current?.controller.abort(); };
  }, [accountId, accountRevision, clearTransient, isCurrent]);
  const refreshInvoices = useCallback(async (owner: Session) => {
    const revision = viewRevision.current;
    try { await readView({ kind: 'payments.legacy.catalog' }); }
    catch (cause) { if (isCurrent(owner) && viewRevision.current === revision) setError(errorMessage(cause)); }
    if (isCurrent(owner) && viewRevision.current === revision) reload();
  }, [isCurrent, readView, reload]);
  const check = useCallback((current: PaymentAttempt, reconcile = true): Promise<boolean> => {
    const owner = session.current;
    if (!owner || !isCurrent(owner) || currentAttempt.current?.attemptKey !== current.attemptKey || request.current || AppState.currentState !== 'active') return Promise.resolve(false);
    if (currentStatus.current?.key === current.attemptKey && currentStatus.current.value.state === 'paid' || settled.current === current.attemptKey) return Promise.resolve(true);
    if (statusJob.current?.key === current.attemptKey) return statusJob.current.promise;
    const controller = new AbortController();
    const job: StatusJob = { key: current.attemptKey, controller, promise: Promise.resolve(false) }; statusJob.current = job;
    const valid = () => isCurrent(owner) && !controller.signal.aborted && currentAttempt.current?.attemptKey === current.attemptKey;
    setChecking(true);
    job.promise = (async () => {
      try {
        if (current.paymentId) {
          const result = await readView({ kind: 'payments.legacy.status', paymentId: current.paymentId }, { signal: controller.signal });
          if (!valid() || result.paymentId !== current.paymentId) return false;
          currentStatus.current = { key: current.attemptKey, value: result }; setStatus(result);
          if (result.state === 'paid') {
            currentProvider.current = null; setProvider(null); setAction(null); setError(null);
            reload(); void refresh(['balance', 'profile']); return true;
          }
        }
        if (reconcile && current.version === 2 && (current.paymentType === 'paypal' || current.paymentType === 'terminals' || current.hostedChannel === 'APAY' || current.hostedChannel === 'GPAY')) {
          const paid = await reconcilePaymentInvoices(current.scope, async query => {
            if (!valid() || AppState.currentState !== 'active') throw new ApiError(0, 'errors.cancelled');
            const result = await readView(query, { signal: controller.signal });
            if (!valid()) throw new ApiError(0, 'errors.cancelled');
            return result as PaymentReconciliationResult<typeof query>;
          });
          if (!valid()) return false;
          if (paid) {
            settled.current = current.attemptKey; setInvoicesPaid(true); currentProvider.current = null; setProvider(null); setAction(null); setError(null);
            reload(); void refresh(['balance', 'profile']); return true;
          }
        }
        return false;
      } catch (cause) { if (valid()) setError(errorMessage(cause)); return false; }
      finally { if (statusJob.current === job) { statusJob.current = null; if (isCurrent(owner)) setChecking(false); } }
    })();
    return job.promise;
  }, [isCurrent, readView, refresh, reload]);
  const ownerMatches = readyOwner?.accountId === accountId && readyOwner?.revision === accountRevision;
  const attempt = ownerMatches ? attemptState : null;
  // Read-only confirmation while the current provider/code is visible. No
  // record or polling survives leaving this screen or starting another payment.
  useEffect(() => {
    if (!attempt?.paymentId || busy || status?.state === 'paid' || invoicesPaid) return;
    let cancelled = false, polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (cancelled) return;
      if (AppState.currentState === 'active') { await check(attempt, false); polls++; }
      if (!cancelled && currentAttempt.current?.attemptKey === attempt.attemptKey && currentStatus.current?.value.state !== 'paid' && settled.current !== attempt.attemptKey) timer = setTimeout(() => { void poll(); }, polls < 6 ? 5000 : 15000);
    };
    timer = setTimeout(() => { void poll(); }, 5000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void check(attempt); });
    return () => { cancelled = true; clearTimeout(timer); subscription.remove(); };
  }, [attempt, busy, check, invoicesPaid, status?.state]);
  const start = async (selection: LegacyPaymentSelection, data: LegacyPaymentsData) => {
    const owner = session.current;
    if (!owner || !isCurrent(owner) || !owner.loaded || !ownerMatches || !canMutate || !accountId || request.current || currentProvider.current || initiations.has(accountId)) return;
    const lease = {}; initiations.set(accountId, lease);
    const controller = new AbortController(); request.current = controller;
    // Observe the whole preparation, including BayShop's initial response, so
    // leaving and returning cannot open a late checkout from that operation.
    const backgroundSubscription = selection.hostedChannel === 'APAY' || selection.hostedChannel === 'GPAY'
      ? AppState.addEventListener('change', state => { if (state === 'background') controller.abort(); }) : null;
    clearTransient(); setBusy(true); setError(null);
    let dispatched = false;
    let preparationDiagnostic: string | null = null;
    try {
      // Freeze the displayed confirmation and compare it with a fresh owned
      // catalog. The service repeats this check immediately before its one POST.
      const input = { ...selection, billIds: [...selection.billIds] };
      const selectionRevision = legacyPaymentSelectionRevision(input, data);
      const fresh = await readView({ kind: 'payments.legacy.catalog' }, { signal: controller.signal });
      if (!isCurrent(owner) || controller.signal.aborted) return;
      if (legacyPaymentSelectionRevision(input, fresh) !== selectionRevision) throw new ApiError(0, 'payments.quoteChanged');
      const { group } = validateLegacyPaymentSelection(input, fresh);
      const selectedIds = new Set(input.billIds);
      const terminalBase = input.paymentType === 'terminals' ? legacyPaymentDisplayBase((group.invoices ?? []).filter(item => selectedIds.has(item.id)).map(item => item.amount), group.maxSum) : null;
      let current: PaymentAttempt = { version: 2, attemptKey: Crypto.randomUUID(), paymentId: null, paymentType: input.paymentType, createdAt: Date.now(), phase: 'preparing', scope: { currency: group.currency, invoices: (group.invoices ?? []).filter(item => selectedIds.has(item.id)).map(item => ({ id: item.id, reference: item.reference ?? '', amount: item.amount })) }, ...(input.hostedChannel ? { hostedChannel: input.hostedChannel } : {}) };
      currentAttempt.current = current; setAttempt(current); dispatched = true;
      const result = await mutate({ kind: 'payments.legacy.start', input: { ...input, selectionRevision } }, { signal: controller.signal });
      if (!isCurrent(owner) || controller.signal.aborted) return;
      if (!result.ok) {
        if (input.paymentType === 'platescro') preparationDiagnostic = legacyPreparationDiagnostic(result.paymentPreparation?.reason);
        throw new ApiError(0, result.outcome === 'unknown' ? input.paymentType === 'platescro' ? 'payments.checkoutFailed' : 'payments.unknown' : result.error || 'payments.unavailableData');
      }
      const value = result.data as LegacyPaymentStartResult;
      if (value.paymentType !== input.paymentType) throw new ApiError(0, 'errors.contract');
      if (value.paymentType === 'paypal' && (value.action.kind !== 'redirect' || !isPayPalApprovalUrl(value.action.url))) throw new ApiError(0, 'payments.checkoutFailed');
      current = { ...current, paymentId: value.paymentId, phase: 'checkout' }; currentAttempt.current = current; setAttempt(current);
      const hostedWallet = value.paymentType === 'platescro' && (input.hostedChannel === 'APAY' || input.hostedChannel === 'GPAY');
      if (hostedWallet) {
        if (value.action.kind !== 'form') throw new ApiError(0, 'payments.checkoutFailed');
        const preparationDeadline = Date.now() + 10000;
        while (AppState.currentState !== 'active') await waitForPaymentForeground(controller.signal, preparationDeadline);
        if (!isCurrent(owner) || controller.signal.aborted) return;
        const checkout = await prepareHostedCheckout(value.action, { fetch: expoFetch, signal: controller.signal });
        if (!isCurrent(owner) || controller.signal.aborted) return;
        if (checkout.paymentId !== value.paymentId || checkout.channel !== input.hostedChannel) throw new ApiError(0, 'payments.checkoutFailed');
        const presentationDeadline = Date.now() + 10000;
        while (AppState.currentState !== 'active') await waitForPaymentForeground(controller.signal, presentationDeadline);
        if (!isCurrent(owner) || controller.signal.aborted) return;
        const redirect = { kind: 'redirect' as const, url: checkout.url }; currentProvider.current = redirect; setAction(redirect); setProvider(redirect);
      } else {
        if (AppState.currentState !== 'active') throw new ApiError(0, 'payments.checkoutFailed');
        setAction(value.action);
        if (value.paymentType === 'terminals' && value.action.kind === 'terminal' && terminalBase !== null) setTerminalOrigin({ attemptKey: current.attemptKey, currency: group.currency, amount: terminalBase });
        if (value.action.kind === 'form' || value.action.kind === 'redirect') { currentProvider.current = value.action; setProvider(value.action); }
      }
    } catch (cause) {
      if (isCurrent(owner)) {
        clearTransient();
        setError(cause instanceof ApiError ? errorMessage(cause) : dispatched ? 'payments.checkoutFailed' : errorMessage(cause));
        if (cause instanceof HostedCheckoutError) setDiagnosticCode(cause.diagnosticCode);
        else if (cause instanceof PaymentPresentationError) setDiagnosticCode(cause.diagnosticCode);
        else if (preparationDiagnostic) setDiagnosticCode(preparationDiagnostic);
        await refreshInvoices(owner);
      }
    } finally {
      backgroundSubscription?.remove();
      if (initiations.get(owner.accountId) === lease) initiations.delete(owner.accountId);
      if (request.current === controller) request.current = null;
      if (isCurrent(owner)) {
        // A backgrounded/aborted preparation never opens a late provider or
        // strands the list. The server remains authoritative about its invoice.
        if (controller.signal.aborted) { clearTransient(false); reload(); }
        setBusy(false);
      }
    }
  };
  const renderedKey = attempt?.attemptKey;
  const returnFromProvider = async (paymentId?: string, failed = false, failureCode?: BrowserFailureCode) => {
    const owner = session.current, current = currentAttempt.current;
    if (!owner || !isCurrent(owner) || !current || current.attemptKey !== renderedKey || request.current) return;
    // A foreign callback ID must not confirm another payment. PayPal's missing
    // numeric ID is reconciled through the exact owned invoices instead.
    if (paymentId && current.paymentId && paymentId !== current.paymentId) return;
    currentProvider.current = null; setProvider(null);
    const confirmed = await check(current);
    if (!isCurrent(owner) || currentAttempt.current?.attemptKey !== current.attemptKey) return;
    if (!confirmed) {
      clearTransient();
      if (failed) { setError('payments.providerInterrupted'); setDiagnosticCode(browserFailureCode(failureCode) ?? 'PROVIDER_INTERRUPTED'); }
    }
    await refreshInvoices(owner);
  };
  const showInvoices = async () => {
    const owner = session.current;
    if (!owner || !isCurrent(owner) || request.current) return;
    clearTransient(); setError(null); await refreshInvoices(owner);
  };
  return { attempt, terminalOrigin: ownerMatches && attempt?.attemptKey === terminalOrigin?.attemptKey ? terminalOrigin : null, status: ownerMatches ? status : null, action: ownerMatches ? action : null, provider: ownerMatches ? provider : null, invoicesPaid: ownerMatches && invoicesPaid,
    error: ownerMatches ? error : null, diagnosticCode: ownerMatches ? diagnosticCode : null, ready: ownerMatches, busy: ownerMatches && busy, checking: ownerMatches && checking, start,
    finish: showInvoices, showInvoices, clearError: () => { setError(null); setDiagnosticCode(null); }, providerReturn: (paymentId?: string) => returnFromProvider(paymentId),
    providerFailed: (code?: BrowserFailureCode) => returnFromProvider(undefined, true, code),
    closeProvider: () => returnFromProvider(), check: () => currentAttempt.current ? check(currentAttempt.current) : Promise.resolve(false),
  };
}
