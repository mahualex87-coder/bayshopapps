export const publicContentPages = {
  terms: 'https://bayshop.com/page/terms-of-use.html',
  contacts: 'https://bayshop.com/page/contact-us.html',
} as const;
export type ContentReaderKind = 'bayshop-info' | 'public-page';

/** Only public reading pages; never an authenticated account or arbitrary URL. */
export function publicContentUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'bayshop.com' || url.port || url.username || url.password || url.search) return null;
    if (!/^\/(?:[a-z]{2}\/){0,2}page\/(?:terms-of-use|contact-us|privacy-policy)\.html$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function publicContentNavigationAllowed(url: string): boolean {
  return url === 'about:blank' || publicContentUrl(url) !== null;
}

/** Public carrier/product reader. Account entry points are never a substitute for native features. */
export function publicPageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value !== value.trim() || /[\u0000-\u001f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.')) return null;
    const path = decodeURIComponent(url.pathname).toLowerCase();
    if (/(?:^|\/)(?:login|log-in|signin|sign-in|sign_in|signon|sign-on|register|registration|auth|oauth|session|account|accounts|my-account|member|members|cabinet|api)(?:\/|$|[.;_-])/.test(path)) return null;
    if ((url.hostname === 'bayshop.com' || url.hostname.endsWith('.bayshop.com')) && /(?:^|\/)(?:package|parcels|order|payments?|balance|admin|system)(?:\/|$)/.test(path)) return null;
    return url.href;
  } catch { return null; }
}

export function readerUrl(value: unknown, kind: ContentReaderKind, initialUrl: string): string | null {
  if (kind === 'bayshop-info') return publicContentUrl(value);
  const initial = publicPageUrl(initialUrl); const target = publicPageUrl(value);
  return initial && target && new URL(initial).hostname === new URL(target).hostname ? target : null;
}
export function readerNavigationAllowed(value: string, kind: ContentReaderKind, initialUrl: string): boolean {
  return value === 'about:blank' || readerUrl(value, kind, initialUrl) !== null;
}

const MAX_HTML_LENGTH = 2_000_000;
type PublicFetch = (url: string, options: RequestInit) => Promise<Response>;
/** Public web fallback deliberately has no session/token/cookie dependency. */
export async function readPublicContent(fetcher: PublicFetch, requestedUrl: string, signal: AbortSignal, kind: ContentReaderKind = 'bayshop-info'): Promise<string> {
  const url = readerUrl(requestedUrl, kind, requestedUrl);
  if (!url || signal.aborted) throw new Error('contentReader.loadError');
  const response = await fetcher(url, { method: 'GET', credentials: 'omit', mode: 'cors', cache: 'no-store', referrerPolicy: 'no-referrer', signal });
  if (!response.ok || !readerUrl(response.url, kind, requestedUrl) || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('contentReader.loadError');
  const length = response.headers.get('content-length');
  if (length && Number(length) > MAX_HTML_LENGTH) throw new Error('contentReader.loadError');
  const html = await response.text();
  if (!html.trim() || html.length > MAX_HTML_LENGTH || signal.aborted) throw new Error('contentReader.loadError');
  return html;
}
