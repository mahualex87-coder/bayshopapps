import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { messagesPayments } from '../src/i18n/messages-payments.ts';
import * as invoiceSelection from '../src/features/payments/invoice-selection.ts';
import * as paymentDisplay from '../src/features/payments/payment-display.ts';

const key = '11111111-2222-4333-8444-555555555555';
const legacy = { version: 1, attemptKey: key, createdAt: 1, paymentId: null };
const invoice = (id, amount = '1.00') => ({ id, reference: `T${id}`, amount, description: '', createdAt: null });
function harness(attempts = [], activeKey = null, platform = 'ios') {
  const slots = [], effects = [], calls = [], scrollCalls = [], pageLoads = [], supportBlocks = [];
  const support = { busy: false, disabled: false, open: async () => { calls.push(['support']); } };
  let cursor = 0, dirty = false, tree;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { const value = typeof next === 'function' ? next(slots[i]) : next; if (slots[i] !== value) dirty = true; slots[i] = value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(fn) { return fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((d, j) => d !== slots[i][j])) { slots[i] = deps; effects.push(fn); } },
  };
  const flow = {
    attempts, attempt: attempts.find(a => a.attemptKey === activeKey) ?? null,
    get savedAttempts() { return this.attempts.filter(a => a !== this.attempt); },
    invoicesPaid: false,
    canResume: false,
    ready: true, busy: false, checking: false, error: null, diagnosticCode: null, unopened: false, status: null, action: null,
    clearError() { this.error = null; }, async showInvoices() { calls.push(['showInvoices']); this.attempt = null; this.action = null; this.status = null; },
    async selectAttempt(value) { calls.push(['selectAttempt', value]); this.attempt = this.attempts.find(a => a.attemptKey === value); },
    async finish() { calls.push(['finish']); this.attempt = null; this.status = null; this.action = null; this.invoicesPaid = false; },
    closeProvider: () => { calls.push(['closeProvider']); flow.provider = null; flow.attempt = null; flow.action = null; flow.status = null; flow.error = 'payments.unknown'; },
    providerFailed: code => { calls.push(code ? ['providerFailed', code] : ['providerFailed']); flow.provider = null; flow.attempt = null; flow.action = null; flow.status = null; flow.error = 'payments.providerInterrupted'; flow.diagnosticCode = code || 'PROVIDER_INTERRUPTED'; },
    resume() { calls.push(['resume']); },
    start(...args) { calls.push(['start', ...args]); },
  };
  const resource = { data: { catalog: {
    invoiceGroups: [{ currencyId: '1', currency: 'USD', invoices: [invoice('1'), invoice('2')] }, { currencyId: '2', currency: 'EUR', invoices: [invoice('3')] }],
    methods: [{ id: 'platescro', currencies: ['USD', 'EUR'] }, { id: 'paypal', currencies: ['USD', 'EUR'] }], billing: {},
  } } };
  const jsx = (type, props) => {
    if (type === 'Screen' && props.scrollRef) props.scrollRef.current = { scrollTo: options => scrollCalls.push(options) };
    return { type, props: props ?? {} };
  };
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Image: 'Image', Platform: { OS: platform }, Pressable: 'Pressable', Text: 'Text', View: 'View' },
    '@expo/vector-icons/Ionicons': { default: 'Icon', __esModule: true },
    'expo-router': { router: { push: path => calls.push(['navigate', path]) }, useFocusEffect() {} },
    'expo-clipboard': {},
    '@/api/context': { useLiveAccount: () => ({ canMutate: true, authenticated: true, accountId: 'synthetic-account' }) },
    '@/navigation/PageLoading': { usePageLoad: (pending, blocking = pending) => pageLoads.push({ pending, blocking }) },
    '@/api/payment-legacy': { normalizeLegacyPaymentsData: x => x, legacyPaymentSelectionRevision: (selection, data) => JSON.stringify([selection, data]) },
    '@/i18n/context': { useI18n: () => ({ t: (k, params) => params ? `${k}:${JSON.stringify(params)}` : k, formatDate: d => d }) },
    '@/ui': { Button: 'Button', Choice: 'Choice', Notice: 'Notice', Screen: 'Screen', useUi: () => ({ s: {}, colors: {} }) },
    '@/features/live/shared': { ResourceStatus: 'ResourceStatus' },
    '@/features/accountops/shared': { useAccountView: () => ({ resource, reload() {} }) },
    '@/navigation/useDraftGuard': { useDraftGuard() {} },
    '@/features/support/SupportChatProvider': { useSupportChat: () => support, useBlockSupportChat: blocked => supportBlocks.push(blocked) },
    './PaymentProvider': { PaymentProvider: 'Provider' },
    './usePaymentFlow': { usePaymentFlow: () => flow },
    './invoice-selection': invoiceSelection,
    './payment-display': paymentDisplay,
  };
  const exports = {};
  const source = readFileSync(new URL('../src/features/payments/PaymentsScreen.tsx', import.meta.url), 'utf8') + '\nexport { PaymentsScreen as TestScreen };';
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: name => { assert(name in imports, name); return imports[name]; }, Date, Set });
  function render() { let turns = 0; do { dirty = false; cursor = 0; tree = exports.TestScreen(); while (effects.length) effects.shift()(); assert(++turns < 10); } while (dirty); return tree; }
  function walk(node) { if (Array.isArray(node)) return node.flatMap(walk); if (!node || typeof node !== 'object') return []; return [node, ...walk(node.props?.children)]; }
  const all = () => walk(tree);
  const find = predicate => { const result = all().find(predicate); assert(result, 'Expected element'); return result; };
  const button = label => find(n => n.type === 'Button' && n.props.children === label);
  const check = label => find(n => n.props.accessibilityRole === 'checkbox' && n.props.accessibilityLabel?.startsWith(label));
  const press = async element => { assert.equal(Boolean(element.props.disabled), false, 'Control must be enabled'); await element.props.onPress(); render(); };
  const method = id => find(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === id);
  render();
  return { render, all, find, button, check, press, method, flow, resource, calls, scrollCalls, pageLoads, support, supportBlocks };
}

