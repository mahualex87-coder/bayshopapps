import type { ThemeColors } from '@/theme/palette';
import { useThemeStyles } from '@/theme/context';
import { useCallback, useMemo, useRef, useState, type ComponentRef, type PropsWithChildren, type RefObject } from 'react';
import { AccessibilityInfo, ActivityIndicator, findNodeHandle, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDemo } from '@/state/context';
import { useLiveAccount } from '@/api/context';
import { useSupportChat } from '@/features/support/SupportChatProvider';
import { minTouchTarget, useUi } from '@/ui';
import { useI18n } from '@/i18n/context';
import { GlassSurface } from './GlassSurface';
import { ShellNavigationContext } from './context';
import { activeLiveParcelSection, activeParcelSection, isDetailPath, type ParcelSection } from './routes';
import { useVisualPreferences } from './accessibility';
import { drawerGroups, parcelTabs } from './menu';


function feedback() {
  if (Platform.OS === 'android') void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick).catch(() => {});
  else if (Platform.OS === 'ios') void Haptics.selectionAsync().catch(() => {});
}

export function AppShell({ children }: PropsWithChildren) {
  const { colors } = useUi();
  const styles = useThemeStyles(makeStyles);
  const { state } = useDemo();
  const live = useLiveAccount();
  const support = useSupportChat();
  const { t, countt, formatNumber } = useI18n();
  const menuGroups = drawerGroups(live.authenticated);
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ add?: string; section?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { reduceMotion } = useVisualPreferences();
  const [drawer, setDrawer] = useState(false);
  const [topHeight, setTopHeight] = useState(50);
  const [bottomHeight, setBottomHeight] = useState(74);
  const blurTarget = useRef<ComponentRef<typeof View>>(null);
  const menuRef = useRef<ComponentRef<typeof View>>(null);
  const closeRef = useRef<ComponentRef<typeof View>>(null);
  const leaveGuard = useRef<((proceed: () => void) => void) | null>(null);
  const backHandler = useRef<(() => boolean) | null>(null);
  const active = live.authenticated ? activeLiveParcelSection(pathname, [...(live.resources.sent.data || []).map(item => ({ id: item.id, status: 'Trimise' as const })), ...(live.resources.received.data || []).map(item => ({ id: item.id, status: 'Primit' as const }))], params.section) : activeParcelSection(pathname, state.shipments);
  const activeTab = active;
  const counts: Record<ParcelSection, number | null> = live.authenticated ? {
    waiting: live.parcelPages.waiting.overallTotal, warehouse: live.parcelPages.warehouse.overallTotal, shipments: live.parcelPages.sent.overallTotal, received: live.parcelPages.received.overallTotal,
  } : {
    waiting: state.incoming.filter(item => item.status === 'Așteptat').length,
    warehouse: state.warehouse.filter(item => !item.shipmentId).length,
    shipments: state.shipments.filter(item => item.status !== 'Primit').length,
    received: state.shipments.filter(item => item.status === 'Primit').length,
  };
  const unread = state.notifications.filter(item => !item.read).length;
  const focusControl = (ref: RefObject<ComponentRef<typeof View> | null>) => {
    if (Platform.OS === 'web') (ref.current as unknown as { focus?: () => void })?.focus?.();
    else { const node = findNodeHandle(ref.current); if (node) AccessibilityInfo.setAccessibilityFocus(node); }
  };
  const closeDrawer = () => { setDrawer(false); if (Platform.OS !== 'ios') requestAnimationFrame(() => focusControl(menuRef)); };
  const navigate = useCallback((href: Href, isCurrent?: () => boolean) => {
    const path = typeof href === 'string' ? href : href.pathname;
    if (typeof href === 'string' && pathname === path) return;
    const proceed = () => { if (isCurrent && !isCurrent()) return; Keyboard.dismiss(); feedback(); router.dismissTo(href); };
    if (leaveGuard.current) leaveGuard.current(proceed); else proceed();
  }, [pathname]);
  const shell = useMemo(() => ({
    navigate,
    registerLeaveGuard: (guard: (proceed: () => void) => void) => {
      leaveGuard.current = guard;
      return () => { if (leaveGuard.current === guard) leaveGuard.current = null; };
    },
    registerBackHandler: (handler: () => boolean) => {
      backHandler.current = handler;
      return () => { if (backHandler.current === handler) backHandler.current = null; };
    },
  }), [navigate]);
  const goBack = () => {
    if (backHandler.current?.()) return;
    const proceed = () => { if (router.canGoBack()) router.back(); else router.replace(active ? `/${active}` : '/'); };
    if (leaveGuard.current) leaveGuard.current(proceed); else proceed();
  };
  const isDetail = isDetailPath(pathname) || (pathname === '/address-book' && params.add === '1');

  return <ShellNavigationContext.Provider value={shell}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.frame}>
        <BlurTargetView ref={blurTarget} style={styles.flex}>
          <LinearGradient colors={[colors.gradientTop, colors.gradientMiddle, colors.gradientBottom]} locations={[0, 0.48, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={[styles.flex, { paddingTop: insets.top + topHeight + 12, paddingBottom: insets.bottom + bottomHeight + 16 }]} aria-hidden={drawer} accessibilityElementsHidden={drawer} importantForAccessibility={drawer ? 'no-hide-descendants' : 'auto'}>{children}</View>
        </BlurTargetView>
        <View style={[styles.topPosition, { top: insets.top + 5 }]} aria-hidden={drawer} accessibilityElementsHidden={drawer} importantForAccessibility={drawer ? 'no-hide-descendants' : 'auto'}>
          <GlassSurface blurTarget={blurTarget} style={styles.topBar} onLayout={event => setTopHeight(event.nativeEvent.layout.height)}>
            <Pressable ref={menuRef} onPress={() => { Keyboard.dismiss(); feedback(); setDrawer(true); }} accessibilityRole="button" accessibilityLabel={t('navigation.openMenu')} accessibilityState={{ expanded: drawer }} style={styles.iconButton}><Ionicons name="menu" size={24} color={colors.text} /></Pressable>
            {isDetail && <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel={t('navigation.back')} style={styles.iconButton}><Ionicons name="chevron-back" size={23} color={colors.text} /></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel={t('navigation.brandHome')} onPress={() => navigate('/')} style={styles.brand}><Image source={require('../../assets/branding/brand-mark.png')} style={{ width: 28, height: 26 }} resizeMode="contain" accessible={false} /><Text numberOfLines={1} maxFontSizeMultiplier={1.2} adjustsFontSizeToFit style={styles.brandText}>bayshop<Text style={{ color: colors.accent }}>.</Text></Text></Pressable>
            {!live.authenticated && <Pressable accessibilityRole="button" accessibilityLabel={t('navigation.unread', { count: unread })} onPress={() => navigate('/notifications')} style={styles.iconButton}><Ionicons name="notifications-outline" size={21} color={colors.text} />{unread > 0 && <View style={styles.notificationDot} />}</Pressable>}
            {live.authenticated && <Pressable accessibilityRole="button" accessibilityLabel={t('navigation.myAccount')} onPress={() => navigate('/account')} style={styles.iconButton}><Ionicons name="person-circle-outline" size={23} color={colors.text} /></Pressable>}
          </GlassSurface>
        </View>
        <View style={[styles.bottomPosition, { bottom: insets.bottom + 8 }]} aria-hidden={drawer} accessibilityElementsHidden={drawer} importantForAccessibility={drawer ? 'no-hide-descendants' : 'auto'}>
          <GlassSurface blurTarget={blurTarget} style={styles.bottomBar} onLayout={event => setBottomHeight(event.nativeEvent.layout.height)}>
            {parcelTabs.map(tab => <Pressable key={tab.key} accessibilityRole={tab.key === 'support' ? 'button' : 'tab'} aria-selected={tab.key === 'support' ? undefined : activeTab === tab.key} accessibilityLabel={tab.key === 'support' ? t(support.busy ? 'supportChat.opening' : tab.label) : counts[tab.key] === null ? t('navigation.notLoaded', { section: t(tab.label) }) : t('navigation.tabCount', { section: t(tab.label), countText: countt('navigation.parcels', counts[tab.key]!) })} accessibilityState={tab.key === 'support' ? { disabled: support.disabled, busy: support.busy } : { selected: activeTab === tab.key }} disabled={tab.key === 'support' && support.disabled} onPress={() => { if (tab.key === 'support') { feedback(); void support.open(); } else navigate(`/${tab.key}`); }} style={[styles.tab, activeTab === tab.key && styles.tabSelected]}>
              <View style={styles.tabIcon}>{tab.key === 'support' && support.busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name={activeTab === tab.key ? tab.activeIcon : tab.icon} size={22} color={activeTab === tab.key ? colors.accent : colors.muted} />}{tab.key !== 'support' && <Text style={[styles.counter, activeTab === tab.key && styles.counterSelected]}>{counts[tab.key] === null ? '—' : formatNumber(counts[tab.key]!)}</Text>}</View>
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelSelected]}>{t(tab.label)}</Text>
            </Pressable>)}
          </GlassSurface>
        </View>
      </View>
    </KeyboardAvoidingView>
    <Modal visible={drawer} transparent animationType={Platform.OS === 'ios' || reduceMotion ? 'none' : 'fade'} onRequestClose={closeDrawer} onShow={() => focusControl(closeRef)} onDismiss={() => focusControl(menuRef)}>
      <View style={styles.overlay} role="dialog" aria-modal accessibilityLabel={t('navigation.mainMenu')} accessibilityViewIsModal>
        <Pressable accessible={false} onPress={closeDrawer} style={StyleSheet.absoluteFill} />
        <GlassSurface style={[styles.drawer, { width: Math.min(width - 36, 340), marginTop: insets.top + 8, marginBottom: insets.bottom + 8 }]}>
          <View style={styles.drawerHeader}><View style={styles.flex}><Text style={styles.drawerName}>{(live.authenticated ? live.resources.profile.data?.firstName : state.profile.firstName) || t('navigation.myAccount')}</Text><Text style={styles.drawerSub}>{t('navigation.personalCabinet')}</Text></View><Pressable ref={closeRef} accessibilityRole="button" accessibilityLabel={t('navigation.closeMenu')} onPress={closeDrawer} style={styles.iconButton}><Ionicons name="close" size={23} color={colors.text} /></Pressable></View>
          <ScrollView contentContainerStyle={styles.drawerContent} keyboardShouldPersistTaps="handled">
            {menuGroups.map(group => <View key={group.label} style={styles.drawerGroup}><Text style={styles.groupLabel}>{t(group.label)}</Text>{group.items.map(item => <Pressable key={String(item.href)} accessibilityRole="button" accessibilityLabel={t(item.label)} accessibilityState={{ selected: pathname === item.href }} onPress={() => { closeDrawer(); navigate(item.href); }} style={({ pressed }) => [styles.drawerItem, pathname === item.href && styles.drawerSelected, pressed && { backgroundColor: colors.soft }]}><Ionicons name={item.icon} size={21} color={pathname === item.href ? colors.accent : colors.muted} /><Text style={[styles.drawerLabel, pathname === item.href && { color: colors.accent }]}>{t(item.label)}</Text><Ionicons name="chevron-forward" size={14} color={colors.muted} /></Pressable>)}</View>)}
          </ScrollView>
        </GlassSurface>
      </View>
    </Modal>
  </ShellNavigationContext.Provider>;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 }, frame: { flex: 1, backgroundColor: colors.background },
  topPosition: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  topBar: { width: '100%', maxWidth: 620, flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 3, borderRadius: 23 },
  iconButton: { width: minTouchTarget, minHeight: minTouchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  brand: { flex: 1, minHeight: minTouchTarget, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -1.1, flexShrink: 1 },
  notificationDot: { position: 'absolute', top: 10, right: 12, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  bottomPosition: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  bottomBar: { width: '100%', maxWidth: 620, flexDirection: 'row', padding: 5, borderRadius: 28, gap: 2 },
  tab: { flex: 1, minHeight: 62, paddingVertical: 7, paddingHorizontal: 2, gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  tabSelected: { backgroundColor: colors.accentSoft }, tabIcon: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  counter: { color: colors.muted, backgroundColor: colors.soft, fontSize: 10, fontWeight: '700', minWidth: 17, paddingHorizontal: 4, borderRadius: 7, textAlign: 'center' }, counterSelected: { backgroundColor: colors.primaryButton, color: colors.onAccent },
  tabLabel: { color: colors.muted, fontSize: 11, fontWeight: '600', textAlign: 'center' }, tabLabelSelected: { color: colors.accentText, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: colors.overlay, flexDirection: 'row' }, drawer: { marginLeft: 8, borderRadius: 28 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, drawerName: { fontSize: 22, color: colors.text, fontWeight: '700' }, drawerSub: { fontSize: 12, color: colors.muted, marginTop: 3 },
  drawerContent: { padding: 12, gap: 20 }, drawerGroup: { gap: 3 }, groupLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.3, paddingHorizontal: 10, paddingBottom: 5 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: Math.max(46, minTouchTarget), paddingHorizontal: 10, paddingVertical: 9, borderRadius: 13 }, drawerSelected: { backgroundColor: colors.accentSoft }, drawerLabel: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '500' },
});
