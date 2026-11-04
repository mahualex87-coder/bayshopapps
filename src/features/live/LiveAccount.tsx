import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { router } from 'expo-router';
import { CompactLink, useCompactStyles } from '@/features/dashboard/components';
import { GlassSurface } from '@/navigation/GlassSurface';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import type { LiveProfile } from '@/api/contracts';
import { Button, Notice, Screen, useUi } from '@/ui';
import { useI18n } from '@/i18n/context';
import { useSupportChat } from '@/features/support/SupportChatProvider';
import { DetailRow, ResourceStatus, type LiveResourceProps } from './shared';

export function LiveAccount({ resource, onRefresh, onLogout }: LiveResourceProps<LiveProfile> & { onLogout: () => void }) {
  const { colors, s } = useUi();
  const styles = useThemeStyles(makeStyles);
  const compact = useCompactStyles();
  const { t } = useI18n();
  const support = useSupportChat();
  const profile = resource.data;
  const name = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') : '';
  return <Screen title={t('live.account.title')} subtitle={t('live.account.subtitle')}>
    <GlassSurface style={compact.group}><CompactLink title={t('settingsHub.title')} detail={t('settingsHub.accountEntry')} icon="settings-outline" onPress={() => router.push('/settings')} last /></GlassSurface>
    <ResourceStatus resource={resource} onRefresh={onRefresh} />
    {profile && <View style={s.card}>
      <View style={styles.profileHeader}><View style={styles.avatar}><Ionicons name="person-outline" color={colors.accent} size={25} /></View><View style={styles.nameBlock}><Text style={s.heading}>{name || t('live.account.fallback')}</Text>{profile.clientCode && <Text selectable style={s.small}>{profile.clientCode}</Text>}</View></View>
      <View><DetailRow label={t('field.lastName')} value={profile.lastName} /><DetailRow label={t('field.firstName')} value={profile.firstName} /><DetailRow label={t('field.email')} value={profile.email} /><DetailRow label={t('field.phone')} value={profile.phone} /></View>
    </View>}
    {profile?.emailError && <><Notice error>{t('profileIdentity.emailUnavailable')}</Notice><Button secondary disabled={resource.loading} onPress={onRefresh}>{t('profileIdentity.retryEmail')}</Button></>}
    {profile && <><Notice>{t('profileIdentity.protected')}</Notice><Button secondary disabled={support.disabled} onPress={() => { void support.open(); }}>{t(support.busy ? 'supportChat.opening' : 'profileIdentity.support')}</Button><Button secondary onPress={() => router.push('/account/edit')}>{t('profileIdentity.settings')}</Button></>}
    <Button secondary onPress={onLogout}>{t('live.logout')}</Button>
  </Screen>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 48, height: 48, borderRadius: 17, backgroundColor: colors.accentSoft, justifyContent: 'center', alignItems: 'center' }, nameBlock: { flex: 1, gap: 4 },
});
