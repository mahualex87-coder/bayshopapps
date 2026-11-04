export type AttachmentSource = 'camera' | 'gallery' | 'files';
export type StagedFile = { uri: string; name: string; mimeType: string; size?: number };
export type PickedFile = { uri: string; name: string; mimeType?: string; size?: number };
export type AttachmentLimits = { allowPdf: boolean; maxBytes: number | null; maxFiles: number | null; multiple: boolean };
export class AttachmentSelectionError extends Error {
  readonly key: string;
  constructor(key: string) { super(key); this.key = key; }
}
const mimeTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };

/** All sources use the same validation. A rejected batch never partially replaces the current selection. */
export function validatePickedFiles(assets: PickedFile[], limits: AttachmentLimits): StagedFile[] {
  return assets.map(asset => {
    const extension = asset.name.split('.').pop()?.toLowerCase() as keyof typeof mimeTypes;
    const inferred = mimeTypes[extension];
    const supplied = asset.mimeType === 'image/jpg' ? 'image/jpeg' : asset.mimeType;
    const mimeType = !supplied || supplied === 'application/octet-stream' ? inferred : supplied;
    if (!inferred || !mimeType || inferred !== mimeType || !['image/jpeg', 'image/png', ...(limits.allowPdf ? ['application/pdf'] : [])].includes(mimeType) || /[\\/\r\n\u0000]/.test(asset.name)) {
      throw new AttachmentSelectionError(limits.allowPdf ? 'attachment.invalidType' : 'attachment.invalidImageType');
    }
    if (asset.size !== undefined && (!Number.isSafeInteger(asset.size) || asset.size < 0) || limits.maxBytes !== null && asset.size === undefined) throw new AttachmentSelectionError('attachment.sizeUnknown');
    if (asset.size === 0) throw new AttachmentSelectionError('attachment.emptyFile');
    if (limits.maxBytes !== null && asset.size !== undefined && asset.size > limits.maxBytes) throw new AttachmentSelectionError('attachment.tooLarge');
    return { ...asset, mimeType };
  });
}

export function mergePickedFiles(chosen: StagedFile[], staged: StagedFile[], existingCount: number, limits: AttachmentLimits): StagedFile[] {
  if (!limits.multiple && chosen.length > 1) throw new AttachmentSelectionError('attachment.tooMany');
  const files = limits.multiple ? [...staged] : [];
  for (const file of chosen) if (!files.some(value => value.uri === file.uri)) files.push(file);
  if (limits.maxFiles !== null && existingCount + files.length > limits.maxFiles) throw new AttachmentSelectionError('attachment.tooMany');
  return files;
}
