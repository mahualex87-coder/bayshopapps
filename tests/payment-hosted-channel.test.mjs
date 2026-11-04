import test from 'node:test';
import assert from 'node:assert/strict';
import { hostedWalletMethod, isHostedPaymentChannel, withHostedPaymentChannel } from '../src/api/payment-hosted-channel.ts';
import { paymentFormBody, inspectPaymentReturn } from '../src/features/payments/provider-policy.ts';

test('only explicitly documented channels are permitted and platform policy is not invented here', () => {
  for (const value of ['CC', 'APAY', 'GPAY']) assert.equal(isHostedPaymentChannel(value), true);
  for (const value of [null, undefined, '', 'cc', 'ApplePay', 'APAY,GPAY', 'CARD', {}]) assert.equal(isHostedPaymentChannel(value), false);
  assert.equal(hostedWalletMethod('APAY'), 'apple-pay'); assert.equal(hostedWalletMethod('GPAY'), 'google-pay');
  assert.equal(hostedWalletMethod('CC'), null); assert.equal(hostedWalletMethod(undefined), null);
});

test('nested channel form preserves invoice text and all signed fields without scalar/array collision', () => {
  const original = Object.freeze({ amount: '1.0000', curr: 'usd', invoice_id: '81', fp_hash: 'synthetic-hash', nonce: 'synthetic-nonce',
    returnurl: 'https://bayshop.com/member/payments/platescro/process', ExtraData: 'SYNTH-11\r\nȘ&=+[]\t12' });
  for (const channel of ['CC', 'APAY', 'GPAY']) {
    const fields = withHostedPaymentChannel(original, channel); const encoded = new URLSearchParams(paymentFormBody(fields));
    assert.equal(encoded.get('ExtraData'), null); assert.equal(encoded.getAll('ExtraData[ep_channel]').length, 1);
    assert.equal(encoded.get('ExtraData[ep_channel]'), channel);
    assert.equal(encoded.get('ExtraData[bayshop_invoice_codes]'), original.ExtraData);
    for (const key of Object.keys(original).filter(key => key !== 'ExtraData')) assert.equal(encoded.get(key), original[key]);
    const action = { kind: 'form', url: 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php', fields };
    assert.deepEqual(inspectPaymentReturn('https://bayshop.com/member/payments/platescro/process', action, 'https://bayshop.com'), { paymentId: '81', finished: false });
  }
  assert.equal(Object.hasOwn(original, 'ExtraData[ep_channel]'), false);
});

test('empty or absent invoice metadata is preserved distinctly; existing nested controls cannot be overwritten', () => {
  assert.deepEqual(withHostedPaymentChannel({}, 'CC'), { 'ExtraData[ep_channel]': 'CC' });
  assert.deepEqual(withHostedPaymentChannel({ ExtraData: '' }, 'APAY'), { 'ExtraData[bayshop_invoice_codes]': '', 'ExtraData[ep_channel]': 'APAY' });
  for (const key of ['ExtraData[ep_channel]', 'ExtraData[successurl]', 'ExtraData[bayshop_invoice_codes]', 'ExtraData[]']) {
    assert.throws(() => withHostedPaymentChannel({ [key]: 'private-provider-data' }, 'GPAY'), error => !error.message.includes('private-provider-data'));
  }
  assert.throws(() => withHostedPaymentChannel({}, 'APAY,GPAY'));
  assert.throws(() => withHostedPaymentChannel({ ExtraData: { nested: true } }, 'APAY'));
});
