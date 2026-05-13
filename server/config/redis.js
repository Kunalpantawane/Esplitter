let redis;
try {
  redis = require('redis');
} catch (err) {
  redis = null;
}

let client = null;
let isReady = false;

async function initializeRedis() {
  if (!redis) {
    console.warn('[Redis] redis module not installed. Using in-memory cache fallback.');
    return null;
  }

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn('[Redis] REDIS_URL not configured. Using in-memory cache fallback.');
    return null;
  }

  try {
    client = redis.createClient({ url: redisUrl });
    client.on('error', (err) => console.error('[Redis] Connection error:', err.message));
    await client.connect();
    isReady = true;
    console.log('[Redis] Connected successfully');
    return client;
  } catch (err) {
    console.error('[Redis] Failed to connect:', err.message);
    console.warn('[Redis] Falling back to in-memory cache.');
    return null;
  }
}

function getRedisClient() {
  return client;
}

function isConnected() {
  return isReady && client;
}

async function closeRedis() {
  if (client) {
    await client.quit();
    isReady = false;
    client = null;
  }
}

async function healthCheck() {
  if (!client) return false;
  try {
    await client.ping();
    return true;
  } catch (err) {
    console.error('[Redis] Health check failed:', err.message);
    return false;
  }
}

module.exports = {
  initializeRedis,
  getRedisClient,
  isConnected,
  closeRedis,
  healthCheck,
};
