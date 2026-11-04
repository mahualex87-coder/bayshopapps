export type PushPermission = 'granted' | 'denied' | 'undetermined';
export type NativePushMessage = { data?: unknown; notification?: { title?: unknown; body?: unknown } | null };
export function nativePushAvailable(): boolean { return false; }
export async function getPushPermission(): Promise<PushPermission> { return 'denied'; }
export async function requestPushPermission(): Promise<PushPermission> { return 'denied'; }
export async function getNativePushToken(): Promise<string> { throw new Error('push.unavailable'); }
export async function clearNativePushToken(): Promise<void> {}
export function listenNativePush(_callbacks: { message(message: NativePushMessage): void; opened(message: NativePushMessage): void; token(token: string): void }): () => void { return () => {}; }
export async function initialNativePush(): Promise<NativePushMessage | null> { return null; }
export function installBackgroundPushHandler(): void {}
