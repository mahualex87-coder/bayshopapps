export type OrderDraft = { url: string; name: string; quantity: string };
export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateOrder(draft: OrderDraft): Validation<{ host: string; name: string; quantity: number }> {
  let url: URL;
  try { url = new URL(draft.url.trim()); }
  catch { return { ok: false, error: 'Introdu un link complet, de exemplu https://magazin.com/produs.' }; }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    return { ok: false, error: 'Folosește un link HTTP sau HTTPS fără date de autentificare.' };
  }
  const name = draft.name.trim();
  if (!name || name.length > 100) return { ok: false, error: 'Denumirea trebuie să aibă între 1 și 100 de caractere.' };
  const quantity = Number(draft.quantity);
  if (!/^\d+$/.test(draft.quantity.trim()) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return { ok: false, error: 'Cantitatea trebuie să fie un număr întreg între 1 și 99.' };
  }
  return { ok: true, value: { host: url.hostname, name, quantity } };
}

export function validateWeight(raw: string): Validation<number> {
  const normalized = raw.trim().replace(',', '.');
  const weight = Number(normalized);
  if (!/^\d+(\.\d{1,2})?$/.test(normalized) || !Number.isFinite(weight) || weight <= 0 || weight > 1000) {
    return { ok: false, error: 'Introdu o greutate între 0,01 și 1 000 kg, cu maximum două zecimale.' };
  }
  return { ok: true, value: weight };
}
