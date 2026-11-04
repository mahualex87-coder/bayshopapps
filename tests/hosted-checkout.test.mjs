import test from 'node:test';
import assert from 'node:assert/strict';
import { HostedCheckoutError, isHostedCheckoutUrl, planHostedCheckout, prepareHostedCheckout } from '../src/api/hosted-checkout.ts';

const endpoint = 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php';
const checkoutUrl = 'https://secure.euplatesc.ro/tdsprocess/checkout.php?epid=synthetic-only';
function form(channel = 'APAY') {
  return { kind: 'form', url: endpoint, method: 'POST', fields: {
    amount: '1.0000', curr: 'usd', invoice_id: '42', order_desc: 'SYNTHETIC ONLY\r\nȘ & = +',
    merch_id: 'synthetic-merchant', timestamp: '20261103103000', nonce: 'synthetic-nonce', fp_hash: 'synthetic-signature',
    returnurl: 'https://bayshop.com/member/payments/platescro/process', fname: 'Synthetic',
    'ExtraData[ep_channel]': channel, 'ExtraData[bayshop_invoice_codes]': 'SYNTH-11\r\nȘ & = +',
  } };
}
function response(raw = { url: checkoutUrl }, changes = {}) {
  return { ok: true, status: 200, url: endpoint, redirected: false, text: async () => JSON.stringify(raw), ...changes };
}
function matchError(kind, reason, dispatched = true) {
  return error => {
    assert.ok(error instanceof HostedCheckoutError);
    assert.equal(error.kind, kind); assert.equal(error.reason, reason); assert.equal(error.dispatched, dispatched);
    assert.equal(error.paymentId, dispatched || kind === 'not_dispatched' ? '42' : null);
    assert.equal(error.message, 'Hosted checkout unavailable');
    return true;
  };
}

test('pure plan preserves every signed/billing field and appends only generate_epid once', () => {
  for (const channel of ['APAY', 'GPAY']) {
    const action = form(channel); Object.freeze(action.fields); Object.freeze(action);
    const plan = planHostedCheckout(action); const body = new URLSearchParams(plan.body);
    assert.equal(plan.url, endpoint); assert.equal(plan.channel, channel); assert.equal(plan.paymentId, '42');
    assert.equal(body.size, Object.keys(action.fields).length + 1); assert.deepEqual(body.getAll('generate_epid'), ['1']);
    for (const [key, value] of Object.entries(action.fields)) assert.equal(body.get(key), value);
    assert.equal(Object.hasOwn(action.fields, 'generate_epid'), false);
    assert.equal(body.has('apay_token'), false); assert.equal(body.has('gpay_token'), false);
  }
});

test('wrong channel, endpoint, credential/token fields or contradictory prior controls dispatch nothing', async () => {
  const invalid = [null, { ...form(), kind: 'redirect' }, { ...form(), method: 'GET' },
    ...['https://secure.euplatesc.ro/other', `${endpoint}?x=1`, 'http://secure.euplatesc.ro/tdsprocess/tranzactd.php'].map(url => ({ ...form(), url })),
    ...['CC', undefined, 'GPAY,APAY'].map(channel => ({ ...form(), fields: { ...form().fields, 'ExtraData[ep_channel]': channel } })),
    ...[{ generate_epid: '1' }, { Authorization: 'private-bearer' }, { Cookie: 'private-cookie' }, { apay_token: 'encrypted-private-token' },
      { 'ExtraData[successurl]': 'https://evil.test/' }, { ExtraData: 'scalar collision' }, { invoice_id: '0' }, { amount: '0.0000' },
      { amount: '1e3' }, { curr: 'USD&' }, { timestamp: 'bad' }, { nonce: '' }, { fp_hash: 'bad hash' }]
      .map(fields => ({ ...form(), fields: { ...form().fields, ...fields } })),
  ];
  let count = 0;
  for (const action of invalid) await assert.rejects(prepareHostedCheckout(action, { fetch: async () => { count++; return response(); } }), matchError('invalid_request', 'input', false));
  assert.equal(count, 0);
});

test('oversized and control-containing form fields fail before dispatch', async () => {
  for (const fields of [{ fname: 'x'.repeat(16385) }, { fname: 'bad\u0000value' },
    { fname: 'x'.repeat(16000), lname: 'x'.repeat(16000), company: 'x'.repeat(16000), add: 'x'.repeat(16000), city: 'x'.repeat(16000) }]) {
    await assert.rejects(prepareHostedCheckout({ ...form(), fields: { ...form().fields, ...fields } }, { fetch: async () => assert.fail('unexpected transport') }), matchError('invalid_request', 'input', false));
  }
});

