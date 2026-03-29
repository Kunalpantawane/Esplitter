const express = require('express');
const authenticate = require('../middleware/auth');
const Group = require('../models/Group');

const router = express.Router();
router.use(authenticate);

// GET /api/groups/:id — Group detail
router.get('/:id', async (req, res) => {
    try {
        const group = await Group.findById(req.params.id)
            .populate('members', 'name email upiId')
            .lean();
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!group.members.some(m => String(m._id) === String(req.userId))) {
            return res.status(403).json({ error: 'Not a member of this group.' });
        }
        res.json({ group: { ...group, id: String(group._id) } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch group.' });
    }
});

// PATCH /api/groups/:id — Update group (admin only)
router.patch('/:id', async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (String(group.adminId) !== String(req.userId)) {
            return res.status(403).json({ error: 'Only the admin can update this group.' });
        }

        const { name, description } = req.body;
        if (name && name.trim()) group.name = name.trim();
        if (description !== undefined) group.description = description.trim();
        group.lastActivityAt = new Date();
        await group.save();

        const updated = await Group.findById(group._id)
            .populate('members', 'name email upiId')
            .lean();
        res.json({ group: { ...updated, id: String(updated._id) } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update group.' });
    }
});

// DELETE /api/groups/:id — Delete group & cascade (admin only)
router.delete('/:id', async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (String(group.adminId) !== String(req.userId)) {
            return res.status(403).json({ error: 'Only the admin can delete this group.' });
        }

        // Hard delete the group
        await Group.deleteOne({ _id: group._id });
        
        // Cascade delete all transactions for this group
        const Transaction = require('../models/Transaction');
        await Transaction.deleteMany({ groupId: group._id });

        res.json({ message: 'Group deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete group.' });
    }
});

// PATCH /api/groups/:id/archive — Archive group (admin only)
router.patch('/:id/archive', async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (String(group.adminId) !== String(req.userId)) {
            return res.status(403).json({ error: 'Only the admin can archive this group.' });
        }

        group.isArchived = true;
        group.lastActivityAt = new Date();
        await group.save();

        res.json({ message: 'Group archived successfully.', group });
    } catch (err) {
        res.status(500).json({ error: 'Failed to archive group.' });
    }
});

// DELETE /api/groups/:id/members/:userId — Remove member (admin only)
router.delete('/:id/members/:userId', async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (String(group.adminId) !== String(req.userId)) {
            return res.status(403).json({ error: 'Only the admin can remove members.' });
        }
        if (String(req.params.userId) === String(group.adminId)) {
            return res.status(400).json({ error: 'Admin cannot remove themselves. Archive the group instead.' });
        }

        group.members = group.members.filter(m => String(m) !== String(req.params.userId));
        group.lastActivityAt = new Date();
        await group.save();

        const updated = await Group.findById(group._id)
            .populate('members', 'name email upiId')
            .lean();
        res.json({ group: { ...updated, id: String(updated._id) } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove member.' });
    }
});

// POST /api/groups/:id/leave — Leave group (any member, not admin)
router.post('/:id/leave', async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });

        if (String(group.adminId) === String(req.userId)) {
            return res.status(400).json({ error: 'Admin cannot leave. Archive the group or transfer admin first.' });
        }

        if (!group.members.map(String).includes(String(req.userId))) {
            return res.status(400).json({ error: 'You are not a member of this group.' });
        }

        group.members = group.members.filter(m => String(m) !== String(req.userId));
        group.lastActivityAt = new Date();
        await group.save();

        res.json({ message: 'Left group successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to leave group.' });
    }
});

module.exports = router;
