// ui.js - UI rendering helpers (uses window.db, window.Sync)

const UI = (() => {

    // ---- Toast Notifications ----
    function showToast(message, type = 'info', duration = 3500) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${escapeHtml(message)}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // ---- Button Ripple Effect ----
    function addRipple(e, btn) {
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    // Attach ripple to all buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn, .btn-primary, .btn-secondary');
        if (btn) addRipple(e, btn);
    });

    // ---- Balance cache ----
    let _balanceCache = {};  // { "groupId:mode": { net, debts, timestamp } }
    const CACHE_TTL = 30000; // 30 seconds
    let _settlementMode = 'smart'; // Default; overridden per-group from group.settlementMode

    function _getCachedDebts(groupId, transactions, members, mode = _settlementMode) {
        const cacheKey = `${groupId}:${mode}`;
        const cached = _balanceCache[cacheKey];
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            return cached;
        }
        const result = _computeDebts(transactions, members, mode);
        _balanceCache[cacheKey] = { ...result, timestamp: Date.now() };
        return result;
    }

    function invalidateBalanceCache(groupId) {
        if (groupId) {
            Object.keys(_balanceCache).forEach((key) => {
                if (key.startsWith(`${groupId}:`)) {
                    delete _balanceCache[key];
                }
            });
        } else {
            _balanceCache = {};
        }
    }

    function getSettlementMode() {
        return _settlementMode;
    }

    function setSettlementMode(mode) {
        _settlementMode = mode === 'normal' ? 'normal' : 'smart';
        invalidateBalanceCache();
        return _settlementMode;
    }

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

    // ---- Skeleton Loaders ----
    function renderGroupSkeletons(containerId = 'groups-list', count = 3) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `
                <div class="skeleton-card">
                    <div class="skeleton skeleton-avatar"></div>
                    <div class="skeleton-card-content">
                        <div class="skeleton skeleton-text"></div>
                        <div class="skeleton skeleton-text short"></div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    function renderExpenseSkeletons(containerId = 'expense-list', count = 4) {
        const container = document.getElementById(containerId);
        if (!container) return;

        let html = '';
        for (let i = 0; i < count; i++) {
            html += `
                <div class="expense-item" style="pointer-events: none;">
                    <div class="expense-icon skeleton" style="border-radius: 50%; opacity: 0.5;"></div>
                    <div class="expense-details">
                        <div class="skeleton skeleton-text" style="margin-bottom: 4px;"></div>
                        <div class="skeleton skeleton-text short"></div>
                    </div>
                    <div class="expense-right" style="display:flex; justify-content:flex-end;">
                        <div class="skeleton skeleton-text" style="width: 40px; margin:0;"></div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    function renderGroups(groups, onGroupClick) {
        const list = document.getElementById('groups-list');
        if (!groups || groups.length === 0) {
            list.innerHTML = `<div class="empty-state">
                <div class="empty-icon">🌟</div>
                <p>Your journey starts here!<br>Create or join a group to begin splitting expenses.</p>
            </div>`;
            return;
        }

        // Sort groups: active first, archived last, then by activity
        const sortedGroups = [...groups].sort((a, b) => {
            if (a.isArchived && !b.isArchived) return 1;
            if (!a.isArchived && b.isArchived) return -1;
            const aDate = new Date(a.lastActivityAt || 0).getTime();
            const bDate = new Date(b.lastActivityAt || 0).getTime();
            return bDate - aDate;
        });

        list.innerHTML = sortedGroups
            .map((g) => {
                const activity = g.lastActivityAt ? _timeAgo(new Date(g.lastActivityAt)) : '';
                const archiveStyle = g.isArchived ? 'opacity: 0.6; background-color: #f9f9f9;' : '';
                const archiveBadge = g.isArchived ? '<span class="badge" style="background:#ddd; color:#555; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; margin-left: 8px;">Archived</span>' : '';
                return `
        <div class="group-card" data-id="${g.id || g._id}" style="${archiveStyle}">
          <div>
            <div class="group-card-name">${escapeHtml(g.name)}${archiveBadge}</div>
            <div class="group-card-meta">${(g.members || []).length} member(s) · Code: <strong>${g.inviteCode || '—'}</strong></div>
            ${activity ? `<div class="group-card-activity">${activity}</div>` : ''}
          </div>
          <span class="group-card-arrow">›</span>
        </div>`;
            })
            .join('');

        list.querySelectorAll('.group-card').forEach((card) => {
            card.addEventListener('click', () => onGroupClick(card.dataset.id));
        });
    }

    function _timeAgo(date) {
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    async function renderGroupDetail(group, session) {
        document.getElementById('group-title').textContent = group.name;
        document.getElementById('invite-code-display').innerHTML = `Code: ${group.inviteCode} ${group.isArchived ? '<span class="badge" style="background:#ddd; color:#555; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; margin-left:8px;">Archived</span>' : ''}`;

        // Disable add expense button if archived
        const btnAddExpense = document.getElementById('btn-add-expense');
        if (btnAddExpense) {
            btnAddExpense.style.display = group.isArchived ? 'none' : 'block';
        }

        // Show skeletons before fetching transactions
        renderExpenseSkeletons('expense-list', 5);

        const transactions = await Sync.getGroupTransactions(group.id || group._id);
        const members = group.members || [];
        const myId = session.user.id;
        const groupId = group.id || String(group._id);

        // Use group's settlement mode (API-driven, group-scoped)
        const settlementMode = group.settlementMode || 'smart';
        _settlementMode = settlementMode; // Keep internal cache in sync
        const { net, debts } = _getCachedDebts(groupId, transactions, members, settlementMode);

        const isAdmin = String(group.adminId) === myId;
        _renderBalances(transactions, members, net, debts, myId);
        _renderSettlement(transactions, members, myId, group, debts, settlementMode, isAdmin);
        _renderGroupOverview(transactions, members, myId);
        _renderGroupSyncIssues(transactions, group);
        _renderExpenses(transactions, members, session, group);
    }

    // ---- Pairwise balance computation ----
    function _computeDebtsSmart(transactions, members) {
        // Step 1: Compute each member's net balance
        const net = {};
        members.forEach((m) => {
            const id = String(m._id || m.id || m);
            net[id] = 0;
        });

        for (const tx of transactions) {
            if (tx.status === 'PENDING') continue; // Ignore pending payments

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

    function _computeDebtsNormal(transactions, members) {
        const net = {};
        const owes = {};

        members.forEach((m) => {
            const id = String(m._id || m.id || m);
            net[id] = 0;
        });

        const addDebt = (from, to, amount) => {
            if (!from || !to || amount <= 0.01) return;
            owes[from] = owes[from] || {};
            owes[from][to] = (owes[from][to] || 0) + amount;
        };

        for (const tx of transactions) {
            if (tx.status === 'PENDING') continue;

            const payerId = String(tx.paidBy);
            const amount = Number(tx.amount) || 0;
            if (net[payerId] !== undefined) net[payerId] += amount;

            if ((tx.type || 'EXPENSE') === 'PAYMENT') {
                const creditorId = tx.splits && tx.splits.length > 0
                    ? String(tx.splits[0].userId)
                    : (tx.receiverId ? String(tx.receiverId) : null);
                if (creditorId && creditorId !== payerId) {
                    addDebt(payerId, creditorId, amount);
                    if (net[creditorId] !== undefined) net[creditorId] -= amount;
                }
                continue;
            }

            for (const split of (tx.splits || [])) {
                const uid = String(split.userId);
                const owed = Number(split.amount) || 0;
                if (net[uid] !== undefined) net[uid] -= owed;
                if (uid !== payerId) {
                    addDebt(uid, payerId, owed);
                }
            }
        }

        const allIds = members.map((m) => String(m._id || m.id || m));
        const debts = [];
        for (let i = 0; i < allIds.length; i += 1) {
            for (let j = i + 1; j < allIds.length; j += 1) {
                const a = allIds[i];
                const b = allIds[j];
                const aToB = (owes[a] && owes[a][b]) || 0;
                const bToA = (owes[b] && owes[b][a]) || 0;
                const netDebt = +(aToB - bToA).toFixed(2);
                if (netDebt > 0.01) {
                    debts.push({ from: a, to: b, amount: netDebt });
                } else if (netDebt < -0.01) {
                    debts.push({ from: b, to: a, amount: +Math.abs(netDebt).toFixed(2) });
                }
            }
        }

        debts.sort((left, right) => right.amount - left.amount);
        return { net, debts };
    }

    function _computeDebts(transactions, members, mode = _settlementMode) {
        return mode === 'normal'
            ? _computeDebtsNormal(transactions, members)
            : _computeDebtsSmart(transactions, members);
    }

    function _getMemberName(members, id, currentUserId = null, selfLabel = 'You') {
        if (currentUserId && String(id) === String(currentUserId)) return selfLabel;
        const m = members.find((m) => String(m._id || m.id || m) === String(id));
        return m ? (m.name || 'Member') : 'Someone';
    }

    function _renderBalances(transactions, members, net, debts, myId) {
        const container = document.getElementById('balance-summary');

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
                const fromName = _getMemberName(members, d.from, myId);
                const toName = _getMemberName(members, d.to, myId);
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
                const name = _getMemberName(members, id, myId);
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

    function _renderSettlement(transactions, members, myId, group, debts, mode = _settlementMode, isAdmin = false) {
        const container = document.getElementById('settlement-section');
        const groupId = group.id || String(group._id);

        // Find existing pending requests related to me
        const myPendingPayments = transactions.filter(tx => tx.type === 'PAYMENT' && tx.status === 'PENDING' && String(tx.paidBy) === myId);
        const othersPendingRequestsToMe = transactions.filter(tx => tx.type === 'PAYMENT' && tx.status === 'PENDING' && tx.splits && String(tx.splits[0].userId) === myId);

        // Filter debts involving current user
        const myDebts = debts.filter(d => d.from === myId); // I owe someone
        const owedToMe = debts.filter(d => d.to === myId);   // Someone owes me

        if (myDebts.length === 0 && owedToMe.length === 0 && myPendingPayments.length === 0 && othersPendingRequestsToMe.length === 0) {
            container.innerHTML = '';
            return;
        }

        const modeLabel = mode === 'normal' ? 'Normal' : 'Smart';
        let html = `<div class="settlement-header">
            <h4>🤝 Settlements</h4>
            <label class="settlement-toggle"${!isAdmin ? ' title="Only the group admin can change settlement mode"' : ''}>
                <input type="checkbox" data-settlement-mode ${mode === 'smart' ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''} />
                <span>Smart${!isAdmin ? ' (Admin only)' : ''}</span>
            </label>
        </div>`;

        // Render My Pending Payments (I need to pay)
        html += myPendingPayments.map(tx => {
            const creditorId = tx.splits[0].userId;
            const creditorName = _getMemberName(members, creditorId, myId);
            const creditorMember = members.find(m => (m.id || String(m._id)) === creditorId);
            const toUpi = creditorMember ? creditorMember.upiId : '';
            return `<div class="settle-card settle-owe">
                <div class="settle-info">
                    <span class="settle-label" style="color:#d97706">Payment Requested By</span>
                    <span class="settle-target">${escapeHtml(creditorName)}</span>
                </div>
                <div class="settle-right">
                    <span class="settle-amt">₹${Number(tx.amount).toFixed(2)}</span>
                    <button class="btn btn-primary btn-xs btn-pay-now"
                        data-tx-id="${tx.serverId || ''}"
                        data-client-id="${tx.clientId}"
                        data-group="${groupId}"
                        data-to="${creditorId}" data-to-name="${escapeHtml(creditorName)}"
                        data-amt="${Number(tx.amount).toFixed(2)}"
                        data-upi="${escapeHtml(toUpi || '')}"
                        data-settlement-mode="${modeLabel}">
                        Pay Now
                    </button>
                    <button class="btn btn-ghost btn-xs btn-mark-paid-manual" data-client-id="${tx.clientId}" data-tx-id="${tx.serverId || ''}">Mark Paid</button>
                </div>
            </div>`;
        }).join('');

        // Render Others Pending Requests To Me (I requested payment, waiting for confirmation)
        html += othersPendingRequestsToMe.map(tx => {
            const debtorId = String(tx.paidBy);
            const debtorName = _getMemberName(members, debtorId, myId);
            return `<div class="settle-card settle-owed">
                <div class="settle-info">
                    <span class="settle-label" style="color:#d97706">Pending Payment From</span>
                    <span class="settle-target">${escapeHtml(debtorName)}</span>
                </div>
                <div class="settle-right">
                    <span class="settle-amt positive">₹${Number(tx.amount).toFixed(2)}</span>
                    <button class="btn btn-primary btn-xs btn-confirm-receipt" data-client-id="${tx.clientId}" data-tx-id="${tx.serverId || ''}">Confirm Receipt</button>
                </div>
            </div>`;
        }).join('');

        // Render remaining debts (not yet requested/pending)
        if (myDebts.length > 0) {
            html += myDebts.map(d => {
                // Ignore if we already have a pending payment for this debt
                if (myPendingPayments.some(tx => String(tx.splits[0].userId) === d.to)) return '';
                const toName = _getMemberName(members, d.to, myId);
                const toMember = members.find(m => (m.id || String(m._id)) === d.to);
                const toUpi = toMember ? toMember.upiId : '';
                return `<div class="settle-card settle-owe">
                    <div class="settle-info">
                        <span class="settle-label">You owe</span>
                        <span class="settle-target">${escapeHtml(toName)}</span>
                    </div>
                    <div class="settle-right">
                        <span class="settle-amt">₹${d.amount.toFixed(2)}</span>
                        <button class="btn btn-primary btn-xs btn-pay-now"
                            data-group="${groupId}"
                            data-to="${d.to}" data-to-name="${escapeHtml(toName)}"
                            data-amt="${d.amount.toFixed(2)}"
                            data-upi="${escapeHtml(toUpi || '')}"
                            data-settlement-mode="${modeLabel}">
                            Pay Now
                        </button>
                    </div>
                </div>`;
            }).join('');
        }

        if (owedToMe.length > 0) {
            html += owedToMe.map(d => {
                // Ignore if we already requested a payment for this debt
                if (othersPendingRequestsToMe.some(tx => String(tx.paidBy) === d.from)) return '';
                const fromName = _getMemberName(members, d.from, myId);
                return `<div class="settle-card settle-owed">
                    <div class="settle-info">
                        <span class="settle-label">Owed by</span>
                        <span class="settle-target">${escapeHtml(fromName)}</span>
                    </div>
                    <div class="settle-right">
                        <span class="settle-amt positive">₹${d.amount.toFixed(2)}</span>
                        <button class="btn btn-secondary btn-xs btn-request-payment"
                            data-group="${groupId}"
                            data-from="${d.from}"
                            data-amt="${d.amount.toFixed(2)}">
                            Request Payment
                        </button>
                    </div>
                </div>`;
            }).join('');
        }

        container.innerHTML = html;
    }

    function _renderExpenses(transactions, members, session, group) {
        const list = document.getElementById('expense-list');
        if (!transactions.length) {
            list.innerHTML = `<div class="empty-state">
                <div class="empty-icon">🧾</div>
                <p>No expenses yet — add your first one!</p>
            </div>`;
            return;
        }

        const myId = session.user.id;
        const isAdmin = String(group.adminId) === myId;

        list.innerHTML = transactions
            .map((tx) => {
                const payerName = _getMemberName(members, tx.paidBy, myId);
                const icon = (tx.type === 'PAYMENT') ? '💸' : '💰';
                const typeLabel = (tx.type === 'PAYMENT') ? 'Settlement' : 'Expense';
                const amtClass = (tx.type === 'PAYMENT') ? 'settlement' : '';
                const txId = tx.serverId || tx.clientId;
                const date = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '';

                return `
        <div class="expense-card clickable ${amtClass}" data-tx-id="${txId}" data-client-id="${tx.clientId}">
          <div class="expense-icon">${icon}</div>
          <div class="expense-info">
            <div class="expense-desc">${escapeHtml(tx.description)}</div>
            <div class="expense-meta">Paid by ${escapeHtml(payerName)} · split ${(tx.splits || []).length} ways · ${typeLabel}${date ? ' · ' + date : ''}</div>
            ${tx.syncStatus === 'PENDING' ? '<span class="expense-unsynced">⏳ PENDING SYNC</span>' : ''}
          </div>
          <div class="expense-amount">${(tx.type === 'PAYMENT') ? '-' : ''}₹${Number(tx.amount).toFixed(2)}</div>
        </div>`;
            })
            .join('');

        // Add click listeners for expense detail
        list.querySelectorAll('.expense-card.clickable').forEach(card => {
            card.addEventListener('click', () => {
                const clientId = card.dataset.clientId;
                const tx = transactions.find(t => t.clientId === clientId);
                if (tx) {
                    _showExpenseDetail(tx, members, isAdmin, myId);
                }
            });
        });
    }

    function _showExpenseDetail(tx, members, isAdmin, myId) {
        const type = tx.type || 'EXPENSE';
        const isPayment = type === 'PAYMENT';
        const isCreator = String(tx.paidBy) === myId;

        // Header
        document.getElementById('detail-title').textContent = isPayment ? 'Settlement Details' : 'Expense Details';
        const badge = document.getElementById('detail-type-badge');
        badge.textContent = isPayment ? 'Payment' : 'Expense';
        badge.className = `type-badge ${isPayment ? 'payment' : 'expense'}`;

        // Body
        document.getElementById('detail-amount').textContent = `₹${Number(tx.amount).toFixed(2)}`;
        document.getElementById('detail-desc').textContent = tx.description;
        document.getElementById('detail-payer').textContent = _getMemberName(members, tx.paidBy, myId);
        document.getElementById('detail-split-type').textContent = tx.splitType || 'Equal';

        const dateStr = tx.createdAt
            ? new Date(tx.createdAt).toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            })
            : '—';
        document.getElementById('detail-date').textContent = dateStr;

        // Sync status
        const syncStatus = tx.syncStatus || 'SYNCED';
        const syncEl = document.getElementById('detail-sync-status');
        syncEl.innerHTML = `<span class="detail-sync-badge ${syncStatus === 'SYNCED' ? 'synced' : 'pending'}">${syncStatus}</span>`;

        // Split breakdown
        const splitsList = document.getElementById('detail-splits-list');
        splitsList.innerHTML = (tx.splits || []).map(s => {
            const name = _getMemberName(members, s.userId, myId);
            return `<div class="detail-split-row">
                <span class="detail-split-name">${escapeHtml(name)}</span>
                <span class="detail-split-amount">₹${Number(s.amount).toFixed(2)}</span>
            </div>`;
        }).join('');

        // Delete button
        const deleteBtn = document.getElementById('btn-delete-expense');
        if (isAdmin || isCreator) {
            deleteBtn.classList.remove('hidden');
            deleteBtn.dataset.clientId = tx.clientId;
            deleteBtn.dataset.txId = tx.serverId || '';
        } else {
            deleteBtn.classList.add('hidden');
        }

        showModal('modal-expense-detail');
    }

    function _renderGroupOverview(transactions, members, myId) {
        const container = document.getElementById('group-overview');
        if (!container) return;

        const expenses = transactions.filter(tx => (tx.type || 'EXPENSE') === 'EXPENSE' && tx.status !== 'PENDING');
        const totalSpending = expenses.reduce((sum, tx) => sum + Number(tx.amount), 0);

        let mySpent = 0;
        let myPaid = 0;

        for (const tx of expenses) {
            if (String(tx.paidBy) === String(myId)) {
                myPaid += Number(tx.amount);
            }
            const mySplit = (tx.splits || []).find(s => String(s.userId) === String(myId));
            if (mySplit) {
                mySpent += Number(mySplit.amount);
            }
        }

        container.innerHTML = `
            <div class="group-overview-panel">
                <div class="group-overview-header">
                    <h4>📊 Analytics</h4>
                </div>
                <div class="group-overview-grid">
                    <div class="group-overview-card">
                        <div class="group-overview-label">Group Spent</div>
                        <div class="group-overview-value">₹${totalSpending.toFixed(2)}</div>
                    </div>
                    <div class="group-overview-card">
                        <div class="group-overview-label">Your Share</div>
                        <div class="group-overview-value">₹${mySpent.toFixed(2)}</div>
                    </div>
                    <div class="group-overview-card">
                        <div class="group-overview-label">You Paid</div>
                        <div class="group-overview-value">₹${myPaid.toFixed(2)}</div>
                    </div>
                </div>
            </div>
        `;
    }

    function _renderGroupSyncIssues(transactions, group) {
        const container = document.getElementById('group-sync-issues');
        if (!container) return;

        const issues = transactions.filter(tx => tx.syncStatus === 'PENDING' || tx.syncStatus === 'FAILED');
        if (issues.length === 0) {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }

        container.classList.remove('hidden');
        container.innerHTML = `
            <div class="group-sync-panel">
                <div class="group-sync-header">
                    <h4>⚠️ Sync Issues</h4>
                    <span class="group-sync-badge">${issues.length} items</span>
                </div>
                <p class="group-sync-desc">These transactions are pending sync or failed to upload to the server. They will be retried automatically when you are online.</p>
            </div>
        `;
    }

    function populateExpenseForm(group, session) {
        const members = group.members || [];
        const payerSelect = document.getElementById('exp-payer');
        const checksContainer = document.getElementById('exp-members-checkboxes');

        payerSelect.innerHTML = members
            .map((m) => {
                const id = String(m._id || m.id || m);
                const name = id === session.user.id ? 'Me' : (m.name || 'Member');
                const selected = id === session.user.id ? 'selected' : '';
                return `<option value="${id}" ${selected}>${escapeHtml(name)}</option>`;
            })
            .join('');

        checksContainer.innerHTML = members
            .map((m) => {
                const id = String(m._id || m.id || m);
                const name = id === session.user.id ? 'Me' : (m.name || 'Member');
                return `<label class="member-check-label">
          <input type="checkbox" value="${id}" ${id === session.user.id ? 'checked' : ''} />
          ${escapeHtml(name)}
        </label>`;
            })
            .join('');

        // Populate custom split inputs
        _populateSplitInputs('exp-custom-inputs', members, '₹', session.user.id);
        _populateSplitInputs('exp-percentage-inputs', members, '%', session.user.id);

        // Reset split type to Equal
        document.querySelectorAll('.split-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.split-tab[data-split="EQUAL"]').classList.add('active');
        document.getElementById('exp-participants-section').classList.remove('hidden');
        document.getElementById('exp-custom-section').classList.add('hidden');
        document.getElementById('exp-percentage-section').classList.add('hidden');
        document.getElementById('exp-split-preview').innerHTML = '';
        document.getElementById('exp-custom-total').innerHTML = '';
        document.getElementById('exp-percentage-total').innerHTML = '';
    }

    function _populateSplitInputs(containerId, members, suffix, currentUserId = null) {
        const container = document.getElementById(containerId);
        container.innerHTML = members.map(m => {
            const id = String(m._id || m.id || m);
            const name = id === currentUserId ? 'Me' : (m.name || 'Member');
            return `<div class="split-input-row">
                <span class="split-name">${escapeHtml(name)}</span>
                <input type="number" class="split-val" data-user="${id}" placeholder="0" min="0" step="0.01" />
                <span class="split-suffix">${suffix}</span>
            </div>`;
        }).join('');
    }

    function renderSplitPreview(splits, members) {
        const preview = document.getElementById('exp-split-preview');
        if (!splits || splits.length === 0) {
            preview.innerHTML = '';
            return;
        }

        let html = `<div class="split-preview-title">Split Preview</div>`;
        html += splits.map(s => {
            const name = _getMemberName(members, s.userId);
            return `<div class="split-preview-row">
                <span class="preview-name">${escapeHtml(name)}</span>
                <span class="preview-amount">₹${Number(s.amount).toFixed(2)}</span>
            </div>`;
        }).join('');
        preview.innerHTML = html;
    }

    function updateSplitTotal(containerId, totalAmount, isPercentage) {
        const container = document.getElementById(containerId);
        const inputs = container.parentElement.querySelectorAll('.split-val');
        let sum = 0;
        inputs.forEach(inp => { sum += parseFloat(inp.value) || 0; });

        const target = isPercentage ? 100 : totalAmount;
        const suffix = isPercentage ? '%' : '';
        const isValid = Math.abs(sum - target) <= 0.02;

        const totalEl = container;
        totalEl.className = `split-total ${isValid ? 'valid' : 'invalid'}`;
        totalEl.innerHTML = `<span>Total: ${sum.toFixed(2)}${suffix}</span>
            <span>Target: ${target.toFixed(2)}${suffix}</span>`;
    }

    async function updateSyncIndicator(status = 'idle', data = {}) {
        const syncInd = document.getElementById('sync-indicator');
        const content = document.getElementById('sync-status-content');
        if (!syncInd || !content) return;

        let pendingCount = 0;
        let failedCount = 0;
        if (window.Sync) {
            pendingCount = await window.Sync.getPendingCount();
            failedCount = await window.Sync.getFailedCount();
        }

        const btnSync = document.getElementById('btn-manual-sync');
        
        // Hide if nothing to do and not currently syncing/showing success
        if (status === 'idle' && pendingCount === 0 && failedCount === 0) {
            syncInd.classList.add('hidden');
            return;
        }

        syncInd.classList.remove('hidden');
        let html = '';

        if (status === 'syncing') {
            html = `<div class="sync-status-main">
                        <span class="sync-spinner"></span> Syncing...
                    </div>
                    <div class="sync-status-sub">Please wait</div>`;
            btnSync.style.display = 'none';
        } else if (status === 'success') {
            html = `<div class="sync-status-main sync-success">
                        ✅ Sync Complete
                    </div>
                    <div class="sync-status-sub">${data.synced || 0} sent, ${data.pulled || 0} received</div>`;
            btnSync.style.display = 'none';
            // Auto hide success after 3 seconds if no new pending items
            setTimeout(() => updateSyncIndicator('idle'), 3000);
        } else if (status === 'error' || failedCount > 0) {
            html = `<div class="sync-status-main sync-error">
                        ⚠️ Sync Failed
                    </div>
                    <div class="sync-status-sub">${failedCount} item(s) failed. ${data.error ? escapeHtml(data.error) : 'Will retry.'}</div>`;
            btnSync.textContent = 'Retry';
            btnSync.style.display = 'block';
            // Need to update the click handler in app.js for retry
        } else {
            // Idle but has pending
            const lastSync = window.Sync ? window.Sync.getLastSyncTime() : null;
            let timeStr = 'Never';
            if (lastSync) {
                const diffMin = Math.round((Date.now() - new Date(lastSync).getTime()) / 60000);
                timeStr = diffMin === 0 ? 'Just now' : `${diffMin}m ago`;
            }
            html = `<div class="sync-status-main sync-count">
                        ⬆️ ${pendingCount} pending
                    </div>
                    <div class="sync-status-sub">Last synced: ${timeStr}</div>`;
            btnSync.textContent = 'Sync Now';
            btnSync.style.display = 'block';
        }

        content.innerHTML = html;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
        );
    }

    return {
        showScreen, showModal, hideModal, setNetworkBanner,
        renderGroups, renderGroupDetail, populateExpenseForm,
        updateSyncIndicator, escapeHtml, showToast,
        renderSplitPreview, updateSplitTotal, invalidateBalanceCache,
        renderGroupSkeletons, renderExpenseSkeletons,
        getSettlementMode, setSettlementMode
    };
})();

window.UI = UI;
