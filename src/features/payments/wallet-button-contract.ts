import { walletConfig, type WalletConfig } from './wallet-contract.ts';

export function walletButtonProps(config: WalletConfig, platform: string, ready: boolean, disabled: boolean, darkBackground: boolean) {
  if (ready !== true) return null;
  try {
    const value = walletConfig(config, platform);
    return { walletNetworks: value.google?.networks ?? value.apple!.networks, walletEnabled: disabled !== true, darkBackground: darkBackground === true };
  } catch { return null; }
}
