import type { ComponentType } from 'react';
import { requireNativeView } from 'expo';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import type { NativeWallet, WalletConfig } from './wallet-contract';
import { walletButtonProps } from './wallet-button-contract';

type NativeProps = NonNullable<ReturnType<typeof walletButtonProps>> & { onButtonPress: () => void; style: StyleProp<ViewStyle> };
let NativeButton: ComponentType<NativeProps> | null = null;
if (Platform.OS === 'ios' || Platform.OS === 'android') {
  const native = requireOptionalNativeModule<NativeWallet & { buttonProtocolVersion?: number }>('BayShopWallet');
  if (native?.protocolVersion === 1 && native.buttonProtocolVersion === 1) {
    try { NativeButton = requireNativeView<NativeProps>('BayShopWallet'); } catch { /* Missing view fails closed; no replacement branding. */ }
  }
}

/** Render only after createNativeWallet().isReadyAsync(config) succeeds for this exact config.
 * Parent owns user-approved initiation; the button only emits a native press event. */
export function WalletPayButton({ config, ready, disabled = false, darkBackground = false, onPress, style }: {
  config: WalletConfig; ready: boolean; disabled?: boolean; darkBackground?: boolean;
  onPress: () => void; style?: StyleProp<ViewStyle>;
}) {
  const props = walletButtonProps(config, Platform.OS, ready, disabled, darkBackground);
  if (!NativeButton || !props) return null;
  return <NativeButton {...props} style={[{ width: '100%', height: 48 }, style, { minWidth: 180, minHeight: 48 }]}
    onButtonPress={() => { if (props.walletEnabled) onPress(); }} />;
}