test('payment help opens support directly, preserves invoice selection and blocks during checkout or another support opening', async () => {
  const h = harness();
  await h.press(h.check('T1')); await h.press(h.button('accountContent.paymentHelp'));
  assert.deepEqual(h.calls, [['support']]);
  assert.equal(h.check('T1').props['aria-checked'], false); assert.equal(h.check('T2').props['aria-checked'], true);
  h.flow.busy = true; h.render();
  assert.equal(h.button('accountContent.paymentHelp').props.disabled, true); assert.equal(h.supportBlocks.at(-1), true);
  h.flow.busy = false; h.flow.provider = { kind: 'redirect', url: 'https://payment.example.test' }; h.render();
  assert.equal(h.supportBlocks.at(-1), true);
  h.flow.provider = null; h.support.busy = true; h.support.disabled = true; h.render();
  assert.equal(h.button('supportChat.opening').props.disabled, true);
  h.support.busy = false; h.support.disabled = false; h.render();
  assert.equal(h.button('accountContent.paymentHelp').props.disabled, false); assert.equal(h.supportBlocks.at(-1), false);
});

test('old attempts are not shown or used to block current unpaid invoices', async () => {
  const scoped = { ...legacy, version: 2, paymentId: '42', paymentType: 'paypal', phase: 'checkout', scope: { currencyId: '1', currency: 'USD', invoices: [invoice('1')] } };
  const h = harness([legacy, scoped], key);
  assert.equal(h.check('T1').props.disabled, false);
  assert.equal(h.all().some(n => ['payments.savedAttempts', 'payments.noReference', 'payments.invoicePending', 'payments.pending', 'payments.resume', 'payments.reviewDifferentInvoices'].includes(n.props.children)), false);
  assert(h.button('payments.clearSelection'));
  assert.equal(h.check('T1').props['aria-checked'], true);
  assert.equal(h.check('T2').props['aria-checked'], true);
  await h.press(h.method('payments.card'));
  await h.press(h.button('payments.continue'));
  const call = h.calls.find(c => c[0] === 'start');
  assert.deepEqual([...call[1].billIds], ['1', '2']);
  assert.equal(call.length, 3); // Selection and current catalog only; no old-attempt acknowledgement.
});

test('a preparation failure displays invoices and a short error, without a failed-attempt card or automatic retry', async () => {
  const h = harness([legacy], key);
  h.flow.error = 'payments.checkoutFailed'; h.flow.unopened = true; h.render();
  assert(h.check('T1'));
  assert(h.all().some(n => n.type === 'Notice' && n.props.error && n.props.children === 'payments.checkoutFailed'));
  assert.equal(h.all().some(n => ['payments.unresolvedAttempt', 'payments.pending', 'payments.returnToInvoices', 'payments.savedAttempts'].includes(n.props.children)), false);
  assert.equal(h.calls.some(call => call[0] === 'start'), false);
  await h.press(h.check('T1')); await h.press(h.method('paypal'));
  assert.equal(h.button('payments.continue').props.disabled, false);
  assert.equal(h.calls.some(call => call[0] === 'start'), false);
});

