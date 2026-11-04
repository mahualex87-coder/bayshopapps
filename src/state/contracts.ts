export type Currency = 'USD' | 'EUR' | 'GBP' | 'RON';
export type Profile = { id: string; firstName: string; lastName: string; email: string; phone: string; country: string; language: string };
export type DeclarationItem = { id: string; name: string; url: string; quantity: number; unitPrice: number };
export type Address = { id: string; firstName: string; lastName: string; country: string; region: string; city: string; street: string; postalCode: string; phone: string; isCompany: boolean; company?: string; archived: boolean; used: boolean };
export type CartItem = { id: string; country: string; name: string; url: string; unitPrice: number; localShipping: number; quantity: number; color: string; size: string; comment: string; inspection: boolean };
export type Order = { id: string; items: CartItem[]; createdAt: string; status: 'În procesare' | 'Recepționată' | 'Anulat'; total: number };
export type Incoming = { id: string; tracking: string; warehouseId: string; items: DeclarationItem[]; documentNames: string[]; addressId: string; status: 'Așteptat' | 'Recepționat' };
export type WarehouseItem = { id: string; name: string; warehouseId: string; tracking: string; weightKg: number; receivedAt: string; items: DeclarationItem[]; declared: boolean; documentNames: string[]; serviceRequests: string[]; photoLabels: string[]; shipmentId?: string };
export type Shipment = { id: string; warehouseItemIds: string[]; name: string; status: 'În pregătire' | 'Trimise' | 'Reținere vamală' | 'Primit'; warehouseId: string; createdAt: string; tracking: string; addressId: string; method: string; localDelivery: string; services: string[]; weightKg: number; volumetricKg: number; costs: { shipping: number; services: number; importTax: number; handling: number }; events: { label: string; date: string; detail: string }[]; documents: { id: string; name: string; kind: string }[] };
export type Transaction = { id: string; date: string; label: string; amount: number; currency: Currency; balanceAfter: number; reference?: string };
export type Invoice = { id: string; title: string; amount: number; currency: Currency; status: 'Neachitată' | 'Achitată'; shipmentId?: string };
export type Notification = { id: string; title: string; body: string; date: string; read: boolean; href?: string };
export type Ticket = { id: string; subject: string; category: string; reference: string; message: string; createdAt: string; status: 'Deschis' | 'Răspuns primit'; replies: { body: string; author: string; date: string }[] };
export type Preferences = { info: boolean; email: boolean; sms: boolean; push: boolean; telegram: boolean; autoSend: boolean };
export type DemoState = { version: 2; seq: number; profile: Profile; cart: CartItem[]; orders: Order[]; incoming: Incoming[]; warehouse: WarehouseItem[]; shipments: Shipment[]; addresses: Address[]; balances: Record<Currency, number>; transactions: Transaction[]; invoices: Invoice[]; notifications: Notification[]; tickets: Ticket[]; preferences: Preferences };
export type ActionResult = { ok: boolean; error?: string; id?: string };
export type DemoAction =
 | { type: 'addCart'; item: Omit<CartItem, 'id'> }
 | { type: 'removeCart'; id: string }
 | { type: 'updateCartQuantity'; id: string; quantity: number }
 | { type: 'checkoutCart' }
 | { type: 'cancelOrder'; id: string }
 | { type: 'addIncoming'; input: Omit<Incoming, 'id' | 'status'> }
 | { type: 'receiveIncoming'; id: string }
 | { type: 'declareItem'; id: string; items: DeclarationItem[]; documentNames: string[] }
 | { type: 'requestService'; id: string; service: string }
 | { type: 'createShipment'; input: { warehouseItemIds: string[]; addressId: string; method: string; localDelivery: string; services: string[] } }
 | { type: 'updateLocalDelivery'; id: string; localDelivery: string }
 | { type: 'advanceShipment'; id: string }
 | { type: 'markNotification'; id: string }
 | { type: 'markAllNotifications' }
 | { type: 'addAddress'; input: Omit<Address, 'id' | 'archived' | 'used'> }
 | { type: 'archiveAddress'; id: string }
 | { type: 'payInvoice'; id: string }
 | { type: 'topUp'; amount: number; currency: Currency }
 | { type: 'requestWithdrawal'; amount: number; currency: Currency }
 | { type: 'updateProfile'; input: Partial<Omit<Profile, 'id'>> }
 | { type: 'updatePreferences'; input: Partial<Preferences> }
 | { type: 'newTicket'; input: Pick<Ticket, 'subject' | 'category' | 'reference' | 'message'> }
 | { type: 'reset' };
export type RegistrationInput = { firstName: string; lastName: string; email: string; phone: string; password: string; accepted: boolean };
export type DemoContextValue = { state: DemoState; ready: boolean; authenticated: boolean; persistenceError: string | null; dispatch: (action: DemoAction) => ActionResult; login: (email: string, password: string) => ActionResult; enterDemo: () => void; logout: () => void; register: (input: RegistrationInput) => ActionResult };
export const WAREHOUSES = [{ id: 'US', name: 'SUA', city: 'Newark' }, { id: 'RO', name: 'România', city: 'Tomesti' }, { id: 'GB', name: 'Regatul Unit', city: 'Ingatestone' }, { id: 'IT', name: 'Italia', city: 'Roma' }, { id: 'DE', name: 'Germania', city: 'Gorlitz' }, { id: 'PL', name: 'Polonia', city: 'Jelenia Gora' }];
export const DEMO_EMAIL = 'demo@bayshop.test';
export const DEMO_PASSWORD = 'BayShopDemo!';
export const money = (value: number, currency: Currency = 'USD') => `${value.toLocaleString('ro-RO', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${currency}`;
