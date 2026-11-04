import type { LiveParcel } from '../api/contracts.ts';
import type { StockDetail } from '../api/operations-normalize.ts';
export type StockServiceKind = 'photos' | 'verification' | 'declaration' | 'label' | 'division';
export type StockServiceState = 'available' | 'pending' | 'completed' | 'registered' | 'needsDeclaration' | 'alreadyDeclared' | 'unavailable';
/** Server cancellation handlers act only on waiting requests. A legacy boolean
 * indicating registered/done is not enough to offer cancellation. */
export function canCancelStockService(detail: StockDetail, kind: StockServiceKind): boolean {
  return stockServiceState(detail, kind) === 'pending';
}

export function stockServiceCancellationConfirmed(detail: StockDetail, kind: StockServiceKind): boolean {
  if (kind === 'photos') return detail.photosInProgress === 0 && detail.additionalPhotosRequested === false;
  if (kind === 'division') return detail.divideRequestStatus === null || detail.divideRequestStatus === 'canceled';
  return (kind === 'verification' ? detail.verificationRequestStatus : kind === 'declaration' ? detail.declarationRequestStatus : detail.labelRequestStatus) === 'canceled';
}
/** MF fields have different semantics: verification's boolean includes done. */
export function stockServiceState(detail: StockDetail, kind: StockServiceKind): StockServiceState {
  if (kind === 'photos') {
    if (detail.photosInProgress === 2) return 'completed';
    if (detail.photosInProgress === 1 || detail.additionalPhotosRequested === true) return 'pending';
    return detail.photosInProgress === 0 && detail.additionalPhotosRequested === false ? 'available' : 'unavailable';
  }
  if (kind === 'division') {
    if (detail.divideRequestStatus === 'waiting') return 'pending';
    if (detail.divideRequestStatus === 'done') return 'completed';
    return detail.allowedDivideRequest === true && (detail.divideRequestStatus == null || detail.divideRequestStatus === 'canceled') ? 'available' : 'unavailable';
  }
  if (kind === 'verification') {
    if (detail.verificationRequestStatus === 'done') return 'completed';
    if (detail.verificationRequestStatus === 'waiting') return 'pending';
    if (detail.verificationRequestStatus && detail.verificationRequestStatus !== 'canceled') return 'unavailable';
    if (detail.checkProductInProgress === true) return 'registered';
    if (detail.checkProductInProgress !== false) return 'unavailable';
    if (detail.declarationItemCount != null) return detail.declarationItemCount > 0 ? 'available' : 'needsDeclaration';
    return detail.declared == null ? 'unavailable' : detail.declared ? 'available' : 'needsDeclaration';
  }
  if (kind === 'declaration') {
    if (detail.declarationRequestStatus === 'waiting') return 'pending';
    if (detail.declarationRequestStatus === 'done') return 'completed';
    if (detail.declared === true || (detail.declarationItemCount ?? 0) > 0) return 'alreadyDeclared';
    if (detail.declarationSupported === false) return 'unavailable';
    return detail.declared === false && (detail.declarationRequestStatus == null || detail.declarationRequestStatus === 'canceled') ? 'available' : 'unavailable';
  }
  if (detail.labelRequestStatus === 'waiting') return 'pending';
  return detail.labelRequestStatus == null || ['done', 'canceled'].includes(detail.labelRequestStatus) ? 'available' : 'unavailable';
}

/** Every request state comes from uncached, ID-filtered stock rows. Missing
 * columns do not grant permission based on the hour-cached detail response. */
export function currentStockServiceDetail(detail: StockDetail, current?: LiveParcel): StockDetail {
  const states = current?.serviceStates || {};
  const has = (key: keyof typeof states) => Object.prototype.hasOwnProperty.call(states, key);
  const photos = has('photos') ? states.photos : 'unknown';
  const verification = has('verification') ? states.verification : 'unknown';
  return { ...detail,
    // mf-list's SQL EXISTS is fresh and independent of the legacy title check.
    declared: current?.declared ?? null, declarationItemCount: null,
    photosInProgress: photos === 'done' ? 2 : photos === 'waiting' ? 1 : photos == null || photos === 'canceled' ? 0 : null,
    additionalPhotosRequested: photos === 'waiting' ? true : photos === 'done' || photos == null || photos === 'canceled' ? false : null,
    verificationRequestStatus: verification,
    checkProductInProgress: verification === 'waiting' || verification === 'done' ? true : verification == null || verification === 'canceled' ? false : null,
    declarationRequestStatus: has('declaration') ? states.declaration ?? null : 'unknown',
    divideRequestStatus: has('division') ? states.division ?? null : 'unknown',
    labelRequestStatus: has('label') ? states.label ?? null : 'unknown',
  };
}
