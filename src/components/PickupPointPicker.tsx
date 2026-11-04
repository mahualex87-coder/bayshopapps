import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import { distanceMetres, pickupDirectionsUrl, type PickupPoint } from '@/domain/pickup-points';
import { createPickupLocationController } from '@/domain/pickup-location-controller';
import { createPickupLocationDevice } from '@/features/location/pickup-device';
import { useI18n } from '@/i18n/context';
import { useVisualPreferences } from '@/navigation/accessibility';
import { Button, Notice, useUi } from '@/ui';
import { OptionPicker } from '@/features/accountops/shared';
import { ConsolidationNotice } from './ConsolidationNotice';
import { PickupMap } from './PickupMap';

type Props = {
  label: string;
  value: string;
  points: (PickupPoint & { title?: string })[];
  onChange(id: string): void;
  disabled?: boolean;
  /** Set only by an explicit method/point action, never by loading a saved setting. */
  openRequested?: boolean;
  onOpenRequestHandled?(): void;
};

export function PickupPointPicker({ label, value, points, onChange, disabled = false, openRequested = false, onOpenRequestHandled }: Props) {
  const { t, formatNumber } = useI18n(); const { s, colors } = useUi(); const focused = useIsFocused();
  const { reduceMotion } = useVisualPreferences(); const dimensions = useWindowDimensions();
  const insets = useSafeAreaInsets(); const frame = useSafeAreaFrame();
  const [open, setOpen] = useState(false); const [shown, setShown] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(0);
  const consumedRequest = useRef(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [directionsFailed, setDirectionsFailed] = useState(false);
  // Keep the lease and position in this owner, not in the conditionally mounted
  // modal. Reopening the map never replaces the form or loses its draft.
  const [controller] = useState(() => createPickupLocationController(createPickupLocationDevice()));
  const location = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const visible = open && focused;
  const close = () => { controller.pause(); setOpen(false); setShown(false); };
  const openMap = () => { if (!disabled && focused) { setDirectionsFailed(false); setShown(false); setOpen(true); } };
  useEffect(() => {
    if (!openRequested) { consumedRequest.current = false; return; }
    if (disabled || !focused || consumedRequest.current) return;
    let current = true;
    // Consume after this committed render; a new, loading method can request its
    // map before its points arrive. Strict Mode must not present it twice.
    queueMicrotask(() => {
      if (!current || consumedRequest.current) return;
      consumedRequest.current = true;
      setDirectionsFailed(false); setShown(false); setOpen(true);
      onOpenRequestHandled?.();
    });
    return () => { current = false; };
  }, [openRequested, onOpenRequestHandled, disabled, focused]);
  useEffect(() => {
    // A native permission dialog is inactive, not background. Wait until Modal
    // onShow before requesting permission so presentation never races the OS.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') { controller.pause(); setForeground(false); }
      else if (state === 'active') setForeground(true);
    });
    return () => subscription.remove();
  }, [controller]);
  useLayoutEffect(() => {
    controller.configure({ points, selectedId: value, disabled, focused: focused && visible && shown, foreground, onSelect: onChange });
  }, [controller, points, value, disabled, focused, visible, shown, foreground, onChange]);
  useEffect(() => {
    if (focused) return;
    controller.pause();
    let current = true;
    queueMicrotask(() => { if (current) { setOpen(false); setShown(false); } });
    return () => { current = false; };
  }, [controller, focused]);
  useEffect(() => () => controller.dispose(), [controller]);

  const selected = points.find(point => point.id === value);
  const distance = selected?.coordinates && location.origin ? distanceMetres(location.origin, selected.coordinates) : null;
  const select = (id: string) => { setDirectionsFailed(false); controller.choose(id); };
  const landscape = Platform.OS !== 'web' && (dimensions.width > dimensions.height || bodyHeight > 0 && bodyHeight < 240);
  const availableHeight = Math.max(200, dimensions.height - insets.top - insets.bottom);
  const mapHeight = Math.min(380, Math.max(120, bodyHeight > 0 ? bodyHeight * 0.48 : availableHeight * 0.4));
  const summary = <View style={{ gap: 4 }}>
    <Text selectable style={s.body}>{selected?.address || t('pickup.noSelection')}</Text>
    {selected?.priceLabel && <Text style={[s.body, { fontWeight: '600' }]}>{selected.priceLabel}</Text>}
  </View>;

  return <View style={{ gap: 10 }}>
    <View style={[s.card, { gap: 8 }]}>
      <Text style={s.label}>{label}</Text>
      {summary}
      <Button secondary disabled={disabled} onPress={openMap}>{t('pickup.openMap')}</Button>
    </View>
    <ConsolidationNotice point={selected} />
    {visible && <Modal visible animationType={reduceMotion ? 'none' : 'slide'} presentationStyle="fullScreen" onRequestClose={close} onShow={() => setShown(true)}>
      <SafeAreaProvider initialMetrics={{ frame, insets }} style={{ flex: 1, backgroundColor: colors.surface }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top', 'bottom', 'left', 'right']} accessibilityViewIsModal>
          <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderColor: colors.border }}>
            <Text accessibilityRole="header" numberOfLines={2} style={[s.heading, { flex: 1, minWidth: 0 }]}>{label}</Text>
            <Button secondary onPress={close}>{t('pickup.closeMap')}</Button>
          </View>
          <KeyboardAvoidingView style={{ flex: 1, minHeight: 0 }} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
          <View onLayout={event => { const next = Math.round(event.nativeEvent.layout.height); setBodyHeight(previous => previous === next ? previous : next); }} style={{ flex: 1, minHeight: 0, flexDirection: landscape ? 'row' : 'column', gap: 12, padding: 12 }}>
            <View style={landscape ? { flex: 1, minWidth: 0, minHeight: 0 } : { flexShrink: 0 }}>
              <PickupMap points={points} selectedId={value} userLocation={location.origin} recenterKey={location.recenterKey} disabled={disabled || !shown} onSelect={select} height={mapHeight} fill={landscape} />
            </View>
            <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ gap: 10, paddingBottom: 8 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {summary}
              <OptionPicker label={t('pickup.mapLabel')} value={value} options={points.map(point => {
                const warning = point.consolidationMessage || (point.allowConsolidation === false ? t('deliveryChange.noConsolidation') : null);
                const title = point.priceLabel ? `${point.address} · ${point.priceLabel}` : point.title || point.address;
                return { id: point.id, title: `${title}${warning ? ` · ${warning}` : ''}` };
              })} disabled={disabled || !shown} onChange={select} />
              <ConsolidationNotice point={selected} />
              <Button secondary disabled={disabled || !shown || location.locating || !points.some(point => point.coordinates && point.eligible !== false)} onPress={() => { void controller.nearest(); }}>{t(location.locating ? location.origin ? 'pickup.refining' : 'pickup.locating' : 'pickup.nearest')}</Button>
              <Text style={s.small}>{t('pickup.locationHelp')}</Text>
              {distance !== null && <Text style={s.small}>{t('pickup.distance', { distance: formatNumber(distance / 1000, { maximumFractionDigits: 1 }) })}</Text>}
              {selected && <Button secondary disabled={disabled} onPress={() => { void Linking.openURL(pickupDirectionsUrl(selected)).catch(() => setDirectionsFailed(true)); }}>{t('pickup.directions')}</Button>}
              {selected?.eligible === false && <Notice error>{selected.consolidationMessage || t('pickup.ineligible')}</Notice>}
              {location.error && <Notice error>{t(location.error)}</Notice>}
              {directionsFailed && <Notice error>{t('pickup.directionsFailed')}</Notice>}
              <Text style={s.small}>{t('pickup.selectionDraft')}</Text>
            </ScrollView>
          </View>
          <View style={{ flexShrink: 0, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.border }}>
            <Button disabled={disabled || !shown || !selected || selected.eligible === false} onPress={close}>{t('pickup.usePoint')}</Button>
          </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>}
  </View>;
}
