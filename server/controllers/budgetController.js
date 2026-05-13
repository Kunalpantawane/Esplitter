const Budget = require('../models/Budget');
const PersonalExpense = require('../models/PersonalExpense');

// GET /api/budgets?month=YYYY-MM — List budgets for a month
async function listBudgets(req, res) {
    try {
        const userId = req.userId;
        const month = req.query.month || _currentMonth();

        const budgets = await Budget.find({ userId, month }).lean();

        // Calculate spending for each budget
        const startDate = new Date(`${month}-01T00:00:00.000Z`);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);

        const expenses = await PersonalExpense.find({
            userId,
            deleted: false,
            date: { $gte: startDate, $lt: endDate },
        }).lean();

        const spendingByCategory = {};
        let totalSpending = 0;
        for (const exp of expenses) {
            const cat = exp.category || 'Others';
            spendingByCategory[cat] = (spendingByCategory[cat] || 0) + exp.amount;
            totalSpending += exp.amount;
        }

        const enriched = budgets.map((b) => ({
            ...b,
            spent: b.category ? (spendingByCategory[b.category] || 0) : totalSpending,
            percentage: b.category
                ? Math.round(((spendingByCategory[b.category] || 0) / b.amount) * 100)
                : Math.round((totalSpending / b.amount) * 100),
        }));

        res.json({ budgets: enriched, month, totalSpending, spendingByCategory });
    } catch (err) {
        console.error('[Budget List Error]', err.message);
        res.status(500).json({ error: 'Failed to fetch budgets.' });
    }
}

// POST /api/budgets — Set/update a budget (upsert)
async function setBudget(req, res) {
    try {
        const userId = req.userId;
        const { category, amount, month } = req.body;

        if (!amount || amount < 1) {
            return res.status(400).json({ error: 'Budget amount must be at least ₹1.' });
        }

        const budgetMonth = month || _currentMonth();

        const budget = await Budget.findOneAndUpdate(
            { userId, category: category || null, month: budgetMonth },
            { userId, category: category || null, amount, month: budgetMonth },
            { upsert: true, new: true }
        );

        res.json({ budget });
    } catch (err) {
        console.error('[Budget Set Error]', err.message);
        res.status(500).json({ error: 'Failed to set budget.' });
    }
}

// DELETE /api/budgets/:id
async function deleteBudget(req, res) {
    try {
        const userId = req.userId;
        const { id } = req.params;

        const budget = await Budget.findById(id);
        if (!budget) return res.status(404).json({ error: 'Budget not found.' });
        if (String(budget.userId) !== userId) return res.status(403).json({ error: 'Not your budget.' });

        await Budget.findByIdAndDelete(id);
        res.json({ success: true });
    } catch (err) {
        console.error('[Budget Delete Error]', err.message);
        res.status(500).json({ error: 'Failed to delete budget.' });
    }
}

function _currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

module.exports = { listBudgets, setBudget, deleteBudget };
