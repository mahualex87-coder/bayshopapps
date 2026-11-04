/** Optional carrier artwork must not invalidate a price or a delivery option.
 * Only public HTTPS images are used; credentials are never attached to them. */
export function normalizeCarrierLogo(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const value = raw.trim();
    const url = new URL(value.startsWith('/') && !value.startsWith('//') ? `https://bayshop.com${value}` : value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