test('closing a provider shows current invoices and never automatically prepares another payment', async () => {
  const h = harness([legacy], key);
  h.flow.provider = { kind: 'redirect', url: 'https://www.paypal.com/checkoutnow?token=SYNTHETIC' }; h.render();
  assert.equal(h.check('T1').props.disabled, true);
  const provider = h.find(n => n.type === 'Provider');
  await provider.props.onClose(); h.render();
  assert.equal(h.check('T1').props.disabled, false);
  assert.equal(h.all().some(n => n.props.children === 'payments.pending'), false);
  assert.deepEqual(h.calls, [['closeProvider']]);
});

test('provider failure returns to invoices with a short constant diagnostic and no automatic retry', async () => {
  const h = harness();
  h.flow.provider = { kind: 'redirect', url: 'https://secure3.euplatesc.ro/tdsprocess/checkout.php?cart_id=SYNTHETIC&mid=SYNTHETIC' }; h.render();
  await h.find(n => n.type === 'Provider').props.onFailure(); h.render();
  assert.equal(h.check('T1').props.disabled, false);
  assert(h.all().some(n => n.props.children === 'payments.providerInterrupted'));
  assert(h.all().some(n => n.props.children === 'payments.diagnostic:{"code":"PROVIDER_INTERRUPTED"}'));
  assert.equal(h.all().some(n => ['payments.pending', 'payments.savedAttempts', 'payments.paid'].includes(n.props.children)), false);
  assert.deepEqual(h.calls, [['providerFailed']]);
});

test('no unpaid invoices does not display old attempts or a payment action', () => {
  const h = harness([legacy]); h.resource.data.catalog.invoiceGroups = []; h.render();
  assert(h.all().some(n => n.props.children === 'accountOps.noUnpaidInvoices'));
  assert.equal(h.all().some(n => ['payments.savedAttempts', 'payments.resume', 'payments.continue'].includes(n.props.children)), false);
});

test('the current bPay code can be closed for another method without retaining a UI history or starting payment', async () => {
  const terminal = { ...legacy, version: 2, paymentId: '42', paymentType: 'terminals', phase: 'checkout', scope: { currencyId: '1', currency: 'USD', invoices: [invoice('1')] } };
  const h = harness([terminal], key);
  h.flow.action = { kind: 'terminal', paymentCode: '42', amount: '19.50', currencySign: 'MDL' }; h.render();
  assert(h.all().some(n => n.props.children === '42'));
  assert(h.all().some(n => n.props.children === '19.50 MDL'));
  assert(h.all().some(n => n.props.children === 'payments.terminalOtherMethods'));
  await h.press(h.button('payments.chooseOtherMethod'));
  assert.deepEqual(h.calls, [['showInvoices']]);
  assert.equal(h.check('T1').props.disabled, false);
  assert.equal(h.all().some(n => ['payments.savedAttempts', 'payments.terminalCode'].includes(n.props.children)), false);
  await h.press(h.check('T1')); await h.press(h.method('payments.card'));
  assert.equal(h.button('payments.continue').props.disabled, false);
  assert.equal(h.calls.some(call => call[0] === 'start'), false);
  await h.press(h.button('payments.continue'));
  assert.equal(h.calls.filter(call => call[0] === 'start').length, 1);
});

test('only a server-confirmed paid status displays payment success; pending stays on invoices', async () => {
  const h = harness([legacy], key);
  h.flow.status = { paymentId: '42', state: 'unconfirmed' }; h.render();
  assert(h.check('T1')); assert.equal(h.all().some(n => n.props.children === 'payments.paid'), false);
  h.flow.status = { paymentId: '42', state: 'paid' }; h.render();
  assert(h.all().some(n => n.props.children === 'payments.paid'));
  assert(h.all().some(n => n.props.children === 'payments.synced'));
  await h.press(h.button('payments.done'));
  assert(h.check('T1')); assert.deepEqual(h.calls, [['finish']]);
});

