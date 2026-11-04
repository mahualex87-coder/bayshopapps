import { API_ORIGIN } from '@/api/client';

/** API documents may use a path relative to BayShop. Never attach account headers to media links. */
export function remoteFileUrl(value: string): string | null {
  if (/[\u0000-\u001f\\]/.test(value) || value.startsWith('//')) return null;
  try {
    const url = value.startsWith('/') ? new URL(value, API_ORIGIN) : new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}
