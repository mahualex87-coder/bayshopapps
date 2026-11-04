import type { ResourceKey } from './service.ts';

export type FormScalar = string | number | boolean | null | undefined;
export type PickedFile = { uri: string; name: string; mimeType?: string; size?: number };
export type FilePart = { field: string; file: PickedFile };
export type WriteRequest = {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  encoding: 'form' | 'json' | 'multipart';
  fields: Record<string, FormScalar | readonly FormScalar[]>;
  files?: FilePart[];
};
export type ReadPlan<T = unknown> = { path: string; timeoutMs?: number; responseMode?: 'data' | 'envelope'; normalize(raw: unknown): T };
export type MutationPlan = WriteRequest & {
  path: string;
  responseMode?: 'data' | 'envelope';
  invalidate: ResourceKey[];
  normalize?: (raw: unknown) => unknown;
};
export type MutationOutcome = 'rejected' | 'unknown';
export type MutationResult = { ok: boolean; error?: string; fieldErrors?: Record<string, string>; outcome?: MutationOutcome; data?: unknown; paymentPreparation?: { paymentId: string | null; reason: string } };
export type MutationState = { pending: boolean; operation: string | null; error: string | null; outcome: MutationOutcome | null };
export const emptyMutation = (): MutationState => ({ pending: false, operation: null, error: null, outcome: null });
export type FileResolver = (file: PickedFile) => Blob | Promise<Blob>;

/** Local validation is distinct from a dispatched write with an unknown outcome. */
export class MutationInputError extends Error {
  readonly key: string;
  readonly fieldErrors: Record<string, string>;
  constructor(key = 'errors.invalidRequest', fieldErrors: Record<string, string> = {}) { super(key); this.name = 'MutationInputError'; this.key = key; this.fieldErrors = fieldErrors; }
}

function fieldName(name: string) {
  if (!name || name.length > 120 || !/^[a-zA-Z0-9_.\[\]-]+$/.test(name) || name === '__proto__' || name === 'constructor' || name === 'prototype') throw new MutationInputError();
  return name;
}

/** Files come only from the explicit system picker. A remote URL is never fetched
 * or uploaded through this boundary, and filenames cannot add multipart headers. */
export function validatePickedFile(file: PickedFile) {
  if (!file || !/^(file|content):\/\//.test(file.uri) || !file.name || /[\x00-\x1f\x7f/\\]/.test(file.name) || file.name.length > 255) throw new MutationInputError('errors.fileInvalid');
  if (file.mimeType && !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(file.mimeType)) throw new MutationInputError('errors.fileInvalid');
  if (file.size !== undefined && (!Number.isSafeInteger(file.size) || file.size <= 0)) throw new MutationInputError('errors.fileEmpty');
}

export async function prepareWriteBody(request: WriteRequest, resolveFile?: FileResolver): Promise<{ body: string | FormData; contentType?: string }> {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) || !['form', 'json', 'multipart'].includes(request.encoding)) throw new MutationInputError();
  if (!request.fields || typeof request.fields !== 'object' || Array.isArray(request.fields)) throw new MutationInputError();
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(request.fields)) {
    fieldName(key);
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === null || item === undefined) continue;
      if (!['string', 'number', 'boolean'].includes(typeof item) || (typeof item === 'number' && !Number.isFinite(item))) throw new MutationInputError();
      entries.push([key, typeof item === 'boolean' ? item ? '1' : '0' : String(item)]);
    }
  }
  if (request.files?.length && request.encoding !== 'multipart') throw new MutationInputError('errors.fileInvalid');
  if (request.encoding === 'json') return { body: JSON.stringify(request.fields), contentType: 'application/json; charset=utf-8' };
  if (request.encoding === 'form') {
    const form = new URLSearchParams();
    for (const [key, value] of entries) form.append(key, value);
    return { body: form.toString(), contentType: 'application/x-www-form-urlencoded; charset=utf-8' };
  }
  const form = new FormData();
  for (const [key, value] of entries) form.append(key, value);
  for (const part of request.files ?? []) {
    fieldName(part.field); validatePickedFile(part.file);
    if (!resolveFile) throw new MutationInputError('errors.fileUnavailable');
    let blob: Blob;
    try { blob = await resolveFile(part.file); }
    catch { throw new MutationInputError('errors.fileUnavailable'); }
    if (!Number.isFinite(blob.size) || blob.size <= 0) throw new MutationInputError('errors.fileEmpty');
    form.append(part.field, blob, part.file.name);
  }
  // fetch owns the multipart boundary; setting Content-Type here would corrupt it.
  return { body: form };
}

/** Keep field paths and known machine codes, never server text that can echo
 * passwords, access tokens or entered values. Unknown messages get a safe label. */
export function validationFieldErrors(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  const known: Record<string, string> = { trackingNumberExists: 'errors.trackingExists', isEmpty: 'errors.fieldRequired', required: 'errors.fieldRequired', notEmpty: 'errors.fieldRequired', invalid: 'errors.invalidField' };
  const walk = (node: unknown, path: string[], depth: number) => {
    if (depth > 7 || Object.keys(result).length >= 40 || !node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node).slice(0, 50)) {
      if (!/^[a-zA-Z0-9_.\[\]-]{1,80}$/.test(key) || /password|token|secret|authorization/i.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      const next = [...path, key];
      if (child && typeof child === 'object') { walk(child, next, depth + 1); continue; }
      // The leaf key is the validation code, its parent identifies the input.
      const parts = path.length ? path : [key];
      const normalized = parts.join('.').replace(/\[(\d+)\]/g, '.$1').replace(/^(declarations|declarationItems)(\.|$)/, 'items$2').replace(/^trackingNumber$/, 'tracking');
      if (normalized && !/^(code|error|message|success)$/.test(normalized)) result[normalized] = known[key] ?? 'errors.invalidField';
    }
  };
  walk(value, [], 0);
  return result;
}
