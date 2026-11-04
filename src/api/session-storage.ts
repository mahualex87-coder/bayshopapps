import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { SessionStorage } from './service';

const KEY = 'bayshop.real-account.session.v1';
const SIGNED_OUT = '@bayshop/session/signed-out';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

/** No real session, password or account payload is written to AsyncStorage. */
export const sessionStorage: SessionStorage = {
  read: async () => {
    if (Platform.OS === 'web' || await AsyncStorage.getItem(SIGNED_OUT) === '1') return null;
    return SecureStore.getItemAsync(KEY, options);
  },
  write: async value => {
    if (Platform.OS === 'web') throw new Error('Native login only');
    await SecureStore.setItemAsync(KEY, value, options);
    await AsyncStorage.removeItem(SIGNED_OUT);
  },
  clear: async () => {
    if (Platform.OS === 'web') return;
    // A non-secret tombstone prevents restoration even if keychain deletion fails.
    const results = await Promise.allSettled([
      AsyncStorage.setItem(SIGNED_OUT, '1'),
      SecureStore.deleteItemAsync(KEY, options),
    ]);
    // Attempt keychain deletion even when the non-secret marker cannot be written.
    if (results.some(result => result.status === 'rejected')) throw new Error('Session cleanup incomplete');
  },
};
