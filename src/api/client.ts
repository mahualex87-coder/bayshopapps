import { prepareWriteBody, validationFieldErrors, MutationInputError, type FileResolver, type MutationOutcome, type WriteRequest } from './mutations.ts';
import { isLanguage, translate, type Language, type TranslationParams } from '../i18n/core.ts';

/** The API is called only on the same HTTPS origin as the official cabinet. */
export const API_ORIGIN = 'https://bayshop.com';
export const API_ACCEPT = 'application/vnd.MF+json; version=2';

export class ApiError extends Error {
  readonly status: number;
  readonly key: string;
  readonly params: TranslationParams;
  readonly outcome?: MutationOutcome;
  readonly fieldErrors?: Record<string, string>;
  constructor(status: number, key: string, params: TranslationParams = {}, details: { outcome?: MutationOutcome; fieldErrors?: Record<string, string> } = {}) { super(translate('ro', key, params)); this.name = 'ApiError'; this.status = status; this.key = key; this.params = params; this.outcome = details.outcome; this.fieldErrors = details.fieldErrors; }
}

export type ApiRequestOptions = { timeoutMs?: number; token?: string; login?: { email: string; password: string }; signal?: AbortSignal; language?: Language; write?: WriteRequest; responseMode?: 'data' | 'envelope' };
export type ApiTransport = (path: string, options?: ApiRequestOptions) => Promise<unknown>;

export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'errors.network';
  if (error.name === 'ApiError' || error.name === 'ApiContractError' || error.name === 'MutationInputError' || error.name === 'ApiValidationError' || error.name === 'OperationValidationError') {
    const key = (error as Error & { key?: unknown }).key;
    return typeof key === 'string' ? key : error.name === 'ApiContractError' ? 'errors.contract' : 'errors.loadFailed';
  }
  return 'errors.network';
}

function responseError(status: number, login: boolean) {
  if (status === 401) return new ApiError(status, login ? 'errors.credentials' : 'errors.sessionExpired');
  if (status === 403) return new ApiError(status, 'errors.forbidden');
  if (status === 429) return new ApiError(status, 'errors.rateLimit');
  if (status >= 500) return new ApiError(status, 'errors.serverUnavailable');
  return new ApiError(status, login ? 'errors.loginFailed' : 'errors.loadFailed');
}

