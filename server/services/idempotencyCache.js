/**
 * Re-export idempotency cache from lib/ for plan-aligned path.
 * The canonical implementation lives in ../lib/idempotencyCache.js
 * This file ensures both import paths work:
 *   require('../services/idempotencyCache')
 *   require('../lib/idempotencyCache')
 */
module.exports = require('../lib/idempotencyCache');
