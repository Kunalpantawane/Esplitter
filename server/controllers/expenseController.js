const Group = require('../models/Group');
const Transaction = require('../models/Transaction');
const { computeGroupBalances } = require('../services/balanceService');
const runAtomic = require('../lib/runAtomic');
const crypto = require('crypto');
const { getRazorpayClient, getRazorpayKeyId } = require('../lib/razorpay');
const paymentService = require('../services/paymentService');

function isGroupMember(group, userId) {
    return group.members.map(String).includes(String(userId));
}

function canManageExpense(group, transaction, userId) {
    const isAdmin = String(group.adminId) === String(userId);
    const isCreator = String(transaction.paidBy) === String(userId);
    return isAdmin || isCreator;
}

// GET /api/expenses/:groupId - Get expenses for a group (paginated + search/filter)
async function listExpenses(req, res) {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!isGroupMember(group, req.userId)) {
            return res.status(403).json({ error: 'You are not a member of this group.' });
        }

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const filter = { groupId: req.params.groupId, deleted: { $ne: true } };

        if (req.query.search) {
            const escapedSearch = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.description = { $regex: escapedSearch, $options: 'i' };
        }
        if (req.query.payerId) {
            filter.paidBy = req.query.payerId;
        }
        if (req.query.type && ['EXPENSE', 'PAYMENT'].includes(req.query.type)) {
            filter.type = req.query.type;
        }
        if (req.query.minAmount || req.query.maxAmount) {
            filter.amount = {};
            if (req.query.minAmount) filter.amount.$gte = parseFloat(req.query.minAmount);
            if (req.query.maxAmount) filter.amount.$lte = parseFloat(req.query.maxAmount);
        }
        if (req.query.startDate || req.query.endDate) {
            filter.createdAt = {};
            if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
            if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
        }

        const [transactions, total] = await Promise.all([
            Transaction.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Transaction.countDocuments(filter),
        ]);

        res.json({
            transactions,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page * limit < total,
            },
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch expenses.' });
    }
}

// GET /api/expenses/detail/:id - Get a single expense with full details
async function getExpenseDetail(req, res) {
    try {
        const transaction = await Transaction.findById(req.params.id)
            .populate('paidBy', 'name email')
            .populate('splits.userId', 'name email')
            .populate('receiverId', 'name email')
            .lean();

        if (!transaction || transaction.deleted) return res.status(404).json({ error: 'Expense not found.' });

        const group = await Group.findById(transaction.groupId);
        if (!group || !isGroupMember(group, req.userId)) {
            return res.status(403).json({ error: 'You are not a member of this group.' });
        }

        const isAdmin = String(group.adminId) === String(req.userId);
        const isCreator = String(transaction.paidBy._id || transaction.paidBy) === String(req.userId);

        res.json({ transaction, canDelete: isAdmin || isCreator });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch expense detail.' });
    }
}

// POST /api/expenses - Add a new expense (with validation)
async function createExpense(req, res) {
    try {
        const { groupId, description, amount, paidBy, splits, clientId, type, splitType, receiverId, status } = req.body;

        if (!groupId || !description || !amount || !paidBy || !splits) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than 0.' });
        }

        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        const memberIds = group.members.map(String);
        if (!memberIds.includes(String(req.userId))) {
            return res.status(403).json({ error: 'You are not a member of this group.' });
        }

        // Fix 5: Block writes to archived groups
        if (group.isArchived) {
            return res.status(403).json({ error: 'Cannot add expenses to an archived group.' });
        }

        if (!memberIds.includes(String(paidBy))) {
            return res.status(400).json({ error: 'Payer must be a group member.' });
        }

        for (const split of splits) {
            if (!memberIds.includes(String(split.userId))) {
                return res.status(400).json({ error: `User ${split.userId} in split is not a group member.` });
            }
        }

        if (type !== 'PAYMENT') {
            const splitsTotal = splits.reduce((sum, s) => sum + Number(s.amount), 0);
            if (Math.abs(splitsTotal - amount) > 0.02) {
                return res.status(400).json({ error: `Splits total (₹${splitsTotal.toFixed(2)}) does not match amount (₹${amount.toFixed(2)}).` });
            }
        }

        const txClientId = clientId || require('crypto').randomUUID();
        const existing = await Transaction.findOne({ clientId: txClientId });
        if (existing) {
            return res.json({ transaction: existing, duplicate: true });
        }

        let transaction;
        const now = new Date();
        await runAtomic(async (session) => {
            const createOptions = session ? { session } : {};
            const docs = await Transaction.create([
                {
                    clientId: txClientId,
                    groupId,
                    description,
                    amount,
                    paidBy,
                    receiverId: receiverId || undefined,
                    splits,
                    splitType: splitType || 'EQUAL',
                    type: type || 'EXPENSE',
                    status: status || (type === 'PAYMENT' ? 'PENDING' : 'PAID'),
                    syncedAt: now,
                },
            ], createOptions);
            transaction = docs[0];

            const updateOptions = session ? { session } : {};
            await Group.findByIdAndUpdate(groupId, { lastActivityAt: now }, updateOptions);
        });

        res.status(201).json({ transaction });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add expense.' });
    }
}

