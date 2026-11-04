import { ApiContractError } from './normalize.ts';
import { MutationInputError, validatePickedFile, type MutationPlan, type PickedFile } from './mutations.ts';

export type ParcelReview = { id: string; received: boolean; rating: number | null; comment: string | null; photo: { url: string; thumbnail: string | null } | null };
export type ReviewBaseline = Pick<ParcelReview, 'rating' | 'comment'> & { photoUrl: string | null };
export type ParcelReviewInput = { rating: number; comment: string; photo?: PickedFile; expected: ReviewBaseline };
export const reviewPhotoMaxBytes = 26214400;
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiContractError('recenzia coletului'); return value as Record<string, unknown>; }
function parcelId(value: unknown): string { const id = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value; if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new MutationInputError('errors.invalidRequest'); return id; }
function photoUrl(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || /[\x00-\x20\\]/.test(value)) throw new ApiContractError('fotografia recenziei');
  const source = /^\/(?!\/)/.test(value) ? `https://bayshop.com${value}` : value;
  let parsed: URL; try { parsed = new URL(source); } catch { throw new ApiContractError('fotografia recenziei'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new ApiContractError('fotografia recenziei');
  return source;
}
/** MFv2 ParcelsController exposes these three fields on the owned detail read.
 * Missing metadata is not interpreted as an empty review. */
export function normalizeParcelReview(raw: unknown): ParcelReview {
  const row = object(raw);
  if (!['service_rating', 'service_comment', 'service_photo'].every(key => Object.prototype.hasOwnProperty.call(row, key))) throw new ApiContractError('recenzia coletului');
  let rating: number | null = null;
  if (row.service_rating != null && row.service_rating !== '' && row.service_rating !== 0 && row.service_rating !== '0') {
    if (typeof row.service_rating !== 'number' && (typeof row.service_rating !== 'string' || !/^[1-5]$/.test(row.service_rating))) throw new ApiContractError('evaluarea coletului');
    rating = Number(row.service_rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ApiContractError('evaluarea coletului');
  }
  if (row.service_comment != null && typeof row.service_comment !== 'string') throw new ApiContractError('comentariul coletului');
  let photo: ParcelReview['photo'] = null;
  if (row.service_photo != null && row.service_photo !== false && row.service_photo !== '') {
    const image = object(row.service_photo); const url = photoUrl(image.original);
    if (!url) throw new ApiContractError('fotografia recenziei');
    photo = { url, thumbnail: photoUrl(image.thumbnail) };
  }
  return { id: parcelId(row.id), received: row.status === 'received', rating, comment: row.service_comment ? String(row.service_comment) : null, photo };
}
export function reviewBaseline(review: ParcelReview): ReviewBaseline { return { rating: review.rating, comment: review.comment, photoUrl: review.photo?.url || null }; }
export function reviewInputFields(input: ParcelReviewInput): { rating: string; comment?: string } {
  if (!input || Object.keys(input).some(key => !['rating', 'comment', 'photo', 'expected'].includes(key))) throw new MutationInputError('errors.validation');
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new MutationInputError('errors.validation', { rating: 'review.chooseRating' });
  if (typeof input.comment !== 'string' || /[\x00]/.test(input.comment)) throw new MutationInputError('errors.validation', { comment: 'errors.invalidField' });
  if (!input.expected || Object.keys(input.expected).some(key => !['rating', 'comment', 'photoUrl'].includes(key)) || input.expected.rating !== null && (!Number.isInteger(input.expected.rating) || input.expected.rating < 1 || input.expected.rating > 5) || input.expected.comment !== null && typeof input.expected.comment !== 'string' || input.expected.photoUrl !== null && typeof input.expected.photoUrl !== 'string') throw new MutationInputError('errors.invalidRequest');
  const comment = input.comment.trim();
  if (comment === '0') throw new MutationInputError('errors.validation', { comment: 'errors.invalidField' });
  // Legacy POST ignores an empty comment; do not pretend it deletes an old one.
  if (!comment && input.expected.comment) throw new MutationInputError('review.commentCannotClear', { comment: 'review.commentCannotClear' });
  if (input.photo) {
    validatePickedFile(input.photo);
    if (!['image/jpeg', 'image/png'].includes(input.photo.mimeType || '') || input.photo.size === undefined || input.photo.size > reviewPhotoMaxBytes) throw new MutationInputError('errors.fileInvalid');
    if (input.expected.photoUrl) throw new MutationInputError('review.photoAlreadySaved');
  }
  return { rating: String(input.rating), ...(comment ? { comment } : {}) };
}
export function validateReviewAgainstCurrent(id: string, input: ParcelReviewInput, current: ParcelReview): void {
  reviewInputFields(input);
  if (current.id !== id || !current.received) throw new MutationInputError('review.receivedOnly');
  const expected = input.expected; const actual = reviewBaseline(current);
  if (expected.rating !== actual.rating || expected.comment !== actual.comment || expected.photoUrl !== actual.photoUrl) throw new MutationInputError('review.changed');
}
export function reviewWriteConfirmed(id: string, input: ParcelReviewInput, current: ParcelReview): boolean {
  return current.id === id && current.received && current.rating === input.rating && (current.comment || '') === input.comment.trim() && (!input.photo || !!current.photo);
}
export function planParcelReviewSave(id: string, input: ParcelReviewInput): MutationPlan {
  const fields = reviewInputFields(input);
  return { path: `/api/parcels/view/${parcelId(id)}`, method: 'POST', encoding: input.photo ? 'multipart' : 'form', fields, files: input.photo ? [{ field: 'service_photo', file: input.photo }] : [], responseMode: 'envelope', invalidate: [], normalize: raw => {
    const row = object(raw);
    if (![false, 0, '0'].includes(row.error as never) || row.code !== undefined && Number(row.code) !== 200 || row.message !== 'Ok') throw new ApiContractError('salvarea recenziei');
    return { saved: true };
  } };
}