export function createApiTransport(fetcher: typeof fetch = fetch, timeoutMs = 20000, platform?: 'ios' | 'android', resolveFile?: FileResolver): ApiTransport {
  return async (path, options = {}) => {
    if (!path.startsWith('/api/') || /[\r\n#\\]/.test(path) || path.includes('://') || !new URL(path, API_ORIGIN).pathname.startsWith('/api/')) throw new ApiError(0, 'errors.invalidRequest');
    if (options.login && (options.write || (path !== '/api/auth' && path !== '/api/auth/'))) throw new ApiError(0, 'errors.invalidLoginRequest');
    if (options.write && (!options.token || path === '/api/auth' || path === '/api/auth/')) throw new ApiError(0, 'errors.invalidRequest', {}, { outcome: 'rejected' });
    const requestPath = path === '/api/auth' ? '/api/auth/' : path;
    const requestedTimeout = options.timeoutMs ?? timeoutMs;
    if (!Number.isFinite(requestedTimeout) || requestedTimeout <= 0 || requestedTimeout > 60_000) throw new ApiError(0, 'errors.invalidRequest');
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, requestedTimeout);
    let dispatched = false;
    try {
      const prepared = options.write ? await prepareWriteBody(options.write, resolveFile) : options.login ? { body: new URLSearchParams(options.login).toString(), contentType: 'application/x-www-form-urlencoded; charset=utf-8' } : undefined;
      if (controller.signal.aborted) throw new ApiError(0, options.signal?.aborted ? 'errors.cancelled' : 'errors.timeout', {}, options.write ? { outcome: 'rejected' } : {});
      dispatched = true;
      const response = await fetcher(`${API_ORIGIN}${requestPath}`, {
        method: options.login ? 'POST' : options.write?.method ?? 'GET',
        // MF v2 uses a custom Bearer header, including authenticated writes.
        headers: { Accept: `${API_ACCEPT}${platform ? `; platform=${platform}` : ''}`, 'Accept-Language': isLanguage(options.language) ? options.language : 'ro', 'Cache-Control': 'no-store, no-cache', Pragma: 'no-cache', ...(prepared?.contentType ? { 'Content-Type': prepared.contentType } : {}), ...(!options.login && options.token ? { Bearer: options.token } : {}) },
        ...(prepared ? { body: prepared.body } : {}),
        signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
      });
      if (response.url && new URL(response.url).origin !== API_ORIGIN) throw new ApiError(0, 'errors.redirected');
      const mediaType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      const isJson = mediaType === 'application/json' || mediaType === 'application/vnd.mf+json';
      if (!response.ok) {
        const failure = responseError(response.status, !!options.login);
        let fields: Record<string, string> | undefined;
        if (options.write && isJson && response.status >= 400 && response.status < 500) {
          try { const body = await response.json(); fields = validationFieldErrors(body?.data ?? body?.errors ?? body?.errorMessages); } catch { /* No response body is exposed. */ }
        }
        throw new ApiError(failure.status, fields && Object.keys(fields).length ? 'errors.validation' : failure.key, {}, { ...(options.write ? { outcome: response.status >= 500 ? 'unknown' : 'rejected' } : {}), fieldErrors: fields });
      }
      if (!isJson) throw responseError(0, !!options.login);
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw responseError(0, !!options.login);
      const envelope = body as Record<string, unknown>;
      const code = typeof envelope.code === 'number' ? envelope.code : typeof envelope.code === 'string' && /^\d{3}$/.test(envelope.code) ? Number(envelope.code) : 200;
      const flag = envelope.error;
      const failed = flag !== undefined && flag !== null && flag !== false && flag !== 0 && flag !== '0';
      // The documented waiting endpoint also reports validation as error:false,
      // code:200, message:Error. It must never become a successful save.
      const messageError = options.write && typeof envelope.message === 'string' && /^error$/i.test(envelope.message.trim());
      if (failed || code >= 400 || messageError) {
        const fields = options.write ? validationFieldErrors(envelope.data ?? envelope.errors ?? envelope.errorMessages) : undefined;
        const failure = responseError(code >= 400 ? code : 0, !!options.login);
        throw new ApiError(failure.status, fields && Object.keys(fields).length ? 'errors.validation' : options.write && code < 400 ? 'errors.mutationRejected' : failure.key, {}, { ...(options.write ? { outcome: code >= 500 ? 'unknown' : 'rejected' } : {}), fieldErrors: fields });
      }
      if (options.responseMode === 'envelope') return envelope;
      if (!Object.prototype.hasOwnProperty.call(envelope, 'data')) throw responseError(0, !!options.login);
      return envelope.data;
    } catch (error) {
      if (error instanceof MutationInputError) throw new ApiError(0, error.key, {}, { outcome: 'rejected', fieldErrors: error.fieldErrors });
      if (error instanceof ApiError) {
        if (options.write && !error.outcome) throw new ApiError(error.status, error.key, error.params, { outcome: dispatched ? 'unknown' : 'rejected', fieldErrors: error.fieldErrors });
        throw error;
      }
      const outcome = options.write ? { outcome: dispatched ? 'unknown' as const : 'rejected' as const } : {};
      if (controller.signal.aborted) throw new ApiError(0, options.signal?.aborted ? 'errors.cancelled' : 'errors.timeout', {}, outcome);
      // No raw server bodies, credentials, headers or request URLs enter errors.
      throw new ApiError(0, 'errors.network', {}, outcome);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  };
}
