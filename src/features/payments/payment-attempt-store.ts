import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_ORIGIN } from '@/api/client';
import { emptyPaymentLedger, parsePaymentAttempt, parsePaymentLedger, paymentAttemptStorageKey, paymentLedgerStorageKey, type PaymentLedger } from './payment-attempt';

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const paymentAttemptStore = {
  async clearLegacyAttempts(accountId: string): Promise<void> {
    if (Platform.OS === 'web') return;
    // Remove only this account's old local history. No server cancellation,
    // payment status mutation, or access to another account is involved.
    await Promise.all([
      SecureStore.deleteItemAsync(paymentLedgerStorageKey(API_ORIGIN, accountId), options),
      SecureStore.deleteItemAsync(paymentAttemptStorageKey(API_ORIGIN, accountId), options),
    ]);
  },
  async readLedger(accountId: string): Promise<PaymentLedger> {
    if (Platform.OS === 'web') return emptyPaymentLedger();
    const raw = await SecureStore.getItemAsync(paymentLedgerStorageKey(API_ORIGIN, accountId), options);
    // Even an empty v2 ledger supersedes the old key. Corrupt v2 state must
    // fail closed instead of falling back to an older, less complete record.
    if (raw !== null) return parsePaymentLedger(raw);
    const legacy = parsePaymentAttempt(await SecureStore.getItemAsync(paymentAttemptStorageKey(API_ORIGIN, accountId), options));
    if (!legacy) return emptyPaymentLedger();
    if (legacy.version !== 1) throw new Error('payments.recoveryFailed');
    return { version: 2, activeAttemptKey: legacy.attemptKey, attempts: [legacy] };
  },
  async writeLedger(accountId: string, ledger: PaymentLedger): Promise<void> {
    if (Platform.OS === 'web') throw new Error('payments.nativeOnly');
    const raw = JSON.stringify(ledger);
    parsePaymentLedger(raw);
    // One write commits the entire transition. Native size/keychain failures
    // propagate to the caller; never evict an unresolved attempt to make room.
    // Keep the legacy key intact for migration, but never read it after v2 exists.
    await SecureStore.setItemAsync(paymentLedgerStorageKey(API_ORIGIN, accountId), raw, options);
  },
};
