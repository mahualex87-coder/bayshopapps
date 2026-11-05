import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { cartProductUrl, cartItemFields, OperationValidationError } from '../src/api/operations-contracts.ts';
import { cartMarketMatches, normalizeCartLinkData } from '../src/api/cart-link.ts';
import { zaraProductUrl } from '../src/features/shops/zara-product.ts';
import { requireShopMatch } from '../src/api/shop-directory.ts';
import { normalizeUserUrl } from '../src/domain/user-url.ts';
import { requestDraftLeave } from '../src/navigation/draft-leave.ts';

const source = readFileSync(new URL('../src/features/commerce/CartLinkEditor.tsx', import.meta.url), 'utf8');
const script = new vm.Script(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText);
const jsx = (type, props) => ({ type, props });
function find(node, predicate) {
  if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
  if (!node || typeof node !== 'object') return;
  return predicate(node) ? node : find(node.props?.children, predicate);
}
function mount({ match = true, verified = true, standalone = false, zara = false, currency = 'RON', linkResponse, onWrite } = {}) {
  let index, tree, guard, pendingDiscard, closed = 0;
  const slots = [], reads = [], detailReads = [];
  const react = {
    useState(initial) {
      const i = index++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useEffect() {},
  };
  const shop = { id: '7', countryCode: 'RO', storageId: '12', directoryVerified: verified };
  const live = { canMutate: true, mutationPending: false,
    async readView(query) {
      reads.push(query.kind);
      if (query.kind === 'shops.match') return { verified: true, matchedShopId: match ? '7' : null, shops: [shop] };
      assert.equal(query.kind, 'cart.link');
      if (linkResponse) return normalizeCartLinkData(linkResponse);
      return { canSave: true, storageId: '12', storages: [{ id: '12', countryCode:'RO', currency }], shipping: null };
    },
    mutate(command) { if (onWrite) return onWrite(command); assert.fail('Displaying or checking a form must not send a write'); },
  };
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'react-native': { Text: 'Text', View: 'View', Pressable: 'Pressable' },
    '@expo/vector-icons/Ionicons': { default: 'Icon' }, 'expo-router': { router: { push() { assert.fail('No intermediate route'); } } },
    '@/api/cart-link': {cartMarketMatches}, '@/features/shops/ZaraShopBrowser': {ZaraShopBrowser:'ZaraShopBrowser'}, '@/features/shops/zara-product': {zaraProductUrl},
    '@/api/context': { useLiveAccount: () => live }, '@/api/client': { errorMessage: error => error.message }, '@/api/shop-directory': { requireShopMatch },
    '@/api/operations-contracts': { cartProductUrl, cartItemFields, OperationValidationError }, '@/domain/user-url': { normalizeUserUrl }, '@/i18n/context': { useI18n: () => ({ t: key => key }) },
    '@/navigation/useDraftGuard': { useDraftGuard(dirty, options) {
      guard = options;
      return { confirmDiscard: proceed => requestDraftLeave(() => ({ dirty, pending: options.pending }), confirm => { pendingDiscard = confirm; }, proceed) };
    } },
    '@/features/accountops/shared': { OptionPicker: 'Picker' }, '@/ui': { Screen: 'Screen', Field: 'Field', Button: 'Button', Notice: 'Notice', useUi: () => ({ s: {}, colors: {} }) },
    './ProductDetailsFields': { ProductDetailsFields: 'ProductDetailsFields' }, '@/features/live/shared': { ResourceStatus: 'ResourceStatus' },
    '@/features/shops/useShopBrowse': { useShopBrowse: query => { if (query) detailReads.push(query); return { resource: { data: null } }; } },
  };
  const exports = {};
  script.runInNewContext({ exports, AbortController, require: name => { assert.ok(imports[name], name); return imports[name]; } });
  function render() {
    index = 0;
    const editor = exports.CartLinkEditor(standalone ? {} : { inlineShop: shop, onClose: () => { closed++; }, initialStorageId: '12', zaraUrl:zara ? 'https://www.zara.com/ro/ro/' : null,
      ...(verified ? { selectedShop: {id: '7', countryCode: 'RO'} } : {}) });
    const section = editor.type(editor.props);
    tree = section.type(section.props);
    return tree;
  }
  render();
  return { render, reads, detailReads, button: key => find(tree, n => n.type === 'Button' && n.props.children === key), node: type => find(tree, n => n.type === type), close: () => find(tree, n => n.props?.accessibilityLabel === 'shops.closeForm')?.props.onPress(),
    check: () => find(tree, n => n.type === 'Button' && n.props.children === 'cartLink.check').props.onPress(), back: () => guard.onBack(), discard: () => pendingDiscard?.(), closed: () => closed,
    enter() { this.node('Field').props.onChangeText('https://shop.example/product'); render(); } };
}

