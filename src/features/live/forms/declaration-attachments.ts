import type { StagedFile } from './attachment-selection.ts';

/** A warehouse change can make selected invoices optional customs evidence.
 * Keep the files visible and route new uploads to the appropriate API field.
 * Existing server attachments keep their original identifiers and category. */
export function declarationUploads(requiredInvoice: boolean | null | undefined, invoices: StagedFile[], customsDocuments: StagedFile[]) {
  if (requiredInvoice !== false) return { invoices, customsDocuments };
  const documents = [...customsDocuments];
  for (const file of invoices) if (!documents.some(existing => existing.uri === file.uri)) documents.push(file);
  return { invoices: [], customsDocuments: documents };
}
