import type { IntercomIdentity } from '../../api/intercom-identity.ts';

export type SupportError = 'not_configured' | 'session_changed' | 'identity_unavailable' | 'failed' | 'cleanup_failed' | 'busy';
export type SupportOpenResult = { ok: true } | { ok: false; error: SupportError };
export type SupportOpenOptions = { expectedUserId: string; isCurrent: () => boolean; theme: 'light' | 'dark' | 'system'; signal?: AbortSignal };
export type SupportConfig = { appId: string; apiKey: string; region: 'US' | 'EU' | 'AU' };
export type SupportBridge = {
  initialize: (apiKey: string, appId: string) => Promise<boolean>;
  logout: () => Promise<boolean>;
  hideIntercom: () => Promise<boolean>;
  removeUserJwtProvider: () => Promise<boolean>;
  setUserJwt: (jwt: string) => Promise<boolean>;
  loginUserWithUserAttributes: (attributes: { userId: string }) => Promise<boolean>;
  setThemeMode: (mode: 'LIGHT' | 'DARK' | 'SYSTEM') => Promise<boolean>;
  setLogLevel: (level: 'DISABLED') => Promise<boolean>;
  setLauncherVisibility: (visibility: 'GONE') => Promise<boolean>;
  setInAppMessageVisibility: (visibility: 'GONE') => Promise<boolean>;
  suppressProactiveContent: (types: ('CAROUSEL' | 'SURVEY')[]) => Promise<boolean>;
  present: () => Promise<boolean>;
};

/** The server signature is verified by Intercom. Locally, reject a mismatched
 * UID or extra data before passing the token to that separate service. */
export function supportIdentityAllowed(identity: IntercomIdentity, expectedUserId: string, now: number): boolean {
  try {
    if (!expectedUserId || identity.userId !== expectedUserId || !Number.isFinite(identity.expiresInSeconds) || identity.expiresInSeconds <= 0 || identity.jwt.length > 16384) return false;
    const parts = identity.jwt.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return false;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let bits = 0; let buffer = 0; let encoded = '';
    for (const character of parts[1]) {
      buffer = (buffer << 6) | alphabet.indexOf(character); bits += 6;
      if (bits >= 8) { bits -= 8; encoded += `%${((buffer >> bits) & 255).toString(16).padStart(2, '0')}`; }
    }
    const claims: unknown = JSON.parse(decodeURIComponent(encoded));
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return false;
    const row = claims as Record<string, unknown>;
    if (Object.keys(row).some(key => !['user_id', 'email', 'name', 'exp', 'iat', 'nbf'].includes(key))) return false;
    if (row.user_id !== expectedUserId || typeof row.exp !== 'number' || !Number.isSafeInteger(row.exp) || row.exp * 1000 <= now + 30000) return false;
    if (row.iat !== undefined && (typeof row.iat !== 'number' || row.iat * 1000 > now + 60000)) return false;
    if (row.nbf !== undefined && (typeof row.nbf !== 'number' || row.nbf * 1000 > now + 60000)) return false;
    for (const key of ['email', 'name']) if (row[key] !== undefined && (typeof row[key] !== 'string' || (row[key] as string).length > 512)) return false;
    return true;
  } catch { return false; }
}

/** No anonymous login, background startup, event tracking, bulk imports or
 * profile update. A deliberate open sends only the existing signed identity. */
export function createSupportSessionController(bridge: SupportBridge, getConfig: () => SupportConfig | null, now = Date.now) {
  let initialized = false; let generation = 0; let opening = false; let cleanupFailed = false;
  let chain: Promise<unknown> = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>): Promise<T> { const next = chain.then(work, work); chain = next.catch(() => {}); return next; }
  async function cleanup(): Promise<boolean> {
    if (!initialized) return true;
    let success = true;
    for (const action of [() => bridge.hideIntercom(), () => bridge.removeUserJwtProvider(), () => bridge.logout()]) {
      try { if (!await action()) success = false; } catch { success = false; }
    }
    cleanupFailed = !success;
    return success;
  }
  function clear(): Promise<boolean> { generation++; return enqueue(cleanup); }
  async function open(identity: IntercomIdentity, options: SupportOpenOptions): Promise<SupportOpenResult> {
    if (opening) return { ok: false, error: 'busy' };
    const config = getConfig();
    if (!config) return { ok: false, error: 'not_configured' };
    if (!options.isCurrent() || options.signal?.aborted) return { ok: false, error: 'session_changed' };
    if (!supportIdentityAllowed(identity, options.expectedUserId, now())) return { ok: false, error: 'identity_unavailable' };
    opening = true; const revision = ++generation;
    return enqueue(async () => {
      const current = () => generation === revision && !options.signal?.aborted && options.isCurrent();
      const step = async (action: () => Promise<boolean>) => { if (!current()) throw new Error('stale'); if (!await action()) throw new Error('operation'); if (!current()) throw new Error('stale'); };
      try {
        if (!current()) return { ok: false, error: 'session_changed' };
        if (cleanupFailed && !await cleanup()) return { ok: false, error: 'cleanup_failed' };
        if (!initialized) {
          await step(() => bridge.setLogLevel('DISABLED'));
          // Mark initialized as soon as the native operation succeeds, even if
          // logout/account change invalidated it while the promise was pending.
          const didInitialize = await bridge.initialize(config.apiKey, config.appId);
          initialized = didInitialize;
          if (!didInitialize) throw new Error('initialize');
          if (!current()) throw new Error('stale');
        }
        if (!await cleanup()) return { ok: false, error: 'cleanup_failed' };
        await step(() => bridge.setLauncherVisibility('GONE'));
        await step(() => bridge.setInAppMessageVisibility('GONE'));
        await step(() => bridge.suppressProactiveContent(['CAROUSEL', 'SURVEY']));
        await step(() => bridge.setThemeMode(options.theme === 'dark' ? 'DARK' : options.theme === 'light' ? 'LIGHT' : 'SYSTEM'));
        await step(() => bridge.setUserJwt(identity.jwt));
        await step(() => bridge.loginUserWithUserAttributes({ userId: identity.userId }));
        await step(() => bridge.present());
        return { ok: true };
      } catch {
        const stale = !current();
        const cleared = await cleanup();
        return { ok: false, error: !cleared ? 'cleanup_failed' : stale ? 'session_changed' : 'failed' };
      } finally { opening = false; }
    });
  }
  return { open, clear };
}
