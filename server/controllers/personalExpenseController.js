const PersonalExpense = require('../models/PersonalExpense');

// POST /api/personal-expenses/sync — Idempotent sync (mirrors group sync pattern)
async function syncPersonalExpenses(req, res) {
    try {
        const userId = req.userId;
        const { lastSyncAt, pending = [] } = req.body;

        const synced = [];
        const errors = [];

        // Process pending (client → server)
        for (const item of pending) {
            try {
                if (!item.clientId) {
                    errors.push({ clientId: item.clientId, error: 'Missing clientId' });
                    continue;
                }

                // Handle deletions
                if (item.deleted) {
                    await PersonalExpense.findOneAndUpdate(
                        { clientId: item.clientId, userId },
                        { deleted: true, syncedAt: new Date() }
                    );
                    synced.push(item.clientId);
                    continue;
                }

                // Upsert expense (idempotent)
                await PersonalExpense.findOneAndUpdate(
                    { clientId: item.clientId, userId },
                    {
                        clientId: item.clientId,
                        userId,
                        amount: item.amount,
                        category: item.category || 'Others',
                        description: item.description || '',
                        date: item.date || new Date(),
                        paymentMethod: item.paymentMethod || 'cash',
                        notes: item.notes || '',
                        isRecurring: item.isRecurring || false,
                        recurringFrequency: item.recurringFrequency || null,
                        deleted: false,
                        syncedAt: new Date(),
                    },
                    { upsert: true, new: true }
                );
                synced.push(item.clientId);
            } catch (err) {
                errors.push({ clientId: item.clientId, error: err.message });
            }
        }

        // Fetch server changes since lastSyncAt (server → client)
        const query = { userId, deleted: false };
        if (lastSyncAt) {
            query.syncedAt = { $gt: new Date(lastSyncAt) };
        }
        const serverAdds = await PersonalExpense.find(query)
            .sort({ date: -1 })
            .limit(500)
            .lean();

        // Also send deleted items so client can remove them
        const deletedQuery = { userId, deleted: true };
        if (lastSyncAt) {
            deletedQuery.syncedAt = { $gt: new Date(lastSyncAt) };
        }
        const serverDeletes = await PersonalExpense.find(deletedQuery)
            .select('clientId')
            .lean();

        const syncTime = new Date().toISOString();

        res.json({
            synced,
            errors,
            serverAdds: serverAdds.map((e) => ({
                clientId: e.clientId,
                amount: e.amount,
                category: e.category,
                description: e.description,
                date: e.date,
                paymentMethod: e.paymentMethod,
                notes: e.notes,
                isRecurring: e.isRecurring,
                recurringFrequency: e.recurringFrequency,
                deleted: false,
                createdAt: e.createdAt,
            })),
            serverDeletes: serverDeletes.map((e) => ({ clientId: e.clientId, deleted: true })),
            syncTime,
        });
    } catch (err) {
        console.error('[PersonalExpense Sync Error]', err.message);
        res.status(500).json({ error: 'Sync failed.' });
    }
}

// GET /api/personal-expenses — List with filters
async function listPersonalExpenses(req, res) {
    try {
        const userId = req.userId;
        const {
            category,
            startDate,
            endDate,
            minAmount,
            maxAmount,
            search,
            page = 1,
            limit = 50,
        } = req.query;

        const query = { userId, deleted: false };

        if (category) query.category = category;
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        if (minAmount || maxAmount) {
            query.amount = {};
            if (minAmount) query.amount.$gte = Number(minAmount);
            if (maxAmount) query.amount.$lte = Number(maxAmount);
        }
        if (search) {
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { description: { $regex: escapedSearch, $options: 'i' } },
                { notes: { $regex: escapedSearch, $options: 'i' } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [expenses, total] = await Promise.all([
            PersonalExpense.find(query)
                .sort({ date: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            PersonalExpense.countDocuments(query),
        ]);

        res.json({ expenses, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
        console.error('[PersonalExpense List Error]', err.message);
        res.status(500).json({ error: 'Failed to fetch expenses.' });
    }
}

// DELETE /api/personal-expenses/:clientId
async function deletePersonalExpense(req, res) {
    try {
        const userId = req.userId;
        const { clientId } = req.params;

        const expense = await PersonalExpense.findOne({ clientId, userId });
        if (!expense) return res.status(404).json({ error: 'Expense not found.' });

        expense.deleted = true;
        expense.syncedAt = new Date();
        await expense.save();

        res.json({ success: true });
    } catch (err) {
        console.error('[PersonalExpense Delete Error]', err.message);
        res.status(500).json({ error: 'Failed to delete expense.' });
    }
}

module.exports = { syncPersonalExpenses, listPersonalExpenses, deletePersonalExpense };
