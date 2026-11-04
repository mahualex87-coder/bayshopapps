import type { ActionResult, Address, CartItem, Currency, DeclarationItem, DemoAction, DemoState, RegistrationInput, Shipment, WarehouseItem } from './contracts';

const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'RON'];
const WAREHOUSE_IDS = ['US', 'RO', 'GB', 'IT', 'DE', 'PL'];
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const text = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const positive = (n: number) => Number.isFinite(n) && n > 0 && n <= 100000;
const validMoney = (n: number) => positive(n) && Math.abs(round(n) - n) < 0.0000001;
const urlValid = (s: string) => { try { return ['https:', 'http:'].includes(new URL(s).protocol); } catch { return false; } };
const emailValid = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const phoneValid = (s: string) => /^\+?[\d ()-]{7,22}$/.test(s) && s.replace(/\D/g, '').length >= 7;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const declarationValid = (items: DeclarationItem[]) => Array.isArray(items) && items.length > 0 && items.every(i => text(i.id) && text(i.name) && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 100 && validMoney(i.unitPrice) && (!i.url || urlValid(i.url))) && new Set(items.map(i => i.id)).size === items.length;
const addressValid = (a: Omit<Address, 'id' | 'archived' | 'used'>) => [a.firstName, a.lastName, a.country, a.region, a.city, a.street, a.postalCode].every(text) && phoneValid(a.phone) && (!a.isCompany || text(a.company));
const cartValid = (i: Omit<CartItem, 'id'>) => text(i.name) && text(i.country) && urlValid(i.url) && validMoney(i.unitPrice) && Number.isFinite(i.localShipping) && i.localShipping >= 0 && i.localShipping <= 100000 && round(i.localShipping) === i.localShipping && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 100;

/** Fictional USD quote: product quantities + one local delivery charge per line + $3 inspection per line. */
export const cartTotal = (items: CartItem[]) => round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity + item.localShipping + (item.inspection ? 3 : 0), 0));
export function shipmentQuote(items: WarehouseItem[], services: string[]): { weightKg: number; volumetricKg: number; costs: Shipment['costs'] };
export function shipmentQuote(weightKg: number, serviceCount: number): { weightKg: number; volumetricKg: number; costs: Shipment['costs'] };
export function shipmentQuote(items: WarehouseItem[] | number, services: string[] | number) {
  const weightKg = round(typeof items === 'number' ? items : items.reduce((sum, item) => sum + item.weightKg, 0));
  const volumetricKg = round(weightKg * 1.2);
  const serviceCount = typeof services === 'number' ? services : [...new Set(services)].length;
  return { weightKg, volumetricKg, costs: { shipping: round(Math.max(weightKg, volumetricKg) * 8 + 6), services: serviceCount * 4, importTax: 0, handling: 2 } };
}

