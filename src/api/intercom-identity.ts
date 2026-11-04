import { ApiError } from './client.ts';
import { ApiContractError } from './normalize.ts';

/** Existing bearer-scoped GET /api/auth identity. Ephemeral: never persist this JWT. */
export type IntercomIdentity = { userId: string; jwt: string; expiresInSeconds: number };

export function normalizeIntercomIdentityData(value: unknown): IntercomIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiContractError('identitatea pentru suport');
  const data = value as Record<string, unknown>;
  if (data.intercom == null) throw new ApiError(503, 'support.identityUnavailable');
  if (typeof data.intercom !== 'object' || Array.isArray(data.intercom)) throw new ApiContractError('identitatea pentru suport');
  const identity = data.intercom as Record<string, unknown>;
  const userId = data.uid;
  const jwt = identity.intercom_user_jwt;
  const expiresInSeconds = identity.expires_in;
  if (typeof userId !== 'string' || !userId || userId !== userId.trim() || userId.length > 255 || /[\u0000-\u001f\u007f]/.test(userId)
    || typeof jwt !== 'string' || jwt.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)
    || typeof expiresInSeconds !== 'number' || !Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0 || expiresInSeconds > 86400) {
    throw new ApiContractError('identitatea pentru suport');
  }
  return { userId, jwt, expiresInSeconds };
}
