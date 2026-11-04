import { literalHtmlText } from '../../domain/server-text.ts';

/** Extract text only. The result is rendered as native Text, never mounted as HTML. */
export function readablePublicText(html: string): string {
  const withoutControls = html.replace(/<\s*(script|style|noscript|nav|header|footer|aside|form|button|select|textarea|iframe|object|svg|canvas)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '');
  const main = /<(main|article)\b[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(withoutControls)?.[2];
  return literalHtmlText(main || withoutControls)
    .replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
