const Group = require('../models/Group');
const idempotency = require('../lib/idempotencyCache');
const { pushPending, pullUpdates } = require('../services/syncService');

// POST /api/sync - Push pending & paginated pull (BANDWIDTH OPTIMIZED)
async function syncTransactions(req, res) {
    try {
        const { lastSyncAt, pending: rawPending, limit = 100, groupIds: filterGroupIds } = req.body;
        const pending = Array.isArray(rawPending) ? rawPending : [];

        // PUSH PHASE — delegated to syncService
        const { synced, errors } = await pushPending(pending, req.userId);

        // PULL PHASE — delegated to syncService
        const pullResult = await pullUpdates(req.userId, {
            lastSyncAt,
            limit,
            filterGroupIds,
        });

        res.json({
            synced,
            errors,
            serverAdds: pullResult.serverAdds,
            serverGroups: pullResult.serverGroups,
            allServerGroupIds: pullResult.allServerGroupIds,
            syncTime: new Date().toISOString(),
            hasMore: pullResult.hasMore,
            pullGroupIds: pullResult.pullGroupIds,
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
