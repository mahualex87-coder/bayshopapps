import { decodeHTMLStrict } from 'entities';
import { Parser } from 'htmlparser2';
import { serverText } from './server-text.ts';

export type NewsImage = { url: string; alt: string | null };
const hiddenTags = new Set(['script', 'style', 'noscript', 'template', 'head', 'iframe', 'object', 'embed', 'svg', 'canvas']);
function decode(value: string): string {
  for (let pass = 0; pass < 4; pass += 1) { const next = decodeHTMLStrict(value); if (next === value) break; value = next; }
  return value;
}
function privateHost(host: string): boolean {
  if (host === 'localhost' || host === 'localhost.localdomain' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host.startsWith('[')) return /^\[(?:::|0*:|f[cd]|fe[89ab])/i.test(host);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return !host.includes('.');
  const [a, b] = host.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127;
}

/** Public news media are loaded without account credentials or request headers. */
export function newsImageUrl(value: unknown, origin: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const decoded = decode(value);
  if (/[\u0000-\u001f\u007f\\]/.test(value) || /[\u0000-\u001f\u007f\\]/.test(decoded)) return null;
  try {
    const base = new URL(origin);
    // Matches App_Tools::resolveHostPlaceholder used by the web news page.
    const candidate = decoded.trim().replace(/%%%host%%%\/(?!\/)/g, `${base.origin}/`).replace(/%%%host%%%/g, '');
    if (!candidate) return null;
    const url = new URL(candidate, `${base.origin}/`);
    if (url.protocol === 'http:' && url.hostname === base.hostname) url.protocol = 'https:';
    if (url.protocol !== 'https:' || url.username || url.password || privateHost(url.hostname)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

/** API GET exposes news.img and TinyMCE body. Keep media separate from the
 * readable body so HTML never enters a WebView or replaces the native text. */
export function newsImages(row: { img?: unknown; body?: unknown; title?: unknown }, origin: string): NewsImage[] {
  const images: NewsImage[] = [];
  const seen = new Set<string>();
  const add = (value: unknown, alt: unknown) => {
    const url = newsImageUrl(value, origin);
    if (url && !seen.has(url)) { seen.add(url); images.push({ url, alt: serverText(alt) || null }); }
  };
  add(row.img, row.title);
  const scan = (html: string, pass: number) => {
    const suppressed: boolean[] = [];
    let depth = 0;
    const parser = new Parser({
      onopentag(name, attributes) {
        const hidden = depth > 0 || hiddenTags.has(name) || 'hidden' in attributes || decode(attributes['aria-hidden'] || '').trim().toLowerCase() === 'true' || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(decode(attributes.style || ''));
        suppressed.push(hidden);
        if (hidden) { depth += 1; return; }
        if (name === 'img' && !(Number(attributes.width) <= 1 && Number(attributes.height) <= 1)) {
          add(attributes['data-src'] || attributes.src, attributes.alt);
        }
      },
      ontext(text) {
        if (depth || pass >= 4) return;
        const next = decodeHTMLStrict(text);
        // Decode escaped markup in place, preserving its order relative to
        // ordinary img elements instead of collecting entire-document passes.
        if (next !== text) scan(next, pass + 1);
      },
      onclosetag() { if (suppressed.pop()) depth -= 1; },
    }, { decodeEntities: false });
    parser.end(html);
  };
  scan(typeof row.body === 'string' ? row.body : '', 0);
  return images;
}
