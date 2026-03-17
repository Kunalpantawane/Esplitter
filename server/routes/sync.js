const express = require('express');
const authenticate = require('../middleware/auth');
const Group = require('../models/Group');
const Transaction = require('../models/Transaction');

const router = express.Router();
router.use(authenticate);

// POST /api/sync - Push pending transactions & pull new updates
router.post('/', async (req, res) => {
    try {
        const { lastSyncAt, pending = [] } = req.body;

        const results = [];
        const errors = [];

        // Process pending transactions from client
        for (const tx of pending) {
            try {
                // Verify user is a member of the group
                const group = await Group.findById(tx.groupId);
                if (!group || !group.members.includes(req.userId)) {
                    errors.push({ clientId: tx.clientId, error: 'Access denied to group.' });
                    continue;
                }

                // Upsert using clientId to avoid duplicates
                await Transaction.findOneAndUpdate(
                    { clientId: tx.clientId },
                    {
                        clientId: tx.clientId,
                        groupId: tx.groupId,
                        description: tx.description,
                        amount: tx.amount,
                        paidBy: tx.paidBy,
                        receiverId: tx.receiverId || undefined,
                        splits: tx.splits,
                        splitType: tx.splitType || 'EQUAL',
                        type: tx.type || 'EXPENSE',
                        syncedAt: new Date(),
                    },
                    { upsert: true, new: true }
                );
                results.push(tx.clientId);

                // Update group's lastActivityAt
                await Group.findByIdAndUpdate(tx.groupId, { lastActivityAt: new Date() });
            } catch (e) {
                errors.push({ clientId: tx.clientId, error: e.message });
            }
        }

        // Pull new transactions since lastSyncAt for all user's groups
        const userGroups = await Group.find({ members: req.userId })
            .populate('members', 'name email upiId')
            .lean();
        const groupIds = userGroups.map((g) => g._id);

        const since = lastSyncAt ? new Date(lastSyncAt) : new Date(0);
        const serverAdds = await Transaction.find({
            groupId: { $in: groupIds },
            syncedAt: { $gt: since },
        }).lean();

        // Return groups data too so client can refresh in one round-trip
        const serverGroups = userGroups.map(g => ({
            _id: g._id,
            name: g.name,
            inviteCode: g.inviteCode,
            adminId: g.adminId,
            members: g.members,
            lastActivityAt: g.lastActivityAt,
        }));

        res.json({
            synced: results,
            errors,
            serverAdds,
            serverGroups,
            syncTime: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ error: 'Sync failed.' });
    }
});

// POST /api/sync/groups - Create or join a group
router.post('/groups', async (req, res) => {
    try {
        const { action, name, inviteCode } = req.body;

        if (action === 'create') {
            const group = new Group({
                name,
                adminId: req.userId,
                members: [req.userId],
            });
            await group.save();
            return res.status(201).json({ group });
        }

        if (action === 'join') {
            const group = await Group.findOne({ inviteCode: inviteCode.toUpperCase() });
            if (!group) return res.status(404).json({ error: 'Group not found.' });
            if (!group.members.includes(req.userId)) {
                group.members.push(req.userId);
                group.lastActivityAt = new Date();
                await group.save();
            }
            return res.json({ group });
        }

        return res.status(400).json({ error: 'Invalid action. Use "create" or "join".' });
    } catch (err) {
        res.status(500).json({ error: 'Group operation failed.' });
    }
});

// GET /api/sync/groups - Get user's groups
router.get('/groups', async (req, res) => {
    try {
        const groups = await Group.find({ members: req.userId })
            .populate('members', 'name email')
            .lean();
        res.json({ groups });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch groups.' });
    }
});

module.exports = router;
