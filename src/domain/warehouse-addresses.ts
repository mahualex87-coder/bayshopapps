export type WarehouseIdentity = { name: string; clientCode: string };
export type AddressField = { label: string; value: string; complete: boolean; personal: boolean };
type WarehouseAddress = { city: string; region: string; postalCode: string; country: string; phone: string; name: string; line1: string; line2?: string; company?: string; surcharge?: string };

// Transcribed from the authenticated BayShop warehouse-address dialog on
// 2026-11-01. Personal account data is intentionally represented by placeholders.
export const ADDRESS_SOURCE = 'https://bayshop.com/storage/';
export const ADDRESS_VERIFIED_AT = '1 noiembrie 2026';
export const WAREHOUSE_ADDRESSES: Record<string, WarehouseAddress> = {
  US: { name: '{name}', line1: '320 Markus Ct', line2: 'UNIT 200 {clientCode}', city: 'Newark', region: 'Delaware', postalCode: '19713', country: 'USA', phone: '336-652-2163' },
  RO: { name: '{name} AIRPOSTSRL', line1: 'STUPINELOR 33A C5 {clientCode}', city: 'Tomesti', region: 'Iasi', postalCode: '707515', country: 'Romania', phone: '+40724091615' },
  GB: { name: '{name} {clientCode}', line1: 'Norton Field Farm Unit 5', line2: 'Vadalex Express LTD', city: 'Ingatestone', region: 'Essex', postalCode: 'CM4 0LN', country: 'United Kingdom', phone: '+447521271421' },
  IT: { name: '{name}', line1: 'Via Agri 19', line2: '{clientCode}', city: 'Roma', region: 'Roma', postalCode: '00198', country: 'Italy', phone: '+393518286582' },
  DE: { name: 'SUPERGLOBAL {name}', line1: 'AM KLINIKUM 7, HALLE 843 {clientCode}', city: 'Gorlitz', region: 'Saxony', postalCode: '02828', country: 'Germany', phone: '+49 157 552 537 52' },
  PL: { name: '{name}', company: 'SuperGlobal Sp. z o.o.', line1: 'UL.OKOPOWA 6 {clientCode}', city: 'Jelenia Gora', region: 'Lower Silesian', postalCode: '58-500', country: 'Poland', phone: '+48 577 888 568' },
};
export const US_PRIVATE_ADDRESS: WarehouseAddress = { name: '{name}', line1: '1913 E Zabenko DR', line2: 'ST {clientCode}', city: 'Wilmington', region: 'Delaware', postalCode: '19808', country: 'USA', phone: '336-652-2163', surcharge: 'Adresa privată: +20 USD pentru fiecare colet, conform cabinetului BayShop.' };

export function normalizeWarehouseIdentity(identity: WarehouseIdentity): WarehouseIdentity {
  return { name: identity.name.trim().replace(/\s+/g, ' ').toUpperCase(), clientCode: identity.clientCode.trim().toUpperCase() };
}
export function validWarehouseIdentity(identity: WarehouseIdentity): boolean {
  return identity.name.length >= 2 && identity.name.length <= 100 && /^[A-Z0-9-]{3,24}$/.test(identity.clientCode);
}
export function warehouseAddressFields(countryId: string, privateAddress: boolean, identity: WarehouseIdentity) {
  const data = countryId === 'US' && privateAddress ? US_PRIVATE_ADDRESS : WAREHOUSE_ADDRESSES[countryId];
  if (!data) throw new Error('Depozit necunoscut.');
  const normalized = normalizeWarehouseIdentity(identity);
  const templates: [string, string | undefined][] = [
    ['Nume / Prenume', data.name], ['Companie', data.company], ['Adresa, linia 1', data.line1], ['Adresa, linia 2', data.line2],
    ['Oraș / City', data.city], ['Regiune / State', data.region], ['Cod poștal / ZIP', data.postalCode], ['Țară / Country', data.country], ['Telefon / Phone', data.phone],
  ];
  const fields: AddressField[] = templates.filter((entry): entry is [string, string] => entry[1] !== undefined).map(([label, template]) => ({
    label,
    value: template.replaceAll('{name}', normalized.name || '[numele tău]').replaceAll('{clientCode}', normalized.clientCode || '[cod client]'),
    complete: (!template.includes('{name}') || normalized.name.length >= 2) && (!template.includes('{clientCode}') || /^[A-Z0-9-]{3,24}$/.test(normalized.clientCode)),
    personal: template.includes('{name}') || template.includes('{clientCode}'),
  }));
  return { fields, city: data.city, surcharge: data.surcharge, complete: fields.every(field => field.complete) };
}
