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

function isGroupMember(group, userId) {
    return group.members.map(String).includes(String(userId));
}

function canDeleteTransaction(group, transaction, userId) {
    return String(group.adminId) === String(userId)
        || String(transaction.paidBy) === String(userId);
}

function getPaymentCreditorId(transaction) {
    if (transaction.splits && transaction.splits.length > 0) {
        return String(transaction.splits[0].userId);
    }
    return transaction.receiverId ? String(transaction.receiverId) : null;
}

function canSetPaymentStatus(transaction, userId, status) {
    const debtorId = String(transaction.paidBy);
    const creditorId = getPaymentCreditorId(transaction);
    const actorId = String(userId);

    if (!creditorId) return false;
    if (status === 'PAID') return transaction.status === 'PENDING' && actorId === debtorId;
    if (status === 'CONFIRMED') return transaction.status === 'PAID' && actorId === creditorId;
    return false;
}

function validateNewTransaction(tx, group, userId) {
    if (!tx.paidBy || typeof tx.amount !== 'number' || tx.amount <= 0) {
        return 'Missing or invalid transaction amount/payer.';
    }
    if (!tx.description || !String(tx.description).trim()) {
        return 'Description is required.';
    }

    const memberIds = group.members.map(String);
    if (!memberIds.includes(String(tx.paidBy))) {
        return 'Invalid paidBy user for group.';
    }
    if (tx.receiverId && !memberIds.includes(String(tx.receiverId))) {
        return 'Invalid receiver user for group.';
    }

    const txSplits = Array.isArray(tx.splits) ? tx.splits : [];
    if (!txSplits.length || txSplits.some((split) => !memberIds.includes(String(split.userId)))) {
        return 'Invalid split user for group.';
    }

    const type = tx.type === 'PAYMENT' ? 'PAYMENT' : 'EXPENSE';
    if (type === 'PAYMENT') {
        if ((tx.status || 'PENDING') !== 'PENDING') {
            return 'New payment requests must start as PENDING.';
        }
        if (getPaymentCreditorId({ splits: txSplits, receiverId: tx.receiverId }) !== String(userId)) {
            return 'Only the receiving member can create a payment request.';
        }
    } else {
        const splitsTotal = txSplits.reduce((sum, split) => sum + Number(split.amount || 0), 0);
        if (Math.abs(splitsTotal - tx.amount) > 0.02) {
            return 'Splits total does not match amount.';
        }
    }

    return null;
}

/**
 * Push a single pending transaction from the client to the server.
 * Uses upsert (findOneAndUpdate) keyed on clientId for idempotent deduplication.
 *
 * @param {Object} tx - The transaction payload from the client
 * @param {string} userId - The authenticated user's ID
 * @returns {{ success: boolean, clientId: string, error?: string }}
 */
async function pushTransaction(tx, userId) {
    if (!tx.clientId || !tx.groupId) {
        return { success: false, clientId: tx.clientId || 'unknown', error: 'Missing required fields (clientId, groupId).' };
    }

    const existing = await Transaction.findOne({ clientId: tx.clientId });
    if (existing && String(existing.groupId) !== String(tx.groupId)) {
        return { success: false, clientId: tx.clientId, error: 'Transaction does not belong to this group.' };
    }

    const group = await Group.findById(existing ? existing.groupId : tx.groupId);
    if (!group || !isGroupMember(group, userId)) {
        return { success: false, clientId: tx.clientId, error: 'Access denied to group.' };
    }

    if (tx.deleted) {
        if (!existing) {
            return { success: true, clientId: tx.clientId };
        }
        if (!canDeleteTransaction(group, existing, userId)) {
            return { success: false, clientId: tx.clientId, error: 'Only the expense creator or group admin can delete.' };
        }

        const now = new Date();
        await runAtomic(async (session) => {
            const options = session ? { session } : {};
            await Transaction.findByIdAndUpdate(existing._id, { deleted: true, syncedAt: now }, options);
            await Group.findByIdAndUpdate(existing.groupId, { lastActivityAt: now }, options);
        });
        return { success: true, clientId: tx.clientId };
    }

    if (existing) {
        if (existing.type !== 'PAYMENT' || !tx.status || tx.status === existing.status) {
            return { success: true, clientId: tx.clientId };
        }
        if (!canSetPaymentStatus(existing, userId, tx.status)) {
            return { success: false, clientId: tx.clientId, error: 'Unauthorized payment status change.' };
        }

        const now = new Date();
        await runAtomic(async (session) => {
            const options = session ? { session } : {};
            await Transaction.findByIdAndUpdate(existing._id, { status: tx.status, syncedAt: now }, options);
            await Group.findByIdAndUpdate(existing.groupId, { lastActivityAt: now }, options);
        });
        return { success: true, clientId: tx.clientId };
    }

    if (group.isArchived) {
        return { success: false, clientId: tx.clientId, error: 'Group is archived. No new transactions allowed.' };
    }

    const validationError = validateNewTransaction(tx, group, userId);
    if (validationError) {
        return { success: false, clientId: tx.clientId, error: validationError };
    }

    const txSplits = Array.isArray(tx.splits) ? tx.splits : [];
    const type = tx.type === 'PAYMENT' ? 'PAYMENT' : 'EXPENSE';
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
                type,
                status: type === 'PAYMENT' ? 'PENDING' : 'PAID',
                deleted: false,
                syncedAt: new Date(),
            },
            { upsert: true, new: true, runValidators: true, ...options }
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
async function pullUpdates(userId, {
    lastSyncAt,
    limit = 100,
    filterGroupIds,
    cursor,
    syncWindowEnd,
} = {}) {
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
    const until = syncWindowEnd ? new Date(syncWindowEnd) : new Date();
    const pullLimit = Math.min(parseInt(limit) || 100, 1000);
    const query = {
        groupId: { $in: pullGroupIds },
        syncedAt: { $gt: since, $lte: until },
    };

    if (cursor && cursor.syncedAt && cursor.id) {
        const cursorDate = new Date(cursor.syncedAt);
        query.$or = [
            { syncedAt: { $lt: cursorDate } },
            { syncedAt: cursorDate, _id: { $lt: cursor.id } },
        ];
    }

    const pulled = await Transaction.find(query)
        .select('clientId groupId description amount paidBy receiverId splits splitType type status syncedAt deleted createdAt')
        .sort({ syncedAt: -1, _id: -1 })
        .limit(pullLimit + 1)
        .lean();
    const serverAdds = pulled.slice(0, pullLimit);

    // Only include groups that changed since last sync
    const changedGroups = userGroups.filter(g => {
        return !lastSyncAt || new Date(g.lastActivityAt) > since;
    }).map(g => ({ ...g, id: String(g._id) }));

    const hasMore = pulled.length > pullLimit;
    const lastItem = hasMore ? serverAdds[serverAdds.length - 1] : null;
    const nextCursor = lastItem
        ? { syncedAt: lastItem.syncedAt.toISOString(), id: String(lastItem._id) }
        : null;
    const allServerGroupIds = userGroups.map(g => String(g._id));

    return {
        serverAdds,
        serverGroups: changedGroups,
        allServerGroupIds,
        hasMore,
        nextCursor,
        pullGroupIds,
    };
}

module.exports = {
    pushTransaction,
    pushPending,
    pullUpdates,
};
