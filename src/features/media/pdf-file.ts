import { File, Paths } from 'expo-file-system';
export function preparePdf(bytes: Uint8Array): { uri: string; dispose: () => void } {
  const file = new File(Paths.cache, `bayshop-view-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  file.write(bytes);
  return { uri: file.uri, dispose: () => { try { if (file.exists) file.delete(); } catch { /* OS may already have cleared its temporary cache. */ } } };
}
