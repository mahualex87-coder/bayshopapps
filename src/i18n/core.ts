import { catalog } from './catalog.ts';

export const languages = ['ro', 'ru', 'en'] as const;
export type Language = typeof languages[number];
export type TranslationParams = Readonly<Record<string, string | number>>;
export type MessageCatalog = Record<string, Record<Language, string>>;
export const languageLocales: Record<Language, string> = { ro: 'ro-MD', ru: 'ru-MD', en: 'en-GB' };
export const languageNames: Record<Language, string> = { ro: 'Română', ru: 'Русский', en: 'English' };
export const LANGUAGE_STORAGE_KEY = '@bayshop/language-v1';
export function isLanguage(value: unknown): value is Language { return typeof value === 'string' && languages.includes(value as Language); }
export function normalizeLanguage(value: unknown): Language | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLanguage(code) ? code : null;
}
export function translate(language: Language, key: string, params: TranslationParams = {}): string {
  const entry = catalog[key];
  const message = entry?.[language] || entry?.ro || key;
  return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : placeholder);
}
export function formatNumber(language: Language, value: number, options: Intl.NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return translate(language, 'common.unavailable');
  return new Intl.NumberFormat(languageLocales[language], options).format(value);
}
/** Hermes can provide NumberFormat/DateTimeFormat without PluralRules. These
 * cardinal rules cover the app's three locales (Unicode CLDR plurals.xml). */
export function pluralCategory(language: Language, count: number): 'one' | 'few' | 'many' | 'other' {
  if (!Number.isFinite(count)) return 'other';
  if (typeof Intl.PluralRules === 'function') {
    try { return new Intl.PluralRules(languageLocales[language]).select(count) as 'one' | 'few' | 'many' | 'other'; }
    catch { /* A partial Intl implementation can reject a supported app locale. */ }
  }
  const absolute = Math.abs(count);
  // Match the default Intl cardinal rounding (at most three fraction digits).
  // NumberFormat is supported by the native runtime and already formats counts.
  const n = Number.isInteger(absolute) ? absolute : Number(new Intl.NumberFormat('en', { useGrouping: false, maximumFractionDigits: 3 }).format(absolute));
  const integer = Number.isInteger(n);
  if (language === 'en') return integer && n === 1 ? 'one' : 'other';
  if (language === 'ro') {
    if (integer && n === 1) return 'one';
    return !integer || n === 0 || n % 100 >= 1 && n % 100 <= 19 ? 'few' : 'other';
  }
  if (!integer) return 'other';
  if (n % 10 === 1 && n % 100 !== 11) return 'one';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return 'few';
  return 'many';
}
export function countt(language: Language, baseKey: string, count: number, params: TranslationParams = {}): string {
  const category = pluralCategory(language, count);
  const selected = `${baseKey}.${category}`;
  const key = catalog[selected] ? selected : `${baseKey}.other`;
  return translate(language, key, { ...params, count: formatNumber(language, count) });
}

/** SQL dates have no zone. Preserve their calendar/wall-clock values instead of
 * guessing a server zone or relying on platform-specific Date string parsing. */
