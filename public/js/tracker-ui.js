// tracker-ui.js — Personal expense tracker UI rendering (uses window.Tracker, window.UI, Chart.js)

const TrackerUI = (() => {
    let _chartPie = null;
    let _chartLine = null;
    let _currentPeriod = 'month';

    function escapeHtml(str) { return UI.escapeHtml(str); }

    // ---- Main Dashboard ----
    async function renderDashboard() {
        const container = document.getElementById('tracker-content');
        if (!container) return;

        container.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-primary"><div class="sync-spinner mb-4"></div><span class="font-label-md tracking-widest uppercase">Analyzing Finances...</span></div>';

        const [analytics, categories, comparison, insights, budgetData, conflicts] = await Promise.all([
            Tracker.getAnalytics('month'),
            Tracker.getCategories(),
            Tracker.getComparison(),
            Tracker.getInsights(),
            Tracker.getBudgets(),
            Tracker.getSyncConflicts(),
        ]);

        let html = '';

        // Monthly Overview Card
        html += `
        <section class="glass-card rounded-xl p-6 shadow-xl mb-8 relative overflow-hidden">
            <div class="absolute top-0 right-0 w-32 h-32 emerald-gradient opacity-10 rounded-bl-[100px]"></div>
            <div class="flex items-center justify-between mb-8">
                <span class="font-label-md text-label-md font-bold uppercase tracking-widest text-primary">Monthly Overview</span>
                <span class="material-symbols-outlined text-outline-variant">calendar_month</span>
            </div>
            <div class="flex flex-col md:flex-row items-center gap-10">
                <!-- Data Visualization -->
                <div class="relative w-36 h-36 flex-shrink-0">
                    <canvas id="tracker-pie-chart" width="144" height="144"></canvas>
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span class="text-[10px] text-outline-variant font-bold uppercase tracking-tighter">Total</span>
                        <span class="text-xl font-extrabold text-on-surface">₹${analytics.totalSpent.toFixed(0)}</span>
                    </div>
                </div>
                <div class="flex-grow text-center md:text-left space-y-4">
                    <div>
                        <p class="text-on-surface-variant font-label-sm uppercase tracking-widest mb-1">Spent so far</p>
                        <h3 class="text-4xl font-extrabold text-on-surface tracking-tight">₹${analytics.totalSpent.toLocaleString('en-IN')}</h3>
                    </div>
                    <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${comparison.weekChange > 0 ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}">
                        <span class="material-symbols-outlined text-sm font-bold">${comparison.weekChange > 0 ? 'trending_up' : 'trending_down'}</span>
                        <span class="font-label-sm font-bold uppercase tracking-tight">${Math.abs(comparison.weekChange)}% vs last week</span>
                    </div>
                </div>
            </div>
            
            <div id="tracker-pie-legend" class="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3"></div>
        </section>`;

        // Budget Progress Section
        if (budgetData.budgets.length > 0) {
            const overallBudget = budgetData.budgets.find((b) => !b.category);
            if (overallBudget) {
                const pct = overallBudget.percentage || 0;
                const progressColor = pct > 100 ? 'bg-error' : pct > 80 ? 'bg-tertiary' : 'bg-primary';
                html += `
        <section class="mb-8">
            <div class="flex items-end justify-between mb-4">
                <h3 class="font-headline-md text-on-surface">Monthly Budget</h3>
                <div class="flex flex-col items-end">
                    <span class="font-headline-md text-on-surface">₹${overallBudget.spent?.toLocaleString('en-IN') || 0}</span>
                    <span class="text-[10px] text-outline-variant font-bold uppercase">of ₹${overallBudget.amount.toLocaleString('en-IN')} limit</span>
                </div>
            </div>
            <div class="glass-card rounded-xl p-5 border border-outline-variant/10 shadow-lg">
                <div class="space-y-3">
                    <div class="h-3 w-full bg-surface-container rounded-full overflow-hidden p-0.5">
                        <div class="h-full ${progressColor} rounded-full shadow-sm transition-all duration-1000" style="width: ${Math.min(pct, 100)}%"></div>
                    </div>
                    <div class="flex justify-between items-center">
                        <p class="text-label-sm font-bold ${pct > 100 ? 'text-error' : 'text-primary'} uppercase tracking-widest">${pct.toFixed(0)}% utilized</p>
                        <span class="text-on-surface-variant text-[10px] uppercase font-bold tracking-widest">₹${(overallBudget.amount - (overallBudget.spent || 0)).toLocaleString('en-IN')} remaining</span>
                    </div>
                </div>
            </div>
        </section>`;
            }
        }

        // Recent Expenses List
        html += `
        <section class="space-y-4 pb-12">
            <div class="flex items-center justify-between">
                <h3 class="font-headline-md text-on-surface">Recent Activity</h3>
                <button class="px-4 py-2 bg-surface-container rounded-full text-primary font-label-md hover:bg-primary/10 transition-colors" id="btn-view-all-expenses">View All</button>
            </div>
            <div id="tracker-expense-list" class="space-y-3"></div>
        </section>`;

        container.innerHTML = html;

        // Render charts
        _renderPieChart(analytics.byCategory, categories);
        _renderRecentExpenses(await Tracker.getExpenses(), categories);

        // View all button
        document.getElementById('btn-view-all-expenses')?.addEventListener('click', () => {
            showAllExpenses();
        });
    }

    // ---- Pie Chart ----
    function _renderPieChart(byCategory, categories) {
        const canvas = document.getElementById('tracker-pie-chart');
        const legendContainer = document.getElementById('tracker-pie-legend');
        if (!canvas || !legendContainer) return;

        const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) {
            legendContainer.innerHTML = '<div class="empty-chart-msg">No expenses yet this period.</div>';
            return;
        }

        const labels = entries.map(([cat]) => cat);
        const data = entries.map(([, val]) => val);
        const colors = entries.map(([cat]) => {
            const meta = Tracker.getCategoryMeta(cat);
            return meta.color;
        });

        if (_chartPie) _chartPie.destroy();

        _chartPie = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#1a1a2e',
                    hoverBorderWidth: 3,
                    hoverBorderColor: '#fff',
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(26,26,46,0.95)',
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { size: 13, weight: '600' },
                        bodyFont: { size: 12 },
                        callbacks: {
                            label: (ctx) => `₹${ctx.parsed.toFixed(0)} (${Math.round((ctx.parsed / data.reduce((a, b) => a + b, 0)) * 100)}%)`,
                        },
                    },
                },
            },
        });

        // Custom legend
        const total = data.reduce((a, b) => a + b, 0);
        legendContainer.innerHTML = entries.map(([cat, val]) => {
            const meta = Tracker.getCategoryMeta(cat);
            const pct = Math.round((val / total) * 100);
            return `<div class="bg-surface-container-low p-2 rounded-lg border border-outline-variant/10 flex items-center gap-2">
                <span class="w-2 h-2 rounded-full" style="background:${meta.color}"></span>
                <span class="text-[10px] text-on-surface-variant font-bold truncate flex-1">${escapeHtml(cat)}</span>
                <span class="text-[10px] font-extrabold text-on-surface">₹${val.toFixed(0)}</span>
            </div>`;
        }).join('');
    }

    // ---- Line Chart ----
    function _renderLineChart(byDay) {
        const canvas = document.getElementById('tracker-line-chart');
        if (!canvas) return;

        const sortedDays = Object.keys(byDay).sort();
        if (sortedDays.length === 0) {
            if (_chartLine) { _chartLine.destroy(); _chartLine = null; }
            return;
        }

        // Fill gaps
        const labels = [];
        const data = [];
        if (sortedDays.length > 0) {
            const start = new Date(sortedDays[0]);
            const end = new Date(sortedDays[sortedDays.length - 1]);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const key = d.toISOString().slice(0, 10);
                labels.push(new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }));
                data.push(byDay[key] || 0);
            }
        }

        if (_chartLine) _chartLine.destroy();

        const gradient = canvas.getContext('2d').createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.02)');

        _chartLine = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Spending',
                    data,
                    borderColor: '#6366f1',
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    pointBackgroundColor: '#6366f1',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.35,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(26,26,46,0.95)',
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: (ctx) => `₹${ctx.parsed.y.toFixed(0)}`,
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { size: 10 }, maxRotation: 45 },
                    },
                    y: {
                        grid: { color: 'rgba(148,163,184,0.1)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { size: 10 },
                            callback: (v) => `₹${v}`,
                        },
                        beginAtZero: true,
                    },
                },
            },
        });
    }

    // ---- Recent Expenses List ----
    function _renderRecentExpenses(expenses, categories, limit = 8) {
        const container = document.getElementById('tracker-expense-list');
        if (!container) return;

        const recent = expenses.slice(0, limit);
        if (recent.length === 0) {
            container.innerHTML = `<div class="text-center py-12 bg-surface-container-low rounded-2xl border border-dashed border-outline-variant/30">
                <span class="material-symbols-outlined text-outline-variant text-4xl mb-2">receipt_long</span>
                <p class="text-on-surface-variant font-label-md">No expenses recorded yet</p>
            </div>`;
            return;
        }

        container.innerHTML = recent.map((e) => {
            const meta = Tracker.getCategoryMeta(e.category);
            const isToday = new Date(e.date).toDateString() === new Date().toDateString();
            const dateStr = isToday ? 'Today' : new Date(e.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
            const pmLabels = { cash: 'Cash', upi: 'UPI', card: 'Card', other: 'Other' };
            return `<div class="glass-card p-4 rounded-xl flex items-center gap-4 hover:bg-surface-container-high transition-all cursor-pointer group tracker-expense-item" data-client-id="${e.clientId}">
                <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-sm border border-outline-variant/10" style="background:${meta.color}20; color:${meta.color}">
                    ${meta.icon}
                </div>
                <div class="flex-1 min-w-0">
                    <h4 class="font-label-md text-on-surface truncate">${escapeHtml(e.description || e.category)}</h4>
                    <p class="text-[10px] text-on-surface-variant uppercase tracking-widest">${e.category} • ${dateStr}</p>
                </div>
                <div class="text-right">
                    <div class="font-bold text-on-surface">₹${Number(e.amount).toFixed(0)}</div>
                    <div class="text-[10px] text-on-surface-variant font-bold">${pmLabels[e.paymentMethod]?.toUpperCase() || 'CASH'}</div>
                </div>
            </div>`;
        }).join('');

        container.querySelectorAll('.tracker-expense-item').forEach((item) => {
            item.addEventListener('click', () => {
                const ex = expenses.find((e) => e.clientId === item.dataset.clientId);
                if (ex) _showExpenseDetail(ex);
            });
        });
    }

    function _buildForecast(analytics) {
        const today = new Date();
        const elapsedDays = today.getDate();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const paceMultiplier = elapsedDays > 0 ? daysInMonth / elapsedDays : 1;

        const projectedTotal = analytics.totalSpent * paceMultiplier;
        const delta = projectedTotal - analytics.totalSpent;

        const categories = Object.entries(analytics.byCategory || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([category, amount]) => ({
                category,
                projected: amount * paceMultiplier,
            }));

        return { projectedTotal, delta, categories, elapsedDays, daysInMonth };
    }

    // ---- Expense Detail (tap to view/delete) ----
    function _showExpenseDetail(expense) {
        if (!expense) return;
        const meta = Tracker.getCategoryMeta(expense.category);
        const pmLabels = { cash: 'Cash', upi: 'UPI', card: 'Card', other: 'Other' };
        const dateStr = new Date(expense.date).toLocaleDateString('en-IN', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });

        const modal = document.getElementById('modal-personal-expense-detail');
        if (!modal) return;

        const iconEl = modal.querySelector('#ped-icon');
        iconEl.textContent = meta.icon;
        iconEl.style.background = `${meta.color}20`;
        iconEl.style.color = meta.color;
        
        modal.querySelector('#ped-category').textContent = expense.category;
        modal.querySelector('#ped-amount').textContent = `₹${Number(expense.amount).toFixed(2)}`;
        modal.querySelector('#ped-desc').textContent = expense.description || '—';
        modal.querySelector('#ped-date').textContent = dateStr;
        modal.querySelector('#ped-payment').textContent = pmLabels[expense.paymentMethod] || 'Cash';
        
        const syncStatus = expense.syncStatus || 'SYNCED';
        const syncEl = modal.querySelector('#ped-sync');
        syncEl.textContent = syncStatus;
        syncEl.className = `px-2 py-0.5 rounded font-label-sm font-bold uppercase tracking-tighter ${syncStatus === 'SYNCED' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'}`;

        const deleteBtn = modal.querySelector('#btn-delete-personal-expense');
        deleteBtn.dataset.clientId = expense.clientId;

        UI.showModal('modal-personal-expense-detail');
    }

    // ---- All Expenses View ----
    async function showAllExpenses() {
        UI.showScreen('screen-tracker-all');
        const expenses = await Tracker.getExpenses();
        const categories = await Tracker.getCategories();
        const container = document.getElementById('tracker-all-expense-list');
        if (!container) return;

        if (expenses.length === 0) {
            container.innerHTML = `<div class="tracker-empty"><div class="empty-icon">🧾</div><p>No expenses yet.</p></div>`;
            return;
        }

        // Group by date
        const grouped = {};
        for (const e of expenses) {
            const day = new Date(e.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
            if (!grouped[day]) grouped[day] = [];
            grouped[day].push(e);
        }

        let html = '';
        for (const [day, items] of Object.entries(grouped)) {
            const dayTotal = items.reduce((s, e) => s + e.amount, 0);
            html += `<div class="tracker-day-group">
                <div class="tracker-day-header">
                    <span>${day}</span>
                    <span class="tracker-day-total">₹${dayTotal.toFixed(0)}</span>
                </div>`;
            for (const e of items) {
                const meta = Tracker.getCategoryMeta(e.category);
                const pmIcons = { cash: 'Cash', upi: 'UPI', card: 'Card', other: 'Other' };
                html += `<div class="tracker-expense-item" data-client-id="${e.clientId}">
                    <div class="tracker-expense-cat" style="background:${meta.color}20; color:${meta.color}">${meta.icon}</div>
                    <div class="tracker-expense-info">
                        <div class="tracker-expense-desc">${escapeHtml(e.description || e.category)}</div>
                        <div class="tracker-expense-meta">${escapeHtml(e.category)} · ${pmIcons[e.paymentMethod] || 'Other'}</div>
                    </div>
                    <div class="tracker-expense-amount">₹${Number(e.amount).toFixed(0)}</div>
                </div>`;
            }
            html += `</div>`;
        }
        container.innerHTML = html;

        // Click handlers
        container.querySelectorAll('.tracker-expense-item').forEach((item) => {
            item.addEventListener('click', () => {
                _showExpenseDetail(expenses.find((e) => e.clientId === item.dataset.clientId));
            });
        });
    }

    // ---- Add Expense Form ----
    async function populateAddForm() {
        const categories = await Tracker.getCategories();
        const catGrid = document.getElementById('pe-category-grid');
        if (!catGrid) return;

        catGrid.innerHTML = categories.map((c) => `
            <button type="button" class="category-pill" data-cat="${escapeHtml(c.name)}" style="--cat-color: ${c.color}">
                <span class="cat-pill-icon">${c.icon}</span>
                <span class="cat-pill-name">${escapeHtml(c.name)}</span>
            </button>
        `).join('');

        // Select first by default
        const first = catGrid.querySelector('.category-pill');
        if (first) first.classList.add('selected');

        catGrid.querySelectorAll('.category-pill').forEach((pill) => {
            pill.addEventListener('click', () => {
                catGrid.querySelectorAll('.category-pill').forEach((p) => p.classList.remove('selected'));
                pill.classList.add('selected');
            });
        });

        // Set default date to now
        const dateInput = document.getElementById('pe-date');
        if (dateInput) {
            const now = new Date();
            const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
            dateInput.value = local.toISOString().slice(0, 16);
        }
    }

    // ---- Budget Screen ----
    async function renderBudgets() {
        const container = document.getElementById('tracker-budget-content');
        if (!container) return;

        container.innerHTML = '<div class="tracker-loading"><div class="sync-spinner"></div> Loading budgets...</div>';

        const data = await Tracker.getBudgets();
        const categories = await Tracker.getCategories();

        let html = `<div class="budget-header-section">
            <h4>Budget Overview</h4>
            <button class="btn btn-primary btn-sm" id="btn-add-budget">+ Set Budget</button>
        </div>`;

        if (data.budgets.length === 0) {
            html += `<div class="tracker-empty">
                <div class="empty-icon">&mdash;</div>
                <p>No budgets set yet.<br>Set a monthly budget to track your spending goals!</p>
            </div>`;
        } else {
            html += data.budgets.map((b) => {
                const pct = b.percentage || 0;
                const colorClass = pct > 100 ? 'budget-over' : pct > 80 ? 'budget-warn' : pct > 60 ? 'budget-mid' : 'budget-ok';
                const catName = b.category || 'Overall';
                const catMeta = b.category ? Tracker.getCategoryMeta(b.category) : { icon: '&bull;', color: '#71717a' };
                return `<div class="budget-card ${colorClass}">
                    <div class="budget-card-header">
                        <div class="budget-card-cat">
                            <span class="budget-cat-icon">${catMeta.icon}</span>
                            <span>${escapeHtml(catName)}</span>
                        </div>
                        <button class="btn btn-ghost btn-xs btn-delete-budget" data-budget-id="${b._id || b.id}">×</button>
                    </div>
                    <div class="budget-amounts">
                        <span class="budget-spent">₹${(b.spent || 0).toFixed(0)}</span>
                        <span class="budget-sep">/</span>
                        <span class="budget-limit">₹${b.amount}</span>
                    </div>
                    <div class="budget-progress-bar">
                        <div class="budget-progress-fill ${colorClass}" style="width: ${Math.min(pct, 100)}%"></div>
                    </div>
                    <div class="budget-card-footer">${pct}% used${pct > 100 ? ' — Over budget!' : ''}</div>
                </div>`;
            }).join('');
        }

        // Spending by category
        if (Object.keys(data.spendingByCategory || {}).length > 0) {
            html += `<div class="budget-category-breakdown">
                <h4 class="tracker-section-title">Category Spending This Month</h4>
                ${Object.entries(data.spendingByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => {
                    const meta = Tracker.getCategoryMeta(cat);
                    return `<div class="budget-cat-row">
                        <div class="budget-cat-row-left">
                            <span style="color:${meta.color}">${meta.icon}</span>
                            <span>${escapeHtml(cat)}</span>
                        </div>
                        <span class="budget-cat-row-amount">₹${amount.toFixed(0)}</span>
                    </div>`;
                }).join('')}
            </div>`;
        }

        container.innerHTML = html;

        // Event listeners
        document.getElementById('btn-add-budget')?.addEventListener('click', () => {
            _populateBudgetForm(categories);
            UI.showModal('modal-set-budget');
        });

        container.querySelectorAll('.btn-delete-budget').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Remove this budget?')) return;
                try {
                    await Tracker.deleteBudget(btn.dataset.budgetId);
                    UI.showToast('Budget removed.', 'success');
                    renderBudgets();
                } catch (err) {
                    UI.showToast(err.message, 'error');
                }
            });
        });
    }

    function _populateBudgetForm(categories) {
        const catSelect = document.getElementById('budget-category');
        if (!catSelect) return;
        catSelect.innerHTML = `<option value="">Overall (All Categories)</option>` +
            categories.map((c) => `<option value="${escapeHtml(c.name)}">${c.icon} ${escapeHtml(c.name)}</option>`).join('');
    }

    return {
        renderDashboard,
        showAllExpenses,
        populateAddForm,
        renderBudgets,
    };
})();

window.TrackerUI = TrackerUI;
