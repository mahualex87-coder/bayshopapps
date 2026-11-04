import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { CompactLink, useCompactStyles } from '@/features/dashboard/components';
import { useI18n } from '@/i18n/context';
import { GlassSurface } from '@/navigation/GlassSurface';
import { AppearancePicker } from '@/theme/AppearancePicker';
import { Button, Notice, Screen, useUi } from '@/ui';

export function AccountSettingsHub() {
  const { s } = useUi(); const compact = useCompactStyles();
  const { notice, logout } = useLiveAccount();
  const { t } = useI18n();
  return <Screen title={t('settingsHub.title')} subtitle={t('settingsHub.intro')}>
    <View style={s.column}><Text accessibilityRole="header" style={s.heading}>{t('settingsHub.personalGroup')}</Text><GlassSurface style={compact.group}>
      <CompactLink title={t('accountRegion.title')} detail={t('accountRegion.entry')} icon="globe-outline" onPress={() => router.push('/account/region')} />
      <CompactLink title={t('settingsHub.personal')} detail={t('settingsHub.personalDetail')} icon="person-outline" onPress={() => router.push('/account/edit')} />
      <CompactLink title={t('settingsHub.details')} detail={t('settingsHub.detailsDetail')} icon="calendar-outline" onPress={() => router.push('/account/details')} />
      <CompactLink title={t('settingsHub.identity')} detail={t('settingsHub.identityDetail')} icon="id-card-outline" onPress={() => router.push('/account/identity')} />
      <CompactLink title={t('settingsHub.security')} detail={t('settingsHub.securityDetail')} icon="lock-closed-outline" onPress={() => router.push('/account/security')} last />
    </GlassSurface></View>
    <View style={s.column}><Text accessibilityRole="header" style={s.heading}>{t('settingsHub.addressGroup')}</Text><GlassSurface style={compact.group}>
      <CompactLink title={t('settingsHub.billing')} detail={t('settingsHub.billingDetail')} icon="receipt-outline" onPress={() => router.push('/account/billing')} />
      <CompactLink title={t('settingsHub.delivery')} detail={t('settingsHub.deliveryDetail')} icon="location-outline" onPress={() => router.push('/address-book')} last />
    </GlassSurface></View>
    <View style={s.column}><Text accessibilityRole="header" style={s.heading}>{t('settingsHub.servicesGroup')}</Text><GlassSurface style={compact.group}>
      <CompactLink title={t('settingsHub.services')} detail={t('settingsHub.servicesDetail')} icon="cube-outline" onPress={() => router.push('/account/services')} />
      <CompactLink title={t('settingsHub.notifications')} detail={t('settingsHub.notificationsDetail')} icon="notifications-outline" onPress={() => router.push('/preferences')} last />
    </GlassSurface></View>
    <Text accessibilityRole="header" style={s.heading}>{t('settingsHub.appGroup')}</Text>
    <AppearancePicker />
    {notice && <Notice error>{t(notice)}</Notice>}
    <Button secondary onPress={() => { void logout(); }}>{t('live.logout.device')}</Button>
  </Screen>;
}
