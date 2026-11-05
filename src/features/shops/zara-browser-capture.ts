import { readZaraCapture, zaraProductUrl, type ZaraProductDraft, type ZaraSizeChoice } from './zara-product.ts';

type Offer = Omit<ZaraProductDraft, 'size' | 'sku'>;
export type ZaraOptions = { draft: Offer; choices: ZaraSizeChoice[] };
export type ZaraRequest = { id: string; url: string; selection?: { draft: Offer; choice: ZaraSizeChoice } };
export type ZaraImport = ZaraProductDraft | Pick<ZaraProductDraft, 'url'>;

export function resolveZaraReply(request: ZaraRequest, sourceUrl: string, currentUrl: string, message: string) {
  if (typeof message !== 'string' || message.length > 12000 || !request.url ||
    zaraProductUrl(sourceUrl) !== request.url || zaraProductUrl(currentUrl) !== request.url ||
    new URL(sourceUrl).origin !== new URL(currentUrl).origin) return null;
  try {
    const envelope = JSON.parse(message);
    if (envelope?.type !== 'bayshop.zara.capture.v1' || envelope.requestId !== request.id) return null;
  } catch { return null; }
  const result = readZaraCapture(message, request.id, currentUrl);
  const selection = request.selection;
  if (!selection) return result;
  const previous = selection.draft;
  if (!result.ok && result.reason !== 'size') return result;
  const offer = result.draft;
  if (!offer || offer.url !== previous.url || offer.title !== previous.title || offer.color !== previous.color) {
    return { ok: false, reason: 'changed' } as const;
  }
  // These are validated RON amounts with up to two decimal places. The
  // merchant may reformat one or update the displayed price for another size.
  const expectedPrice = Number(selection.choice.price ?? previous.price);
  if (result.ok) return result.draft.size === selection.choice.label && result.draft.sku === selection.choice.sku &&
    Number(result.draft.price) === expectedPrice
    ? result : { ok: false, reason: 'changed' } as const;
  const choice = result.choices?.find(item => item.label === selection.choice.label && item.sku === selection.choice.sku);
  if (!choice || !result.draft || Number(choice.price ?? result.draft.price) !== expectedPrice) return { ok: false, reason: 'changed' } as const;
  return { ok: true, draft: { ...result.draft, price: choice.price ?? result.draft.price, size: choice.label, sku: choice.sku } } as const;
}
