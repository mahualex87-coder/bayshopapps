export function preparePdf(bytes: Uint8Array): { uri: string; dispose: () => void } {
  const uri = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
  return { uri, dispose: () => URL.revokeObjectURL(uri) };
}
