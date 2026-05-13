// tracker.js — Personal expense tracker data logic & sync (uses window.db, window.Auth)

const Tracker = (() => {
    const API = '/api/personal-expenses';
    const CAT_API = '/api/categories';
    const BUDGET_API = '/api/budgets';

    let _syncingPersonal = false;
    let _lastPersonalSyncAt = localStorage.getItem('lastPersonalSyncAt') || null;

    // ---- Default categories (client-side fallback) ----
    const DEFAULT_CATEGORIES = [
        { id: 'cat-food', name: 'Food', color: '#f97316', icon: '🍔', isDefault: true },
        { id: 'cat-travel', name: 'Travel', color: '#3b82f6', icon: '🚗', isDefault: true },
        { id: 'cat-shopping', name: 'Shopping', color: '#ec4899', icon: '🛍️', isDefault: true },
        { id: 'cat-bills', name: 'Bills', color: '#eab308', icon: '📄', isDefault: true },
        { id: 'cat-entertainment', name: 'Entertainment', color: '#8b5cf6', icon: '🎬', isDefault: true },
        { id: 'cat-health', name: 'Health', color: '#22c55e', icon: '💊', isDefault: true },
        { id: 'cat-others', name: 'Others', color: '#6b7280', icon: '📦', isDefault: true },
    ];

    // ---- Category Operations ----
    async function getCategories() {
        let cats = await db.categories.toArray();
        if (!cats.length) {
            // Seed defaults locally
            for (const c of DEFAULT_CATEGORIES) {
                await db.categories.put(c);
            }
            cats = DEFAULT_CATEGORIES;
        }
        return cats;
    }

    async function syncCategories() {
        try {
            const { categories } = await Api.request(CAT_API, {
                cache: 'no-store',
            });
            // Clear and re-populate
            await db.categories.clear();
            for (const c of categories) {
                await db.categories.put({
                    id: String(c._id || c.id || `cat-${c.name.toLowerCase()}`),
                    name: c.name,
                    color: c.color,
                    icon: c.icon,
                    isDefault: c.isDefault || false,
                });
            }
        } catch (err) {
            console.warn('[Tracker] Category sync failed:', err.message);
        }
    }

    async function addCategory(name, color, icon) {
        const data = await Api.request(CAT_API, {
            method: 'POST',
            body: { name, color, icon },
        });

        const cat = data.category;
        await db.categories.put({
            id: String(cat._id),
            name: cat.name,
            color: cat.color,
            icon: cat.icon,
            isDefault: false,
        });
        return cat;
    }

    async function deleteCategory(id) {
        await Api.request(`${CAT_API}/${id}`, { method: 'DELETE' });
        await db.categories.delete(id);
    }

    function getCategoryMeta(categoryName) {
        const defaults = DEFAULT_CATEGORIES.find(
            (c) => c.name.toLowerCase() === (categoryName || '').toLowerCase()
        );
        return defaults || { name: categoryName || 'Others', color: '#6b7280', icon: '📦' };
    }

    // ---- Personal Expense Operations ----

    async function addExpense({ amount, category, description, date, paymentMethod, notes }) {
        const clientId = crypto.randomUUID();
        const expense = {
            clientId,
            amount: Number(amount),
            category: category || 'Others',
            description: description || '',
            date: date || new Date().toISOString(),
            paymentMethod: paymentMethod || 'cash',
            notes: notes || '',
            isRecurring: false,
            recurringFrequency: null,
            syncStatus: 'PENDING',
            createdAt: new Date().toISOString(),
        };
        await db.personalExpenses.add(expense);
        return expense;
    }

    async function deleteExpense(clientId) {
        const existing = await db.personalExpenses.get(clientId);
        if (!existing) return;

        await db.personalExpenses.update(clientId, { deleted: true, syncStatus: 'PENDING' });

        // Try immediate server delete
        if (navigator.onLine) {
            try {
                await Api.request(`${API}/${clientId}`, { method: 'DELETE' });
                await db.personalExpenses.delete(clientId);
            } catch (err) {
                console.warn('[Tracker] Delete push failed:', err.message);
            }
        }
    }

    async function getSyncConflicts() {
        const conflicts = await db.personalExpenses.where('syncStatus').equals('FAILED').toArray();
        return conflicts
            .filter((e) => !e.deleted)
            .map((e) => ({
                clientId: e.clientId,
                amount: e.amount,
                category: e.category,
                description: e.description,
                date: e.date,
                paymentMethod: e.paymentMethod,
                reason: e.lastError || 'Sync failed. Please retry when back online.',
            }))
            .sort((left, right) => new Date(right.date) - new Date(left.date));
    }

    async function retryExpenseSync(clientId) {
        const existing = await db.personalExpenses.get(clientId);
        if (!existing) throw new Error('Expense not found.');

        await db.personalExpenses.update(clientId, {
            syncStatus: 'PENDING',
            lastError: null,
        });

        return syncPersonalExpenses();
    }

    async function getExpenses(filters = {}) {
        let all = await db.personalExpenses.toArray();
        // Filter out tombstones
        all = all.filter((e) => !e.deleted);

        if (filters.category) {
            all = all.filter((e) => e.category === filters.category);
        }
        if (filters.startDate) {
            const start = new Date(filters.startDate);
            all = all.filter((e) => new Date(e.date) >= start);
        }
        if (filters.endDate) {
            const end = new Date(filters.endDate);
            all = all.filter((e) => new Date(e.date) <= end);
        }
        if (filters.paymentMethod) {
            all = all.filter((e) => e.paymentMethod === filters.paymentMethod);
        }
        if (filters.search) {
            const q = filters.search.toLowerCase();
            all = all.filter(
                (e) =>
                    (e.description || '').toLowerCase().includes(q) ||
                    (e.notes || '').toLowerCase().includes(q)
            );
        }

        // Sort by date descending
        all.sort((a, b) => new Date(b.date) - new Date(a.date));
        return all;
    }

    // ---- Sync ----
    async function syncPersonalExpenses() {
        if (_syncingPersonal) return null;
        const session = await Auth.getSession();
        if (!session || !navigator.onLine) return null;

        _syncingPersonal = true;
        try {
            const allPending = await db.personalExpenses
                .where('syncStatus')
                .anyOf('PENDING', 'FAILED')
                .toArray();

            const pendingPayload = allPending.map((e) => ({
                clientId: e.clientId,
                amount: e.amount,
                category: e.category,
                description: e.description,
                date: e.date,
                paymentMethod: e.paymentMethod,
                notes: e.notes,
                deleted: e.deleted || false,
            }));

            const { synced, errors, serverAdds, serverDeletes, syncTime } = await Api.request(`${API}/sync`, {
                method: 'POST',
                body: {
                    lastSyncAt: _lastPersonalSyncAt,
                    pending: pendingPayload,
                },
            });

            // Mark synced
            for (const clientId of synced || []) {
                await db.personalExpenses.where('clientId').equals(clientId).modify({
                    syncStatus: 'SYNCED',
                    lastError: null,
                });
            }

            // Mark errors
            for (const err of errors || []) {
                await db.personalExpenses.where('clientId').equals(err.clientId).modify({
                    syncStatus: 'FAILED',
                    lastError: err.error,
                });
            }

            // Merge server additions
            for (const e of serverAdds || []) {
                const existing = await db.personalExpenses.get(e.clientId);
                if (!existing) {
                    await db.personalExpenses.put({
                        clientId: e.clientId,
                        amount: e.amount,
                        category: e.category,
                        description: e.description,
                        date: e.date,
                        paymentMethod: e.paymentMethod,
                        notes: e.notes,
                        isRecurring: e.isRecurring || false,
                        syncStatus: 'SYNCED',
                        lastError: null,
                        createdAt: e.createdAt,
                    });
                } else if (existing.syncStatus === 'SYNCED') {
                    await db.personalExpenses.update(e.clientId, {
                        amount: e.amount,
                        category: e.category,
                        description: e.description,
                        date: e.date,
                        paymentMethod: e.paymentMethod,
                        notes: e.notes,
                        lastError: null,
                    });
                }
            }

            // Remove server deletions
            for (const e of serverDeletes || []) {
                await db.personalExpenses.delete(e.clientId);
            }

            _lastPersonalSyncAt = syncTime;
            localStorage.setItem('lastPersonalSyncAt', syncTime);

            return { synced: (synced || []).length, pulled: (serverAdds || []).length };
        } catch (err) {
            console.warn('[Tracker] Sync failed:', err.message);
            return null;
        } finally {
            _syncingPersonal = false;
        }
    }

    // ---- Analytics Computations ----

    function _getDateRange(period) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let start, end;

        switch (period) {
            case 'today':
                start = today;
                end = new Date(today.getTime() + 86400000);
                break;
            case 'week': {
                const dow = today.getDay();
                start = new Date(today.getTime() - dow * 86400000);
                end = new Date(start.getTime() + 7 * 86400000);
                break;
            }
            case 'lastWeek': {
                const dow = today.getDay();
                const thisWeekStart = new Date(today.getTime() - dow * 86400000);
                start = new Date(thisWeekStart.getTime() - 7 * 86400000);
                end = thisWeekStart;
                break;
            }
            case 'month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                break;
            case 'lastMonth':
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                end = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case '7days':
                start = new Date(today.getTime() - 7 * 86400000);
                end = new Date(today.getTime() + 86400000);
                break;
            case '30days':
                start = new Date(today.getTime() - 30 * 86400000);
                end = new Date(today.getTime() + 86400000);
                break;
            default:
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        }
        return { start, end };
    }

    async function getAnalytics(period = 'month') {
        const { start, end } = _getDateRange(period);
        const expenses = await getExpenses({ startDate: start.toISOString(), endDate: end.toISOString() });

        const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
        const count = expenses.length;

        // Category breakdown
        const byCategory = {};
        for (const e of expenses) {
            const cat = e.category || 'Others';
            if (!byCategory[cat]) byCategory[cat] = 0;
            byCategory[cat] += e.amount;
        }

        // Daily breakdown
        const byDay = {};
        for (const e of expenses) {
            const day = new Date(e.date).toISOString().slice(0, 10);
            if (!byDay[day]) byDay[day] = 0;
            byDay[day] += e.amount;
        }

        // Payment method breakdown
        const byPayment = {};
        for (const e of expenses) {
            const pm = e.paymentMethod || 'cash';
            if (!byPayment[pm]) byPayment[pm] = 0;
            byPayment[pm] += e.amount;
        }

        return { totalSpent, count, byCategory, byDay, byPayment, period, start, end };
    }

    async function getComparison() {
        const [thisWeek, lastWeek] = await Promise.all([
            getAnalytics('week'),
            getAnalytics('lastWeek'),
        ]);
        const [thisMonth, lastMonth] = await Promise.all([
            getAnalytics('month'),
            getAnalytics('lastMonth'),
        ]);

        const weekChange = lastWeek.totalSpent > 0
            ? Math.round(((thisWeek.totalSpent - lastWeek.totalSpent) / lastWeek.totalSpent) * 100)
            : (thisWeek.totalSpent > 0 ? 100 : 0);
        const monthChange = lastMonth.totalSpent > 0
            ? Math.round(((thisMonth.totalSpent - lastMonth.totalSpent) / lastMonth.totalSpent) * 100)
            : (thisMonth.totalSpent > 0 ? 100 : 0);

        return { thisWeek, lastWeek, weekChange, thisMonth, lastMonth, monthChange };
    }

    // ---- Smart Insights ----
    async function getInsights() {
        const insights = [];
        const comparison = await getComparison();

        // Week-over-week spending change
        if (comparison.weekChange > 20) {
            insights.push({
                icon: '📈',
                text: `You spent ${comparison.weekChange}% more this week compared to last week.`,
                type: 'warning',
            });
        } else if (comparison.weekChange < -20) {
            insights.push({
                icon: '📉',
                text: `Great job! Spending is down ${Math.abs(comparison.weekChange)}% this week.`,
                type: 'success',
            });
        }

        // Top category
        const thisMonth = comparison.thisMonth;
        if (Object.keys(thisMonth.byCategory).length > 0) {
            const topCat = Object.entries(thisMonth.byCategory).sort((a, b) => b[1] - a[1])[0];
            insights.push({
                icon: getCategoryMeta(topCat[0]).icon,
                text: `${topCat[0]} is your top spending category this month (₹${topCat[1].toFixed(0)}).`,
                type: 'info',
            });
        }

        // Category comparison
        const lastMonthCats = comparison.lastMonth.byCategory;
        for (const [cat, amount] of Object.entries(thisMonth.byCategory)) {
            const prev = lastMonthCats[cat] || 0;
            if (prev > 0 && amount > prev * 1.3) {
                insights.push({
                    icon: '⚠️',
                    text: `${cat} spending is ${Math.round(((amount - prev) / prev) * 100)}% higher than last month.`,
                    type: 'warning',
                });
            }
        }

        // Daily average
        if (thisMonth.count > 0) {
            const daysInMonth = new Date().getDate();
            const avgDaily = thisMonth.totalSpent / daysInMonth;
            insights.push({
                icon: '📊',
                text: `Your daily average this month is ₹${avgDaily.toFixed(0)}.`,
                type: 'info',
            });
        }

        return insights.slice(0, 4); // Max 4 insights
    }

    // ---- Budget Operations ----

    async function getBudgets(month) {
        const session = await Auth.getSession();
        if (!session) return { budgets: [], totalSpending: 0, spendingByCategory: {} };

        // Try server first
        if (navigator.onLine) {
            try {
                const url = month ? `${BUDGET_API}?month=${month}` : BUDGET_API;
                const data = await Api.request(url, {
                    cache: 'no-store',
                });
                // Cache locally
                await db.budgets.clear();
                for (const b of data.budgets) {
                    await db.budgets.put({
                        id: String(b._id),
                        category: b.category,
                        amount: b.amount,
                        month: b.month,
                        spent: b.spent,
                        percentage: b.percentage,
                    });
                }
                return data;
            } catch (err) {
                console.warn('[Tracker] Budget fetch failed:', err.message);
            }
        }

        // Fallback: local budgets + compute spending from local data
        const localBudgets = await db.budgets.toArray();
        const analytics = await getAnalytics('month');
        return {
            budgets: localBudgets.map((b) => ({
                ...b,
                spent: b.category ? (analytics.byCategory[b.category] || 0) : analytics.totalSpent,
                percentage: b.category
                    ? Math.round(((analytics.byCategory[b.category] || 0) / b.amount) * 100)
                    : Math.round((analytics.totalSpent / b.amount) * 100),
            })),
            totalSpending: analytics.totalSpent,
            spendingByCategory: analytics.byCategory,
        };
    }

    async function setBudget(category, amount, month) {
        const data = await Api.request(BUDGET_API, {
            method: 'POST',
            body: { category: category || null, amount, month },
        });

        await db.budgets.put({
            id: String(data.budget._id),
            category: data.budget.category,
            amount: data.budget.amount,
            month: data.budget.month,
        });
        return data.budget;
    }

    async function deleteBudget(id) {
        await Api.request(`${BUDGET_API}/${id}`, { method: 'DELETE' });
        await db.budgets.delete(id);
    }

    return {
        // Categories
        getCategories, syncCategories, addCategory, deleteCategory, getCategoryMeta,
        DEFAULT_CATEGORIES,
        // Expenses
        addExpense, deleteExpense, getExpenses,
        // Sync
        syncPersonalExpenses,
        getSyncConflicts, retryExpenseSync,
        // Analytics
        getAnalytics, getComparison, getInsights,
        // Budgets
        getBudgets, setBudget, deleteBudget,
    };
})();

window.Tracker = Tracker;