export function parseDisplayDate(value: string): { date: Date; wallClock: boolean } | null {
  const wall = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/.exec(value);
  if (wall) {
    const [, y, m, d, h = '0', min = '0', sec = '0', millis = '0'] = wall;
    const parts = [Number(y), Number(m), Number(d), Number(h), Number(min), Number(sec), Number(millis.padEnd(3, '0'))];
    const date = new Date(0);
    date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
    date.setUTCHours(parts[3], parts[4], parts[5], parts[6]);
    const valid = parts[0] >= 1 && date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2] && date.getUTCHours() === parts[3] && date.getUTCMinutes() === parts[4] && date.getUTCSeconds() === parts[5];
    return valid ? { date, wallClock: true } : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  if (!parseDisplayDate(value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, ''))) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? { date, wallClock: false } : null;
}
export function formatDate(language: Language, value: string | null): string | null {
  if (!value) return null;
  const parsed = parseDisplayDate(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat(languageLocales[language], { day: 'numeric', month: 'short', year: 'numeric', ...(parsed.wallClock ? { timeZone: 'UTC' } : {}) }).format(parsed.date);
}
export function formatTime(language: Language, value: number | Date | string | null): string | null {
  if (value === null) return null;
  const parsed = typeof value === 'string' ? parseDisplayDate(value) : { date: value instanceof Date ? value : new Date(value), wallClock: false };
  if (!parsed || !Number.isFinite(parsed.date.getTime())) return typeof value === 'string' ? value : null;
  return new Intl.DateTimeFormat(languageLocales[language], { hour: '2-digit', minute: '2-digit', ...(parsed.wallClock ? { timeZone: 'UTC' } : {}) }).format(parsed.date);
}
export function formatUpdatedAt(language: Language, value: number | null, now = Date.now()): string {
  if (value === null || !Number.isFinite(value)) return translate(language, 'common.dataFromAccount');
  const date = new Date(value); const today = new Date(now);
  if (!Number.isFinite(date.getTime())) return translate(language, 'common.dataFromAccount');
  const time = formatTime(language, date) || '';
  const sameDay = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  if (sameDay) return translate(language, 'common.updatedAt', { time });
  return translate(language, 'common.updatedOn', { time, date: new Intl.DateTimeFormat(languageLocales[language], { day: 'numeric', month: 'short', year: 'numeric' }).format(date) });
}

export type LanguageStorage = { read(): Promise<string | null>; write(language: Language): Promise<void> };
export type LanguageSnapshot = { language: Language; ready: boolean; persistenceError: string | null; changeError: string | null };
/** Independent of authentication: this store persists only a non-secret locale. */
export class LanguagePreferenceStore {
  private snapshot: LanguageSnapshot = { language: 'ro', ready: false, persistenceError: null, changeError: null };
  private listeners = new Set<() => void>();
  private handlers = new Set<(language: Language) => boolean>();
  private guards = new Set<(language: Language) => boolean>();
  private storage: LanguageStorage;
  private generation = 0;
  private writes: Promise<void> = Promise.resolve();
  private started = false;
  private initialLanguage: Language;
  constructor(storage: LanguageStorage, initialLanguage: Language = 'ro') { this.storage = storage; this.initialLanguage = initialLanguage; this.snapshot = { ...this.snapshot, language: initialLanguage }; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  registerLanguageGuard = (guard: (language: Language) => boolean) => { this.guards.add(guard); return () => { this.guards.delete(guard); if (this.snapshot.changeError) this.emit({ changeError: null }); }; };
  registerLanguageChange = (handler: (language: Language) => boolean) => { this.handlers.add(handler); return () => { this.handlers.delete(handler); }; };
  private emit(patch: Partial<LanguageSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()); }
  start = async () => {
    if (this.started) return;
    this.started = true;
    const generation = this.generation;
    try {
      const raw = await this.storage.read();
      if (generation !== this.generation) return;
      const language = isLanguage(raw) ? raw : this.initialLanguage;
      for (const guard of this.guards) if (!guard(language)) { this.emit({ ready: true }); return; }
      for (const handler of this.handlers) if (!handler(language)) { this.emit({ ready: true }); return; }
      this.emit({ language, ready: true });
    } catch { if (generation === this.generation) this.emit({ ready: true, persistenceError: 'errors.languageRead' }); }
  };
  setLanguage = async (language: Language): Promise<boolean> => {
    if (!isLanguage(language)) return false;
    if (language === this.snapshot.language && this.snapshot.ready) { this.emit({ changeError: null }); return true; }
    for (const guard of this.guards) if (!guard(language)) { this.emit({ changeError: 'errors.languageDraft' }); return false; }
    for (const handler of this.handlers) if (!handler(language)) return false;
    const generation = ++this.generation;
    this.emit({ language, ready: true, persistenceError: null, changeError: null });
    const write = this.writes.catch(() => {}).then(() => this.storage.write(language));
    this.writes = write;
    try { await write; } catch { if (generation === this.generation) this.emit({ persistenceError: 'errors.languagePersistence' }); }
    return true;
  };
}