// PUT /api/expenses/:id - Update expense description (admin/creator only)
async function updateExpense(req, res) {
    try {
        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) return res.status(404).json({ error: 'Expense not found.' });

        const group = await Group.findById(transaction.groupId);
        if (!group) return res.status(404).json({ error: 'Group not found.' });

        if (!canManageExpense(group, transaction, req.userId)) {
            return res.status(403).json({ error: 'Only admin or creator can update.' });
        }

        const { description } = req.body;
        if (!description || !description.trim()) {
            return res.status(400).json({ error: 'Description is required.' });
        }

        const now = new Date();
        await runAtomic(async (session) => {
            const options = session ? { session } : {};
            await Transaction.findByIdAndUpdate(
                transaction._id,
                { description: description.trim(), syncedAt: now },
                options
            );
            await Group.findByIdAndUpdate(transaction.groupId, { lastActivityAt: now }, options);
        });

        const updated = await Transaction.findById(transaction._id);
        res.json({ transaction: updated });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update expense.' });
    }
}

// PATCH /api/expenses/:id/settle-status - Update settlement status (role-based, atomic)
async function updateSettlementStatus(req, res) {
    try {
        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) return res.status(404).json({ error: 'Expense not found.' });

        if (transaction.type !== 'PAYMENT') {
            return res.status(400).json({ error: 'Only settlements (payments) can have status updates.' });
        }

        const { status } = req.body;
        if (!['PENDING', 'PAID', 'CONFIRMED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }

        const debtorId = String(transaction.paidBy);
        const creditorId = transaction.splits && transaction.splits.length > 0
            ? String(transaction.splits[0].userId)
            : (transaction.receiverId ? String(transaction.receiverId) : null);

        if (!creditorId) {
            return res.status(400).json({ error: 'Cannot determine creditor for this payment.' });
        }

        if (status === 'PAID' && String(req.userId) !== debtorId) {
            return res.status(403).json({ error: 'Only the debtor can mark as PAID.' });
        }
        if (status === 'CONFIRMED' && String(req.userId) !== creditorId) {
            return res.status(403).json({ error: 'Only the creditor can confirm receipt.' });
        }
        if (status === 'PENDING' && String(req.userId) !== creditorId && String(req.userId) !== debtorId) {
            return res.status(403).json({ error: 'Unauthorized.' });
        }

        const now = new Date();
        await runAtomic(async (session) => {
            const options = session ? { session } : {};
            await Transaction.findByIdAndUpdate(
                transaction._id,
                { status, syncedAt: now },
                options
            );
            await Group.findByIdAndUpdate(transaction.groupId, { lastActivityAt: now }, options);
        });

        const updated = await Transaction.findById(transaction._id);
        res.json({ transaction: updated });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update settlement status.' });
    }
}

// DELETE /api/expenses/:id - Soft delete expense (admin/creator only, atomic)
async function deleteExpense(req, res) {
    try {
        // Support both /api/expenses/:id (MongoDB _id) and /api/expenses/client/:clientId (UUID)
        let transaction;
        if (req.params.clientId) {
            transaction = await Transaction.findOne({ clientId: req.params.clientId });
        } else {
            transaction = await Transaction.findById(req.params.id);
        }
        if (!transaction) return res.status(404).json({ error: 'Expense not found.' });

        const group = await Group.findById(transaction.groupId);
        if (!group) return res.status(404).json({ error: 'Group not found.' });

        if (!canManageExpense(group, transaction, req.userId)) {
            return res.status(403).json({ error: 'Only the expense creator or group admin can delete.' });
        }

        const now = new Date();
        await runAtomic(async (session) => {
            const options = session ? { session } : {};
            await Transaction.findByIdAndUpdate(
                transaction._id,
                { deleted: true, syncedAt: now },
                options
            );
            await Group.findByIdAndUpdate(transaction.groupId, { lastActivityAt: now }, options);
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete expense.' });
    }
}

// GET /api/expenses/:groupId/balances - Derive pairwise balances
async function getGroupBalances(req, res) {
    try {
        // Pass raw query mode; computeGroupBalances resolves: query.mode || group.settlementMode || 'smart'
            const mode = req.query.mode === 'normal' || req.query.mode === 'smart'
                ? req.query.mode
                : undefined;
        const derived = await computeGroupBalances(req.params.groupId, { mode });
        if (!derived) return res.status(404).json({ error: 'Group not found.' });
        if (!derived.group.members.map(m => String(m._id)).includes(String(req.userId))) {
            return res.status(403).json({ error: 'You are not a member of this group.' });
        }

        const balances = {};
        Object.entries(derived.balances).forEach(([memberId, entry]) => {
            balances[memberId] = {
                name: entry.name,
                amount: entry.balance,
                moneyPaid: entry.moneyPaid,
                moneyOwed: entry.moneyOwed,
            };
        });

        res.json({
            balances,
            pairwiseDebts: derived.pairwiseDebts,
            memberCount: derived.memberCount,
            isSettled: derived.isSettled,
            mode: derived.mode,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to compute balances.' });
    }
}

async function createRazorpayOrder(req, res) {
    try {
        const {
            groupId,
            amount,
            debtorId,
            creditorId,
            clientId,
            description,
        } = req.body;

        if (String(req.userId) !== String(debtorId)) {
            return res.status(403).json({ error: 'You can only create an order for your own settlement.' });
        }

        const result = await paymentService.createRazorpayOrder({
            groupId,
            amount,
            debtorId,
            creditorId,
            clientId,
            description,
        });

        return res.status(201).json(result);
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ error: err.message });
        }
        return res.status(500).json({ error: 'Failed to create Razorpay order.' });
    }
}

async function handleRazorpayWebhook(req, res) {
    try {
        const signature = req.header('x-razorpay-signature');
        if (!signature) {
            return res.status(400).json({ error: 'Missing Razorpay signature.' });
        }

        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!webhookSecret) {
            return res.status(503).json({ error: 'Razorpay webhook is not configured.' });
        }

        const rawBody = req.rawBody;
        if (!rawBody || !Buffer.isBuffer(rawBody)) {
            return res.status(400).json({ error: 'Raw webhook body is required.' });
        }

        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(rawBody)
            .digest('hex');

        if (expectedSignature !== signature) {
            return res.status(401).json({ error: 'Invalid Razorpay signature.' });
        }

        const event = req.body || {};
        const result = await paymentService.handleWebhookEvent(event, signature);

        return res.status(200).json({ received: true, ...result });
    } catch (err) {
        console.error('[Razorpay Webhook] Failed:', err.message);
        return res.status(500).json({ error: 'Webhook processing failed.' });
    }
}

async function getPaymentStatus(req, res) {
    try {
        const { clientId } = req.params;
        if (!clientId) {
            return res.status(400).json({ error: 'Client ID is required.' });
        }

        const status = await paymentService.getPaymentStatus(clientId);
        if (!status) {
            return res.status(404).json({ error: 'Payment record not found.' });
        }

        res.json(status);
    } catch (err) {
        console.error('[Get Payment Status] Failed:', err.message);
        res.status(500).json({ error: 'Failed to fetch payment status.' });
    }
}

async function verifyPayment(req, res) {
    try {
        const { clientId } = req.params;
        if (!clientId) {
            return res.status(400).json({ error: 'Client ID is required.' });
        }

        const status = await paymentService.getPaymentStatus(clientId);
        if (!status) {
            return res.status(404).json({ error: 'Payment record not found.' });
        }

        if (!status.paymentRecord.razorpayPaymentId) {
            return res.status(400).json({ error: 'Payment ID not available for verification.' });
        }

        const result = await paymentService.reconcilePayment(status.paymentRecord.id);
        res.json(result);
    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({ error: err.message });
        }
        console.error('[Verify Payment] Failed:', err.message);
        res.status(500).json({ error: 'Failed to verify payment.' });
    }
}

module.exports = {
    listExpenses,
    getExpenseDetail,
    createExpense,
    updateExpense,
    updateSettlementStatus,
    deleteExpense,
    getGroupBalances,
    createRazorpayOrder,
    handleRazorpayWebhook,
    getPaymentStatus,
    verifyPayment,
};
