const express = require('express');
const authenticate = require('../middleware/auth');
const Group = require('../models/Group');
const Transaction = require('../models/Transaction');

const router = express.Router();
router.use(authenticate);

// GET /api/expenses/:groupId - Get all expenses for a group
router.get('/:groupId', async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!group.members.map(String).includes(String(req.userId))) {
            return res.status(403).json({ error: 'You are not a member of this group.' });
        }

        const transactions = await Transaction.find({ groupId: req.params.groupId })
            .sort({ syncedAt: -1 })
            .lean();

        res.json({ transactions });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch expenses.' });
    }
});

// POST /api/expenses - Add a new expense (with validation)
router.post('/', async (req, res) => {
    try {
        const { groupId, description, amount, paidBy, splits, clientId, type } = req.body;

        // Validate required fields
        if (!groupId || !description || !amount || !paidBy || !splits) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        // Validate amount > 0
        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than 0.' });
        }

        // Validate group exists and user is a member
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        const memberIds = group.members.map(String);
        if (!memberIds.includes(String(req.userId))) {
            return res.status(403).json({ error: 'You are not a member of this group.' });
        }

        // Validate paidBy is a group member
        if (!memberIds.includes(String(paidBy))) {
            return res.status(400).json({ error: 'Payer must be a group member.' });
        }

        // Validate all split users are group members
        for (const split of splits) {
            if (!memberIds.includes(String(split.userId))) {
                return res.status(400).json({ error: `User ${split.userId} in split is not a group member.` });
            }
        }

        // Validate splits total ≈ amount (allow ₹0.02 rounding tolerance)
        if (type !== 'PAYMENT') {
            const splitsTotal = splits.reduce((sum, s) => sum + Number(s.amount), 0);
            if (Math.abs(splitsTotal - amount) > 0.02) {
                return res.status(400).json({ error: `Splits total (₹${splitsTotal.toFixed(2)}) does not match amount (₹${amount.toFixed(2)}).` });
            }
        }

        // Check for duplicate clientId
        const txClientId = clientId || require('crypto').randomUUID();
        const existing = await Transaction.findOne({ clientId: txClientId });
        if (existing) {
            return res.json({ transaction: existing, duplicate: true });
        }

        const transaction = await Transaction.create({
            clientId: txClientId,
            groupId,
            description,
            amount,
            paidBy,
            splits,
            type: type || 'EXPENSE',
            syncedAt: new Date(),
        });

        // Update group activity
        await Group.findByIdAndUpdate(groupId, { lastActivityAt: new Date() });

        res.status(201).json({ transaction });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add expense.' });
    }
});

// DELETE /api/expenses/:id - Delete an expense
router.delete('/:id', async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) return res.status(404).json({ error: 'Expense not found.' });

        // Check group membership
        const group = await Group.findById(transaction.groupId);
        if (!group) return res.status(404).json({ error: 'Group not found.' });

        const isAdmin = String(group.adminId) === String(req.userId);
        const isCreator = String(transaction.paidBy) === String(req.userId);

        if (!isAdmin && !isCreator) {
            return res.status(403).json({ error: 'Only the expense creator or group admin can delete.' });
        }

        await Transaction.findByIdAndDelete(req.params.id);
        await Group.findByIdAndUpdate(transaction.groupId, { lastActivityAt: new Date() });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete expense.' });
    }
});

// GET /api/expenses/:groupId/balances - Compute pairwise balances
router.get('/:groupId/balances', async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId).populate('members', 'name email');
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!group.members.map(m => String(m._id)).includes(String(req.userId))) {
            return res.status(403).json({ error: 'You are not a member of this group.' });
        }

        const transactions = await Transaction.find({ groupId: req.params.groupId }).lean();

        // Compute net balances
        const balances = {};
        group.members.forEach(m => {
            balances[String(m._id)] = { name: m.name, amount: 0 };
        });

        for (const tx of transactions) {
            const payerId = String(tx.paidBy);
            if (balances[payerId]) balances[payerId].amount += Number(tx.amount);
            for (const split of (tx.splits || [])) {
                const uid = String(split.userId);
                if (balances[uid]) balances[uid].amount -= Number(split.amount);
            }
        }

        res.json({ balances, memberCount: group.members.length });
    } catch (err) {
        res.status(500).json({ error: 'Failed to compute balances.' });
    }
});

module.exports = router;
