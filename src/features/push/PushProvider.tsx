import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState, Linking, Text, View } from 'react-native';
import type { Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLiveAccount } from '@/api/context';
import { useI18n } from '@/i18n/context';
import { useShellNavigation } from '@/navigation/context';
import { Button, Notice, useUi } from '@/ui';
import { clearNativePushToken, getNativePushToken, getPushPermission, initialNativePush, listenNativePush, nativePushAvailable, requestPushPermission } from './native-push';
import { PushDelivery } from './push-delivery';
import type { PushIntent } from './push-intent';
import { createPushRegistration, type PushState } from './push-registration';
import { readPushRecord, savePushRecord } from './push-storage';

type PushContextValue = {
  available: boolean; state: PushState; accountId: string | null; revision: number;
  registration: ReturnType<typeof createPushRegistration>;
  delivery: PushDelivery; view: { banner: PushIntent | null };
};
const PushContext = createContext<PushContextValue | null>(null);

export function PushProvider({ children }: PropsWithChildren) {
  const { ready, authenticated, accountId, authRevision, bindPushDevice } = useLiveAccount();
  const [available] = useState(nativePushAvailable);
  const [registration] = useState(() => createPushRegistration({
    read: readPushRecord, save: savePushRecord, permission: getPushPermission,
    request: requestPushPermission, token: getNativePushToken, clear: clearNativePushToken, bind: bindPushDevice,
  }));
  const state = useSyncExternalStore(registration.subscribe, registration.snapshot, registration.snapshot);
  const [delivery] = useState(() => new PushDelivery(registration.snapshot));
  const view = useSyncExternalStore(delivery.subscribe, delivery.snapshot, delivery.snapshot);
  const initial = useRef<ReturnType<typeof initialNativePush> | null>(null);
  const revision = useRef(authRevision);
  const owner = authenticated ? accountId : null;
  const signedOut = ready && !authenticated;
  useLayoutEffect(() => {
    revision.current = authRevision;
    delivery.setScope({ accountId: owner, revision: authRevision, signedOut });
    if (available) void registration.setSession({ resolved: ready && (!authenticated || !!owner), accountId: owner, revision: authRevision });
  }, [available, ready, authenticated, owner, authRevision, signedOut, delivery, registration]);
  useEffect(() => {
    if (!available) return;
    let mounted = true;
    const initialRevision = revision.current;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = listenNativePush({
        message: delivery.message, opened: delivery.opened,
        token: () => { void registration.refresh(); },
      });
      // iOS consumes its initial response on read. Reuse the same promise if
      // React remounts the effects while the response is in flight.
      initial.current ??= initialNativePush();
      void initial.current.then(message => {
        if (!mounted) return;
        initial.current = Promise.resolve(null);
        if (message && revision.current === initialRevision) delivery.opened(message);
      }).catch(() => {});
    } catch { /* Preview clients without the native module stay usable. */ }
    const listener = AppState.addEventListener('change', status => { if (status === 'active') void registration.refresh(); });
    return () => { mounted = false; unsubscribe?.(); listener.remove(); };
  }, [available, delivery, registration]);
  useEffect(() => {
    if (!registration.snapshot().busy && !registration.snapshot().optedIn && ready && (signedOut || owner)) delivery.clear();
  }, [state.busy, state.optedIn, delivery, signedOut, owner, ready, registration]);
  const value = useMemo(() => ({ available, state, accountId: owner, revision: authRevision, registration, delivery, view }),
    [available, state, owner, authRevision, registration, delivery, view]);
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function PushNavigationBridge({ active }: { active: boolean }) {
  const push = useContext(PushContext);
  const shell = useShellNavigation();
  const { t } = useI18n();
  const { s, colors } = useUi();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!active || !push?.accountId || !push.state.optedIn || !shell) return;
    const owner = push.accountId;
    const current = () => push.delivery.current(owner, push.revision);
    const href = push.delivery.take(owner, push.revision);
    if (href) shell.navigate(href as Href, current);
  }, [active, push, shell]);
  if (!active || !push?.view.banner || !push.accountId || !push.state.optedIn || push.view.banner.accountId !== push.accountId) return null;
  const intent = push.view.banner;
  return <View style={{ position: 'absolute', top: insets.top + 64, alignSelf: 'center', width: '94%', maxWidth: 530, zIndex: 10 }}>
    <View style={[s.card, { backgroundColor: colors.surface }]} accessibilityLiveRegion="polite">
      <Text style={s.heading} numberOfLines={2}>{intent.title}</Text>
      {!!intent.body && <Text style={s.body} numberOfLines={3}>{intent.body}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button onPress={() => { if (push.delivery.current(intent.accountId, push.revision)) push.delivery.open(intent); }}>{t('push.open')}</Button>
        <Button secondary onPress={push.delivery.dismiss}>{t('push.dismiss')}</Button>
      </View>
    </View>
  </View>;
}

export function PushSettings({ accountEnabled }: { accountEnabled?: boolean | null }) {
  const push = useContext(PushContext);
  const { t } = useI18n();
  const { s } = useUi();
  const [settingsFailed, setSettingsFailed] = useState(false);
  if (!push) return null;
  const { state, registration } = push;
  const blocked = state.permission === 'denied';
  const cleanupFailed = state.error === 'push.cleanupFailed';
  const label = !push.available ? 'push.unavailable' : state.busy ? 'push.busy' : cleanupFailed ? 'push.cleanupFailed' : blocked ? 'push.blocked' : state.registered ? 'push.on' : state.error ? state.error : 'push.off';
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.heading}>{t('push.title')}</Text>
    <Text accessibilityLiveRegion="polite" style={s.body}>{t(label)}</Text>
    {accountEnabled === false && <Notice>{t('push.accountOff', { button: t('accountOps.save') })}</Notice>}
    {settingsFailed && <Notice error>{t('live.settings.openError')}</Notice>}
    {push.available && !!push.accountId && <>
      {cleanupFailed && <Button disabled={state.busy} onPress={() => { void registration.disable(); }}>{t('push.retry')}</Button>}
      {blocked && !cleanupFailed && <Button secondary disabled={state.busy} onPress={() => { setSettingsFailed(false); void Linking.openSettings().catch(() => setSettingsFailed(true)); }}>{t('push.settings')}</Button>}
      {!blocked && !cleanupFailed && !state.registered && <Button disabled={state.busy} onPress={() => { void registration.enable(); }}>{t(state.error ? 'push.retry' : 'push.enable')}</Button>}
      {state.optedIn && <Button secondary disabled={state.busy} onPress={() => { void registration.disable(); }}>{t('push.disable')}</Button>}
    </>}
  </View>;
}