test('inline form is mounted immediately, avoids a second detail read and verifies URL, shop and warehouse before showing product fields', async () => {
  for (const match of [true, false]) {
    const h = mount({ match });
    assert.equal(h.render().type, 'View'); assert.ok(h.node('Field')); assert.equal(h.node('ProductDetailsFields'), undefined);
    h.enter(); h.check(); await new Promise(resolve => setImmediate(resolve)); h.render();
    assert.deepEqual(h.reads, ['cart.link', 'shops.match']); assert.deepEqual(h.detailReads, []);
    assert.equal(!!h.node('ProductDetailsFields'), match);
  }
});
test('legacy uses the general form, and standalone routing still owns exactly one screen', async () => {
  const h = mount({ verified: false }); h.enter(); h.check(); await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.deepEqual(h.reads, ['cart.link']); assert.ok(h.node('ProductDetailsFields'));
  assert.equal(mount({ standalone: true }).render().type, 'Screen');
});
test('empty form closes immediately; an edited form stays until discard is confirmed, including Back', () => {
  const empty = mount(); empty.close(); assert.equal(empty.closed(), 1);
  const edited = mount(); edited.enter(); edited.close(); assert.equal(edited.closed(), 0);
  assert.equal(edited.back(), true); assert.equal(edited.closed(), 0); edited.discard(); assert.equal(edited.closed(), 1);
});

test('Zara selection prefills the reviewed product only for the confirmed RON warehouse; import never posts', async () => {
  const product = { url: 'https://www.zara.com/ro/ro/bluza-p12345678.html?v1=2', title: 'Bluză', price: '179.90', currency: 'RON', color: 'Alb', size: 'M', sku: '209001' };
  for (const currency of ['RON','EUR',null]) {
    const h = mount({zara:true, currency});
    h.button('zara.browse').props.onPress(); h.render();
    h.node('ZaraShopBrowser').props.onProduct(product);
    await new Promise(resolve => setImmediate(resolve)); h.render();
    assert.equal(h.node('ZaraShopBrowser'), undefined);
    assert.equal(h.node('Field').props.value, product.url);
    const fields = h.node('ProductDetailsFields');
    if (currency === 'RON') {
      assert.equal(fields.props.values.price, product.price); assert.equal(fields.props.values.size, product.size);
      assert.equal(fields.props.values.color, product.color); assert.equal(fields.props.values.title, product.title);
      assert.equal(fields.props.currency, 'RON'); assert.deepEqual(h.reads, ['cart.link','shops.match']);
    } else { assert.equal(fields, undefined); assert.deepEqual(h.reads, ['cart.link']); }
  }
});
test('browsing a replacement preserves an existing manual draft until explicit confirmation', async () => {
  const h = mount({ zara:true }); h.enter(); h.button('zara.browse').props.onPress(); h.render();
  h.node('ZaraShopBrowser').props.onProduct({url:'https://www.zara.com/ro/ro/test-p12345678.html', title:'Z', price:'12',currency:'RON',color:'Blue',size:'L',sku:null});
  h.render(); assert.deepEqual(h.reads, []); assert.equal(h.node('Field').props.value, 'https://shop.example/product');
  h.button('confirmation.keepEditing').props.onPress(); h.render();
  assert.equal(h.button('zara.replace'), undefined); assert.deepEqual(h.reads, []);
});

