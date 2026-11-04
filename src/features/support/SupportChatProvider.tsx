import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { router, usePathname } from 'expo-router';
import { Keyboard, Modal, Text, View } from 'react-native';
import { useLiveAccount } from '@/api/context';
import { ApiError, errorMessage } from '@/api/client';
import { useI18n } from '@/i18n/context';
import { useTheme } from '@/theme/context';
import { Button, useUi } from '@/ui';
import { nativeSupportAvailable, openNativeSupport } from './native-support';

type SupportChat = { open: () => Promise<void>; busy: boolean; disabled: boolean; block: () => () => void };
const SupportChatContext = createContext<SupportChat | null>(null);

/** One launcher for every help entry point. Opening the native overlay leaves
 * the current screen, invoice selection and unsaved form untouched. */
export function SupportChatProvider({ children }: PropsWithChildren) {
  const { authenticated, accountId, authRevision, resources, readView } = useLiveAccount();
  const { t } = useI18n(); const { mode } = useTheme(); const { s, colors } = useUi();
  const pathname = usePathname();
  const uid = resources.profile.data?.clientCode || null;
  const scope = JSON.stringify([authenticated, accountId, authRevision, uid, pathname]);
  const latest = useRef(scope); const mounted = useRef(true);
  const active = useRef<AbortController | null>(null);
  const blockers = useRef(new Set<symbol>());
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ scope: string; key: string } | null>(null);
  useLayoutEffect(() => {
    latest.current = scope;
    return () => { active.current?.abort(); };
  }, [scope]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort(); }; }, []);

  const open = useCallback(async () => {
    // Guard before fetching identity, including simultaneous presses from
    // different buttons. Never initialize Intercom at application startup.
    if (active.current || blockers.current.size || !mounted.current || latest.current !== scope) return;
    Keyboard.dismiss();
    if (!authenticated) { router.push('/login'); return; }
    const fail = (key: string) => setFailure({ scope, key });
    if (!nativeSupportAvailable()) { fail('supportChat.error.not_configured'); return; }
    if (!uid) { fail('supportChat.error.identity_unavailable'); return; }
    const controller = new AbortController(); active.current = controller;
    const isCurrent = () => mounted.current && !controller.signal.aborted && latest.current === scope;
    setBusy(true); setFailure(null);
    try {
      // The signed identity is never persisted, logged or placed in route params.
      const identity = await readView({ kind: 'support.identity' }, { signal: controller.signal });
      if (!isCurrent()) return;
      const result = await openNativeSupport(identity, { expectedUserId: uid, isCurrent, theme: mode, signal: controller.signal });
      if (isCurrent() && !result.ok) fail(`supportChat.error.${result.error}`);
    } catch (cause) {
      if (isCurrent()) fail(cause instanceof ApiError && (cause.key === 'support.identityUnavailable' || cause.status === 404 || cause.status === 503) ? 'supportChat.error.identity_unavailable' : errorMessage(cause));
    } finally {
      if (active.current === controller) { active.current = null; if (mounted.current) setBusy(false); }
    }
  }, [authenticated, uid, scope, readView, mode]);
  const block = useCallback(() => {
    const id = Symbol(); blockers.current.add(id); setBlocked(true);
    active.current?.abort();
    return () => { blockers.current.delete(id); setBlocked(blockers.current.size > 0); };
  }, []);
  const value = useMemo(() => ({ open, busy, disabled: busy || blocked, block }), [open, busy, blocked, block]);
  const error = failure?.scope === scope ? failure.key : null;
  const dismissError = () => setFailure(null);
  return <SupportChatContext.Provider value={value}>
    {children}
    <Modal visible={!!error} transparent animationType="none" onRequestClose={dismissError}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View accessibilityViewIsModal role="alertdialog" aria-modal accessibilityLabel={t('supportChat.title')} style={[s.card, { width: '100%', maxWidth: 380 }]}>
          <Text accessibilityRole="header" style={s.heading}>{t('supportChat.title')}</Text>
          <Text style={s.body}>{error ? t(error) : ''}</Text>
          <Button secondary onPress={dismissError}>{t('supportChat.close')}</Button>
        </View>
      </View>
    </Modal>
  </SupportChatContext.Provider>;
}

export function useSupportChat(): SupportChat {
  const value = useContext(SupportChatContext);
  if (!value) throw new Error('useSupportChat requires SupportChatProvider');
  return value;
}

/** Checkout already owns a native payment sheet; support must not cover it. */
export function useBlockSupportChat(blocked: boolean) {
  const { block } = useSupportChat();
  useLayoutEffect(() => { if (blocked) return block(); }, [blocked, block]);
}
