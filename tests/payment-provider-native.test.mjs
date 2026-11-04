import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from '../src/features/payments/provider-policy.ts';

const origin = 'https://bayshop.com';
const form = { kind: 'form', url: 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php', method: 'POST', fields: { invoice_id: '123', amount: '12.34', description: 'A & B', fp_hash: 'synthetic-signature' } };
const paypal = { kind: 'redirect', url: 'https://www.paypal.com/checkoutnow?token=synthetic-order' };

function harness(action, onFailure) {
  const slots = [], calls = [];
  let cursor = 0, closeCount = 0;
  const react = {
    useRef(initial) { const slot = cursor++; return slots[slot] ??= { current: initial }; },
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
  };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Modal: 'Modal', Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-native-webview': { WebView: 'WebView' },
    '@/api/client': { API_ORIGIN: origin },
    '@/ui': { Button: 'Button', Notice: 'Notice', useUi: () => ({ s: {}, colors: {} }) },
    '@/i18n/context': { useI18n: () => ({ t: key => key }) },
    './provider-policy': policy,
    './PayPalBrowser': { PayPalBrowser: 'PayPalBrowser' },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/features/payments/PaymentProvider.native.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, URL, require: name => { assert(name in imports, name); return imports[name]; } });
  const render = (next = action) => {
    cursor = 0;
    let tree = exports.PaymentProvider({ action: next, onReturn: id => calls.push(id), onClose: () => closeCount++, onFailure });
    while (typeof tree.type === 'function') tree = tree.type(tree.props);
    const find = (node, type) => {
      if (!node || typeof node !== 'object') return null;
      if (node.type === type) return node;
      return [node.props?.children].flat().map(child => find(child, type)).find(Boolean) ?? null;
    };
    return { modal: find(tree, 'Modal')?.props, web: find(tree, 'WebView')?.props, paypal: find(tree, 'PayPalBrowser')?.props };
  };
  return { render, calls, closed: () => closeCount };
}

test('hosted wallets are enabled without injecting script, account headers or replaying a signed POST', () => {
  const h = harness(form);
  const first = h.render().web;
  assert.equal(first.enableApplePay, true);
  assert.equal(first.paymentRequestEnabled, true);
  assert.equal(first.injectedJavaScript, undefined);
  assert.equal(first.injectedJavaScriptBeforeContentLoaded, undefined);
  assert.equal(first.onMessage, undefined);
  assert.equal(first.sharedCookiesEnabled, false);
  assert.equal(first.source.method, 'POST');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(first.source.body)), form.fields);
  assert.deepEqual(Object.keys(first.source.headers), ['Content-Type']);
  const next = h.render({ ...form, fields: { ...form.fields, invoice_id: '456' } }).web;
  assert.equal(next.source, first.source);
  next.onLoadEnd({ nativeEvent: { url: `${origin}/member/payments/platescro/success/456` } });
  assert.deepEqual(h.calls, ['123']);
});

test('PayPal redirects use the OS browser component, never the embedded payment WebView', () => {
  const h = harness(paypal), rendered = h.render();
  assert.equal(rendered.web, undefined); assert.equal(rendered.paypal.action, paypal);
  rendered.paypal.onReturn(); rendered.paypal.onClose();
  assert.deepEqual(h.calls, [undefined]); assert.equal(h.closed(), 1);
});

test('unrelated or uncorrelated account pages never trigger a status callback', () => {
  const h = harness(form), web = h.render().web;
  for (const url of [`${origin}/member/profile`, `${origin}/member/payments/paypal/process?payment=987&token=wrong`, 'https://other.example/member/payments/paypal/success']) {
    web.onNavigationStateChange({ url });
    web.onLoadEnd({ nativeEvent: { url } });
  }
  assert.deepEqual(h.calls, []);
});

test('close, unsafe navigation and failed or popup checkout discard late return callbacks', () => {
  for (const interrupt of ['close', 'unsafe', 'error', 'popup']) {
    const h = harness(form), { web, modal } = h.render();
    if (interrupt === 'close') { modal.onRequestClose(); assert.equal(h.closed(), 1); }
    else if (interrupt === 'unsafe') assert.equal(web.onShouldStartLoadWithRequest({ url: 'intent://untrusted' }), false);
    else if (interrupt === 'error') web.onHttpError({ nativeEvent: { statusCode: 500 } });
    else web.onOpenWindow({ nativeEvent: { targetUrl: 'https://unverified.example' } });
    web.onLoadEnd({ nativeEvent: { url: `${origin}/member/payments/platescro/success` } });
    assert.deepEqual(h.calls, []);
  }
});