export function validateRegistration(input: RegistrationInput): ActionResult {
  if (!text(input.firstName) || !text(input.lastName)) return { ok: false, error: 'Completează numele și prenumele.' };
  if (!emailValid(input.email.trim())) return { ok: false, error: 'Introdu o adresă de email validă.' };
  if (!phoneValid(input.phone)) return { ok: false, error: 'Introdu un număr de telefon valid.' };
  if (input.password.length < 10 || !/[A-Z]/.test(input.password) || !/[a-z]/.test(input.password) || !/[0-9!@#$%^&*]/.test(input.password)) return { ok: false, error: 'Parola trebuie să aibă minimum 10 caractere, litere mari și mici, plus o cifră sau un simbol.' };
  if (!input.accepted) return { ok: false, error: 'Confirmă salvarea profilului pe acest dispozitiv.' };
  return { ok: true };
}

export function authenticateDemo(email: string, password: string): ActionResult {
  return email.trim().toLowerCase() === 'demo@bayshop.test' && password === 'BayShopDemo!'
    ? { ok: true }
    : { ok: false, error: 'Datele de acces nu sunt corecte. Folosește „Acces pentru previzualizare” sau „Explorează aplicația”.' };
}

function legacyInitialState(): DemoState {
  const item = (id: string, name: string, price: number): DeclarationItem => ({ id, name, quantity: 1, unitPrice: price, url: 'https://shop.example/product-demo' });
  const warehouse: WarehouseItem[] = [
    { id: 'WH-1001', name: 'Sneakers · exemplu', warehouseId: 'US', tracking: 'DEMO-US-1001', weightKg: 1.2, receivedAt: '2026-10-26T09:00:00Z', items: [item('D-1', 'Sneakers de test', 48)], declared: true, documentNames: ['factura-exemplu-1001.pdf'], serviceRequests: [], photoLabels: ['Vedere colet demo', 'Etichetă demo'] },
    { id: 'WH-1002', name: 'Tricou din bumbac · exemplu', warehouseId: 'US', tracking: 'DEMO-US-1002', weightKg: .4, receivedAt: '2026-10-27T09:00:00Z', items: [item('D-2', 'Tricou de test', 18)], declared: true, documentNames: [], serviceRequests: [], photoLabels: ['Ambalaj demo'] },
    { id: 'WH-1003', name: 'Accesorii birou · de declarat', warehouseId: 'DE', tracking: 'DEMO-DE-1003', weightKg: .8, receivedAt: '2026-10-28T09:00:00Z', items: [], declared: false, documentNames: [], serviceRequests: [], photoLabels: ['Colet demo'] },
    { id: 'WH-1004', name: 'Cărți de design · exemplu', warehouseId: 'RO', tracking: 'DEMO-RO-1004', weightKg: 1.5, receivedAt: '2026-10-29T09:00:00Z', items: [item('D-4', 'Album design de test', 25)], declared: true, documentNames: ['bon-demo.pdf'], serviceRequests: [], photoLabels: [] },
    ...(['US', 'GB', 'DE', 'RO'] as const).map((country, index) => ({ id: `WH-${1101 + index}`, name: ['Rucsac de test', 'Geacă de test', 'Căști de test', 'Set creativ de test'][index], warehouseId: country, tracking: `DEMO-${country}-${1101 + index}`, weightKg: [1.1, 1.7, .7, .6][index], receivedAt: '2026-10-18T09:00:00Z', items: [item(`D-${11 + index}`, 'Produs demonstrativ', 30)], declared: true, documentNames: ['document-demo.pdf'], serviceRequests: [], photoLabels: ['Fotografie demonstrativă'], shipmentId: `BS-${2401 + index}` })),
  ];
  const statuses: Shipment['status'][] = ['În pregătire', 'Trimise', 'Reținere vamală', 'Primit'];
  const shipments: Shipment[] = statuses.map((status, index) => {
    const w = warehouse[4 + index];
    return { id: `BS-${2401 + index}`, name: w.name, status, warehouseItemIds: [w.id], warehouseId: w.warehouseId, createdAt: '2026-10-19T09:00:00Z', tracking: `DEMO-BS-${2401 + index}`, addressId: 'ADDR-1', method: index === 0 ? 'Avion' : 'Rutier', localDelivery: 'Depozitul nostru', services: [], weightKg: w.weightKg, volumetricKg: round(w.weightKg * 1.2), costs: { shipping: [18, 20, 24, 12][index], services: 0, importTax: 0, handling: 2 }, events: statuses.slice(0, index + 1).map((label, ix) => ({ label, date: `2026-10-${20 + ix}T10:00:00Z`, detail: 'Eveniment sintetic pentru testarea traseului.' })), documents: [{ id: `DOC-${index + 1}`, name: 'Factură demonstrativă', kind: 'Exemplu' }] };
  });
  const orderItems: CartItem[] = [{ id: 'CI-20', country: 'SUA', name: 'Lampă de birou · comandă demo', url: 'https://shop.example/lamp', unitPrice: 30, localShipping: 5, quantity: 1, color: 'Alb', size: '', comment: 'Date fictive', inspection: true }];
  return {
    version: 2, seq: 3000,
    profile: { id: 'DEMO-2048', firstName: 'Alex', lastName: 'Exemplu', email: 'demo@bayshop.test', phone: '+373 00 000 000', country: 'Republica Moldova', language: 'Română' },
    cart: [{ id: 'CI-1', country: 'SUA', name: 'Hanorac Urban · exemplu', url: 'https://shop.example/hoodie', unitPrice: 24, localShipping: 4, quantity: 1, color: 'Bleumarin', size: 'M', comment: '', inspection: true }, { id: 'CI-2', country: 'Germania', name: 'Sticlă sport · exemplu', url: 'https://shop.example/bottle', unitPrice: 12, localShipping: 2, quantity: 1, color: 'Verde', size: '500 ml', comment: '', inspection: false }],
    orders: [{ id: 'ORD-201', items: orderItems, createdAt: '2026-10-28T10:00:00Z', status: 'În procesare', total: 38 }, { id: 'ORD-200', items: [{ ...orderItems[0], id: 'CI-19', name: 'Carte de test', unitPrice: 15, localShipping: 0, inspection: false }], createdAt: '2026-10-14T10:00:00Z', status: 'Recepționată', total: 15 }],
    incoming: [{ id: 'INC-901', tracking: 'DEMO-WAIT-901', warehouseId: 'US', items: [item('DI-901', 'Ceas de test', 45)], documentNames: ['confirmare-demo.pdf'], addressId: 'ADDR-1', status: 'Așteptat' }, { id: 'INC-902', tracking: 'DEMO-WAIT-902', warehouseId: 'DE', items: [item('DI-902', 'Cabluri de test', 9)], documentNames: [], addressId: 'ADDR-2', status: 'Așteptat' }],
    warehouse, shipments,
    addresses: [{ id: 'ADDR-1', firstName: 'Alex', lastName: 'Exemplu', country: 'Republica Moldova', region: 'Municipiu demonstrativ', city: 'Oraș Demo', street: 'Strada Exemplului 10', postalCode: 'MD-DEMO', phone: '+373 00 000 000', isCompany: false, archived: false, used: true }, { id: 'ADDR-2', firstName: 'Dana', lastName: 'Test', country: 'Republica Moldova', region: 'Regiune demo', city: 'Oraș Test', street: 'Strada Testului 22', postalCode: 'MD-TEST', phone: '+373 00 000 001', isCompany: false, archived: false, used: false }],
    balances: { USD: 385, EUR: 80, GBP: 30, RON: 150 },
    transactions: [
      { id: 'TX-7', date: '2026-10-28T10:00:00Z', label: 'Comandă demo ORD-201', amount: -38, currency: 'USD', balanceAfter: 385, reference: 'ORD-201' },
      { id: 'TX-6', date: '2026-10-21T10:00:00Z', label: 'Transport demo BS-2404', amount: -14, currency: 'USD', balanceAfter: 423, reference: 'INV-2404' },
      { id: 'TX-5', date: '2026-10-21T09:00:00Z', label: 'Transport demo BS-2403', amount: -26, currency: 'USD', balanceAfter: 437, reference: 'INV-2403' },
      { id: 'TX-4', date: '2026-10-20T10:00:00Z', label: 'Transport demo BS-2402', amount: -22, currency: 'USD', balanceAfter: 463, reference: 'INV-2402' },
      { id: 'TX-3', date: '2026-10-14T10:00:00Z', label: 'Comandă demo ORD-200', amount: -15, currency: 'USD', balanceAfter: 485, reference: 'ORD-200' },
      ...CURRENCIES.map((currency, index) => ({ id: `OPEN-${index}`, date: '2026-10-01T10:00:00Z', label: 'Sold inițial fictiv', amount: [500, 80, 30, 150][index], currency, balanceAfter: [500, 80, 30, 150][index] })),
    ],
    invoices: shipments.map((shipment, index) => ({ id: `INV-${2401 + index}`, title: `Transport demo ${shipment.id}`, amount: shipment.costs.shipping + shipment.costs.handling, currency: 'USD', status: index ? 'Achitată' : 'Neachitată', shipmentId: shipment.id })),
    notifications: [{ id: 'N-1', title: 'Colet recepționat în depozit', body: 'WH-1001 este pregătit pentru consolidare. Acesta este un exemplu.', date: '2026-10-28T09:00:00Z', read: false, href: '/warehouse' }, { id: 'N-2', title: 'Declarație necesară', body: 'Completează produsele pentru coletul demonstrativ WH-1003.', date: '2026-10-28T09:05:00Z', read: false, href: '/warehouse' }, { id: 'N-3', title: 'Factură demo disponibilă', body: 'Poți testa plata din soldul fictiv pentru BS-2401.', date: '2026-10-28T09:10:00Z', read: false, href: '/balance' }, { id: 'N-4', title: 'Livrare demonstrativă finalizată', body: 'BS-2404 a ajuns la destinație în scenariul de test.', date: '2026-10-23T10:00:00Z', read: true, href: '/shipments' }],
    tickets: [{ id: 'T-100', subject: 'Cum funcționează consolidarea?', category: 'Colete', reference: 'WH-1001', message: 'Întrebare demonstrativă despre combinarea coletelor.', createdAt: '2026-10-27T10:00:00Z', status: 'Răspuns primit', replies: [{ author: 'Asistent demo', body: 'Selectează colete declarate din același depozit și creează o expediere. Acest răspuns este predefinit, nu provine de la BayShop.', date: '2026-10-27T10:10:00Z' }] }],
    preferences: { info: true, email: true, sms: false, push: true, telegram: false, autoSend: false },
  };
}

// Exact legacy seed strings are retained above solely for a narrow upgrade of saved
// fixtures. New records use neutral labels; IDs, amounts and user edits are untouched.
const seedLabels: Record<string, string> = {
  'https://shop.example/product-demo': 'https://shop.example/product',
  'Sneakers · exemplu': 'Sneakers albi', 'Sneakers de test': 'Sneakers albi',
  'Tricou din bumbac · exemplu': 'Tricou din bumbac', 'Tricou de test': 'Tricou din bumbac',
  'Accesorii birou · de declarat': 'Accesorii de birou',
  'Cărți de design · exemplu': 'Cărți de design', 'Album design de test': 'Album de design',
  'Rucsac de test': 'Rucsac urban', 'Geacă de test': 'Geacă impermeabilă',
  'Căști de test': 'Căști wireless', 'Set creativ de test': 'Set de pictură',
  'Produs demonstrativ': 'Articol', 'Ceas de test': 'Ceas de mână', 'Cabluri de test': 'Cabluri USB-C',
  'Lampă de birou · comandă demo': 'Lampă de birou', 'Carte de test': 'Carte de arhitectură',
  'Hanorac Urban · exemplu': 'Hanorac Urban', 'Sticlă sport · exemplu': 'Sticlă sport',
  'factura-exemplu-1001.pdf': 'factura-1001.pdf', 'bon-demo.pdf': 'bon-1004.pdf',
  'document-demo.pdf': 'document-transport.pdf', 'confirmare-demo.pdf': 'confirmare-comanda.pdf',
  'Vedere colet demo': 'Vedere colet', 'Etichetă demo': 'Etichetă', 'Ambalaj demo': 'Ambalaj',
  'Colet demo': 'Colet', 'Fotografie demonstrativă': 'Fotografie colet',
  'Eveniment sintetic pentru testarea traseului.': 'Etapă înregistrată în istoricul expedierii.',
  'Factură demonstrativă': 'Factură de transport', 'Date fictive': '',
  'Municipiu demonstrativ': 'Municipiul Chișinău', 'Oraș Demo': 'Chișinău',
  'Strada Exemplului 10': 'Strada Teilor 10', 'MD-DEMO': 'MD-2060',
  'Regiune demo': 'Municipiul Bălți', 'Oraș Test': 'Bălți',
  'Strada Testului 22': 'Strada Florilor 22', 'MD-TEST': 'MD-3100',
  'Sold inițial fictiv': 'Sold inițial',
  'WH-1001 este pregătit pentru consolidare. Acesta este un exemplu.': 'WH-1001 este pregătit pentru consolidare.',
  'Completează produsele pentru coletul demonstrativ WH-1003.': 'Completează declarația pentru WH-1003.',
  'Factură demo disponibilă': 'Factură disponibilă',
  'Poți testa plata din soldul fictiv pentru BS-2401.': 'Factura pentru BS-2401 poate fi achitată din soldul local.',
  'Livrare demonstrativă finalizată': 'Livrare finalizată',
  'BS-2404 a ajuns la destinație în scenariul de test.': 'BS-2404 a ajuns la destinație.',
  'Întrebare demonstrativă despre combinarea coletelor.': 'Cum pot reuni mai multe colete într-o singură expediere?',
  'Asistent demo': 'Ghid de ajutor',
  'Selectează colete declarate din același depozit și creează o expediere. Acest răspuns este predefinit, nu provine de la BayShop.': 'Selectează colete declarate din același depozit și creează o expediere. Răspuns din ghidul de ajutor.',
};
for (const [country, id] of [['US', 1001], ['US', 1002], ['DE', 1003], ['RO', 1004], ['US', 1101], ['GB', 1102], ['DE', 1103], ['RO', 1104]]) seedLabels[`DEMO-${country}-${id}`] = `${country}-${id}`;
for (const id of [2401, 2402, 2403, 2404]) {
  seedLabels[`DEMO-BS-${id}`] = `BS-${id}`;
  seedLabels[`Transport demo BS-${id}`] = `Transport BS-${id}`;
}
for (const id of [200, 201]) seedLabels[`Comandă demo ORD-${id}`] = `Comandă ORD-${id}`;
seedLabels['DEMO-WAIT-901'] = 'US-0901'; seedLabels['DEMO-WAIT-902'] = 'DE-0902';

function rewriteSeed(value: unknown): unknown {
  if (typeof value === 'string') return seedLabels[value] ?? value;
  if (Array.isArray(value)) return value.map(rewriteSeed);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewriteSeed(child)]));
  return value;
}

