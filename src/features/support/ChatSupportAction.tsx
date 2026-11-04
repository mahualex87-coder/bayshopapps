import { useCallback, useLayoutEffect, useRef } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useI18n } from '@/i18n/context';
import { Button, useUi } from '@/ui';
import { useSupportChat } from './SupportChatProvider';

/** Compatibility for an existing /support link. Normal help actions open the
 * overlay in place; this route also launches it without a second tap. */
export function ChatSupportAction() {
  const { open, busy } = useSupportChat();
  const { t } = useI18n(); const { s, colors } = useUi();
  const launch = useRef(open);
  useLayoutEffect(() => { launch.current = open; }, [open]);
  useFocusEffect(useCallback(() => {
    void launch.current();
  }, []));
  return <View style={s.card}>
    {busy && <View style={s.row}><ActivityIndicator color={colors.accent} /><Text accessibilityLiveRegion="polite" style={s.small}>{t('supportChat.opening')}</Text></View>}
    <Button secondary onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}>{t('navigation.back')}</Button>
  </View>;
}
