const Group = require('../models/Group');
const Transaction = require('../models/Transaction');
const runAtomic = require('../lib/runAtomic');
const idempotency = require('../lib/idempotencyCache');

// POST /api/sync - Push pending & paginated pull (BANDWIDTH OPTIMIZED)
async function syncTransactions(req, res) {
    try {
        const { lastSyncAt, pending = [], limit = 100, groupIds: filterGroupIds } = req.body;

        const results = [];
        const errors = [];

        // PUSH PHASE: Send pending transactions
        for (const tx of pending) {
            try {
                // Fix 10: Validate required payload fields before any DB work
                if (!tx.clientId || !tx.groupId || !tx.paidBy) {
                    errors.push({ clientId: tx.clientId || 'unknown', error: 'Missing required fields (clientId, groupId, paidBy).' });
                    continue;
                }
                if (typeof tx.amount !== 'number' || tx.amount <= 0) {
                    // Allow deleted tombstones to pass through without an amount
                    if (!tx.deleted) {
                        errors.push({ clientId: tx.clientId, error: 'Amount must be a positive number.' });
                        continue;
                    }
                }

                const group = await Group.findById(tx.groupId);
                if (!group || !group.members.map(String).includes(String(req.userId))) {
                    errors.push({ clientId: tx.clientId, error: 'Access denied to group.' });
                    continue;
                }

                // Fix 5: Block writes to archived groups
                if (group.isArchived) {
                    errors.push({ clientId: tx.clientId, error: 'Group is archived. No new transactions allowed.' });
                    continue;
                }

                const memberIds = group.members.map(String);
                if (!memberIds.includes(String(tx.paidBy))) {
                    errors.push({ clientId: tx.clientId, error: 'Invalid paidBy user for group.' });
                    continue;
                }

                const txSplits = Array.isArray(tx.splits) ? tx.splits : [];
                const invalidSplit = txSplits.find((split) => !memberIds.includes(String(split.userId)));
                if (invalidSplit) {
                    errors.push({ clientId: tx.clientId, error: 'Invalid split user for group.' });
                    continue;
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
                            // Fix 2/3: Persist deleted flag from client so tombstones are stored
                            deleted: tx.deleted || false,
                            syncedAt: new Date(),
                        },
                        { upsert: true, new: true, ...options }
                    );
                    await Group.findByIdAndUpdate(tx.groupId, { lastActivityAt: new Date() }, options);
                });
                results.push(tx.clientId);
            } catch (e) {
                errors.push({ clientId: tx.clientId, error: e.message });
            }
        }

        // PULL PHASE: Fetch user's groups (minimal data)
        const userGroups = await Group.find({ members: req.userId })
            .populate('members', 'name email upiId')
            .lean();
        
        const allGroupIds = userGroups.map((g) => g._id);
        
        // Allow filtering to specific groups (for partial sync)
        const pullGroupIds = filterGroupIds && filterGroupIds.length > 0
            ? filterGroupIds.filter(id => allGroupIds.some(gid => String(gid) === String(id)))
            : allGroupIds;

        // OPTIMIZED PULL: Paginated + only essential fields
        const since = lastSyncAt ? new Date(lastSyncAt) : new Date(0);
        const pullLimit = Math.min(parseInt(limit) || 100, 1000);
        
        const serverAdds = await Transaction.find({
            groupId: { $in: pullGroupIds },
            syncedAt: { $gt: since },
        })
            .select('clientId groupId description amount paidBy splits type status syncedAt deleted createdAt')
            .sort({ syncedAt: -1 })
            .limit(pullLimit)
            .lean();

        // Only include groups that changed since last sync
        const changedGroups = userGroups.filter(g => {
            return !lastSyncAt || new Date(g.lastActivityAt) > since;
        }).map(g => ({ ...g, id: String(g._id) }));

        const hasMore = serverAdds.length === pullLimit;

        // Also return the full list of group IDs so frontend knows which groups are still valid
        const allServerGroupIds = userGroups.map(g => String(g._id));

        res.json({
            synced: results,
            errors,
            serverAdds,
            serverGroups: changedGroups,
            allServerGroupIds,
            syncTime: new Date().toISOString(),
            hasMore,
            pullGroupIds,
        });
    } catch (err) {
        res.status(500).json({ error: 'Sync failed.' });
    }
}

// POST /api/sync/groups - Create or join a group
async function syncGroupAction(req, res) {
    try {
        const { action, name, inviteCode, idempotencyKey } = req.body;

        if (action === 'create') {
            if (idempotencyKey) {
                const cached = idempotency.getCached(idempotencyKey, req.userId);
                if (cached) {
                    return res.status(201).json({ group: cached, idempotent: true });
                }
            }

            const creatorId = String(req.userId);
            const group = new Group({
                name,
                adminId: req.userId,
                members: [req.userId],
                memberRoles: {
                    [creatorId]: 'admin',
                },
            });
            await group.save();
            await group.populate('members', 'name email upiId');
            
            if (idempotencyKey) {
                idempotency.setCached(idempotencyKey, req.userId, group._doc || group.toObject());
            }
            
            const groupObj = group._doc || group.toObject();
            return res.status(201).json({ group: { ...groupObj, id: String(group._id) } });
        }

        if (action === 'join') {
            // Fix 8: Guard missing/non-string inviteCode before calling .toUpperCase()
            if (!inviteCode || typeof inviteCode !== 'string') {
                return res.status(400).json({ error: 'Invite code is required.' });
            }
            const group = await Group.findOne({ inviteCode: inviteCode.toUpperCase() });
            if (!group) return res.status(404).json({ error: 'Group not found.' });

            if (group.members.map(String).includes(String(req.userId))) {
                await group.populate('members', 'name email upiId');
                return res.json({ group, alreadyMember: true });
            }

            const existingPending = (group.joinRequests || []).find((request) =>
                String(request.userId) === String(req.userId) && request.status === 'pending'
            );

            if (!existingPending) {
                group.joinRequests.push({
                    userId: req.userId,
                    status: 'pending',
                    requestedAt: new Date(),
                });
                group.lastActivityAt = new Date();
                await group.save();
            }

            return res.json({
                pending: true,
                groupId: String(group._id),
                message: 'Join request sent. Waiting for admin approval.',
            });
        }

        return res.status(400).json({ error: 'Invalid action. Use "create" or "join".' });
    } catch (err) {
        res.status(500).json({ error: 'Group operation failed.' });
    }
}

// GET /api/sync/groups - Get user's groups (OPTIMIZED: minimal fields)
async function getUserGroups(req, res) {
    try {
        const groups = await Group.find({ members: req.userId })
            .populate('members', 'name email upiId')
            .lean();
        res.json({ groups: groups.map(g => ({ ...g, id: String(g._id) })) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch groups.' });
    }
}

module.exports = {
    syncTransactions,
    syncGroupAction,
    getUserGroups,
};
