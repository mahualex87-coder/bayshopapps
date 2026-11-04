import { ApiContractError } from './normalize.ts';

export type AccountPickupQr = { code: string };
export function normalizeAccountPickupQr(raw: unknown): AccountPickupQr {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiContractError('codul de primire');
  const code = (raw as Record<string, unknown>).code;
  if (typeof code !== 'string' || !code.trim() || code.length > 512 || /[\u0000-\u001f\u007f]/.test(code)) throw new ApiContractError('codul de primire');
  // The exact server code is encoded; never derive one from the member ID.
  return { code };
}
