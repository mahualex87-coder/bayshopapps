import type { SocialProvider } from '@/api/native-social-auth';
import { useI18n } from '@/i18n/context';
import { Button } from '@/ui';
export type SocialProviderButtonProps = { provider: SocialProvider; disabled: boolean; onPress: () => void };
/** Only rendered by synthetic previews on web; native availability is checked first. */
export function SocialProviderButton({ provider, disabled, onPress }: SocialProviderButtonProps) {
  const { t } = useI18n();
  return <Button secondary disabled={disabled} onPress={onPress}>{t(`socialAuth.${provider}`)}</Button>;
}
