// ui.js - UI rendering helpers (uses window.db, window.Sync)

const UI = (() => {

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }

    function showModal(id) {
        document.getElementById(id).classList.remove('hidden');
    }

    function hideModal(id) {
        document.getElementById(id).classList.add('hidden');
    }

    function setNetworkBanner(online) {
        const banner = document.getElementById('network-banner');
        banner.classList.remove('hidden', 'online', 'offline');
        banner.textContent = online
            ? '✅ Back online — syncing…'
            : "⚠️ You're offline. Changes saved locally.";
        banner.classList.add(online ? 'online' : 'offline');
        if (online) setTimeout(() => banner.classList.add('hidden'), 3000);
    }

    function renderGroups(groups, onGroupClick) {
        const list = document.getElementById('groups-list');
        if (!groups || groups.length === 0) {
            list.innerHTML = `<div class="empty-state">
                <div class="empty-icon">📂</div>
                <p>No groups yet. Create or join one!</p>
            </div>`;
            return;
        }
        list.innerHTML = groups
            .map((g) => `
        <div class="group-card" data-id="${g.id || g._id}">
          <div>
            <div class="group-card-name">${escapeHtml(g.name)}</div>
            <div class="group-card-meta">${(g.members || []).length} member(s) · Code: <strong>${g.inviteCode || '—'}</strong></div>
          </div>
          <span class="group-card-arrow">›</span>
        </div>`)
            .join('');

        list.querySelectorAll('.group-card').forEach((card) => {
            card.addEventListener('click', () => onGroupClick(card.dataset.id));
        });
    }

    async function renderGroupDetail(group, session) {
        document.getElementById('group-title').textContent = group.name;
        document.getElementById('invite-code-display').textContent = `Code: ${group.inviteCode}`;

        const transactions = await Sync.getGroupTransactions(group.id || group._id);
        const members = group.members || [];
        const myId = session.user.id;

        _renderBalances(transactions, members);
        _renderSettlement(transactions, members, myId, group);
        _renderExpenses(transactions, members);
    }

    // ---- Pairwise balance computation ----
    function _computeDebts(transactions, members) {
        // Step 1: Compute each member's net balance
        const net = {};
        members.forEach((m) => {
            const id = String(m._id || m.id || m);
            net[id] = 0;
        });

        for (const tx of transactions) {
            const payerId = String(tx.paidBy);
            if (net[payerId] !== undefined) net[payerId] += Number(tx.amount);
            for (const split of (tx.splits || [])) {
                const uid = String(split.userId);
                if (net[uid] !== undefined) net[uid] -= Number(split.amount);
            }
        }

        // Step 2: Separate into creditors (positive) and debtors (negative)
        const creditors = [];
        const debtors = [];

        for (const [id, amount] of Object.entries(net)) {
            if (amount > 0.01) {
                creditors.push({ id, amount });
            } else if (amount < -0.01) {
                debtors.push({ id, amount: Math.abs(amount) });
            }
        }

        // Step 3: Simplify debts — greedily match debtors to creditors
        creditors.sort((a, b) => b.amount - a.amount);
        debtors.sort((a, b) => b.amount - a.amount);

        const debts = [];
        let ci = 0, di = 0;
        while (ci < creditors.length && di < debtors.length) {
            const settle = Math.min(creditors[ci].amount, debtors[di].amount);
            if (settle > 0.01) {
                debts.push({
                    from: debtors[di].id,
                    to: creditors[ci].id,
                    amount: +settle.toFixed(2),
                });
            }
            creditors[ci].amount -= settle;
            debtors[di].amount -= settle;
            if (creditors[ci].amount < 0.01) ci++;
            if (debtors[di].amount < 0.01) di++;
        }

        return { net, debts };
    }

    function _getMemberName(members, id) {
        const m = members.find((m) => String(m._id || m.id || m) === String(id));
        return m ? (m.name || 'Member') : 'Someone';
    }

    function _renderBalances(transactions, members) {
        const container = document.getElementById('balance-summary');
        const { net, debts } = _computeDebts(transactions, members);

        // Total group spending
        const totalSpending = transactions
            .filter(tx => (tx.type || 'EXPENSE') === 'EXPENSE')
            .reduce((sum, tx) => sum + Number(tx.amount), 0);

        let html = `<div class="balance-header">
            <h4>💰 Balances</h4>
            <div class="total-spending">Total: <strong>₹${totalSpending.toFixed(2)}</strong></div>
        </div>`;

        if (!transactions.length) {
            html += `<p class="balance-empty">No transactions yet.</p>`;
            container.innerHTML = html;
            return;
        }

        // Show "A owes B" format
        if (debts.length > 0) {
            html += debts.map(d => {
                const fromName = _getMemberName(members, d.from);
                const toName = _getMemberName(members, d.to);
                return `<div class="debt-row">
                    <span class="debt-text">${escapeHtml(fromName)} owes ${escapeHtml(toName)}</span>
                    <span class="debt-amount">₹${d.amount.toFixed(2)}</span>
                </div>`;
            }).join('');
        } else {
            html += `<div class="all-settled">
                <span class="settled-icon">✅</span>
                <span>All settled up!</span>
            </div>`;
        }

        // Show net per person
        html += `<div class="net-section"><h5>Net per person</h5>`;
        html += Object.entries(net)
            .map(([id, amount]) => {
                const name = _getMemberName(members, id);
                const cls = amount >= 0 ? 'positive' : 'negative';
                const sign = amount >= 0 ? '+' : '';
                return `<div class="balance-row">
                    <span class="balance-name">${escapeHtml(name)}</span>
                    <span class="balance-amount ${cls}">${sign}₹${Math.abs(amount).toFixed(2)}</span>
                </div>`;
            })
            .join('');
        html += `</div>`;

        container.innerHTML = html;
    }

    // ---- Settlement section ----
    function _renderSettlement(transactions, members, myId, group) {
        const container = document.getElementById('settlement-section');
        const { debts } = _computeDebts(transactions, members);
        const groupId = group.id || String(group._id);

        // Filter debts involving current user
        const myDebts = debts.filter(d => d.from === myId); // I owe someone
        const owedToMe = debts.filter(d => d.to === myId);   // Someone owes me

        if (myDebts.length === 0 && owedToMe.length === 0) {
            container.innerHTML = '';
            return;
        }

        let html = `<h4>🤝 Settlements</h4>`;

        if (myDebts.length > 0) {
            html += myDebts.map(d => {
                const toName = _getMemberName(members, d.to);
                return `<div class="settle-card settle-owe">
                    <div class="settle-info">
                        <span class="settle-label">You owe</span>
                        <span class="settle-target">${escapeHtml(toName)}</span>
                    </div>
                    <div class="settle-right">
                        <span class="settle-amt">₹${d.amount.toFixed(2)}</span>
                        <button class="btn btn-primary btn-xs btn-settle"
                            data-group="${groupId}"
                            data-to="${d.to}" data-to-name="${escapeHtml(toName)}"
                            data-amt="${d.amount.toFixed(2)}">
                            Mark Settled
                        </button>
                    </div>
                </div>`;
            }).join('');
        }

        if (owedToMe.length > 0) {
            html += owedToMe.map(d => {
                const fromName = _getMemberName(members, d.from);
                return `<div class="settle-card settle-owed">
                    <div class="settle-info">
                        <span class="settle-label">Owed by</span>
                        <span class="settle-target">${escapeHtml(fromName)}</span>
                    </div>
                    <span class="settle-amt positive">₹${d.amount.toFixed(2)}</span>
                </div>`;
            }).join('');
        }

        container.innerHTML = html;
    }

    function _renderExpenses(transactions, members) {
        const list = document.getElementById('expense-list');
        if (!transactions.length) {
            list.innerHTML = `<div class="empty-state">
                <div class="empty-icon">🧾</div>
                <p>No expenses yet. Add one!</p>
            </div>`;
            return;
        }

        list.innerHTML = transactions
            .map((tx) => {
                const payerName = _getMemberName(members, tx.paidBy);
                const icon = (tx.type === 'PAYMENT') ? '💸' : '💰';
                const typeLabel = (tx.type === 'PAYMENT') ? 'Settlement' : 'Expense';
                const amtClass = (tx.type === 'PAYMENT') ? 'settlement' : '';

                return `
        <div class="expense-card ${amtClass}">
          <div class="expense-icon">${icon}</div>
          <div class="expense-info">
            <div class="expense-desc">${escapeHtml(tx.description)}</div>
            <div class="expense-meta">Paid by ${escapeHtml(payerName)} · split ${(tx.splits || []).length} ways · ${typeLabel}</div>
            ${tx.syncStatus === 'PENDING' ? '<span class="expense-unsynced">⏳ PENDING SYNC</span>' : ''}
          </div>
          <div class="expense-amount">${(tx.type === 'PAYMENT') ? '-' : ''}₹${Number(tx.amount).toFixed(2)}</div>
        </div>`;
            })
            .join('');
    }

    function populateExpenseForm(group, session) {
        const members = group.members || [];
        const payerSelect = document.getElementById('exp-payer');
        const checksContainer = document.getElementById('exp-members-checkboxes');

        payerSelect.innerHTML = members
            .map((m) => {
                const id = String(m._id || m.id || m);
                const name = m.name || 'Member';
                const selected = id === session.user.id ? 'selected' : '';
                return `<option value="${id}" ${selected}>${escapeHtml(name)}</option>`;
            })
            .join('');

        checksContainer.innerHTML = members
            .map((m) => {
                const id = String(m._id || m.id || m);
                const name = m.name || 'Member';
                return `<label class="member-check-label">
          <input type="checkbox" value="${id}" ${id === session.user.id ? 'checked' : ''} />
          ${escapeHtml(name)}
        </label>`;
            })
            .join('');
    }

    async function updateSyncIndicator() {
        const count = await db.transactions.where('syncStatus').equals('PENDING').count();
        const synci = document.getElementById('sync-indicator');
        const badge = document.getElementById('sync-count');
        if (count > 0) {
            badge.textContent = `${count} pending`;
            synci.style.display = 'flex';
        } else {
            badge.textContent = '';
            synci.style.display = 'none';
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
        );
    }

    return {
        showScreen, showModal, hideModal, setNetworkBanner,
        renderGroups, renderGroupDetail, populateExpenseForm, updateSyncIndicator, escapeHtml,
    };
})();

window.UI = UI;