test('invoice reconciliation says invoices paid without claiming a particular transaction succeeded or was retained', async () => {
  const h = harness([legacy], key); h.flow.invoicesPaid = true; h.render();
  assert(h.all().some(n => n.props.children === 'payments.invoicesPaid'));
  assert(h.all().some(n => n.props.children === 'payments.invoicesPaidHelp'));
  assert.equal(h.all().some(n => ['payments.paid', 'payments.synced', 'payments.resume'].includes(n.props.children)), false);
  await h.press(h.button('payments.done'));
  assert.equal(h.check('T1').props.disabled, false);
  assert.equal(h.all().some(n => n.props.children === 'payments.savedAttempts'), false);
});

test('in-flight preparation and stale catalog disable selection and Continue, then a new manual press is required', async () => {
  const h = harness(); await h.press(h.check('T1')); await h.press(h.method('payments.card'));
  h.flow.busy = true; h.render();
  assert.equal(h.check('T1').props.disabled, true); assert.equal(h.button('payments.submitting').props.disabled, true);
  h.flow.busy = false; h.resource.loading = true; h.render(); assert.equal(h.button('payments.continue').props.disabled, true);
  h.resource.loading = false; h.resource.error = 'errors.network'; h.render(); assert.equal(h.button('payments.continue').props.disabled, true);
  h.resource.error = null; h.render(); assert.equal(h.button('payments.continue').props.disabled, false);
  assert.equal(h.calls.some(call => call[0] === 'start'), false);
});

for (const [platform, id, title, channel] of [['ios', 'apple-pay', 'Apple Pay', 'APAY'], ['ios', 'google-pay', 'Google Pay', 'GPAY'], ['android', 'google-pay', 'Google Pay', 'GPAY']]) {
  test(`${title} on ${platform}: Continue requires currency support from both the wallet and the card preparation after catalog changes`, async () => {
    const h = harness([], null, platform);
    const wallet = { id, currencies: ['USD'] };
    h.resource.data.catalog.methods.push(wallet); h.render();
    await h.press(h.check('T1'));
    await h.press(h.method(title));
    assert(h.all().some(n => n.props.children === 'payments.viaEuplatesc'));
    assert.equal(h.button('payments.continue').props.disabled, false);
    const card = h.resource.data.catalog.methods[0];
    card.currencies = ['EUR']; h.render();
    assert.equal(h.method(title).props.disabled, true);
    assert.equal(h.button('payments.continue').props.disabled, true);
    card.currencies = ['USD', 'EUR']; wallet.currencies = ['EUR']; h.render();
    assert.equal(h.button('payments.continue').props.disabled, true);
    wallet.currencies = ['USD']; h.render();
    assert.equal(h.button('payments.continue').props.disabled, false);
    await h.press(h.button('payments.continue'));
    const selection = h.calls.find(call => call[0] === 'start')[1];
    assert.equal(selection.paymentType, 'platescro');
    assert.equal(selection.hostedChannel, channel);
  });
}

test('new payment states and channel labels have Romanian, Russian and English translations', () => {
  for (const key of ['payments.card', 'payments.viaEuplatesc', 'payments.invoicesPaid', 'payments.invoicesPaidHelp', 'payments.terminalOtherMethods', 'payments.chooseOtherMethod', 'payments.serverConfirmation', 'payments.localCleanupFailed', 'payments.minimumFee', 'payments.minimumBeforeFixed', 'payments.terminalEquivalent']) {
    for (const language of ['ro', 'ru', 'en']) assert.equal(typeof messagesPayments[key]?.[language], 'string', `${key}:${language}`);
  }
});


test('a preparation diagnostic is visible only with an error and contains a constant code, not a private URL', () => {
  const h = harness();
  h.flow.diagnosticCode = 'HOSTED_URL_ORIGIN'; h.render();
  assert.equal(h.all().some(n => typeof n.props.children === 'string' && n.props.children.startsWith('payments.diagnostic:')), false);
  h.flow.error = 'payments.checkoutFailed'; h.render();
  assert(h.all().some(n => n.props.children === 'payments.diagnostic:{"code":"HOSTED_URL_ORIGIN"}'));
  h.flow.diagnosticCode = 'https://secure3.euplatesc.ro/checkout?private=synthetic'; h.render();
  assert.equal(h.all().some(n => typeof n.props.children === 'string' && n.props.children.startsWith('payments.diagnostic:')), false);
  assert(h.check('T1'));
  assert.equal(h.calls.some(call => call[0] === 'start'), false);
});