export function makeInitialState(): DemoState {
  const state = rewriteSeed(legacyInitialState()) as DemoState;
  state.profile.lastName = 'Ionescu';
  state.addresses[0].lastName = 'Ionescu'; state.addresses[1].lastName = 'Marin';
  for (const item of state.warehouse.slice(4)) item.items[0].name = item.name;
  for (const shipment of state.shipments) for (const document of shipment.documents) document.kind = 'Document';
  return state;
}

type SavedRecord = Record<string, unknown>;
const record = (value: unknown): value is SavedRecord => Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** Upgrade only exact old seed values under their original IDs; never add records. */
function migrateFixtureLabels(value: unknown, before: unknown, after: unknown): unknown {
  if (typeof before === 'string' && typeof after === 'string') return value === before ? after : value;
  if (Array.isArray(value) && Array.isArray(before) && Array.isArray(after)) {
    return value.map(item => {
      let index = -1;
      if (record(item) && typeof item.id === 'string') index = before.findIndex(old => record(old) && old.id === item.id);
      else if (record(item) && typeof item.date === 'string') index = before.findIndex(old => record(old) && old.date === item.date && (old.label === item.label || old.author === item.author));
      else if (typeof item === 'string') index = before.indexOf(item);
      return index >= 0 ? migrateFixtureLabels(item, before[index], after[index]) : item;
    });
  }
  if (record(value) && record(before) && record(after)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'id' ? child : migrateFixtureLabels(child, before[key], after[key])]));
  }
  return value;
}

