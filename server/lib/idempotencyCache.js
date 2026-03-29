/**
 * In-memory idempotency cache for handling duplicate requests
 * In production, this should be backed by Redis with TTL expiration (e.g., 24 hours)
 */

const cache = new Map();

/**
 * Generate a unique cache key from idempotency key and user ID
 */
function getCacheKey(idempotencyKey, userId) {
    return `${String(userId)}:${idempotencyKey}`;
}

/**
 * Check if a request has been processed before
 * Returns the cached result if found, null otherwise
 */
function getCached(idempotencyKey, userId) {
    const key = getCacheKey(idempotencyKey, userId);
    const entry = cache.get(key);
    
    // Return null if not found or expired
    if (!entry || Date.now() > entry.expiresAt) {
        if (entry) cache.delete(key);
        return null;
    }
    
    return entry.result;
}

/**
 * Store a result for an idempotent request
 * @param {string} idempotencyKey - Unique key for this operation
 * @param {ObjectId|string} userId - The user performing the operation
 * @param {*} result - The result to cache
 * @param {number} ttlMs - Time-to-live in milliseconds (default: 24 hours)
 */
function setCached(idempotencyKey, userId, result, ttlMs = 24 * 60 * 60 * 1000) {
    const key = getCacheKey(idempotencyKey, userId);
    cache.set(key, {
        result,
        expiresAt: Date.now() + ttlMs,
    });
}

/**
 * Clear an idempotency cache entry (useful for testing)
 */
function clearCached(idempotencyKey, userId) {
    const key = getCacheKey(idempotencyKey, userId);
    cache.delete(key);
}

/**
 * Clear all cache entries (useful for cleanup)
 */
function clearAll() {
    cache.clear();
}

module.exports = {
    getCached,
    setCached,
    clearCached,
    clearAll,
};
