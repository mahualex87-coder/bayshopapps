export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'bayshop.appearance.v1';
export function isThemeMode(value: unknown): value is ThemeMode { return value === 'system' || value === 'light' || value === 'dark'; }
export function resolveTheme(mode: ThemeMode, system: string | null | undefined): ResolvedTheme { return mode === 'system' ? system === 'dark' ? 'dark' : 'light' : mode; }
type Snapshot = { mode: ThemeMode; ready: boolean; persistenceError: boolean };
type Storage = { read: () => Promise<string | null>; write: (mode: ThemeMode) => Promise<void> };

/** A theme preference is device-local, independent of account authentication.
 * Late hydration and slow writes cannot overwrite a newer explicit selection. */
export class ThemePreferenceStore {
  private snapshot: Snapshot = { mode: 'system', ready: false, persistenceError: false };
  private listeners = new Set<() => void>();
  private revision = 0;
  private pending = Promise.resolve();
  private started: Promise<void> | null = null;
  private storage: Storage;
  constructor(storage: Storage) { this.storage = storage; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()); }
  start = (): Promise<void> => {
    if (this.started) return this.started;
    const revision = this.revision;
    this.started = this.storage.read().then(value => {
      this.emit({ ready: true, ...(revision === this.revision && isThemeMode(value) ? { mode: value } : {}) });
    }).catch(() => { this.emit({ ready: true, ...(revision === this.revision ? { persistenceError: true } : {}) }); });
    return this.started;
  };
  setMode = (mode: ThemeMode): void => {
    if (!isThemeMode(mode)) return;
    const revision = ++this.revision;
    this.emit({ mode, persistenceError: false });
    this.pending = this.pending.then(() => this.storage.write(mode)).then(() => {
      if (revision === this.revision) this.emit({ persistenceError: false });
    }).catch(() => { if (revision === this.revision) this.emit({ persistenceError: true }); });
  };
  whenSaved = () => this.pending;
}