test('Romanian Zara products from the mobile browser open editable RON fields and add to the cart on the legacy contract', async () => {
  const products = [
    ['jacheta-tehnica-relaxed-fit-cu-gluga-p03411330.html?v1=552297497', 'Jachetă tehnică', 'Negru', 'M', '159.90'],
    ['sacou-de-costum-confort-p04456999.html?v1=565424841', 'Sacou de costum', 'Ocru', '44', '209.90'],
    ['geaca-water-repellent-80-pum-de-gasca---20-pene-p02634384.html?v1=549815743', 'Geacă water repellent', 'Negru / Maro', 'M', '359.90'],
  ];
  for (const [path, title, color, size, price] of products) {
    const writes = [];
    const h = mount({ zara: true, verified: false,
      linkResponse: { storage_id: 12, shipping: '0.00', storageList: [{ storage_id: 12, countryCode: 'RO', countryTitle: 'România', currency_sign: 'RON' }] },
      onWrite: async command => {
        writes.push(cartItemFields(command.input));
        return { ok: true, data: { id: null, storageId: '12' } };
      },
    });
    const url = 'https://www.zara.com/ro/ro/' + path;
    h.button('zara.browse').props.onPress(); h.render();
    h.node('ZaraShopBrowser').props.onProduct({ url, title, price, color, size, currency: 'RON' });
    await new Promise(resolve => setImmediate(resolve)); h.render();
    assert.deepEqual(h.reads, ['cart.link']);
    assert.equal(h.node('ProductDetailsFields').props.currency, 'RON');
    assert.equal(h.button('cartLink.add').props.disabled, false);
    h.button('cartLink.add').props.onPress(); await new Promise(resolve => setImmediate(resolve)); h.render();
    assert.deepEqual(writes, [{ storage_id: '12', url, title, price, quantity: '1', shipping: '0', color, size, comment: '' }]);
    assert.ok(h.button('commerce.openCart'));
  }
});

test('two explicit Add taps on a reviewed Zara draft send exactly one cart item with the selected variant', async () => {
  const writes = [];
  let acknowledge;
  const h = mount({ zara:true, onWrite: command => {
    assert.equal(command.kind, 'cart.create');
    assert.equal(command.input.expectedMarket.countryCode, 'RO'); assert.equal(command.input.expectedMarket.currency, 'RON');
    writes.push(cartItemFields(command.input));
    return new Promise(resolve => { acknowledge = resolve; });
  } });
  const url = 'https://www.zara.com/ro/ro/tricou-p12345678.html?v1=204020';
  h.button('zara.browse').props.onPress(); h.render();
  h.node('ZaraShopBrowser').props.onProduct({url, title:'Tricou', price:'85.90',currency:'RON',color:'Verde',size:'L',sku:'300L'});
  await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.equal(writes.length, 0);
  h.node('ProductDetailsFields').props.onChange('shipping','0'); h.render();
  const add = h.button('cartLink.add').props.onPress;
  add(); add();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], {storage_id:'12',url,title:'Tricou',price:'85.90',quantity:'1',shipping:'0',color:'Verde',size:'L',comment:''});
  acknowledge({ ok:true, data:{id:null,storageId:'12'} }); await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.equal(h.button('cartLink.add'), undefined); assert.equal(writes.length, 1);
});
test('incomplete Zara capture opens the current product link with a clean editable draft only after confirmation', async () => {
  const h = mount({zara:true});
  const original = {url:'https://www.zara.com/ro/ro/bluza-p12345678.html?v1=2', title:'Bluză', price:'179.90', currency:'RON', color:'Alb', size:'M', sku:'209001'};
  const next = 'https://www.zara.com/ro/ro/geaca-p02634384.html?v1=549815743';
  h.button('zara.browse').props.onPress(); h.render();
  h.node('ZaraShopBrowser').props.onProduct(original);
  await new Promise(resolve => setImmediate(resolve)); h.render();
  h.button('zara.browse').props.onPress(); h.render();
  h.node('ZaraShopBrowser').props.onProduct({url:next}); h.render();
  assert.equal(h.node('Field').props.value,original.url);
  assert.equal(h.node('ProductDetailsFields').props.values.size,'M');
  h.button('zara.replace').props.onPress(); await new Promise(resolve => setImmediate(resolve)); h.render();
  assert.equal(h.node('Field').props.value,next);
  const fields=h.node('ProductDetailsFields');
  assert.ok(fields); assert.equal(fields.props.currency,'RON');
  for (const k of ['price','size','color','title']) assert.equal(fields.props.values[k],'');
  assert.deepEqual(h.reads,['cart.link','shops.match','cart.link','shops.match']);
  const mismatch = mount({zara:true,currency:'EUR'});
  mismatch.button('zara.browse').props.onPress(); mismatch.render();
  mismatch.node('ZaraShopBrowser').props.onProduct({url:next});
  await new Promise(resolve=>setImmediate(resolve)); mismatch.render();
  assert.equal(mismatch.node('ProductDetailsFields'), undefined);
});
