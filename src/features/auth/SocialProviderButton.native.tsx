import { View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTheme } from '@/theme/context';
import { useI18n } from '@/i18n/context';
import { Button, minTouchTarget } from '@/ui';
import type { SocialProviderButtonProps } from './SocialProviderButton';

export function SocialProviderButton({ provider, disabled, onPress }: SocialProviderButtonProps) {
  const { isDark } = useTheme(); const { t } = useI18n();
  if (provider === 'google') return <Button secondary disabled={disabled} onPress={onPress}>{t('socialAuth.google')}</Button>;
  return <View pointerEvents={disabled ? 'none' : 'auto'} accessibilityElementsHidden={disabled} importantForAccessibility={disabled ? 'no-hide-descendants' : 'auto'} style={{ opacity: disabled ? 0.5 : 1 }}>
    <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE} buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK} cornerRadius={12} style={{ width: '100%', height: Math.max(48, minTouchTarget) }} onPress={onPress} />
  </View>;
}
