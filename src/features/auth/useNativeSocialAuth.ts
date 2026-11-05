import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, usePreventRemove } from 'expo-router';
import { AppState, BackHandler, Platform } from 'react-native';
import { fetch } from 'expo/fetch';
import { createNativeSocialAuth, type SocialAuthData, type SocialCapabilities, type SocialPending, type SocialProfile, type SocialProvider, type SocialResult } from '@/api/native-social-auth';
import { useLiveAccount } from '@/api/context';
import { useI18n } from '@/i18n/context';
import { usePageLoad } from '@/navigation/PageLoading';
import { availableSocialProviders, getSocialIdentity } from './social-provider';
import { socialErrorKey, socialProfileErrors } from './social-completion';

/** Challenge, proof and completion tokens never leave this screen's memory. */
export function useNativeSocialAuth(enabled: boolean) {
  const { language } = useI18n(); const { authRevision, adoptSocialSession } = useLiveAccount();
  const [capabilities, setCapabilities] = useState<SocialCapabilities | null>(null);
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(enabled && (Platform.OS === 'ios' || Platform.OS === 'android'));
  usePageLoad(enabled && (Platform.OS === 'ios' || Platform.OS === 'android') && checkingAvailability);
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const [pending, setPending] = useState<SocialPending | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null); const client = useRef<ReturnType<typeof createNativeSocialAuth> | null>(null);
  const flowRevision = useRef<number | null>(null); const mounted = useRef(true);
  const releaseNavigation = usePreventRemove(busy);
  const reset = useCallback(() => {
    active.current?.abort(); active.current = null; client.current = null; flowRevision.current = null;
    if (mounted.current) { setPending(null); setBusy(false); }
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; reset(); }; }, [reset]);
  useFocusEffect(useCallback(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => active.current !== null);
    return () => { back.remove(); reset(); };
  }, [reset]));
  useEffect(() => {
    if (flowRevision.current !== null && flowRevision.current !== authRevision) reset();
  }, [authRevision, reset]);
  useEffect(() => {
    const aborter = new AbortController();
    if (!enabled || Platform.OS !== 'ios' && Platform.OS !== 'android') return () => aborter.abort();
    const publicClient = createNativeSocialAuth(fetch, Platform.OS);
    void publicClient.capabilities(language, aborter.signal).then(async result => {
      if (aborter.signal.aborted) return;
      if (result.outcome !== 'success') { setUnavailable(true); return; }
      const available = await availableSocialProviders(result.data);
      if (!aborter.signal.aborted) { setCapabilities(result.data); setProviders(available); setUnavailable(available.length === 0); }
    }).catch(() => { if (!aborter.signal.aborted) setUnavailable(true); }).finally(() => {
      if (!aborter.signal.aborted) setCheckingAvailability(false);
    });
    return () => aborter.abort();
  }, [enabled, language, availabilityRevision]);
  useEffect(() => {
    if (!pending) return;
    const expire = () => {
      if (Date.parse(pending.expiresAt) <= Date.now() && !active.current) { reset(); setError('socialAuth.error.flow_expired'); }
    };
    const timer = setTimeout(expire, Math.max(0, Date.parse(pending.expiresAt) - Date.now()) + 50);
    const app = AppState.addEventListener('change', state => { if (state === 'active') expire(); });
    return () => { clearTimeout(timer); app.remove(); };
  }, [pending, reset]);
  const refreshProviders = () => {
    setCapabilities(null); setProviders([]); setUnavailable(false); setCheckingAvailability(true);
    setAvailabilityRevision(value => value + 1);
  };
  const receive = async (result: SocialResult<SocialAuthData>, controller: AbortController) => {
    if (!mounted.current || controller.signal.aborted || active.current !== controller) return;
    if (result.outcome !== 'success') {
      setError(socialErrorKey(result.errorCode));
      if (result.outcome === 'unknown' || ['flow_expired', 'account_changed', 'account_link_required', 'provider_unavailable'].includes(result.errorCode)) { setPending(null); client.current = null; }
      if (result.errorCode === 'provider_unavailable') refreshProviders();
      return;
    }
    if (result.data.status === 'completion_required') { setPending(result.data); return; }
    const revision = flowRevision.current;
    if (revision === null) return;
    // The service advances authRevision for this very adoption. Do not abort
    // our own result; the captured revision still rejects an external logout.
    flowRevision.current = null;
    setPending(null); client.current = null;
    // Successful authentication may remove this public route immediately.
    releaseNavigation(); setBusy(false);
    const adopted = await adoptSocialSession(result.data.session, revision);
    if (mounted.current && !controller.signal.aborted && !adopted.ok) setError(adopted.error || 'socialAuth.error.request_failed');
  };
  const finish = (controller: AbortController) => { if (active.current === controller) { active.current = null; if (mounted.current) setBusy(false); } };
  const start = async (provider: SocialProvider) => {
    if (!enabled || active.current || pending || !capabilities || !providers.includes(provider) || Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    const controller = new AbortController(); active.current = controller; flowRevision.current = authRevision;
    const attempt = createNativeSocialAuth(fetch, Platform.OS); client.current = attempt;
    setBusy(true); setError(null);
    try {
      const challenge = await attempt.challenge(provider, language, controller.signal);
      if (controller.signal.aborted) return;
      if (challenge.outcome !== 'success') {
        setError(socialErrorKey(challenge.errorCode));
        client.current = null;
        if (challenge.errorCode === 'provider_unavailable') refreshProviders();
        return;
      }
      const identity = await getSocialIdentity(provider, challenge.data, capabilities, controller.signal);
      if (controller.signal.aborted || identity.status === 'cancelled') { client.current = null; return; }
      if (identity.status === 'error') { setError(socialErrorKey(identity.errorCode)); client.current = null; return; }
      await receive(await attempt.verify(challenge.data, identity.proof, language, controller.signal), controller);
    } catch { if (!controller.signal.aborted) { client.current = null; setError('socialAuth.error.request_failed'); } }
    finally { finish(controller); }
  };
  const complete = async (profile: SocialProfile, accepted: boolean) => {
    if (active.current || !pending || !client.current || !enabled) return;
    const validation = socialProfileErrors(pending, profile, accepted);
    if (Object.keys(validation).length) { setError(validation.session || 'socialAuth.error.incomplete_profile'); return; }
    const controller = new AbortController(); active.current = controller; setBusy(true); setError(null);
    try { await receive(await client.current.complete(pending, profile, accepted, language, controller.signal), controller); }
    catch { if (!controller.signal.aborted) { setPending(null); client.current = null; setError('socialAuth.error.request_unknown'); } }
    finally { finish(controller); }
  };
  // This retries only the anonymous GET. It never restarts an identity flow,
  // exchanges provider credentials or creates an account.
  const retryAvailability = () => {
    if (enabled && !checkingAvailability && !active.current && !pending) refreshProviders();
  };
  return { unavailable: enabled && unavailable, checkingAvailability: enabled && checkingAvailability, retryAvailability,
    providers: enabled ? providers : [], pending, busy, error, start, complete, cancel: () => { reset(); setError(null); } };
}
