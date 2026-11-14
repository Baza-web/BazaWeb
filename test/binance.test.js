'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { BinanceClient } = require('../src/binance');

function mock(status = 200, body = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: status < 400, status, statusText: 'x', json: async () => body };
  };
  return { calls, fetchImpl };
}

test('public request builds query', async () => {
  const { calls, fetchImpl } = mock(200, { symbol: 'BTCUSDT', price: '1' });
  const c = new BinanceClient({ fetchImpl });
  await c.price('BTCUSDT');
  assert.match(calls[0].url, /\/api\/v3\/ticker\/price\?symbol=BTCUSDT$/);
});

test('signed request adds key header and valid signature', async () => {
  const { calls, fetchImpl } = mock();
  const c = new BinanceClient({ apiKey: 'k', apiSecret: 's', fetchImpl });
  await c.account();
  const u = new URL(calls[0].url);
  const q = `timestamp=${u.searchParams.get('timestamp')}`;
  assert.strictEqual(u.searchParams.get('signature'), c.sign(q));
  assert.strictEqual(calls[0].opts.headers['X-MBX-APIKEY'], 'k');
});

test('signed request without credentials throws; API errors surface', async () => {
  const c = new BinanceClient({ apiKey: '', apiSecret: '', fetchImpl: mock().fetchImpl });
  await assert.rejects(c.account(), /required/);
  const e = new BinanceClient({ fetchImpl: mock(400, { code: -1121, msg: 'Invalid symbol.' }).fetchImpl });
  await assert.rejects(e.price('X'), /Invalid symbol/);
});