/** Pure local simulator. Failed operations preserve the original object and every balance. */
export function transition(original: DemoState, action: DemoAction): { state: DemoState; result: ActionResult } {
  const fail = (error: string) => ({ state: original, result: { ok: false, error } });
  if (action.type === 'reset') return { state: makeInitialState(), result: { ok: true } };
  const state = copy(original);
  const seq = state.seq + 1;
  const date = new Date(Date.UTC(2026, 10, 1, 10) + (seq - 3000) * 60000).toISOString();
  const id = (prefix: string) => `${prefix}-${seq}`;
  const done = (resultId?: string) => { state.seq = seq; return { state, result: { ok: true, ...(resultId ? { id: resultId } : {}) } }; };
  const notify = (title: string, body: string, href?: string) => state.notifications.unshift({ id: id('N'), title, body, date, read: false, href });
  const ledger = (amount: number, currency: Currency, label: string, reference?: string) => {
    state.balances[currency] = round(state.balances[currency] + amount);
    state.transactions.unshift({ id: id('TX'), date, label, amount: round(amount), currency, balanceAfter: state.balances[currency], ...(reference ? { reference } : {}) });
  };
  switch (action.type) {
    case 'addCart': {
      if (!cartValid(action.item)) return fail('Completează produsul, linkul http/https, prețul pozitiv și cantitatea între 1 și 100. Costurile acceptă maximum două zecimale.');
      state.cart.push({ ...copy(action.item), name: action.item.name.trim(), id: id('CI') }); return done(id('CI'));
    }
    case 'removeCart': {
      if (!state.cart.some(i => i.id === action.id)) return fail('Produsul nu mai este în coș.');
      state.cart = state.cart.filter(i => i.id !== action.id); return done();
    }
    case 'updateCartQuantity': {
      const item = state.cart.find(i => i.id === action.id);
      if (!item) return fail('Produsul nu mai este în coș.');
      if (!Number.isInteger(action.quantity) || action.quantity < 1 || action.quantity > 100) return fail('Cantitatea trebuie să fie un număr întreg între 1 și 100.');
      item.quantity = action.quantity; return done();
    }
    case 'checkoutCart': {
      if (!state.cart.length) return fail('Coșul este gol. Comanda nu poate fi înregistrată de două ori.');
      if (!state.cart.every(cartValid)) return fail('Verifică produsele din coș.');
      const total = cartTotal(state.cart);
      if (!validMoney(total)) return fail('Valoarea comenzii este în afara limitelor.');
      if (state.balances.USD < total) return fail('Sold USD insuficient. Verifică soldul local.');
      state.orders.unshift({ id: id('ORD'), items: copy(state.cart), createdAt: date, status: 'În procesare', total });
      ledger(-total, 'USD', 'Achiziție asistată', id('ORD')); state.cart = [];
      notify('Comandă înregistrată local', 'Suma a fost scăzută din soldul local. Nu s-a efectuat o plată reală.', '/shopping'); return done(id('ORD'));
    }
    case 'cancelOrder': {
      const order = state.orders.find(o => o.id === action.id);
      if (!order || order.status !== 'În procesare') return fail('Poți anula numai o comandă aflată în procesare.');
      order.status = 'Anulat'; ledger(order.total, 'USD', 'Restituire comandă', order.id); return done(order.id);
    }
    case 'addIncoming': {
      const input = action.input;
      if (!text(input.tracking) || input.tracking.trim().length < 4) return fail('Introdu un tracking de minimum 4 caractere.');
      const tracking = input.tracking.trim().toUpperCase();
      if ([...state.incoming, ...state.warehouse].some(i => i.tracking.trim().toUpperCase() === tracking)) return fail('Acest tracking este deja înregistrat.');
      if (!WAREHOUSE_IDS.includes(input.warehouseId)) return fail('Selectează un depozit valid.');
      if (!state.addresses.some(a => a.id === input.addressId && !a.archived)) return fail('Selectează un destinatar activ.');
      if (!declarationValid(input.items)) return fail('Adaugă un produs cu denumire, cantitate și valoare pozitivă în USD.');
      state.incoming.unshift({ ...copy(input), tracking, id: id('INC'), status: 'Așteptat' }); return done(id('INC'));
    }
    case 'receiveIncoming': {
      const incoming = state.incoming.find(i => i.id === action.id);
      if (!incoming || incoming.status !== 'Așteptat') return fail('Coletul a fost deja recepționat sau nu există.');
      if (state.warehouse.some(i => i.tracking === incoming.tracking)) return fail('Trackingul există deja în depozit.');
      incoming.status = 'Recepționat';
      state.warehouse.unshift({ id: id('WH'), name: incoming.items.map(i => i.name).join(' + '), tracking: incoming.tracking, warehouseId: incoming.warehouseId, weightKg: round(Math.max(.3, incoming.items.reduce((s, i) => s + i.quantity, 0) * .45)), receivedAt: date, items: copy(incoming.items), declared: declarationValid(incoming.items), documentNames: [...incoming.documentNames], serviceRequests: [], photoLabels: ['Fotografie simulată la recepție'] });
      notify('Recepție simulată', `${incoming.tracking} poate fi acum inclus într-o expediere. Greutatea este simulată.`, '/warehouse'); return done(id('WH'));
    }
    case 'declareItem': {
      const item = state.warehouse.find(w => w.id === action.id);
      if (!item || item.shipmentId) return fail('Declarația poate fi modificată doar pentru un colet liber din depozit.');
      if (!declarationValid(action.items)) return fail('Completează cel puțin un produs cu denumire, cantitate între 1 și 100 și valoare pozitivă cu maximum două zecimale.');
      item.items = copy(action.items); item.documentNames = [...new Set(action.documentNames.filter(text))]; item.declared = true; return done(item.id);
    }
    case 'requestService': {
      const item = state.warehouse.find(w => w.id === action.id);
      if (!item || item.shipmentId) return fail('Serviciile se solicită înainte de includerea coletului într-o expediere.');
      const service = action.service.trim();
      if (!service) return fail('Selectează un serviciu.');
      if (item.serviceRequests.some(s => s.toLocaleLowerCase() === service.toLocaleLowerCase())) return fail('Acest serviciu este deja selectat.');
      item.serviceRequests.push(service); notify('Serviciu salvat local', `${service} · ${item.id}. Nu a fost transmisă o cerere reală.`, '/warehouse'); return done(item.id);
    }
    case 'createShipment': {
      const input = action.input;
      if (!input.warehouseItemIds.length || new Set(input.warehouseItemIds).size !== input.warehouseItemIds.length) return fail('Selectează colete distincte pentru expediere.');
      const selected = input.warehouseItemIds.map(i => state.warehouse.find(w => w.id === i));
      if (selected.some(i => !i)) return fail('Un colet selectat nu mai există.');
      const items = selected as WarehouseItem[];
      if (items.some(i => i.shipmentId)) return fail('Un colet selectat este deja inclus într-o expediere.');
      if (items.some(i => !i.declared || !declarationValid(i.items))) return fail('Completează declarațiile tuturor coletelor înainte de expediere.');
      if (new Set(items.map(i => i.warehouseId)).size !== 1) return fail('Consolidarea este posibilă numai pentru colete din același depozit.');
      const address = state.addresses.find(a => a.id === input.addressId && !a.archived);
      if (!address) return fail('Selectează un destinatar activ.');
      if (!text(input.method) || !text(input.localDelivery)) return fail('Selectează transportul și livrarea locală.');
      const services = [...new Set(input.services.map(s => s.trim()).filter(text))];
      const quote = shipmentQuote(items, services);
      if (!positive(quote.weightKg)) return fail('Greutatea trebuie să fie pozitivă.');
      const shipment: Shipment = { id: id('BS'), warehouseItemIds: [...input.warehouseItemIds], name: items.map(i => i.name).join(' + '), status: 'În pregătire', warehouseId: items[0].warehouseId, createdAt: date, tracking: `BS-${seq}`, addressId: address.id, method: input.method, localDelivery: input.localDelivery, services, ...quote, events: [{ label: 'În pregătire', date, detail: 'Expediere locală. Simulează achitarea facturii pentru a continua.' }], documents: [{ id: id('DOC'), name: 'Factură de transport', kind: 'Document' }] };
      state.shipments.unshift(shipment); items.forEach(i => { i.shipmentId = shipment.id; }); address.used = true;
      state.invoices.unshift({ id: id('INV'), title: `Transport ${shipment.id}`, amount: round(Object.values(quote.costs).reduce((s, n) => s + n, 0)), currency: 'USD', status: 'Neachitată', shipmentId: shipment.id });
      notify('Expediere creată local', 'Factura locală este disponibilă. Nu s-a comandat un transport real.', '/balance'); return done(shipment.id);
    }
    case 'updateLocalDelivery': {
      const shipment = state.shipments.find(s => s.id === action.id);
      if (!shipment || shipment.status === 'Primit') return fail('Livrarea nu mai poate fi schimbată pentru acest colet.');
      if (!text(action.localDelivery)) return fail('Selectează livrarea locală.');
      shipment.localDelivery = action.localDelivery; return done(shipment.id);
    }
    case 'advanceShipment': {
      const shipment = state.shipments.find(s => s.id === action.id);
      if (!shipment || shipment.status === 'Primit') return fail('Expedierea este deja finalizată sau nu există.');
      if (state.invoices.some(i => i.shipmentId === shipment.id && i.status === 'Neachitată')) return fail('Simulează achitarea facturii înainte de a continua.');
      const next: Record<Exclude<Shipment['status'], 'Primit'>, Shipment['status']> = { 'În pregătire': 'Trimise', 'Trimise': 'Reținere vamală', 'Reținere vamală': 'Primit' };
      shipment.status = next[shipment.status]; shipment.events.push({ label: shipment.status, date, detail: 'Etapă simulată manual.' });
      notify('Traseu actualizat', `${shipment.id}: ${shipment.status}`, '/shipments'); return done(shipment.id);
    }
    case 'markNotification': {
      const note = state.notifications.find(n => n.id === action.id); if (!note) return fail('Notificarea nu există.'); note.read = true; return done();
    }
    case 'markAllNotifications': state.notifications.forEach(n => { n.read = true; }); return done();
    case 'addAddress': {
      if (!addressValid(action.input)) return fail('Completează numele, adresa integrală și un telefon valid. Pentru firmă, completează denumirea.');
      state.addresses.push({ ...copy(action.input), id: id('ADDR'), archived: false, used: false }); return done(id('ADDR'));
    }
    case 'archiveAddress': {
      const address = state.addresses.find(a => a.id === action.id);
      if (!address || address.archived) return fail('Destinatarul este deja arhivat sau nu există.');
      if (state.addresses.filter(a => !a.archived).length <= 1) return fail('Păstrează cel puțin un destinatar activ.');
      if (state.shipments.some(s => s.addressId === address.id && s.status !== 'Primit') || state.incoming.some(i => i.addressId === address.id && i.status === 'Așteptat')) return fail('Destinatarul este folosit de un colet activ. Finalizează fluxul înainte de arhivare.');
      address.archived = true; return done();
    }
    case 'payInvoice': {
      const invoice = state.invoices.find(i => i.id === action.id);
      if (!invoice || invoice.status !== 'Neachitată') return fail('Factura este deja achitată sau nu există.');
      if (!validMoney(invoice.amount) || !CURRENCIES.includes(invoice.currency)) return fail('Factura are o valoare nevalidă.');
      if (state.balances[invoice.currency] < invoice.amount) return fail(`Sold ${invoice.currency} insuficient. Verifică soldul local.`);
      ledger(-invoice.amount, invoice.currency, 'Achitare simulată', invoice.id); invoice.status = 'Achitată'; notify('Plată simulată', `${invoice.id}: suma a fost scăzută din soldul local, fără plată reală.`, '/balance'); return done(invoice.id);
    }
    case 'topUp': case 'requestWithdrawal': {
      if (!CURRENCIES.includes(action.currency) || !validMoney(action.amount)) return fail('Introdu o sumă pozitivă de maximum 100.000, cu maximum două zecimale, într-o monedă disponibilă.');
      if (action.type === 'requestWithdrawal' && state.balances[action.currency] < action.amount) return fail('Soldul este insuficient pentru această retragere.');
      if (action.type === 'topUp' && state.balances[action.currency] + action.amount > 1000000) return fail('Soldul local maxim este 1.000.000 per monedă.');
      ledger(action.type === 'topUp' ? action.amount : -action.amount, action.currency, action.type === 'topUp' ? 'Alimentare simulată' : 'Retragere simulată'); return done(id('TX'));
    }
    case 'updateProfile': {
      const profile = { ...state.profile, ...action.input };
      if (![profile.firstName, profile.lastName, profile.country, profile.language].every(text) || !emailValid(profile.email) || !phoneValid(profile.phone)) return fail('Completează numele, emailul și telefonul în format valid.');
      state.profile = copy(profile); return done();
    }
    case 'updatePreferences': {
      if (Object.entries(action.input).some(([key, value]) => !(key in state.preferences) || typeof value !== 'boolean')) return fail('Preferințe nevalide.');
      state.preferences = { ...state.preferences, ...action.input }; return done();
    }
    case 'newTicket': {
      const input = action.input;
      if (!text(input.subject) || !text(input.category) || !text(input.message) || input.message.trim().length < 10) return fail('Completează subiectul, categoria și un mesaj de minimum 10 caractere.');
      state.tickets.unshift({ ...copy(input), id: id('T'), createdAt: date, status: 'Deschis', replies: [] }); return done(id('T'));
    }
    default: return fail('Acțiune necunoscută.');
  }
}

