'use strict';
const crypto = require('node:crypto');

const DEFAULT_BASE_URL = 'https://api.binance.com';

class BinanceClient {
  constructor({
    apiKey = process.env.BINANCE_API_KEY,
    apiSecret = process.env.BINANCE_API_SECRET,
    baseUrl = process.env.BINANCE_BASE_URL || DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetch = fetchImpl;
  }

  sign(query) {
    return crypto.createHmac('sha256', this.apiSecret).update(query).digest('hex');
  }

  async request(path, params = {}, { signed = false, method = 'GET' } = {}) {
    const headers = {};
    const clean = Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    );
    if (signed) {
      if (!this.apiKey || !this.apiSecret) {
        throw new Error('BINANCE_API_KEY and BINANCE_API_SECRET are required for signed requests');
      }
      clean.timestamp = Date.now();
      headers['X-MBX-APIKEY'] = this.apiKey;
    }
    let query = new URLSearchParams(clean).toString();
    if (signed) query += `&signature=${this.sign(query)}`;

    const res = await this.fetch(`${this.baseUrl}${path}${query ? `?${query}` : ''}`, { method, headers });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Binance API error ${res.status}: ${body.msg || res.statusText} (code ${body.code})`);
    }
    return body;
  }

  ping() {
    return this.request('/api/v3/ping');
  }

  time() {
    return this.request('/api/v3/time');
  }

  price(symbol) {
    return this.request('/api/v3/ticker/price', { symbol });
  }

  klines(symbol, interval = '1h', limit = 100) {
    return this.request('/api/v3/klines', { symbol, interval, limit });
  }

  account() {
    return this.request('/api/v3/account', {}, { signed: true });
  }
}

module.exports = { BinanceClient };
