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
                <div class="glass-card p-6 rounded-lg shadow-[0_8px_32px_rgba(15,143,111,0.08)] animate-pulse">
                    <div class="flex justify-between items-start mb-6">
                        <div class="space-y-3 w-3/4">
                            <div class="h-6 bg-surface-variant rounded w-full"></div>
                            <div class="h-4 bg-surface-variant rounded w-1/2"></div>
                        </div>
                    </div>
                    <div class="space-y-4">
                        <div class="space-y-2">
                            <div class="h-4 bg-surface-variant rounded w-1/4"></div>
                            <div class="h-5 bg-surface-variant rounded w-1/3"></div>
                        </div>
                        <div class="flex items-center justify-between pt-4 border-t border-white/20">
                            <div class="h-4 bg-surface-variant rounded w-1/4"></div>
                            <div class="h-6 bg-surface-variant rounded-full w-16"></div>
                        </div>
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
                <div class="empty-icon">&mdash;</div>
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
                const archiveStyle = g.isArchived ? 'opacity: 0.6; filter: grayscale(100%);' : '';
                const archiveBadge = g.isArchived ? '<span class="bg-surface-variant text-on-surface-variant px-3 py-1 rounded-full font-label-sm text-label-sm">Archived</span>' : '<span class="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label-sm text-label-sm">Active</span>';
                
                return `
        <div class="group-card glass-card p-6 rounded-lg shadow-[0_8px_32px_rgba(15,143,111,0.08)] hover:shadow-[0_12px_48px_rgba(15,143,111,0.12)] transition-all group cursor-pointer relative overflow-hidden" data-id="${g.id || g._id}" style="${archiveStyle}">
          <div class="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <span class="material-symbols-outlined text-6xl text-primary">group</span>
          </div>
          <div class="flex justify-between items-start mb-6">
            <div>
              <h3 class="font-headline-md text-headline-md text-primary mb-1">${escapeHtml(g.name)}</h3>
              <div class="flex items-center gap-2 text-on-surface-variant">
                <span class="material-symbols-outlined text-[18px]">group</span>
                <span class="font-label-sm text-label-sm">${(g.members || []).length} members</span>
              </div>
            </div>
            <span class="material-symbols-outlined text-primary group-hover:translate-x-1 transition-transform">chevron_right</span>
          </div>
          <div class="space-y-4">
            <div>
              <span class="text-on-surface-variant font-label-sm text-label-sm block mb-1">Invite Code</span>
              <span class="font-headline-md text-on-surface text-lg">${g.inviteCode || '—'}</span>
            </div>
            <div class="flex items-center justify-between pt-4 border-t border-white/20">
              <span class="font-label-sm text-label-sm text-on-surface-variant italic">${activity || 'No activity'}</span>
              ${archiveBadge}
            </div>
          </div>
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
            if (tx.type === 'PAYMENT' && tx.status !== 'CONFIRMED') continue;

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
            if (tx.type === 'PAYMENT' && tx.status !== 'CONFIRMED') continue;

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

        container.className = 'glass-card rounded-xl p-6 animate-fade-in relative overflow-hidden';

        let html = `<div class="absolute top-0 right-0 p-4 opacity-10">
            <span class="material-symbols-outlined text-6xl text-primary">account_balance</span>
        </div>
        <div class="flex justify-between items-center mb-6 relative z-10">
            <h2 class="font-headline-md text-on-surface">Balances</h2>
            <span class="bg-primary-fixed text-on-primary-fixed px-4 py-1.5 rounded-full font-label-md">Total: ₹${totalSpending.toFixed(2)}</span>
        </div>
        <div class="space-y-4 relative z-10">`;

        if (!transactions.length) {
            html += `<p class="text-on-surface-variant font-label-md text-center py-4">No transactions yet.</p></div>`;
            container.innerHTML = html;
            return;
        }

        Object.entries(net).forEach(([id, amount]) => {
            const name = _getMemberName(members, id, myId);
            const isPositive = amount >= -0.01;
            const amtStr = `₹${Math.abs(amount).toFixed(2)}`;
            const colorCls = isPositive && amount > 0.01 ? 'text-primary' : (amount < -0.01 ? 'text-error' : 'text-on-surface');
            const sign = isPositive && amount > 0.01 ? '+' : (amount < -0.01 ? '-' : '');
            const initial = name.charAt(0).toUpperCase();

            // Pseudo-random background based on char code
            const bgClass = ['bg-primary-container/20 text-primary', 'bg-tertiary-fixed-dim/20 text-tertiary', 'bg-surface-container-high text-on-surface-variant'][initial.charCodeAt(0) % 3];

            html += `<div class="flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full ${bgClass} flex items-center justify-center font-bold">${initial}</div>
                    <span class="font-label-md">${escapeHtml(name)}</span>
                </div>
                <span class="${colorCls} font-bold">${sign}${amtStr}</span>
            </div>`;
        });

        const myNet = net[myId] || 0;
        const myNetStr = `₹${Math.abs(myNet).toFixed(2)}`;
        const myNetSign = myNet > 0.01 ? '+' : (myNet < -0.01 ? '-' : '');
        const myNetColor = myNet > 0.01 ? 'text-primary' : (myNet < -0.01 ? 'text-error' : 'text-on-surface');

        html += `<div class="border-t border-outline-variant/20 pt-4 flex justify-between items-center mt-2">
            <span class="text-on-surface-variant font-label-md">Your Net Balance</span>
            <span class="${myNetColor} font-headline-md font-bold">${myNetSign}${myNetStr}</span>
        </div>
        </div>`;

        container.innerHTML = html;
    }

    function _renderSettlement(transactions, members, myId, group, debts, mode = _settlementMode, isAdmin = false) {
        const container = document.getElementById('settlement-section');
        const groupId = group.id || String(group._id);

        // Find existing pending requests related to me
        const myPendingPayments = transactions.filter(tx => tx.type === 'PAYMENT' && tx.status === 'PENDING' && String(tx.paidBy) === myId);
        const myPaidPayments = transactions.filter(tx => tx.type === 'PAYMENT' && tx.status === 'PAID' && String(tx.paidBy) === myId);
        const myRequestedPayments = transactions.filter(tx => tx.type === 'PAYMENT' && tx.status === 'PENDING' && tx.splits && String(tx.splits[0].userId) === myId);
        const paymentsToConfirm = transactions.filter(tx => tx.type === 'PAYMENT' && tx.status === 'PAID' && tx.splits && String(tx.splits[0].userId) === myId);

        // Filter debts involving current user
        const myDebts = debts.filter(d => d.from === myId); // I owe someone
        const owedToMe = debts.filter(d => d.to === myId);   // Someone owes me

        if (myDebts.length === 0 && owedToMe.length === 0 && myPendingPayments.length === 0 && myPaidPayments.length === 0 && myRequestedPayments.length === 0 && paymentsToConfirm.length === 0) {
            container.innerHTML = '';
            return;
        }

        const modeLabel = mode === 'normal' ? 'Normal Mode' : '⚡ Smart Mode';
        let html = `<div class="flex justify-between items-center mb-4">
            <h2 class="font-headline-md text-on-surface">Settlements</h2>
            <div class="flex items-center gap-2 bg-surface-container-high p-1 rounded-full px-4" ${!isAdmin ? 'title="Only the group admin can change settlement mode"' : ''}>
                <label class="flex items-center cursor-pointer gap-2 ${!isAdmin ? 'opacity-70' : ''}">
                    <input type="checkbox" data-settlement-mode class="hidden" ${mode === 'smart' ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''} />
                    <span class="text-label-sm font-bold text-primary whitespace-nowrap">${modeLabel}</span>
                </label>
            </div>
        </div>
        <div class="space-y-3">`;

        // Render My Pending Payments (I need to pay)
        html += myPendingPayments.map(tx => {
            const creditorId = tx.splits[0].userId;
            const creditorName = _getMemberName(members, creditorId, myId);
            const creditorMember = members.find(m => (m.id || String(m._id)) === creditorId);
            const toUpi = creditorMember ? creditorMember.upiId : '';
            const hasUpi = Boolean(toUpi);
            return `<div class="glass-card rounded-lg p-5 border-l-4 border-l-[#d97706] flex justify-between items-center gap-4">
                <div class="flex flex-col gap-1 min-w-0">
                    <p class="font-body-md text-on-surface truncate">
                        Requested by <span class="font-bold">${escapeHtml(creditorName)}</span>
                    </p>
                    <span class="text-headline-md font-extrabold text-on-surface">₹${Number(tx.amount).toFixed(2)}</span>
                    <p class="text-label-sm text-on-surface-variant truncate">UPI: ${hasUpi ? escapeHtml(toUpi) : 'Not set'}</p>
                </div>
                <div class="flex flex-col items-end gap-2 shrink-0">
                    <button class="btn-copy-upi emerald-gradient text-white px-5 py-2 rounded-full font-label-md shadow-md active:scale-95 duration-200 disabled:opacity-50 disabled:cursor-not-allowed shrink-0" data-upi="${escapeHtml(toUpi || '')}" ${hasUpi ? '' : 'disabled'}>
                        ${hasUpi ? 'Copy UPI' : 'UPI not set'}
                    </button>
                    <button class="btn-mark-paid-manual border-2 border-primary text-primary px-5 py-2 rounded-full font-label-md hover:bg-primary/5 active:scale-95 duration-200 shrink-0" data-client-id="${tx.clientId}" data-tx-id="${tx.serverId || ''}">Mark Paid</button>
                </div>
            </div>`;
        }).join('');

        html += myPaidPayments.map(tx => {
            const creditorName = _getMemberName(members, tx.splits[0].userId, myId);
            return `<div class="glass-card rounded-lg p-5 border-l-4 border-l-[#d97706] flex justify-between items-center gap-4">
                <div class="flex flex-col gap-1 min-w-0">
                    <p class="font-body-md text-on-surface truncate">Paid to <span class="font-bold">${escapeHtml(creditorName)}</span></p>
                    <span class="text-headline-md font-extrabold text-on-surface">&#8377;${Number(tx.amount).toFixed(2)}</span>
                </div>
                <span class="text-label-sm text-on-surface-variant text-right shrink-0">Await confirmation</span>
            </div>`;
        }).join('');

        // Payment request exists; creditor must wait until debtor marks it paid.
        html += myRequestedPayments.map(tx => {
            const debtorId = String(tx.paidBy);
            const debtorName = _getMemberName(members, debtorId, myId);
            return `<div class="glass-card rounded-lg p-5 border-l-4 border-l-primary flex justify-between items-center gap-4">
                <div class="flex flex-col gap-1 min-w-0">
                    <p class="font-body-md text-on-surface truncate">
                        Pending from <span class="font-bold">${escapeHtml(debtorName)}</span>
                    </p>
                    <span class="text-headline-md font-extrabold text-primary">₹${Number(tx.amount).toFixed(2)}</span>
                </div>
                <span class="text-label-sm text-on-surface-variant text-right shrink-0">Await payment</span>
            </div>`;
        }).join('');

        html += paymentsToConfirm.map(tx => {
            const debtorName = _getMemberName(members, tx.paidBy, myId);
            return `<div class="glass-card rounded-lg p-5 border-l-4 border-l-primary flex justify-between items-center gap-4">
                <div class="flex flex-col gap-1 min-w-0">
                    <p class="font-body-md text-on-surface truncate">Paid by <span class="font-bold">${escapeHtml(debtorName)}</span></p>
                    <span class="text-headline-md font-extrabold text-primary">&#8377;${Number(tx.amount).toFixed(2)}</span>
                </div>
                <button class="btn-confirm-receipt bg-primary text-on-primary px-5 py-2 rounded-full font-label-md shadow-md active:scale-95 duration-200 shrink-0"
                    data-client-id="${tx.clientId}" data-tx-id="${tx.serverId || ''}">Confirm</button>
            </div>`;
        }).join('');

        // Render remaining debts (not yet requested/pending)
        if (myDebts.length > 0) {
            html += myDebts.map(d => {
                if (myPendingPayments.some(tx => String(tx.splits[0].userId) === d.to)
                    || myPaidPayments.some(tx => String(tx.splits[0].userId) === d.to)) return '';
                const toName = _getMemberName(members, d.to, myId);
                return `<div class="glass-card rounded-lg p-5 border-l-4 border-l-error flex justify-between items-center gap-4">
                    <div class="flex flex-col gap-1 min-w-0">
                        <p class="font-body-md text-on-surface truncate">
                            You owe <span class="font-bold">${escapeHtml(toName)}</span>
                        </p>
                        <span class="text-headline-md font-extrabold text-error">₹${d.amount.toFixed(2)}</span>
                    </div>
                    <span class="text-label-sm text-on-surface-variant text-right shrink-0">Await payment request</span>
                </div>`;
            }).join('');
        }

        if (owedToMe.length > 0) {
            html += owedToMe.map(d => {
                if (myRequestedPayments.some(tx => String(tx.paidBy) === d.from) || paymentsToConfirm.some(tx => String(tx.paidBy) === d.from)) return '';
                const fromName = _getMemberName(members, d.from, myId);
                return `<div class="glass-card rounded-lg p-5 border-l-4 border-l-primary flex justify-between items-center gap-4">
                    <div class="flex flex-col gap-1 min-w-0">
                        <p class="font-body-md text-on-surface truncate">
                            Owes you <span class="font-bold">${escapeHtml(fromName)}</span>
                        </p>
                        <span class="text-headline-md font-extrabold text-primary">₹${d.amount.toFixed(2)}</span>
                    </div>
                    <button class="btn-request-payment bg-surface-variant text-on-surface px-4 py-2 rounded-full font-label-md hover:bg-surface-dim transition-colors shrink-0"
                        data-group="${groupId}" data-from="${d.from}" data-amt="${d.amount.toFixed(2)}">Request</button>
                </div>`;
            }).join('');
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    function _renderExpenses(transactions, members, session, group) {
        const list = document.getElementById('expense-list');
        if (!transactions.length) {
            list.innerHTML = `<div class="empty-state text-center py-8 text-on-surface-variant">No expenses yet.</div>`;
            return;
        }

        const myId = session.user.id;
        const isAdmin = String(group.adminId) === myId;

        list.innerHTML = transactions
            .map((tx) => {
                const payerName = _getMemberName(members, tx.paidBy, myId);
                const isPayment = tx.type === 'PAYMENT';
                const emoji = isPayment ? '💸' : '🧾';
                const txId = tx.serverId || tx.clientId;
                const date = tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : 'Today';

                return `
        <div class="glass-card rounded-lg p-5 flex items-center gap-4 cursor-pointer hover:bg-white/10 transition-colors clickable" data-tx-id="${txId}" data-client-id="${tx.clientId}">
          <div class="w-14 h-14 bg-white/40 rounded-2xl flex items-center justify-center text-2xl shadow-inner shrink-0">${emoji}</div>
          <div class="flex-1 min-w-0">
            <div class="flex justify-between items-start gap-2">
              <h3 class="font-label-md text-on-surface truncate">${escapeHtml(tx.description)}</h3>
              <span class="font-bold text-on-surface whitespace-nowrap">₹${Number(tx.amount).toFixed(2)}</span>
            </div>
            <div class="flex justify-between items-end mt-1">
              <p class="text-label-sm text-on-surface-variant truncate">
                Paid by <span class="text-primary font-bold">${escapeHtml(payerName)}</span>
              </p>
              <span class="text-label-sm text-outline shrink-0">${date}</span>
            </div>
            ${tx.syncStatus === 'PENDING' ? '<div class="text-label-sm text-[#d97706] mt-1">⏳ PENDING SYNC</div>' : ''}
          </div>
        </div>`;
            })
            .join('');

        // Add click listeners for expense detail
        list.querySelectorAll('.clickable').forEach(card => {
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
        badge.className = `px-3 py-1 rounded-full text-label-sm font-bold uppercase tracking-wider ${isPayment ? 'bg-secondary-container/20 text-secondary' : 'bg-primary-container/20 text-primary'}`;

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
            : 'Today';
        document.getElementById('detail-date').textContent = dateStr;

        // Sync status
        const syncStatus = tx.syncStatus || 'SYNCED';
        const syncEl = document.getElementById('detail-sync-status');
        const colorClass = syncStatus === 'SYNCED' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error';
        syncEl.innerHTML = `<span class="px-2 py-0.5 rounded font-label-sm ${colorClass}">${syncStatus}</span>`;

        // Split breakdown
        const splitsList = document.getElementById('detail-splits-list');
        splitsList.innerHTML = (tx.splits || []).map(s => {
            const name = _getMemberName(members, s.userId, myId);
            return `<div class="flex justify-between items-center py-2 border-b border-outline-variant/5 last:border-0">
                <span class="font-body-md text-on-surface-variant">${escapeHtml(name)}</span>
                <span class="font-bold text-on-surface">₹${Number(s.amount).toFixed(2)}</span>
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
            <div class="glass-card rounded-xl p-6 space-y-6">
                <div class="flex justify-between items-center">
                    <h4 class="font-headline-md text-on-surface">Analytics</h4>
                    <span class="material-symbols-outlined text-primary">analytics</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div class="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10">
                        <span class="block text-label-sm text-outline mb-1">Group Spent</span>
                        <span class="text-xl font-bold text-on-surface">₹${totalSpending.toFixed(2)}</span>
                    </div>
                    <div class="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10">
                        <span class="block text-label-sm text-outline mb-1">Your Share</span>
                        <span class="text-xl font-bold text-on-surface">₹${mySpent.toFixed(2)}</span>
                    </div>
                    <div class="bg-surface-container-low p-4 rounded-xl border border-outline-variant/10">
                        <span class="block text-label-sm text-outline mb-1">You Paid</span>
                        <span class="text-xl font-bold text-on-surface">₹${myPaid.toFixed(2)}</span>
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
            <div class="bg-error/5 border border-error/20 rounded-xl p-5 flex gap-4 animate-pulse">
                <span class="material-symbols-outlined text-error text-3xl">warning</span>
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <h4 class="font-label-md text-error font-bold">Sync Issues</h4>
                        <span class="bg-error text-white text-[10px] px-2 py-0.5 rounded-full">${issues.length} items</span>
                    </div>
                    <p class="text-label-sm text-on-surface-variant">Some transactions are pending sync or failed. We'll retry automatically when you're back online.</p>
                </div>
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
                const initial = name.charAt(0).toUpperCase();
                const isChecked = id === session.user.id ? 'checked' : '';
                return `
                <label class="flex items-center justify-between p-3 rounded-lg bg-surface-container-high border border-outline-variant/20 cursor-pointer member-check-label hover:bg-surface-container-highest transition-colors">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-primary-container/20 flex items-center justify-center font-bold text-primary">${initial}</div>
                    <span class="font-body-md text-on-surface">${escapeHtml(name)}</span>
                  </div>
                  <input type="checkbox" value="${id}" class="accent-primary w-5 h-5" ${isChecked} />
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
            const initial = name.charAt(0).toUpperCase();
            return `
            <div class="flex items-center justify-between p-3 rounded-lg bg-surface-container-high border border-outline-variant/20">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-primary-container/20 flex items-center justify-center font-bold text-primary">${initial}</div>
                    <span class="font-body-md text-on-surface">${escapeHtml(name)}</span>
                </div>
                <div class="relative w-24">
                    <input type="number" class="split-val w-full py-1.5 pl-2 pr-6 bg-white border border-outline-variant/30 rounded-md outline-none focus:ring-2 focus:ring-primary text-right font-label-md" data-user="${id}" placeholder="0" min="0" step="0.01" />
                    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-label-sm text-outline-variant pointer-events-none">${suffix}</span>
                </div>
            </div>`;
        }).join('');
    }

    function renderSplitPreview(splits, members, totalAmount = 0) {
        const preview = document.getElementById('exp-split-preview');
        if (!splits || splits.length === 0) {
            preview.innerHTML = totalAmount > 0
                ? `<div class="split-preview-title">Split Preview</div>
                   <div class="split-preview-row">
                     <span class="preview-name">Balance</span>
                     <span class="preview-amount">₹${Number(totalAmount).toFixed(2)} to allocate</span>
                   </div>`
                : '';
            return;
        }

        const allocated = splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
        const balance = +(Number(totalAmount) - allocated).toFixed(2);
        const balanceLabel = Math.abs(balance) <= 0.02
            ? 'Balanced'
            : balance > 0
                ? `₹${balance.toFixed(2)} left`
                : `Over by ₹${Math.abs(balance).toFixed(2)}`;

        let html = `<div class="split-preview-title">Split Preview</div>
            <div class="split-preview-row">
                <span class="preview-name">Balance</span>
                <span class="preview-amount">${balanceLabel}</span>
            </div>`;
        html += splits.map(s => {
            const name = _getMemberName(members, s.userId);
            return `<div class="flex justify-between items-center text-on-surface">
                <span>${escapeHtml(name)}</span>
                <span class="font-bold">₹${Number(s.amount).toFixed(2)}</span>
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
        const remaining = +(target - sum).toFixed(2);
        const isValid = Math.abs(remaining) <= 0.02;
        const statusText = remaining > 0.02
            ? `Left to allocate: ${remaining.toFixed(2)}${suffix}`
            : remaining < -0.02
                ? `Over by: ${Math.abs(remaining).toFixed(2)}${suffix}`
                : 'Fully allocated';

        const totalEl = container;
        totalEl.className = `split-total ${isValid ? 'valid' : 'invalid'}`;
        totalEl.innerHTML = `<span>${statusText}</span>
            <span>${isValid ? 'Ready to save' : (remaining > 0.02 ? 'Keep filling' : 'Reduce values')}</span>`;
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