test('known payment remains recoverable after process HTTP500 or user closes during capture', () => {
  for (const interrupt of ['close', 'http500']) {
    const h = harness(form), { web, modal } = h.render();
    const processUrl = `${origin}/member/payments/platescro/process`;
    assert.equal(web.onShouldStartLoadWithRequest({ url: processUrl }), true);
    web.onNavigationStateChange({ url: processUrl });
    assert.deepEqual(h.calls, []);
    if (interrupt === 'close') modal.onRequestClose();
    else web.onHttpError({ nativeEvent: { statusCode: 500 } });
    assert.deepEqual(h.calls, ['123']);
    web.onLoadEnd({ nativeEvent: { url: processUrl } });
    assert.deepEqual(h.calls, ['123']);
  }
});

test('callback navigation keeps the WebView mounted until the server return has completed', () => {
  const h = harness(form), { web } = h.render();
  const url = `${origin}/member/payments/platescro/process`;
  assert.equal(web.onShouldStartLoadWithRequest({ url, isTopFrame: true }), true);
  web.onNavigationStateChange({ url });
  assert.deepEqual(h.calls, []);
  assert(h.render().web, 'No early parent callback may close the view during the server request');
  web.onLoadEnd({ nativeEvent: { url } });
  assert.deepEqual(h.calls, ['123']);
  web.onLoadEnd({ nativeEvent: { url } });
  web.onHttpError({ nativeEvent: { statusCode: 500 } });
  assert.deepEqual(h.calls, ['123']);
});

test('provider failures notify the parent once, without claiming payment success or keeping a failed checkout open', () => {
  for (const afterCallback of [false, true]) {
    let failures = 0;
    const h = harness(form, () => failures++), { web } = h.render();
    const url = `${origin}/member/payments/platescro/process`;
    if (afterCallback) web.onNavigationStateChange({ url });
    web.onHttpError({ nativeEvent: { statusCode: 500 } });
    web.onError({ nativeEvent: {} });
    web.onLoadEnd({ nativeEvent: { url } });
    assert.equal(failures, 1);
    assert.deepEqual(h.calls, []); // The parent checks its original owned payment ID.
    assert.equal(h.render().web, undefined);
  }
  let redirectedFailures = 0;
  const h = harness(paypal, () => redirectedFailures++);
  h.render().paypal.onFailure();
  assert.equal(redirectedFailures, 1);
  assert.deepEqual(h.calls, []);
});

test('installed WebView supplies Android payment intents and supported WebKit dependency', () => {
  const base = new URL('../node_modules/react-native-webview/', import.meta.url);
  const manifest = readFileSync(new URL('android/src/main/AndroidManifest.xml', base), 'utf8');
  for (const intent of ['PAY', 'IS_READY_TO_PAY', 'UPDATE_PAYMENT_DETAILS']) assert.ok(manifest.includes(`org.chromium.intent.action.${intent}`));
  const properties = readFileSync(new URL('android/gradle.properties', base), 'utf8');
  const version = /ReactNativeWebView_webkitVersion=(\d+)\.(\d+)/.exec(properties);
  assert.ok(version && (+version[1] > 1 || +version[1] === 1 && +version[2] >= 14));
});

test('3DS may initialize a blank child frame, but child frames cannot supply account payment references', () => {
  const h = harness(form), web = h.render().web;
  assert.equal(web.onShouldStartLoadWithRequest({ url: 'about:blank', isTopFrame: false }), true);
  assert.equal(web.onShouldStartLoadWithRequest({ url: `${origin}/member/payments/paypal/process?payment=987&token=synthetic-order`, isTopFrame: false }), true);
  assert.deepEqual(h.calls, []);
  const other = harness(form).render().web;
  assert.equal(other.onShouldStartLoadWithRequest({ url: 'about:blank', isTopFrame: true }), false);
});