test('new errors and current results scroll into view without animation or repeated jumps on ordinary renders', () => {
  const h = harness(); assert.equal(h.scrollCalls.length, 0);
  h.flow.error = 'payments.checkoutFailed'; h.render();
  assert.equal(h.scrollCalls.length, 1);
  assert.equal(h.scrollCalls[0].y, 0); assert.equal(h.scrollCalls[0].animated, false);
  h.render(); assert.equal(h.scrollCalls.length, 1);
  h.flow.error = null; h.render(); assert.equal(h.scrollCalls.length, 1);
  h.flow.action = { kind: 'terminal', paymentCode: '42', amount: '19.50', currencySign: 'MDL' }; h.render();
  assert.equal(h.scrollCalls.length, 2);
  h.render(); assert.equal(h.scrollCalls.length, 2);
  h.flow.action = null; h.render();
  h.flow.status = { paymentId: '42', state: 'paid' }; h.render();
  assert.equal(h.scrollCalls.length, 3);
  assert(h.scrollCalls.every(options => options.y === 0 && options.animated === false));
});


test('unpaid invoices default to checked only in the displayed currency, without starting payment', async () => {
  const h = harness();
  assert.equal(h.check('T1').props['aria-checked'], true);
  assert.equal(h.check('T2').props['aria-checked'], true);
  assert.equal(h.all().filter(n => n.props.accessibilityRole === 'checkbox').length, 2);
  assert.equal(h.calls.length, 0);
  await h.press(h.method('paypal')); await h.press(h.button('payments.continue'));
  const selection = h.calls.find(call => call[0] === 'start')[1];
  assert.deepEqual([...selection.billIds], ['1', '2']);
  assert.equal(selection.paymentType, 'paypal');
});

test('explicit deselections survive a refreshed catalog and currency switches; new unpaid rows default checked', async () => {
  const h = harness(); await h.press(h.check('T1'));
  h.resource.data.catalog.invoiceGroups = [
    { currencyId: '1', currency: 'USD', invoices: [invoice('1', '2.30'), invoice('2'), invoice('4', '3.4567')] },
    { currencyId: '2', currency: 'EUR', invoices: [invoice('3')] },
  ]; h.render();
  assert.equal(h.check('T1').props['aria-checked'], false);
  assert.equal(h.check('T2').props['aria-checked'], true);
  assert.equal(h.check('T4').props['aria-checked'], true);
  h.find(n => n.type === 'Choice').props.onChange('EUR'); h.render();
  assert.equal(h.check('T3').props['aria-checked'], true);
  await h.press(h.check('T3'));
  h.find(n => n.type === 'Choice').props.onChange('USD'); h.render();
  assert.equal(h.check('T1').props['aria-checked'], false);
  assert.equal(h.check('T4').props['aria-checked'], true);
  await h.press(h.method('paypal')); await h.press(h.button('payments.continue'));
  const call = h.calls.find(c => c[0] === 'start');
  assert.deepEqual([...call[1].billIds], ['2', '4']);
  assert.equal(call[2].catalog.invoiceGroups[0].invoices[2].amount, '3.4567');
  h.find(n => n.type === 'Choice').props.onChange('EUR'); h.render();
  assert.equal(h.check('T3').props['aria-checked'], false);
  assert.equal(h.button('payments.continue').props.disabled, true);
});

test('paid or removed invoices leave the selection immediately; invalid and duplicate rows cannot be checked', async () => {
  const h = harness();
  h.resource.data.catalog.invoiceGroups[0].invoices = [invoice('2'), invoice('4', '0.00'), invoice('5', '-1'), invoice('6', '1e2'), invoice('0'), invoice('3')];
  h.render();
  assert.equal(h.all().some(n => n.props.accessibilityLabel?.startsWith('T1,')), false);
  for (const id of ['4', '5', '6', '0', '3']) {
    assert.equal(h.check(`T${id},`).props['aria-checked'], false);
    assert.equal(h.check(`T${id},`).props.disabled, true);
  }
  await h.press(h.method('paypal')); await h.press(h.button('payments.continue'));
  assert.deepEqual([...h.calls.find(c => c[0] === 'start')[1].billIds], ['2']);
});

test('clearing and selecting all operates on the current eligible currency only', async () => {
  const h = harness();
  await h.press(h.button('payments.clearSelection'));
  assert.equal(h.check('T1').props['aria-checked'], false);
  assert.equal(h.check('T2').props['aria-checked'], false);
  await h.press(h.method('paypal')); assert.equal(h.button('payments.continue').props.disabled, true);
  h.render(); assert.equal(h.check('T1').props['aria-checked'], false);
  await h.press(h.button('payments.selectAll'));
  assert.equal(h.check('T1').props['aria-checked'], true);
  assert.equal(h.check('T2').props['aria-checked'], true);
  h.find(n => n.type === 'Choice').props.onChange('EUR'); h.render();
  assert.equal(h.check('T3').props['aria-checked'], true);
  assert.equal(h.calls.some(c => c[0] === 'start'), false);
});


