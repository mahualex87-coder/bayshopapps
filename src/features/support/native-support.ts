import type { IntercomIdentity } from '@/api/intercom-identity';
import type { SupportOpenOptions, SupportOpenResult } from './session-controller';
export type { SupportError, SupportOpenOptions, SupportOpenResult } from './session-controller';
export function nativeSupportAvailable(): boolean { return false; }
export async function openNativeSupport(_identity: IntercomIdentity, _options: SupportOpenOptions): Promise<SupportOpenResult> { return { ok: false, error: 'not_configured' }; }
export async function clearNativeSupport(): Promise<boolean> { return true; }
