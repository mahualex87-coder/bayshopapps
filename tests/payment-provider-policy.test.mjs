import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentFormBody, paymentNavigationAllowed } from '../src/features/payments/provider-policy.ts';

test('payment navigation permits HTTPS provider and bank challenges only', () => {
  for (const url of ['https://secure.euplatesc.ro/tds', 'https://secure3.euplatesc.ro/tdsprocess/checkout.php', 'https://www.paypal.com/checkout', 'https://acs.bank.example/challenge']) assert.equal(paymentNavigationAllowed(url), true);
  for (const url of ['http://www.paypal.com/', 'javascript:alert(1)', 'file:///a', 'intent://pay', 'https://user:secret@www.paypal.com', 'https://127.0.0.1/', 'https://[::1]/', 'https://2130706433/', 'https://localhost/', 'https://host.local/', 'https://bank.example:8080/', 'https://bank.example./']) assert.equal(paymentNavigationAllowed(url), false, url);
});
test('payment form values are encoded without interpreting HTML or scripts', () => {
  const fields = { fname: 'A & B', ExtraData: 'a=b&c=d', fp_hash: '00FF', description: '<script>not executed</script>' };
  const parsed = Object.fromEntries(new URLSearchParams(paymentFormBody(fields)));
  assert.deepEqual(parsed, fields);
});

test('PayPal return binds the payment ID to the API approval token and never reports paid', async () => {
  const { inspectPaymentReturn } = await import('../src/features/payments/provider-policy.ts');
  const action = { kind: 'redirect', url: 'https://www.paypal.com/checkoutnow?token=ORDER-123' };
  const origin = 'https://bayshop.com';
  const process = origin + '/member/payments/paypal/process?payment=42&token=ORDER-123';
  assert.deepEqual(inspectPaymentReturn(process, action, origin), { paymentId: '42', finished: false });
  for (const url of [process.replace('ORDER-123', 'OTHER'), process.replace('https://bayshop.com', 'https://bayshop.com.evil.example'), process + '&payment=99', process + '&token=OTHER', process.replace('payment=42', 'payment=-42')]) assert.equal(inspectPaymentReturn(url, action, origin), null, url);
  assert.deepEqual(inspectPaymentReturn(origin + '/member/payments/paypal/success', action, origin), { paymentId: null, finished: true });
  assert.equal(inspectPaymentReturn(process, { ...action, url: 'https://www.paypal.com/checkoutnow' }, origin), null);
});

test('EuPlatesc return can check only the original signed invoice ID', async () => {
  const { inspectPaymentReturn } = await import('../src/features/payments/provider-policy.ts');
  const action = { kind: 'form', url: 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php', fields: { invoice_id: '42' } };
  for (const path of ['/success/99', '/failed', '/process']) {
    const result = inspectPaymentReturn('https://bayshop.com/member/payments/platescro' + path, action, 'https://bayshop.com');
    assert.equal(result.paymentId, '42');
    assert.equal('paid' in result, false);
  }
  assert.equal(inspectPaymentReturn('https://bayshop.com/member/payments/paypal/success', action, 'https://bayshop.com'), null);
});