/** Ignore incompatible or damaged saved state rather than crash during app startup. */
export function restoreDemoState(value: unknown): DemoState | null {
  try {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as DemoState;
    const strings = (entry: object, keys: string[]) => !!entry && keys.every(key => typeof (entry as Record<string, unknown>)[key] === 'string');
    const stringArray = (entry: unknown): entry is string[] => Array.isArray(entry) && entry.every(v => typeof v === 'string');
    const cartShape = (i: CartItem) => strings(i, ['id', 'country', 'name', 'url', 'color', 'size', 'comment']) && typeof i.inspection === 'boolean' && cartValid(i);
    const declarationsShape = (items: DeclarationItem[]) => Array.isArray(items) && (!items.length || declarationValid(items)) && items.every(i => strings(i, ['id', 'name', 'url']));
    const arrays = ['cart', 'orders', 'incoming', 'warehouse', 'shipments', 'addresses', 'transactions', 'invoices', 'notifications', 'tickets'] as const;
    if (candidate.version !== 2 || !Number.isSafeInteger(candidate.seq) || candidate.seq < 3000 || !strings(candidate.profile, ['id', 'firstName', 'lastName', 'email', 'phone', 'country', 'language']) || !emailValid(candidate.profile.email) || !candidate.preferences || !candidate.balances) return null;
    if (arrays.some(key => !Array.isArray(candidate[key]) || candidate[key].some(entry => !entry || typeof entry !== 'object' || !text(entry.id)))) return null;
    // The shipment wizard resolves these IDs to a known depot; reject unknown persisted IDs before rendering it.
    if ([...candidate.incoming, ...candidate.warehouse, ...candidate.shipments].some(entry => !WAREHOUSE_IDS.includes(entry.warehouseId))) return null;
    if (CURRENCIES.some(c => !Number.isFinite(candidate.balances[c]) || candidate.balances[c] < 0)) return null;
    if (['info', 'email', 'sms', 'push', 'telegram', 'autoSend'].some(k => typeof candidate.preferences[k as keyof typeof candidate.preferences] !== 'boolean')) return null;
    if (!candidate.cart.every(cartShape)) return null;
    if (candidate.orders.some(o => !strings(o, ['id', 'createdAt', 'status']) || !['În procesare', 'Recepționată', 'Anulat'].includes(o.status) || !validMoney(o.total) || !Array.isArray(o.items) || !o.items.every(cartShape))) return null;
    if (candidate.incoming.some(i => !strings(i, ['id', 'tracking', 'warehouseId', 'addressId', 'status']) || !['Așteptat', 'Recepționat'].includes(i.status) || !declarationsShape(i.items) || !stringArray(i.documentNames))) return null;
    if (candidate.warehouse.some(i => !strings(i, ['id', 'name', 'warehouseId', 'tracking', 'receivedAt']) || !positive(i.weightKg) || typeof i.declared !== 'boolean' || !declarationsShape(i.items) || !stringArray(i.documentNames) || !stringArray(i.serviceRequests) || !stringArray(i.photoLabels) || (i.shipmentId !== undefined && !text(i.shipmentId)))) return null;
    if (candidate.shipments.some(s => !strings(s, ['id', 'name', 'status', 'warehouseId', 'createdAt', 'tracking', 'addressId', 'method', 'localDelivery']) || !['În pregătire', 'Trimise', 'Reținere vamală', 'Primit'].includes(s.status) || !stringArray(s.warehouseItemIds) || !stringArray(s.services) || !positive(s.weightKg) || !positive(s.volumetricKg) || !Array.isArray(s.events) || !s.events.every(e => strings(e, ['label', 'date', 'detail'])) || !Array.isArray(s.documents) || !s.documents.every(d => strings(d, ['id', 'name', 'kind'])) || !s.costs || ['shipping', 'services', 'importTax', 'handling'].some(k => !Number.isFinite(s.costs[k as keyof typeof s.costs]) || s.costs[k as keyof typeof s.costs] < 0))) return null;
    if (candidate.addresses.some(a => !strings(a, ['id', 'firstName', 'lastName', 'country', 'region', 'city', 'street', 'postalCode', 'phone']) || ['archived', 'used', 'isCompany'].some(k => typeof a[k as keyof Address] !== 'boolean') || (a.company !== undefined && typeof a.company !== 'string'))) return null;
    if (candidate.transactions.some(t => !strings(t, ['id', 'date', 'label', 'currency']) || !CURRENCIES.includes(t.currency) || !Number.isFinite(t.amount) || !Number.isFinite(t.balanceAfter) || (t.reference !== undefined && typeof t.reference !== 'string'))) return null;
    if (candidate.invoices.some(i => !strings(i, ['id', 'title', 'currency', 'status']) || !CURRENCIES.includes(i.currency) || !['Achitată', 'Neachitată'].includes(i.status) || !validMoney(i.amount) || (i.shipmentId !== undefined && typeof i.shipmentId !== 'string'))) return null;
    if (candidate.notifications.some(n => !strings(n, ['id', 'title', 'body', 'date']) || typeof n.read !== 'boolean' || (n.href !== undefined && typeof n.href !== 'string'))) return null;
    if (candidate.tickets.some(t => !strings(t, ['id', 'subject', 'category', 'reference', 'message', 'createdAt', 'status']) || !['Deschis', 'Răspuns primit'].includes(t.status) || !Array.isArray(t.replies) || !t.replies.every(r => strings(r, ['body', 'author', 'date'])))) return null;
    const previousSeed = legacyInitialState();
    const nextSeed = makeInitialState();
    const restored = migrateFixtureLabels(copy(candidate), previousSeed, nextSeed) as DemoState;
    // An already-received fixture has the same tracking in incoming and warehouse.
    // Keep that relation, and never collide with a tracking entered by the user.
    const previousRecords = [...candidate.incoming, ...candidate.warehouse];
    const restoredRecords = [...restored.incoming, ...restored.warehouse];
    const nextRecords = [...nextSeed.incoming, ...nextSeed.warehouse];
    for (const seed of [...previousSeed.incoming, ...previousSeed.warehouse]) {
      const original = previousRecords.find(item => item.id === seed.id && item.tracking === seed.tracking);
      const replacement = nextRecords.find(item => item.id === seed.id)?.tracking;
      if (!original || !replacement || replacement === seed.tracking) continue;
      const collision = previousRecords.some(item => item.id !== seed.id && item.tracking.trim().toUpperCase() === replacement.toUpperCase());
      for (const item of restoredRecords) {
        const saved = previousRecords.find(record => record.id === item.id);
        if (saved?.tracking === seed.tracking) item.tracking = collision ? seed.tracking : replacement;
      }
    }
    return restored;
  } catch { return null; }
}
