import { DomUtils, parseDocument } from 'htmlparser2';
import { literalHtmlText } from '../../domain/server-text.ts';

export type ContactSection = { title: string | null; paragraphs: string[] };
export type ServerContacts = { title: string; sections: ContactSection[]; countryCode: string; language: string };
type Node = ReturnType<typeof parseDocument>['children'][number];
const MAX_HTML = 2_000_000;
const hiddenTags = new Set(['script', 'style', 'noscript', 'template', 'head', 'iframe', 'object', 'embed', 'svg', 'canvas', 'nav', 'header', 'footer', 'aside', 'form', 'input', 'button', 'select', 'textarea']);
function element(node: Node): node is Extract<Node, { attribs: Record<string, string> }> { return node.type === 'tag'; }
const hasClass = (node: Node, name: string) => element(node) && node.attribs.class?.split(/\s+/).includes(name);
const hidden = (node: Node) => node.type === 'script' || node.type === 'style' || element(node) && (hiddenTags.has(node.name) || 'hidden' in node.attribs || node.attribs['aria-hidden'] === 'true' || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(node.attribs.style || ''));
function find(nodes: Node[], predicate: (node: Node) => boolean): Node | undefined {
  for (const node of nodes) { if (hidden(node)) continue; if (predicate(node)) return node; if ('children' in node) { const found = find(node.children, predicate); if (found) return found; } } return undefined;
}
function visibleHtml(node: Node): string {
  if (hidden(node)) return '';
  if (element(node)) return ['br', 'hr', 'img', 'wbr'].includes(node.name) ? `<${node.name}>` : `<${node.name}>${node.children.map(visibleHtml).join('')}</${node.name}>`;
  return node.type === 'text' ? DomUtils.getOuterHTML(node) : '';
}
const text = (node: Node) => literalHtmlText(visibleHtml(node));
/** Exact CMS column from page/item.phtml. No body-wide fallback: chrome,
 * forms, cookie banners or a missing-page response must never become contacts. */
export function parseServerContacts(html: string, countryCode: string, language: string): ServerContacts {
  if (!/^[A-Z]{2}$/.test(countryCode) || !/^(ro|ru|en)$/.test(language) || html.length > MAX_HTML) throw new Error('contacts.unavailable');
  const document = parseDocument(html);
  const root = find(document.children, node => element(node) && node.name === 'html');
  if (!root || !element(root) || root.attribs.lang?.toLowerCase() !== `${language}-${countryCode.toLowerCase()}`) throw new Error('contacts.contextUnavailable');
  const row = find(document.children, node => hasClass(node, 'row') && hasClass(node, 'with-custom-border'));
  const column = row && 'children' in row ? row.children.find(node => !hidden(node) && hasClass(node, 'col-lg-9')) : undefined;
  const box = column && 'children' in column ? column.children.find(node => !hidden(node) && hasClass(node, 'help-box')) : undefined;
  const heading = box && 'children' in box ? find(box.children, node => element(node) && node.name === 'h1') : undefined;
  if (!column || !('children' in column) || !heading || !text(heading)) throw new Error('contacts.unavailable');
  const sections: ContactSection[] = [];
  const visit = (node: Node) => {
    if (node === box || hidden(node)) return;
    if (element(node) && ['div', 'section', 'article'].includes(node.name)) { node.children.forEach(visit); return; }
    const value = text(node); if (!value) return;
    const boldOnly = element(node) && node.name === 'p' && node.children.filter(child => text(child)).every(child => element(child) && ['strong', 'b'].includes(child.name));
    const isHeading = element(node) && (/^h[1-6]$/.test(node.name) || boldOnly);
    if (isHeading) sections.push({ title: value, paragraphs: [] });
    else { if (!sections.length) sections.push({ title: null, paragraphs: [] }); sections[sections.length - 1].paragraphs.push(value); }
  };
  column.children.forEach(visit);
  if (!sections.some(section => section.paragraphs.length)) throw new Error('contacts.unavailable');
  return { title: text(heading), sections, countryCode, language };
}
function contactUrl(value: string): string | null {
  try { const url = new URL(value); return url.origin === 'https://bayshop.com' && !url.username && !url.password && !url.search && !url.hash && /^\/(?:[a-z]{2}(?:_[A-Z]{2})?\/|[A-Z]{2}\/)?page\/contact-us\.html$/.test(url.pathname) ? url.href : null; } catch { return null; }
}
/** Anonymous CMS read. These two public locale preferences are constructed
 * from server country metadata; no account cookie/token is accepted here.
 * Manual same-origin redirects retain locale without adopting session cookies. */
export async function readServerContacts(fetcher: (url: string, options: RequestInit) => Promise<Response>, countryCode: string, language: string, signal: AbortSignal): Promise<ServerContacts> {
  if (!/^[A-Z]{2}$/.test(countryCode) || !/^(ro|ru|en)$/.test(language)) throw new Error('contacts.contextUnavailable');
  let url = `https://bayshop.com/${countryCode.toLowerCase()}_${language.toUpperCase()}/page/contact-us.html`;
  for (let redirect = 0; redirect < 4; redirect++) {
    if (signal.aborted) throw new Error('contacts.unavailable');
    const response = await fetcher(url, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'manual', referrerPolicy: 'no-referrer', signal, headers: { Accept: 'text/html', 'Accept-Language': language, Cookie: `change-country=${countryCode}; change-lang=${language.toUpperCase()}` } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); const next = location && contactUrl(new URL(location, url).href);
      if (!next) throw new Error('contacts.unavailable'); url = next; continue;
    }
    if (!response.ok || response.url && !contactUrl(response.url) || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '') || Number(response.headers.get('content-length')) > MAX_HTML) throw new Error('contacts.unavailable');
    const html = await response.text(); if (signal.aborted) throw new Error('contacts.unavailable');
    return parseServerContacts(html, countryCode, language);
  }
  throw new Error('contacts.unavailable');
}
