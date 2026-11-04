import { router } from 'expo-router';
import { useLiveAccount } from '@/api/context';
import { LiveBalanceRoute } from '@/features/live/routes';
import { useI18n } from '@/i18n/context';
import { Button, Notice, Screen } from '@/ui';

export default function BalanceScreen() {
  const { authenticated } = useLiveAccount();
  const { t } = useI18n();
  if (authenticated) return <LiveBalanceRoute />;
  return <Screen title={t('live.balance.title')} subtitle={t('live.balance.subtitle')}>
    <Notice>{t('balanceHistory.signInRequired')}</Notice>
    <Button onPress={() => router.push('/login')}>{t('auth.signIn')}</Button>
  </Screen>;
}
