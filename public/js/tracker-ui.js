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

        container.innerHTML = '<div class="tracker-loading"><div class="sync-spinner"></div> Loading...</div>';

        const [analytics, categories, comparison, insights, budgetData, conflicts] = await Promise.all([
            Tracker.getAnalytics('month'),
            Tracker.getCategories(),
            Tracker.getComparison(),
            Tracker.getInsights(),
            Tracker.getBudgets(),
            Tracker.getSyncConflicts(),
        ]);

        let html = '';

        const forecast = _buildForecast(analytics);

        // Summary Cards
        html += `<div class="tracker-summary-cards">
            <div class="tracker-card tracker-card-total">
                <div class="tracker-card-icon">💰</div>
                <div class="tracker-card-body">
                    <div class="tracker-card-label">This Month</div>
                    <div class="tracker-card-value">₹${analytics.totalSpent.toFixed(0)}</div>
                    <div class="tracker-card-sub">${analytics.count} expense${analytics.count !== 1 ? 's' : ''}</div>
                </div>
            </div>
            <div class="tracker-card tracker-card-week">
                <div class="tracker-card-icon">📅</div>
                <div class="tracker-card-body">
                    <div class="tracker-card-label">This Week</div>
                    <div class="tracker-card-value">₹${comparison.thisWeek.totalSpent.toFixed(0)}</div>
                    <div class="tracker-card-sub ${comparison.weekChange > 0 ? 'negative' : 'positive'}">
                        ${comparison.weekChange > 0 ? '↑' : '↓'} ${Math.abs(comparison.weekChange)}% vs last week
                    </div>
                </div>
            </div>
            <div class="tracker-card tracker-card-today">
                <div class="tracker-card-icon">🕐</div>
                <div class="tracker-card-body">
                    <div class="tracker-card-label">Today</div>
                    <div class="tracker-card-value">₹${(Object.values(analytics.byDay).length > 0 ? analytics.byDay[new Date().toISOString().slice(0, 10)] || 0 : 0).toFixed(0)}</div>
                    <div class="tracker-card-sub">${new Date().toLocaleDateString('en-IN', { weekday: 'long' })}</div>
                </div>
            </div>
        </div>`;

        // Budget Quick Glance
        if (budgetData.budgets.length > 0) {
            const overallBudget = budgetData.budgets.find((b) => !b.category);
            if (overallBudget) {
                const pct = overallBudget.percentage || 0;
                const colorClass = pct > 100 ? 'budget-over' : pct > 80 ? 'budget-warn' : pct > 60 ? 'budget-mid' : 'budget-ok';
                html += `<div class="tracker-budget-glance ${colorClass}">
                    <div class="budget-glance-header">
                        <span>Monthly Budget</span>
                        <span>₹${overallBudget.spent?.toFixed(0) || 0} / ₹${overallBudget.amount}</span>
                    </div>
                    <div class="budget-progress-bar">
                        <div class="budget-progress-fill ${colorClass}" style="width: ${Math.min(pct, 100)}%"></div>
                    </div>
                    <div class="budget-glance-footer">${pct > 100 ? `⚠️ Over budget by ₹${(overallBudget.spent - overallBudget.amount).toFixed(0)}` : `₹${(overallBudget.amount - (overallBudget.spent || 0)).toFixed(0)} remaining`}</div>
                </div>`;
            }
        }

        // Forecast
        html += `<div class="tracker-forecast">
            <div class="tracker-section-header">
                <h4 class="tracker-section-title">📅 Forecast</h4>
                <span class="tracker-forecast-pill">Local-first</span>
            </div>
            <div class="tracker-forecast-grid">
                <div class="tracker-forecast-card tracker-forecast-main">
                    <div class="tracker-forecast-label">Projected month-end spend</div>
                    <div class="tracker-forecast-value">₹${forecast.projectedTotal.toFixed(0)}</div>
                    <div class="tracker-forecast-sub">Based on ${forecast.elapsedDays} of ${forecast.daysInMonth} days</div>
                </div>
                <div class="tracker-forecast-card">
                    <div class="tracker-forecast-label">Projected remaining</div>
                    <div class="tracker-forecast-value ${forecast.delta >= 0 ? 'positive' : 'negative'}">${forecast.delta >= 0 ? '₹' + forecast.delta.toFixed(0) + ' over pace' : '₹' + Math.abs(forecast.delta).toFixed(0) + ' under pace'}</div>
                    <div class="tracker-forecast-sub">Compared with current month pace</div>
                </div>
            </div>
            <div class="tracker-forecast-cats">
                ${forecast.categories.length > 0 ? forecast.categories.map((entry) => {
                    const meta = Tracker.getCategoryMeta(entry.category);
                    return `<div class="tracker-forecast-row">
                        <div class="tracker-forecast-row-left">
                            <span class="tracker-forecast-dot" style="background:${meta.color}"></span>
                            <span>${escapeHtml(entry.category)}</span>
                        </div>
                        <div class="tracker-forecast-row-right">₹${entry.projected.toFixed(0)}</div>
                    </div>`;
                }).join('') : '<div class="tracker-forecast-empty">No spending data to forecast yet.</div>'}
            </div>
        </div>`;

        // Sync conflicts
        if (conflicts.length > 0) {
            html += `<div class="tracker-conflicts">
                <div class="tracker-section-header">
                    <h4 class="tracker-section-title">⚠️ Sync Conflicts</h4>
                    <span class="tracker-forecast-pill danger">Needs review</span>
                </div>
                ${conflicts.map((item) => {
                    const meta = Tracker.getCategoryMeta(item.category);
                    return `<div class="tracker-conflict-card" data-client-id="${item.clientId}">
                        <div class="tracker-conflict-head">
                            <div class="tracker-conflict-left">
                                <span class="tracker-expense-cat" style="background:${meta.color}20; color:${meta.color}; width:34px; height:34px;">${meta.icon}</span>
                                <div>
                                    <div class="tracker-conflict-title">${escapeHtml(item.description || item.category)}</div>
                                    <div class="tracker-conflict-meta">${escapeHtml(item.category)} · ₹${Number(item.amount || 0).toFixed(0)}</div>
                                </div>
                            </div>
                            <button class="btn btn-secondary btn-xs btn-resolve-conflict" data-client-id="${item.clientId}">Retry sync</button>
                        </div>
                        <div class="tracker-conflict-reason">${escapeHtml(item.reason)}</div>
                    </div>`;
                }).join('')}
            </div>`;
        }

        // Insights
        if (insights.length > 0) {
            html += `<div class="tracker-insights">
                <h4 class="tracker-section-title">💡 Insights</h4>
                ${insights.map((i) => `<div class="insight-card insight-${i.type}">
                    <span class="insight-icon">${i.icon}</span>
                    <span class="insight-text">${escapeHtml(i.text)}</span>
                </div>`).join('')}
            </div>`;
        }

        // Category Breakdown (Pie chart placeholder + legend)
        html += `<div class="tracker-chart-section">
            <h4 class="tracker-section-title">📊 Category Breakdown</h4>
            <div class="tracker-chart-container">
                <canvas id="tracker-pie-chart" width="240" height="240"></canvas>
                <div class="tracker-chart-legend" id="tracker-pie-legend"></div>
            </div>
        </div>`;

        // Spending Trend (Line chart)
        html += `<div class="tracker-chart-section">
            <h4 class="tracker-section-title">📈 Spending Trend</h4>
            <div class="tracker-period-tabs">
                <button class="period-tab ${_currentPeriod === '7days' ? 'active' : ''}" data-period="7days">7 Days</button>
                <button class="period-tab ${_currentPeriod === '30days' ? 'active' : ''}" data-period="30days">30 Days</button>
                <button class="period-tab ${_currentPeriod === 'month' ? 'active' : ''}" data-period="month">Month</button>
            </div>
            <div class="tracker-line-container">
                <canvas id="tracker-line-chart" width="400" height="200"></canvas>
            </div>
        </div>`;

        // Recent Expenses
        html += `<div class="tracker-recent">
            <div class="tracker-section-header">
                <h4 class="tracker-section-title">🧾 Recent Expenses</h4>
                <button class="btn btn-ghost btn-xs" id="btn-view-all-expenses">View All</button>
            </div>
            <div id="tracker-expense-list" class="tracker-expense-list"></div>
        </div>`;

        container.innerHTML = html;

        // Render charts
        _renderPieChart(analytics.byCategory, categories);
        _renderLineChart(analytics.byDay);
        _renderRecentExpenses(await Tracker.getExpenses(), categories);

        // Period tab listeners
        container.querySelectorAll('.period-tab').forEach((tab) => {
            tab.addEventListener('click', async () => {
                container.querySelectorAll('.period-tab').forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
                _currentPeriod = tab.dataset.period;
                const newAnalytics = await Tracker.getAnalytics(_currentPeriod);
                _renderLineChart(newAnalytics.byDay);
            });
        });

        // View all button
        document.getElementById('btn-view-all-expenses')?.addEventListener('click', () => {
            showAllExpenses();
        });

        container.querySelectorAll('.btn-resolve-conflict').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const original = btn.textContent;
                btn.disabled = true;
                btn.textContent = 'Retrying...';
                try {
                    await Tracker.retryExpenseSync(btn.dataset.clientId);
                    UI.showToast('Conflict retry queued.', 'success');
                    await renderDashboard();
                } catch (err) {
                    UI.showToast(err.message, 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = original;
                }
            });
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
            return `<div class="legend-item">
                <span class="legend-dot" style="background:${meta.color}"></span>
                <span class="legend-icon">${meta.icon}</span>
                <span class="legend-name">${escapeHtml(cat)}</span>
                <span class="legend-value">₹${val.toFixed(0)} <small>(${pct}%)</small></span>
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
            container.innerHTML = `<div class="tracker-empty">
                <div class="empty-icon">🧾</div>
                <p>No expenses yet — tap + to add your first!</p>
            </div>`;
            return;
        }

        container.innerHTML = recent.map((e) => {
            const meta = Tracker.getCategoryMeta(e.category);
            const dateStr = new Date(e.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
            const pmIcons = { cash: '💵', upi: '📱', card: '💳', other: '💸' };
            return `<div class="tracker-expense-item" data-client-id="${e.clientId}">
                <div class="tracker-expense-cat" style="background:${meta.color}20; color:${meta.color}">
                    ${meta.icon}
                </div>
                <div class="tracker-expense-info">
                    <div class="tracker-expense-desc">${escapeHtml(e.description || e.category)}</div>
                    <div class="tracker-expense-meta">${escapeHtml(e.category)} · ${dateStr} · ${pmIcons[e.paymentMethod] || '💸'}</div>
                </div>
                <div class="tracker-expense-amount">₹${Number(e.amount).toFixed(0)}</div>
                ${e.syncStatus === 'PENDING' ? '<span class="tracker-pending-badge">⏳</span>' : ''}
            </div>`;
        }).join('');

        // Click to delete
        container.querySelectorAll('.tracker-expense-item').forEach((item) => {
            item.addEventListener('click', () => {
                _showExpenseDetail(expenses.find((e) => e.clientId === item.dataset.clientId));
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

        modal.querySelector('.ped-icon').textContent = meta.icon;
        modal.querySelector('.ped-icon').style.background = `${meta.color}20`;
        modal.querySelector('.ped-icon').style.color = meta.color;
        modal.querySelector('.ped-category').textContent = expense.category;
        modal.querySelector('.ped-amount').textContent = `₹${Number(expense.amount).toFixed(2)}`;
        modal.querySelector('.ped-desc').textContent = expense.description || '—';
        modal.querySelector('.ped-date').textContent = dateStr;
        modal.querySelector('.ped-payment').textContent = pmLabels[expense.paymentMethod] || 'Cash';
        modal.querySelector('.ped-notes').textContent = expense.notes || '—';
        modal.querySelector('.ped-sync').textContent = expense.syncStatus || 'SYNCED';

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
                const pmIcons = { cash: '💵', upi: '📱', card: '💳', other: '💸' };
                html += `<div class="tracker-expense-item" data-client-id="${e.clientId}">
                    <div class="tracker-expense-cat" style="background:${meta.color}20; color:${meta.color}">${meta.icon}</div>
                    <div class="tracker-expense-info">
                        <div class="tracker-expense-desc">${escapeHtml(e.description || e.category)}</div>
                        <div class="tracker-expense-meta">${escapeHtml(e.category)} · ${pmIcons[e.paymentMethod] || '💸'}</div>
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
            <h4>📋 Budget Overview</h4>
            <button class="btn btn-primary btn-sm" id="btn-add-budget">+ Set Budget</button>
        </div>`;

        if (data.budgets.length === 0) {
            html += `<div class="tracker-empty">
                <div class="empty-icon">💰</div>
                <p>No budgets set yet.<br>Set a monthly budget to track your spending goals!</p>
            </div>`;
        } else {
            html += data.budgets.map((b) => {
                const pct = b.percentage || 0;
                const colorClass = pct > 100 ? 'budget-over' : pct > 80 ? 'budget-warn' : pct > 60 ? 'budget-mid' : 'budget-ok';
                const catName = b.category || 'Overall';
                const catMeta = b.category ? Tracker.getCategoryMeta(b.category) : { icon: '💰', color: '#6366f1' };
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
