import { ApiContractError } from './normalize.ts';
import { MutationInputError, type MutationPlan, type ReadPlan } from './mutations.ts';
import { serverText } from '../domain/server-text.ts';
import { sortCurrencies } from '../domain/option-order.ts';

export type RefundBalance = { id: string; currency: string; amount: number };
export type RefundMethod = { id: string; title: string; commissionPercent: string; minimumCommission: string; currencyIds: string[] };
export type RefundRequest = { id: string; currencyId: string; currency: string | null; methodId: string; methodTitle: string | null; amount: number; createdAt: string | null; status: string; canCancel: boolean };
export type RefundOverview = { guardedWrites: boolean; balances: RefundBalance[]; methods: RefundMethod[]; requests: RefundRequest[] };
export type RefundQuote = { currencyId: string; currency: string; methodId: string; methodTitle: string; amount: string; reservedAmount: number; estimatedFee: number; availableAmount: number; revision: string };
export type OrderCancellation = { id: string; uid: string | null; processingStatus: string; paymentStatus: string; currency: string; totalPrice: number; canCancel: boolean; revision: string };
export type FinancialReadCommand = { kind: 'refunds.read' } | { kind: 'order.cancellation'; id: string };
export type FinancialReadResult<Q extends FinancialReadCommand> = Q extends { kind: 'refunds.read' } ? RefundOverview : OrderCancellation;
export type FinancialMutationCommand =
  | { kind: 'refund.create'; currencyId: string; refundTypeId: string; amount: string; reviewRevision: string }
  | { kind: 'refund.cancel'; id: string }
  | { kind: 'order.cancel'; id: string; revision: string };
export type FinancialAcknowledgement = { accepted: true; id: string | null };

const fail = () => new ApiContractError('rambursări și anularea comenzilor');
function record(raw: unknown): Record<string, unknown> { if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fail(); return raw as Record<string, unknown>; }
function list(raw: unknown): unknown[] { if (!Array.isArray(raw)) throw fail(); return raw; }
function id(raw: unknown): string { if (typeof raw !== 'string' && typeof raw !== 'number' || !/^[1-9]\d*$/.test(String(raw))) throw fail(); return String(raw); }
function text(raw: unknown): string | null { if (raw === undefined || raw === null || raw === '') return null; if (typeof raw !== 'string') throw fail(); return serverText(raw); }
function decimal(raw: unknown, signed = false): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') throw fail();
  const value = String(raw);
  if (!(signed ? /^-?\d+(?:\.\d{1,4})?$/ : /^\d+(?:\.\d{1,4})?$/).test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1000000000) throw fail();
  return value;
}
function currency(raw: unknown): string { const value = text(raw)?.toUpperCase(); if (!value || !/^[A-Z]{3}$/.test(value)) throw fail(); return value; }
function unique<T>(values: T[], getId: (value: T) => string): T[] { if (new Set(values.map(getId)).size !== values.length) throw fail(); return values; }
function inputId(raw: string): string { if (!/^[1-9]\d*$/.test(raw)) throw new MutationInputError('errors.validation'); return raw; }

export function normalizeRefundOverview(raw: unknown): RefundOverview {
  const data = record(raw);
  const guardedWrites = data.guardedRefundWrites === true;
  const balances = sortCurrencies(unique(list(data.memberBalance).map(value => {
    const row = record(value); return { id: id(row.currency_id), currency: currency(row.currency_code), amount: Number(decimal(row.amount, true)) };
  }), row => row.id), row => row.currency);
  const methods = unique(list(data.refundTypes).map(value => {
    const row = record(value); const title = text(row.title); if (!title) throw fail();
    const commissionPercent = decimal(row.commissionPercent); if (Number(commissionPercent) > 100) throw fail();
    return { id: id(row.id), title, commissionPercent, minimumCommission: decimal(row.minimalCommission), currencyIds: guardedWrites ? unique(list(row.availableCurrency).map(id), value => value) : [] };
  }), row => row.id);
  const requests = unique(list(data.requestsList).map(value => {
    const row = record(value); const currencyId = id(row.currency_id), methodId = id(row.refundType_id);
    // MF v2's original GET calls getListByMemberId(member, 'DESC', true):
    // every legacy row is awaiting. New servers explicitly include status.
    const status = text(row.status) ?? 'awaiting';
    if (row.canCancel !== undefined && typeof row.canCancel !== 'boolean') throw fail();
    return { id: id(row.id), currencyId, currency: row.currency_code ? currency(row.currency_code) : balances.find(value => value.id === currencyId)?.currency ?? null, methodId, methodTitle: text(row.methodTitle) ?? methods.find(value => value.id === methodId)?.title ?? null, amount: Number(decimal(row.sum)), createdAt: text(row.created), status, canCancel: guardedWrites && status === 'awaiting' && row.canCancel === true };
  }), row => row.id);
  return { guardedWrites, balances, methods, requests };
}

export function normalizeOrderCancellation(raw: unknown, expectedId: string): OrderCancellation {
  const rows = list(raw); if (rows.length !== 1) throw fail();
  const row = record(rows[0]); const orderId = id(row.id); if (orderId !== expectedId) throw fail();
  const processingStatus = text(row.processingStatus), paymentStatus = text(row.paymentStatus);
  if (!processingStatus || !paymentStatus) throw fail();
  const result = { id: orderId, uid: text(row.uid), processingStatus, paymentStatus, currency: currency(row.currency), totalPrice: Number(decimal(row.totalPrice)), canCancel: processingStatus === 'new' && row.canCancelSafely === true };
  return { ...result, revision: JSON.stringify([result.id, result.processingStatus, result.paymentStatus, result.currency, result.totalPrice]) };
}

