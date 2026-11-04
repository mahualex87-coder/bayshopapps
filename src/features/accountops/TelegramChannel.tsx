import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import * as Linking from 'expo-linking';
import { useLiveAccount } from '@/api/context';
import { preferencesData, type Preferences } from '@/api/account-operations';
import { openTelegramBot } from '@/api/telegram-link';
import { useI18n } from '@/i18n/context';
import { Button, useUi } from '@/ui';

/** Opening the bot is only a handoff. The existing bot verifies the shared phone;
 * the member API is the only source for confirmation on return. */
export function TelegramChannel({ linked, disabled, onVerified }: {
  linked: boolean; disabled: boolean; onVerified: (preferences: Preferences) => void;
}) {
  const { s } = useUi(); const { t } = useI18n(); const { readView } = useLiveAccount();
  const focused = useIsFocused();
  const [opening, setOpening] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const active = useRef(true);
  const foreground = useRef(AppState.currentState === 'active');
  const focus = useRef(focused);
  const waiting = useRef(false);
  const launching = useRef(false);
  const refreshing = useRef<AbortController | null>(null);
  const openRequest = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onVerified);
  useLayoutEffect(() => { latest.current = onVerified; }, [onVerified]);
  const stopCheck = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; refreshing.current?.abort(); refreshing.current = null;
  }, []);
  const check = useCallback(async function check(attempt = 0) {
    if (!active.current || !focus.current || !foreground.current || refreshing.current) return;
    const controller = new AbortController(); refreshing.current = controller;
    try {
      const data = preferencesData(await readView({ kind: 'preferences.read' }, { signal: controller.signal }));
      if (!active.current || controller.signal.aborted) return;
      latest.current(data);
      if (data.hasTelegram) { waiting.current = false; setPending(false); setMessage(null); }
      else if (waiting.current) setMessage('telegram.waiting');
    } catch {
      if (active.current && !controller.signal.aborted && waiting.current) setMessage('telegram.checkError');
    } finally { if (refreshing.current === controller) refreshing.current = null; }
    if (!controller.signal.aborted && active.current && waiting.current && attempt < 3) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { timer.current = null; void check(attempt + 1); }, [1500, 3500, 8000][attempt]);
    }
  }, [readView]);
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; waiting.current = false; stopCheck(); openRequest.current?.abort(); };
  }, [stopCheck]);
  useEffect(() => {
    const previous = focus.current; focus.current = focused;
    if (!focused) { stopCheck(); openRequest.current?.abort(); }
    else if (!previous) void check();
    const sub = AppState.addEventListener('change', state => {
      const wasActive = foreground.current; foreground.current = state === 'active';
      if (!foreground.current) stopCheck();
      else if (!wasActive && focus.current) void check();
    });
    return () => sub.remove();
  }, [focused, check, stopCheck]);
  const open = async () => {
    if (disabled || launching.current || !focus.current) return;
    launching.current = true; setOpening(true); setMessage(null); stopCheck();
    const controller = new AbortController(); openRequest.current = controller;
    const current = () => active.current && focus.current && !controller.signal.aborted;
    try {
      const data = preferencesData(await readView({ kind: 'preferences.read' }, { signal: controller.signal }));
      if (!current() || !foreground.current) return;
      latest.current(data);
      if (!data.telegramBotLink) { setMessage('telegram.unavailable'); return; }
      waiting.current = true; setPending(true);
      await openTelegramBot(data.telegramBotLink, Linking.openURL, () => current() && foreground.current);
      if (current()) void check();
    } catch {
      if (current()) { waiting.current = false; setPending(false); setMessage('telegram.openError'); }
    } finally { launching.current = false; openRequest.current = null; if (active.current) setOpening(false); }
  };
  return <View style={{ gap: 7, paddingBottom: 8 }}>
    <Text style={s.small}>{t(linked ? 'telegram.linked' : 'telegram.instructions')}</Text>
    {message && <Text accessibilityLiveRegion="polite" style={s.small}>{t(message)}</Text>}
    <Button secondary disabled={disabled || opening} onPress={() => { void open(); }}>{t(opening ? 'telegram.opening' : linked ? 'telegram.reconnect' : 'accountOps.telegramConnect')}</Button>
    {pending && !linked && <Button secondary disabled={disabled || opening} onPress={() => { stopCheck(); void check(); }}>{t('telegram.check')}</Button>}
  </View>;
}