test('one unauthenticated POST returns the original BayShop ID and a validated checkout URL', async () => {
  const calls = [];
  const session = await prepareHostedCheckout(form('GPAY'), { fetch: async (url, init) => {
    calls.push([url, init]); return response({ url: checkoutUrl, paymentId: 'foreign-response-id', error: false });
  } });
  assert.deepEqual(session, { paymentId: '42', channel: 'GPAY', url: checkoutUrl }); assert.equal(calls.length, 1);
  const [url, init] = calls[0]; assert.equal(url, endpoint); assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.equal(init.referrerPolicy, 'no-referrer');
  assert.deepEqual(init.headers, { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' });
  assert.equal(init.signal.aborted, false); assert.equal(new URLSearchParams(init.body).get('generate_epid'), '1');
  assert.equal(Object.keys(session).length, 3); // No raw PSP response or signed form survives.
});

test('URL predicate accepts only the exact secure origin without normalization ambiguity', () => {
  assert.equal(isHostedCheckoutUrl(checkoutUrl), true);
  assert.equal(isHostedCheckoutUrl('https://secure2.euplatesc.ro/tdsprocess/checkout.php?ep_id=synthetic'), true);
  assert.equal(isHostedCheckoutUrl('https://secure3.euplatesc.ro/tdsprocess/checkout.php?cart_id=synthetic&mid=synthetic'), true);
  assert.equal(isHostedCheckoutUrl('https://secure.euplatesc.ro/another/path?order=abc%2F123&lang=ro'), true);
  for (const url of [null, 42, '', 'https://secure.euplatesc.ro', 'http://secure.euplatesc.ro/', 'https://secure.euplatesc.ro.evil.test/',
    'https://user:pass@secure.euplatesc.ro/', 'https://secure.euplatesc.ro:443/', 'https://secure.euplatesc.ro:444/',
    'https://secure.euplatesc.ro./', 'https://secure1.euplatesc.ro/pay', 'https://secure4.euplatesc.ro/pay', 'https://other.euplatesc.ro/pay',
    'https://secure3.euplatesc.ro.evil.test/pay', 'https://secure3.euplatesc.ro:443/pay', 'https://secure3.euplatesc.ro/pay#done',
    'https://user:pass@secure3.euplatesc.ro/pay', 'https://secure3.euplatesc.ro/a/../pay',
    'https://secure2.euplatesc.ro.evil.test/pay', 'https://secure2.euplatesc.ro:443/pay', 'https://secure2.euplatesc.ro/pay#done',
    'https://user:pass@secure2.euplatesc.ro/pay', 'https://secure2.euplatesc.ro/a/../pay', 'https://SECURE.euplatesc.ro/', 'https://secure.euplatesc.ro/a/../pay',
    'https://secure.euplatesc.ro/a/%2e%2e/pay', 'https://secure.euplatesc.ro/#', `${checkoutUrl}#paid`,
    'https://secure.euplatesc.ro/\n', 'https://secure.euplatesc.ro/\\evil.test', 'https://secure.euplatesc.ro/space here',
    'https://secure.euplatesc.ro/' + 'x'.repeat(8192)]) assert.equal(isHostedCheckoutUrl(url), false, String(url));
});

test('observed secure2 GET checkout is accepted while the signed POST endpoint remains secure only', async () => {
  const url = 'https://secure2.euplatesc.ro/tdsprocess/checkout.php?ep_id=synthetic';
  let calls = 0;
  const session = await prepareHostedCheckout(form('GPAY'), { fetch: async (target, init) => { calls++; assert.equal(target, endpoint); assert.equal(init.redirect, 'error'); return response({ url }); } });
  assert.equal(session.url, url); assert.equal(calls, 1);
  await assert.rejects(prepareHostedCheckout({ ...form(), url: 'https://secure2.euplatesc.ro/tdsprocess/tranzactd.php' }, { fetch: async () => assert.fail('must not POST to checkout origin') }), matchError('invalid_request', 'input', false));
});

test('observed GBP APAY secure3 response opens its GET URL, preserves ID and never changes POST host', async () => {
  const url = 'https://secure3.euplatesc.ro/tdsprocess/checkout.php?cart_id=synthetic&mid=synthetic';
  const action = form('APAY'); action.fields.curr = 'GBP';
  let calls = 0;
  const session = await prepareHostedCheckout(action, { fetch: async (target, init) => {
    calls++; assert.equal(target, endpoint);
    assert.equal(new URLSearchParams(init.body).get('curr'), 'GBP');
    return response({ cart_id: 'synthetic-provider-id', url, short_url: 'https://not-used.example' });
  } });
  assert.deepEqual(session, { paymentId: '42', channel: 'APAY', url }); assert.equal(calls, 1);
  await assert.rejects(prepareHostedCheckout({ ...action, url: 'https://secure3.euplatesc.ro/tdsprocess/tranzactd.php' }, { fetch: async () => assert.fail('wrong POST host') }), matchError('invalid_request', 'input', false));
});

test('diagnostics distinguish response failures without retaining provider text, URL or form data', async () => {
  const cases = [
    [response({}, { status: 503, ok: false }), 'HOSTED_HTTP_503'],
    [response({}, { text: async () => 'private-invalid-body' }), 'HOSTED_JSON'],
    [response([]), 'HOSTED_SHAPE'],
    [response({ status: 'private-field' }), 'HOSTED_URL_MISSING'],
    [response({ url: 'https://evil.test/?private=secret' }), 'HOSTED_URL_ORIGIN'],
    [response({ url: 'https://secure3.euplatesc.ro/pay#private' }), 'HOSTED_URL_FORMAT'],
    [response({ error: 'private-provider-message' }), 'HOSTED_PROVIDER'],
  ];
  for (const [value, code] of cases) await assert.rejects(prepareHostedCheckout(form(), { fetch: async () => value }), error => {
    assert.equal(error.diagnosticCode, code); assert(!/private|secret|https:/.test(JSON.stringify(error))); return true;
  });
  assert.equal(new HostedCheckoutError('outcome_unknown', 'response', '42', true, 'secret').diagnosticCode, 'HOSTED_RESPONSE');
});

test('unsafe or missing PSP URL stays unknown after dispatch, with no automatic retry', async () => {
  for (const raw of [{ url: 'https://evil.test/private' }, { url: `${checkoutUrl}#paid` }, { status: 'paid' }, { redirect: checkoutUrl }, [], null]) {
    let calls = 0;
    await assert.rejects(prepareHostedCheckout(form(), { fetch: async () => { calls++; return response(raw); } }), matchError('outcome_unknown', 'response'));
    assert.equal(calls, 1);
  }
});

test('explicit PSP error is sanitized, still dispatched and never a cancelled/paid claim', async () => {
  for (const error of ['private-provider-error', true, { message: 'private-provider-error' }, 123]) {
    await assert.rejects(prepareHostedCheckout(form(), { fetch: async () => response({ error, url: checkoutUrl }) }), value => {
      matchError('provider_rejected', 'provider')(value);
      assert.equal(JSON.stringify(value).includes('private-provider-error'), false); assert.equal(Object.hasOwn(value, 'cause'), false); return true;
    });
  }
  for (const error of [undefined, null, false, 0, '', '0']) assert.equal((await prepareHostedCheckout(form(), { fetch: async () => response({ error, url: checkoutUrl }) })).url, checkoutUrl);
});

test('HTTP errors and redirects are unknown and do not read or follow the response body', async () => {
  for (const change of [{ ok: false, status: 500 }, { ok: false, status: 400 }, { status: 302 }, { redirected: true }, { url: 'https://evil.test/' }]) {
    await assert.rejects(prepareHostedCheckout(form(), { fetch: async () => response({}, { ...change, text: async () => assert.fail('body must not be read') }) }), matchError('outcome_unknown', 'http'));
  }
});

test('invalid, HTML or oversized PSP bodies are unknown and never surfaced', async () => {
  for (const body of ['not-json-private', '<html>private-provider-data</html>', 'x'.repeat(65537)]) {
    await assert.rejects(prepareHostedCheckout(form(), { fetch: async () => response({}, { text: async () => body }) }), matchError('outcome_unknown', 'response'));
  }
});

test('network exceptions are sanitized and are never retried', async () => {
  let calls = 0;
  await assert.rejects(prepareHostedCheckout(form(), { fetch: async () => { calls++; throw new Error('secret-signed-body'); } }), value => {
    matchError('outcome_unknown', 'network')(value); assert.equal(JSON.stringify(value).includes('secret'), false); return true;
  });
  assert.equal(calls, 1);
});

test('already-aborted caller signal cannot dispatch', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(prepareHostedCheckout(form(), { signal: controller.signal, fetch: async () => { calls++; return response(); } }), matchError('not_dispatched', 'aborted', false));
  assert.equal(calls, 0);
});

test('cancellation after dispatch aborts transport and keeps the outcome unknown', async () => {
  const controller = new AbortController(); let signal; let calls = 0;
  const task = prepareHostedCheckout(form(), { signal: controller.signal, fetch: (_url, init) => { calls++; signal = init.signal; return new Promise(() => {}); } });
  controller.abort(); await assert.rejects(task, matchError('outcome_unknown', 'aborted'));
  assert.equal(signal.aborted, true); assert.equal(calls, 1);
});

test('timeout also finishes when transport ignores abort; late success cannot open checkout', async () => {
  let finish; let signal; let calls = 0;
  const task = prepareHostedCheckout(form(), { timeoutMs: 5, fetch: (_url, init) => { calls++; signal = init.signal; return new Promise(resolve => { finish = resolve; }); } });
  await assert.rejects(task, matchError('outcome_unknown', 'timeout')); assert.equal(signal.aborted, true);
  finish(response()); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(calls, 1);
});

test('timeout also covers a stalled response body and its later fulfillment', async () => {
  let finish; let signal;
  const task = prepareHostedCheckout(form(), { timeoutMs: 5, fetch: async (_url, init) => {
    signal = init.signal; return response({}, { text: () => new Promise(resolve => { finish = resolve; }) });
  } });
  await assert.rejects(task, matchError('outcome_unknown', 'timeout')); assert.equal(signal.aborted, true);
  finish(JSON.stringify({ url: checkoutUrl })); await new Promise(resolve => setTimeout(resolve, 0));
});

test('successful completion removes abort listeners and timers', async () => {
  const controller = new AbortController(); let signal;
  const session = await prepareHostedCheckout(form(), { signal: controller.signal, timeoutMs: 5, fetch: async (_url, init) => { signal = init.signal; return response(); } });
  controller.abort(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(session.paymentId, '42'); assert.equal(signal.aborted, false);
});
