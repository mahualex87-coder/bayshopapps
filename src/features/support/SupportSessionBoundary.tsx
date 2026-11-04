import { useLayoutEffect } from 'react';
import { useLiveAccount } from '@/api/context';
import { clearNativeSupport } from './native-support';

/** Cleanup only: never initializes Intercom or reads/uploads a customer. */
export function SupportSessionBoundary() {
  const { authenticated, authRevision, resources } = useLiveAccount();
  const uid = resources.profile.data?.clientCode;
  useLayoutEffect(() => {
    void clearNativeSupport();
    return () => { void clearNativeSupport(); };
  }, [authenticated, authRevision, uid]);
  return null;
}
