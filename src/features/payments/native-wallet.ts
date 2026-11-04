import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { createWalletController } from './wallet-controller';
import type { NativeWallet } from './wallet-contract';

export function createNativeWallet() {
  const native = Platform.OS === 'ios' || Platform.OS === 'android' ? requireOptionalNativeModule<NativeWallet>('BayShopWallet') : null;
  return createWalletController(native, Platform.OS);
}
export type { WalletConfig, WalletRequest, WalletToken } from './wallet-contract';
