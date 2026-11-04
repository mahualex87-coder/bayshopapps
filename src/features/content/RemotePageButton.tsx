import { useState } from 'react';
import { Button } from '@/ui';
import { InternalContentViewer } from './InternalContentViewer';

/** HTML carrier/product pages are not PDF/image attachments. */
export function RemotePageButton({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false);
  return <><Button secondary onPress={() => setOpen(true)}>{label}</Button>{open && <InternalContentViewer kind="public-page" url={url} title={label} onClose={() => setOpen(false)} />}</>;
}