export function refundAmount(raw: string): string {
  const value = raw.trim().replace(',', '.');
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value) || Number(value) <= 0 || Number(value) > 1000000000) throw new MutationInputError('refunds.invalidAmount', { amount: 'refunds.invalidAmount' });
  return Number(value).toFixed(2);
}

export function quoteRefund(data: RefundOverview, input: { currencyId: string; refundTypeId: string; amount: string }): RefundQuote {
  const balance = data.balances.find(row => row.id === input.currencyId);
  const method = data.methods.find(row => row.id === input.refundTypeId);
  if (!balance || !method || !method.currencyIds.includes(balance.id)) throw new MutationInputError('refunds.methodUnavailable');
  const amount = refundAmount(input.amount); const reservedAmount = Number(amount);
  if (Math.round(reservedAmount * 100) > Math.round(balance.amount * 100)) throw new MutationInputError('refunds.insufficientFunds', { amount: 'refunds.insufficientFunds' });
  // Match Rows_RefundRequest::getCommissionSum's truncation, not Math.round.
  // The existing addRequest reserves only amount; it does not debit this fee.
  const amountCents = BigInt(amount.replace('.', ''));
  const percentScale = 10000n;
  const [whole, fraction = ''] = method.commissionPercent.split('.');
  const percent = BigInt(whole) * percentScale + BigInt(fraction.padEnd(4, '0'));
  const percentageFee = Number(amountCents * percent / (100n * percentScale)) / 100;
  const estimatedFee = Math.max(percentageFee, Number(method.minimumCommission));
  return { currencyId: balance.id, currency: balance.currency, methodId: method.id, methodTitle: method.title, amount, reservedAmount, estimatedFee, availableAmount: balance.amount, revision: JSON.stringify([balance.id, balance.currency, balance.amount, method.id, method.title, method.commissionPercent, method.minimumCommission, method.currencyIds, amount]) };
}

export function validateFinancialMutation(command: FinancialMutationCommand, current: RefundOverview | OrderCancellation): void {
  if (command.kind === 'order.cancel') {
    if (!('processingStatus' in current) || current.id !== command.id || !current.canCancel || current.revision !== command.revision) throw new MutationInputError('cancellation.changed');
  } else {
    if (!('requests' in current)) throw new MutationInputError('refunds.changed');
    if (!current.guardedWrites) throw new MutationInputError('refunds.readOnly');
    if (command.kind === 'refund.cancel') {
      const request = current.requests.find(row => row.id === command.id);
      if (!request?.canCancel || request.status !== 'awaiting') throw new MutationInputError('refunds.notCancelable');
    } else if (quoteRefund(current, command).revision !== command.reviewRevision) throw new MutationInputError('refunds.changed');
  }
}

export function normalizeFinancialAcknowledgement(raw: unknown): FinancialAcknowledgement {
  const envelope = record(raw);
  if (envelope.error !== false || envelope.code !== undefined && Number(envelope.code) !== 200) throw fail();
  const data = envelope.data == null ? null : record(envelope.data);
  return { accepted: true, id: data?.id == null ? null : id(data.id) };
}

export function planFinancialRead<Q extends FinancialReadCommand>(command: Q): ReadPlan<FinancialReadResult<Q>> {
  if (command.kind === 'refunds.read') return { path: '/api/refund-request?includeHistory=1', normalize: normalizeRefundOverview } as ReadPlan<FinancialReadResult<Q>>;
  const orderId = inputId(command.id);
  return { path: `/api/order/${orderId}`, normalize: raw => normalizeOrderCancellation(raw, orderId) } as ReadPlan<FinancialReadResult<Q>>;
}

export function planFinancialMutation(command: FinancialMutationCommand): MutationPlan {
  const common = { encoding: 'form' as const, responseMode: 'envelope' as const, invalidate: ['balance', 'profile'] as MutationPlan['invalidate'], normalize: normalizeFinancialAcknowledgement };
  if (command.kind === 'refund.create') {
    if (!command.reviewRevision) throw new MutationInputError('refunds.changed');
    return { ...common, method: 'POST', path: '/api/refund-request', fields: { currency_id: inputId(command.currencyId), refundType_id: inputId(command.refundTypeId), amount: refundAmount(command.amount) } };
  }
  if (command.kind === 'order.cancel' && !command.revision) throw new MutationInputError('cancellation.changed');
  return { ...common, method: 'DELETE', path: `/api/${command.kind === 'order.cancel' ? 'order' : 'refund-request'}/${inputId(command.id)}`, fields: {} };
}

/** A new row must match the reviewed request; an old equal-amount row is not proof. */
export function findCreatedRefund(current: RefundOverview, beforeIds: readonly string[], quote: RefundQuote, acknowledgedId: string | null): RefundRequest | null {
  const matching = current.requests.filter(row => !beforeIds.includes(row.id) && row.currencyId === quote.currencyId && row.methodId === quote.methodId && Math.round(row.amount * 100) === Math.round(quote.reservedAmount * 100));
  return matching.find(row => row.id === acknowledgedId) ?? null;
}
