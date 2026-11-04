/** Backend source at 175a0469f4ddd9252f0e3980c613f3932b47f945:
 * PackageDeclarationController checks raw status=processing; public status is
 * getStatus()/currentStatus and may instead report awaiting-invoice or a hold.
 * Rows/WpPackage.php:6300-6483 defines the derived statuses below. Ambiguous
 * states must still ask the endpoint; a display label cannot grant permission.
 * https://bitbucket.org/bayshop/bayshop/src/175a0469f4ddd9252f0e3980c613f3932b47f945/application/modules/api/controllers/MF/v2/PackageDeclarationController.php
 */
const processing = new Set(['processing', 'processing-storage', 'awaiting-invoice', 'order-invoice']);
const notProcessing = new Set([
  'package-exceeded', 'hold-by-user', 'unheld-by-user', 'packed', 'in-pallet', 'awaiting', 'ready-to-send',
  'disposed-by-user', 'disposed', 'archived', 'sent', 'sent-storage', 'sent-transit', 'customs-held',
  'local-depo', 'transit-depo', 'taken-to-delivery', 'ready-to-pickup', 'from-customs-to-depo', 'dept', 'dept-storage', 'received',
]);

export function shipmentDocumentAccess(status: string | null, boxCount: number) {
  const declaration = status !== null && processing.has(status) ? 'available' : status !== null && notProcessing.has(status) ? 'unavailable' : 'check';
  return {
    declaration,
    // PackageInvoiceController calls isStatus(), which compares currentStatus.
    invoice: status === 'awaiting-invoice',
    // POST requires exactly one box even when its GET can return a declaration.
    singleBox: Number.isSafeInteger(boxCount) && boxCount === 1,
  } as const;
}