test('server fee conditions show only positive components, retaining the checkout currency and exact decimal text', () => {
  const h = harness();
  h.resource.data.catalog.methods[1] = { id: 'paypal', currencies: ['USD', 'EUR'], percent: '3.9000', additionalFixedCommission: '0.3500', minimalCommission: '0.1000' };
  h.render();
  assert(h.all().some(n => n.props.children === '3.9% + 0.35 USD'));
  assert(h.all().some(n => n.props.children === 'payments.minimumBeforeFixed:{"amount":"0.1 USD"}'));
  h.find(n => n.type === 'Choice').props.onChange('EUR'); h.render();
  assert(h.all().some(n => n.props.children === '3.9% + 0.35 EUR'));
  const method = h.resource.data.catalog.methods[1];
  method.percent = '0'; method.additionalFixedCommission = '0.00'; h.render();
  assert.equal(h.all().some(n => n.props.children === 'payments.commission'), false);
  assert.equal(h.all().some(n => typeof n.props.children === 'string' && n.props.children.startsWith('payments.minimum')), false);
  assert.equal(h.calls.some(c => c[0] === 'start'), false);
});

test('hosted wallet fee conditions use the signed card preparation method, not the old native method fee', () => {
  const h = harness();
  h.resource.data.catalog.methods[0].percent = '1.25';
  h.resource.data.catalog.methods.push({ id: 'apple-pay', currencies: ['USD'], percent: '99', additionalFixedCommission: '500', minimalCommission: '100' });
  h.render();
  const wallet = h.method('Apple Pay');
  const strings = JSON.stringify(wallet.props.children);
  assert(strings.includes('1.25%'));
  assert(!strings.includes('99%')); assert(!strings.includes('500 USD'));
});


test('bPay shows only the matching attempt equivalent with the exact destination label supplied by the server', () => {
  const terminalAttempt = { ...legacy, version: 2, paymentType: 'terminals', scope: { currency: 'EUR', invoices: [invoice('1')] } };
  const h = harness([terminalAttempt], key);
  h.flow.action = { kind: 'terminal', paymentCode: '42', amount: '123.456', currencySign: 'RON' };
  h.flow.terminalOrigin = { attemptKey: key, currency: 'EUR', amount: '12.3400' }; h.render();
  assert(h.all().some(n => n.props.children === 'payments.terminalEquivalent:{"original":"12.3400 EUR","converted":"123.456 RON"}'));
  assert.equal(h.all().some(n => typeof n.props.children === 'string' && n.props.children.includes('MDL')), false);
  h.flow.terminalOrigin.attemptKey = 'other'; h.render();
  assert.equal(h.all().some(n => typeof n.props.children === 'string' && n.props.children.startsWith('payments.terminalEquivalent:')), false);
  h.flow.terminalOrigin.attemptKey = key; h.flow.action.currencySign = null; h.render();
  assert.equal(h.all().some(n => typeof n.props.children === 'string' && n.props.children.startsWith('payments.terminalEquivalent:')), false);
});


test('only initial payment readiness gates the page; checkout and confirmation do not', () => {
  const h = harness();
  assert.deepEqual(h.pageLoads.at(-1), { pending: false, blocking: false });
  h.flow.ready = false; h.render();
  assert.deepEqual(h.pageLoads.at(-1), { pending: true, blocking: true });
  h.flow.ready = true; h.flow.busy = true; h.flow.checking = true; h.flow.provider = { kind: 'redirect', url: 'https://payment.example.test' }; h.render();
  assert.deepEqual(h.pageLoads.at(-1), { pending: false, blocking: false });
});


test('native browser stage diagnosis reaches the invoice error unchanged', async () => {
  const h = harness();
  h.flow.provider = { kind: 'redirect', url: 'https://secure3.euplatesc.ro/checkout?cart_id=SYNTHETIC' }; h.render();
  await h.find(n => n.type === 'Provider').props.onFailure('BROWSER_LOCKED'); h.render();
  assert.deepEqual(h.calls, [['providerFailed', 'BROWSER_LOCKED']]);
  assert(h.all().some(n => n.props.children === 'payments.diagnostic:{"code":"BROWSER_LOCKED"}'));
  assert.equal(h.check('T1').props.disabled, false);
});
