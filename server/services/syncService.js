/**
 * Sync Service — push upsert + bounded pull logic
 *
 * Extracted from syncController.js for modularity.
 * Handles the core sync operations: pushing pending client transactions
 * and pulling server-side updates with pagination.
 */

const Group = require('../models/Group');
const Transaction = require('../models/Transaction');
const runAtomic = require('../lib/runAtomic');

/**
 * Push a single pending transaction from the client to the server.
 * Uses upsert (findOneAndUpdate) keyed on clientId for idempotent deduplication.
 *
 * @param {Object} tx - The transaction payload from the client
 * @param {string} userId - The authenticated user's ID
 * @returns {{ success: boolean, clientId: string, error?: string }}
 */
async function pushTransaction(tx, userId) {
    // Validate required payload fields before any DB work
    if (!tx.clientId || !tx.groupId || !tx.paidBy) {
        return { success: false, clientId: tx.clientId || 'unknown', error: 'Missing required fields (clientId, groupId, paidBy).' };
    }
    if (typeof tx.amount !== 'number' || tx.amount <= 0) {
        // Allow deleted tombstones to pass through without an amount
        if (!tx.deleted) {
            return { success: false, clientId: tx.clientId, error: 'Amount must be a positive number.' };
        }
    }

    const group = await Group.findById(tx.groupId);
    if (!group || !group.members.map(String).includes(String(userId))) {
        return { success: false, clientId: tx.clientId, error: 'Access denied to group.' };
    }

    // Block writes to archived groups
    if (group.isArchived) {
        return { success: false, clientId: tx.clientId, error: 'Group is archived. No new transactions allowed.' };
    }

    const memberIds = group.members.map(String);
    if (!memberIds.includes(String(tx.paidBy))) {
        return { success: false, clientId: tx.clientId, error: 'Invalid paidBy user for group.' };
    }

    const txSplits = Array.isArray(tx.splits) ? tx.splits : [];
    const invalidSplit = txSplits.find((split) => !memberIds.includes(String(split.userId)));
    if (invalidSplit) {
        return { success: false, clientId: tx.clientId, error: 'Invalid split user for group.' };
    }

    await runAtomic(async (session) => {
        const options = session ? { session } : {};
        await Transaction.findOneAndUpdate(
            { clientId: tx.clientId },
            {
                clientId: tx.clientId,
                groupId: tx.groupId,
                description: tx.description,
                amount: tx.amount,
                paidBy: tx.paidBy,
                receiverId: tx.receiverId || undefined,
                splits: txSplits,
                splitType: tx.splitType || 'EQUAL',
                type: tx.type || 'EXPENSE',
                status: tx.status || (tx.type === 'PAYMENT' ? 'PENDING' : 'PAID'),
                deleted: tx.deleted || false,
                syncedAt: new Date(),
            },
            { upsert: true, new: true, ...options }
        );
        await Group.findByIdAndUpdate(tx.groupId, { lastActivityAt: new Date() }, options);
    });

    return { success: true, clientId: tx.clientId };
}

/**
 * Push multiple pending transactions (batch).
 *
 * @param {Array} pendingTxs - Array of transaction payloads
 * @param {string} userId - The authenticated user's ID
 * @returns {{ synced: string[], errors: Array<{clientId: string, error: string}> }}
 */
async function pushPending(pendingTxs, userId) {
    const synced = [];
    const errors = [];

    for (const tx of pendingTxs) {
        try {
            const result = await pushTransaction(tx, userId);
            if (result.success) {
                synced.push(result.clientId);
            } else {
                errors.push({ clientId: result.clientId, error: result.error });
            }
        } catch (e) {
            errors.push({ clientId: tx.clientId, error: e.message });
        }
    }

    return { synced, errors };
}

/**
 * Pull server-side transactions that changed since `lastSyncAt`.
 * Bounded by `limit` for pagination.
 *
 * @param {string} userId - The authenticated user's ID
 * @param {Object} options
 * @param {string|Date} [options.lastSyncAt] - ISO date string or Date; defaults to epoch
 * @param {number} [options.limit=100] - Max records to pull (capped at 1000)
 * @param {string[]} [options.filterGroupIds] - Optional subset of group IDs to pull
 * @returns {Object} { serverAdds, serverGroups, allServerGroupIds, hasMore, pullGroupIds }
 */
async function pullUpdates(userId, { lastSyncAt, limit = 100, filterGroupIds } = {}) {
    // Fetch all groups the user belongs to
    const userGroups = await Group.find({ members: userId })
        .populate('members', 'name email upiId')
        .lean();

    const allGroupIds = userGroups.map((g) => g._id);

    // Allow filtering to specific groups (for partial sync)
    const pullGroupIds = filterGroupIds && filterGroupIds.length > 0
        ? filterGroupIds.filter(id => allGroupIds.some(gid => String(gid) === String(id)))
        : allGroupIds;

    // Paginated pull — only essential fields
    const since = lastSyncAt ? new Date(lastSyncAt) : new Date(0);
    const pullLimit = Math.min(parseInt(limit) || 100, 1000);

    const serverAdds = await Transaction.find({
        groupId: { $in: pullGroupIds },
        syncedAt: { $gt: since },
    })
        .select('clientId groupId description amount paidBy receiverId splits splitType type status syncedAt deleted createdAt')
        .sort({ syncedAt: -1 })
        .limit(pullLimit)
        .lean();

    // Only include groups that changed since last sync
    const changedGroups = userGroups.filter(g => {
        return !lastSyncAt || new Date(g.lastActivityAt) > since;
    }).map(g => ({ ...g, id: String(g._id) }));

    const hasMore = serverAdds.length === pullLimit;
    const allServerGroupIds = userGroups.map(g => String(g._id));

    return {
        serverAdds,
        serverGroups: changedGroups,
        allServerGroupIds,
        hasMore,
        pullGroupIds,
    };
}

module.exports = {
    pushTransaction,
    pushPending,
    pullUpdates,
};
