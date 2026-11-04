import { Text, View } from 'react-native';
import type { Attachment } from '@/api/operations-normalize';
import { useI18n } from '@/i18n/context';
import { useUi } from '@/ui';
import { AttachmentsEditor } from './forms/AttachmentsEditor';

export function ParcelDocuments({ invoices, customsDocuments, requireInvoiceUpload }: { invoices: Attachment[]; customsDocuments: Attachment[]; requireInvoiceUpload?: boolean | null }) {
  const { t } = useI18n(); const { s } = useUi();
  return <View style={{ gap: 8 }}>
    {invoices.length ? <AttachmentsEditor title={t(requireInvoiceUpload === false ? 'parcelForm.existingDocuments' : 'parcelForm.invoices')} existing={invoices} staged={[]} onStagedChange={() => {}} readOnly /> : requireInvoiceUpload === true && <Text style={s.small}>{t('parcelSections.noInvoices')}</Text>}
    {customsDocuments.length ? <AttachmentsEditor title={t('parcelForm.customsDocuments')} existing={customsDocuments} staged={[]} onStagedChange={() => {}} readOnly /> : <Text style={s.small}>{t('parcelSections.noCustomsDocuments')}</Text>}
  </View>;
}
