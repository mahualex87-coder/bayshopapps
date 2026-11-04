/** The authenticated cabinet supplies the bot address. Never append a member ID,
 * phone number or API token to a Telegram URL. */
export function telegramBotLinks(raw: unknown): { https: string; native: string } | null {
  if (typeof raw !== 'string') return null;
  const match = /^https:\/\/(?:t\.me|telegram\.me)\/([a-z][a-z\d_]{1,28}bot)\/?(?:\?start=([A-Za-z\d_-]{1,64}))?$/i.exec(raw.trim());
  if (!match || match[1].length > 32) return null;
  const [, bot, start] = match;
  return { https: `https://t.me/${bot}${start ? `?start=${start}` : ''}`, native: `tg://resolve?domain=${bot}${start ? `&start=${start}` : ''}` };
}

export async function openTelegramBot(raw: unknown, launch: (url: string) => Promise<unknown>, current: () => boolean) {
  const links = telegramBotLinks(raw);
  if (!links) throw new Error('telegram.unavailable');
  if (!current()) return;
  try { await launch(links.native); }
  catch { if (current()) await launch(links.https); }
}
