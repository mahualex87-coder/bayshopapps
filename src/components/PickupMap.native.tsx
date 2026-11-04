import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Constants from 'expo-constants';
import { useI18n } from '@/i18n/context';
import { useTheme } from '@/theme/context';
import { useVisualPreferences } from '@/navigation/accessibility';
import { Notice } from '@/ui';
import { pickupCameraTarget, pickupCoordinates, pickupLocationScope, type PickupCameraTarget } from '@/domain/pickup-points';
import type { PickupMapProps } from './pickup-map-types';

export function PickupMap({ points, selectedId, userLocation, recenterKey = 0, disabled, height = 280, fill = false, onSelect }: PickupMapProps) {
  const { t } = useI18n(); const { colors, scheme } = useTheme();
  const { reduceMotion } = useVisualPreferences();
  const map = useRef<MapView>(null); const [ready, setReady] = useState(false);
  const camera = useRef({ scope: '', recenterKey: 0, movedByUser: false });
  const enabled = Constants.expoConfig?.extra?.googleMaps?.[Platform.OS] === true;
  const mappedPoints = points.filter(point => point.coordinates && pickupCoordinates(point.coordinates.latitude, point.coordinates.longitude));
  const scope = pickupLocationScope(points);
  const target = pickupCameraTarget(points, selectedId, userLocation);
  const regionKey = JSON.stringify(target);
  useEffect(() => {
    if (!ready) return;
    const explicit = camera.current.recenterKey !== recenterKey || camera.current.scope !== scope;
    camera.current.recenterKey = recenterKey; camera.current.scope = scope;
    if (camera.current.movedByUser && !explicit) return;
    if (explicit) camera.current.movedByUser = false;
    const next = JSON.parse(regionKey) as PickupCameraTarget;
    if (next?.kind === 'region') map.current?.animateToRegion({ ...next.center, latitudeDelta: next.delta, longitudeDelta: next.delta }, reduceMotion ? 0 : 350);
    else if (next?.kind === 'fit') map.current?.fitToCoordinates(next.coordinates, { edgePadding: { top: 65, bottom: 65, left: 55, right: 55 }, animated: !reduceMotion });
  }, [ready, regionKey, reduceMotion, recenterKey, scope, height, fill]);
  if (!enabled) return <Notice>{t('pickup.mapUnavailable')}</Notice>;
  if (!mappedPoints.length || !target) return <Notice>{t('pickup.noCoordinates')}</Notice>;
  const initialCenter = target.kind === 'region' ? target.center : target.coordinates[0];
  return <View style={{ height: fill ? undefined : height, flex: fill ? 1 : undefined, minHeight: 0, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
    <MapView ref={map} provider={PROVIDER_GOOGLE} userInterfaceStyle={scheme} style={{ flex: 1 }} onMapReady={() => setReady(true)} initialRegion={{ ...initialCenter, latitudeDelta: 0.05, longitudeDelta: 0.05 }} onPanDrag={() => { camera.current.movedByUser = true; }} onRegionChangeComplete={(_, details) => { if (details.isGesture) camera.current.movedByUser = true; }} showsUserLocation={false} showsMyLocationButton={false} showsCompass toolbarEnabled={false} accessibilityLabel={t('pickup.mapLabel')}>
      {mappedPoints.map(point => <Marker key={point.id} identifier={point.id} coordinate={point.coordinates!} title={point.address} description={[point.priceLabel, point.consolidationMessage || (point.allowConsolidation === false ? t('deliveryChange.noConsolidation') : null)].filter(Boolean).join('\n') || undefined} pinColor={point.eligible === false ? colors.muted : point.id === selectedId ? colors.accent : colors.text} onPress={() => { if (!disabled) onSelect(point.id); }} />)}
      {userLocation && <Marker key="device-location" identifier="device-location" coordinate={userLocation} title={t('pickup.yourLocation')} anchor={{ x: 0.5, y: 0.5 }} zIndex={1000}>
        <View accessibilityLabel={t('pickup.yourLocation')} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#4285F433', alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#4285F4' }} /></View>
      </Marker>}
    </MapView>
  </View>;
}
