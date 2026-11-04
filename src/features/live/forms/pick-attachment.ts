import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { AttachmentSelectionError, type AttachmentSource, type AttachmentLimits, type PickedFile } from './attachment-selection';

/** Local selection only: neither opening a picker nor converting a photo uploads it. */
export async function pickAttachment(source: AttachmentSource, limits: AttachmentLimits, remaining: number | null, canContinue: () => boolean = () => true): Promise<PickedFile[] | null> {
  if (source === 'files') {
    const result = await DocumentPicker.getDocumentAsync({ type: limits.allowPdf ? ['image/jpeg', 'image/png', 'application/pdf'] : ['image/jpeg', 'image/png'], copyToCacheDirectory: true, multiple: limits.multiple });
    if (result.canceled) return null;
    return result.assets.map(asset => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size ?? (Platform.OS !== 'web' ? new File(asset.uri).size : undefined) }));
  }
  // The system photo picker grants access only to selected images, without broad library permission.
  if (source === 'camera' && Platform.OS !== 'web') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!canContinue()) return null;
    if (!permission.granted) throw new AttachmentSelectionError(permission.canAskAgain ? 'attachment.cameraPermission' : 'attachment.cameraSettings');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false, base64: false };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: limits.multiple, selectionLimit: limits.multiple ? remaining ?? 0 : 1, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible });
  if (result.canceled || !canContinue()) return null;
  const files: PickedFile[] = [];
  for (const asset of result.assets) {
    if (!canContinue()) return null;
    if (asset.type && asset.type !== 'image') throw new AttachmentSelectionError('attachment.invalidImageType');
    let uri = asset.uri;
    let mimeType = asset.mimeType === 'image/jpg' ? 'image/jpeg' : asset.mimeType;
    let size = asset.fileSize ?? asset.file?.size;
    // iPhone can return HEIC even when compatibility is preferred. Re-encode locally;
    // renaming a HEIC file to .jpg would fail the server's image validation.
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
      const context = ImageManipulator.manipulate(uri);
      try {
        const image = await context.renderAsync();
        try { uri = (await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 })).uri; }
        finally { image.release(); }
      } finally { context.release(); }
      mimeType = 'image/jpeg';
      size = undefined;
    }
    if (Platform.OS !== 'web') size = new File(uri).size;
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    const basename = (asset.fileName || `photo-${Date.now()}-${files.length + 1}`).replace(/\.[^.]*$/, '').replace(/[\\/\r\n\u0000]/g, '_');
    files.push({ uri, name: `${basename || 'photo'}.${extension}`, mimeType, size });
  }
  return files;
}
