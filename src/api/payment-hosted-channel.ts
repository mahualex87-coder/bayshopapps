/** EuPlătesc's hosted checkout channels, not native wallet authorization.
 * Official request contract: https://manager.euplatesc.ro/v3/?page=docs
 * ExtraData[ep_channel] is explicitly outside the signed fields. */
export type HostedPaymentChannel = 'CC' | 'APAY' | 'GPAY';

export function isHostedPaymentChannel(value: unknown): value is HostedPaymentChannel {
  return value === 'CC' || value === 'APAY' || value === 'GPAY';
}

export function hostedWalletMethod(channel: HostedPaymentChannel | undefined): 'apple-pay' | 'google-pay' | null {
  return channel === 'APAY' ? 'apple-pay' : channel === 'GPAY' ? 'google-pay' : null;
}

/** Never send both scalar ExtraData and ExtraData[...] form keys: PHP would
 * overwrite one with the other. Preserve the server's invoice-reference text
 * in the nested metadata instead. Amount, callback, signature and every other
 * original field remain byte-for-byte identical. A pre-existing nested field
 * is rejected rather than replaced, including any provider-supplied channel. */
export function withHostedPaymentChannel(fields: Record<string, string>, channel: HostedPaymentChannel): Record<string, string> {
  if (!isHostedPaymentChannel(channel) || Object.entries(fields).some(([key, value]) => key.startsWith('ExtraData[') || typeof value !== 'string')) {
    throw new Error('Invalid hosted checkout channel');
  }
  const result = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== 'ExtraData'));
  if (Object.hasOwn(fields, 'ExtraData')) result['ExtraData[bayshop_invoice_codes]'] = fields.ExtraData;
  result['ExtraData[ep_channel]'] = channel;
  return result;
}
