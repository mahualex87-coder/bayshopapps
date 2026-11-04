import { useLayoutEffect, useRef } from 'react';
import { useLiveAccount } from '@/api/context';
import { clearAndroidGoogleCredentialState } from './android-google-auth';

/** Cleanup only. No module initialization, profile transfer, or provider UI on startup. */
export function GoogleCredentialSessionBoundary() {
  const { authenticated, authRevision, accountId } = useLiveAccount();
  const previous = useRef({ authenticated, authRevision, accountId });
  useLayoutEffect(() => {
    const old = previous.current;
    const force = old.authenticated && (!authenticated || old.authRevision !== authRevision || !!old.accountId && !!accountId && old.accountId !== accountId);
    previous.current = { authenticated, authRevision, accountId };
    void clearAndroidGoogleCredentialState(force);
  }, [authenticated, authRevision, accountId]);
  useLayoutEffect(() => () => { void clearAndroidGoogleCredentialState(); }, []);
  return null;
}
