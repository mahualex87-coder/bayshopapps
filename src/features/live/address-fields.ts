type AddressFieldLabel = { label: string; labelKey?: string };
const emailLabels = new Set(['email', 'e mail', 'email address', 'e mail address', 'contact email', 'email de contact', 'e mail de contact', 'adresă de email', 'adresa de email', 'adresă de e mail', 'adresa de e mail', 'электронная почта', 'адрес электронной почты']);
const patronymicLabels = new Set(['patronimic', 'patronimic / al doilea prenume', 'al doilea prenume', 'middle name', 'middle name / patronymic', 'patronymic', 'second name', 'shipping middle name', 'отчество', 'отчество / второе имя', 'второе имя']);
const hiddenKeys = new Set(['field.email', 'field.middleName', 'field.patronymic', 'field.secondName', 'recipientDetails.middleName', 'shipping_middle_name', 'middleName', 'patronymic', 'secondName']);

/** The postal address view and its clipboard text share the same fields.
 * Filter hidden fields by meaning, without rewriting names or postal values. */
export function postalAddressFields<T extends AddressFieldLabel>(fields: readonly T[]): T[] {
  return fields.filter(field => {
    const label = field.label.trim().toLowerCase().replace(/[:：]$/, '').trim().replace(/[\s_-]+/g, ' ');
    return !hiddenKeys.has(field.labelKey || '') && !emailLabels.has(label) && !patronymicLabels.has(label);
  });
}
