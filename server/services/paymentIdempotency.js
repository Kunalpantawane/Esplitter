const { getRedisClient, isConnected } = require('../config/redis');

class PaymentIdempotency {
  constructor() {
    this.inMemoryCache = new Map();
    this.inMemoryExpiries = new Map();
  }

  async getWebhookResult(eventId) {
    if (!eventId) return null;

    const redisClient = getRedisClient();
    if (isConnected() && redisClient) {
      try {
        const key = `webhook:event:${eventId}`;
        const result = await redisClient.get(key);
        return result ? JSON.parse(result) : null;
      } catch (err) {
        console.error('[PaymentIdempotency] Redis get failed:', err.message);
      }
    }

    return this.getInMemoryCache(`webhook:event:${eventId}`);
  }

  async setWebhookResult(eventId, result, ttlSeconds = 86400) {
    if (!eventId) return;

    const redisClient = getRedisClient();
    if (isConnected() && redisClient) {
      try {
        const key = `webhook:event:${eventId}`;
        await redisClient.setEx(key, ttlSeconds, JSON.stringify(result));
      } catch (err) {
        console.error('[PaymentIdempotency] Redis set failed:', err.message);
        this.setInMemoryCache(`webhook:event:${eventId}`, result, ttlSeconds);
      }
      return;
    }

    this.setInMemoryCache(`webhook:event:${eventId}`, result, ttlSeconds);
  }

  async getOrderIdempotency(clientId) {
    if (!clientId) return null;

    const redisClient = getRedisClient();
    if (isConnected() && redisClient) {
      try {
        const key = `order:idempotency:${clientId}`;
        const result = await redisClient.get(key);
        return result ? JSON.parse(result) : null;
      } catch (err) {
        console.error('[PaymentIdempotency] Redis get failed:', err.message);
      }
    }

    return this.getInMemoryCache(`order:idempotency:${clientId}`);
  }

  async setOrderIdempotency(clientId, result, ttlSeconds = 2592000) {
    if (!clientId) return;

    const redisClient = getRedisClient();
    if (isConnected() && redisClient) {
      try {
        const key = `order:idempotency:${clientId}`;
        await redisClient.setEx(key, ttlSeconds, JSON.stringify(result));
      } catch (err) {
        console.error('[PaymentIdempotency] Redis set failed:', err.message);
        this.setInMemoryCache(`order:idempotency:${clientId}`, result, ttlSeconds);
      }
      return;
    }

    this.setInMemoryCache(`order:idempotency:${clientId}`, result, ttlSeconds);
  }

  getInMemoryCache(key) {
    const expiry = this.inMemoryExpiries.get(key);
    if (expiry && Date.now() > expiry) {
      this.inMemoryCache.delete(key);
      this.inMemoryExpiries.delete(key);
      return null;
    }
    return this.inMemoryCache.get(key) || null;
  }

  setInMemoryCache(key, value, ttlSeconds) {
    this.inMemoryCache.set(key, value);
    this.inMemoryExpiries.set(key, Date.now() + ttlSeconds * 1000);
  }

  async clearExpired() {
    const redisClient = getRedisClient();
    if (isConnected() && redisClient) {
      return;
    }

    const now = Date.now();
    for (const [key, expiry] of this.inMemoryExpiries.entries()) {
      if (now > expiry) {
        this.inMemoryCache.delete(key);
        this.inMemoryExpiries.delete(key);
      }
    }
  }

  async clearAll() {
    const redisClient = getRedisClient();
    if (isConnected() && redisClient) {
      try {
        await redisClient.del(redisClient.keys('webhook:event:*'));
        await redisClient.del(redisClient.keys('order:idempotency:*'));
      } catch (err) {
        console.error('[PaymentIdempotency] Redis clear failed:', err.message);
      }
    }

    this.inMemoryCache.clear();
    this.inMemoryExpiries.clear();
  }
}

module.exports = new PaymentIdempotency();
