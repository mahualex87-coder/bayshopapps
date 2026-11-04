import * as SecureStore from 'expo-secure-store';
import type { PushRecord } from './push-registration';

const key = 'bayshop.push.registration.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export async function readPushRecord(): Promise<PushRecord | null> {
  const value = await SecureStore.getItemAsync(key, options);
  if (!value) return null;
  try {
    const record = JSON.parse(value);
    if (record && typeof record.accountId === 'string' && /^[1-9]\d*$/.test(record.accountId)
      && (record.token === undefined || (typeof record.token === 'string' && /^[A-Za-z0-9_:.-]{20,4096}$/.test(record.token)))) {
      return { accountId: record.accountId, token: record.token };
    }
  } catch { /* A damaged record must also revoke its native address. */ }
  return { cleanup: true };
}
export async function savePushRecord(record: PushRecord | null) {
  if (record) await SecureStore.setItemAsync(key, JSON.stringify(record), options);
  else await SecureStore.deleteItemAsync(key, options);
}
