import { useEffect } from 'react';
import type { ZaraPageProps } from './zara-page-types';
// Cross-origin merchant pages cannot be inspected by the web app.
export function ZaraPage({ onFailure }: ZaraPageProps) {
  useEffect(() => { onFailure(); }, [onFailure]);
  return null;
}
