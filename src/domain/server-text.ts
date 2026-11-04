import { decodeHTMLStrict } from 'entities';
import { Parser } from 'htmlparser2';

const hiddenTags = new Set(['script', 'style', 'noscript', 'template', 'head', 'iframe', 'object', 'embed', 'svg', 'canvas']);
const paragraphs = new Set(['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figure', 'figcaption', 'address', 'pre', 'dl', 'dt', 'dd']);
const normalizeSpacing = (text: string) => text.replace(/\r\n?/g, '\n').replace(/[\u00a0\u202f\t\f\v ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\u00ad/g, '').trim();

/** Streaming extraction; attributes, comments and active content never reach the UI. */
function extractText(html: string, decode: boolean): string {
  const parts: string[] = [];
  const suppressed: boolean[] = [];
  const lists: { ordered: boolean; next: number }[] = [];
  let suppressionDepth = 0;
  let tail = '';
  const append = (text: string) => { if (text) { parts.push(text); tail = (tail + text).slice(-128); } };
  const separator = (lines: number) => {
    if (!parts.length || /(?:^|\n)[ \t]*(?:•|\d+\.)[ \t]*$/.test(tail)) return;
    const existing = /\n*$/.exec(tail)?.[0].length || 0;
    if (existing < lines) append('\n'.repeat(lines - existing));
  };
  const parser = new Parser({
    onopentag(name, attributes) {
      const hidden = suppressionDepth > 0 || hiddenTags.has(name) || 'hidden' in attributes || attributes['aria-hidden'] === 'true' || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(attributes.style || '');
      suppressed.push(hidden);
      if (hidden) { suppressionDepth += 1; return; }
      if (name === 'ul' || name === 'ol') {
        separator(2);
        const start = Number(attributes.start);
        lists.push({ ordered: name === 'ol', next: Number.isSafeInteger(start) && start > 0 ? start : 1 });
      } else if (name === 'li') {
        separator(1);
        const list = lists[lists.length - 1];
        const value = Number(attributes.value);
        if (list?.ordered && Number.isSafeInteger(value) && value > 0) list.next = value;
        append(list?.ordered ? `${list.next++}. ` : '• ');
      } else if (name === 'br') append('\n');
      else if (name === 'hr') separator(2);
      else if (name === 'tr') separator(1);
      else if (paragraphs.has(name)) separator(lists.length ? 1 : 2);
    },
    ontext(text) { if (!suppressionDepth) append(decode ? decodeHTMLStrict(text) : text); },
    onclosetag(name) {
      if (suppressed.pop()) { suppressionDepth -= 1; return; }
      if (name === 'ul' || name === 'ol') { lists.pop(); separator(2); }
      else if (name === 'li' || name === 'tr') separator(1);
      else if (name === 'td' || name === 'th') append(' · ');
      else if (paragraphs.has(name)) separator(lists.length ? 1 : 2);
    },
  }, { decodeEntities: false, xmlMode: false });
  parser.end(html);
  return normalizeSpacing(parts.join('').replace(/ · (?=\n|$)/g, ''));
}

/** Public documents may deliberately quote escaped markup. Decode those once,
 * retaining the quoted text, which is only rendered inside native Text. */
export function literalHtmlText(html: string): string { return extractText(html, true); }

/** Display-only conversion for server HTML, including multiply escaped news.
 * Never use this on IDs, URLs, money fields or editable user input. Native Text
 * receives plain characters; the result must never be mounted as HTML. */
export function serverText(value: unknown): string {
  let text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  for (let pass = 0; pass < 4; pass += 1) {
    const next = extractText(text, true);
    if (next === text) return next;
    text = next;
  }
  // Strip tags exposed by the final decode without unbounded re-decoding.
  return extractText(text, false);
}
