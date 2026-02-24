// app.js - Main application (uses window.db, window.Auth, window.Sync, window.UI)

// ---- App State ----
let currentSession = null;
let currentGroup = null;
let groups = [];

// ---- Init ----
async function init() {
    currentSession = await Auth.getSession();
    if (currentSession) {
        await goToDashboard();
    } else {
        UI.showScreen('screen-auth');
    }
    registerServiceWorker();
    setupNetworkListeners();
}

async function goToDashboard() {
    UI.showScreen('screen-dashboard');
    document.getElementById('user-name-badge').textContent = currentSession.user.name;
    await loadGroups();
    await UI.updateSyncIndicator();
    if (navigator.onLine) doSync();
}

async function loadGroups() {
    groups = await Sync.syncGroups();
    if (!groups.length) groups = await db.groups.toArray();
    UI.renderGroups(groups, openGroup);
}

async function openGroup(groupId) {
    currentGroup = groups.find((g) => (g.id || String(g._id)) === groupId);
    if (!currentGroup) return;
    UI.showScreen('screen-group');
    await UI.renderGroupDetail(currentGroup, currentSession);
}

// ---- Sync ----
async function doSync() {
    if (!navigator.onLine || !currentSession) return;
    await Sync.syncWithServer();
    await loadGroups();
    await UI.updateSyncIndicator();
    if (currentGroup) await UI.renderGroupDetail(currentGroup, currentSession);
}

// ---- Network ----
function setupNetworkListeners() {
    window.addEventListener('online', () => { UI.setNetworkBanner(true); doSync(); });
    window.addEventListener('offline', () => UI.setNetworkBanner(false));
    if (!navigator.onLine) UI.setNetworkBanner(false);
    setInterval(doSync, 2 * 60 * 1000);
}

// ---- Service Worker ----
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => { });
    }
}

// ============ Event Listeners ============

// Auth Tabs
document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach((f) => f.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`form-${btn.dataset.tab}`).classList.add('active');
    });
});

// Login
document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('login-error');
    err.textContent = '';
    try {
        await Auth.login(
            document.getElementById('login-email').value.trim(),
            document.getElementById('login-password').value
        );
        currentSession = await Auth.getSession();
        await goToDashboard();
    } catch (ex) {
        err.textContent = ex.message;
    }
});

// Register
document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('register-error');
    err.textContent = '';
    try {
        await Auth.register(
            document.getElementById('reg-name').value.trim(),
            document.getElementById('reg-email').value.trim(),
            document.getElementById('reg-password').value
        );
        currentSession = await Auth.getSession();
        await goToDashboard();
    } catch (ex) {
        err.textContent = ex.message;
    }
});

// Logout
document.getElementById('btn-logout').addEventListener('click', async () => {
    await Auth.logout();
    currentSession = null; currentGroup = null; groups = [];
    UI.showScreen('screen-auth');
});

// Back
document.getElementById('btn-back').addEventListener('click', () => {
    currentGroup = null;
    UI.showScreen('screen-dashboard');
    UI.updateSyncIndicator();
});

// Create Group
document.getElementById('btn-create-group').addEventListener('click', () => {
    document.getElementById('create-group-name').value = '';
    UI.showModal('modal-create-group');
});
document.getElementById('btn-create-group-confirm').addEventListener('click', async () => {
    const name = document.getElementById('create-group-name').value.trim();
    if (!name) return;
    try {
        await Sync.createGroup(name);
        UI.hideModal('modal-create-group');
        await loadGroups();
    } catch (ex) { alert(ex.message); }
});

// Join Group
document.getElementById('btn-join-group').addEventListener('click', () => {
    document.getElementById('join-invite-code').value = '';
    UI.showModal('modal-join-group');
});
document.getElementById('btn-join-group-confirm').addEventListener('click', async () => {
    const code = document.getElementById('join-invite-code').value.trim().toUpperCase();
    if (!code) return;
    try {
        await Sync.joinGroup(code);
        UI.hideModal('modal-join-group');
        await loadGroups();
    } catch (ex) { alert(ex.message); }
});

// Add Expense
document.getElementById('btn-add-expense').addEventListener('click', () => {
    if (!currentGroup) return;
    document.getElementById('exp-desc').value = '';
    document.getElementById('exp-amount').value = '';
    UI.populateExpenseForm(currentGroup, currentSession);
    UI.showModal('modal-add-expense');
});
document.getElementById('btn-add-expense-confirm').addEventListener('click', async () => {
    const description = document.getElementById('exp-desc').value.trim();
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const paidBy = document.getElementById('exp-payer').value;
    if (!description || !amount || !paidBy) { alert('Please fill all fields.'); return; }

    const checkedBoxes = document.querySelectorAll('#exp-members-checkboxes input:checked');
    const selectedIds = Array.from(checkedBoxes).map((cb) => cb.value);
    if (!selectedIds.length) { alert('Select at least one member to split with.'); return; }

    const splitAmount = +(amount / selectedIds.length).toFixed(2);
    const splits = selectedIds.map((userId) => ({ userId, amount: splitAmount }));

    await Sync.addExpense({
        groupId: currentGroup.id || String(currentGroup._id),
        description, amount, paidBy, splits,
    });

    UI.hideModal('modal-add-expense');
    await UI.renderGroupDetail(currentGroup, currentSession);
    await UI.updateSyncIndicator();
    if (navigator.onLine) doSync();
});

// Manual Sync
document.getElementById('btn-manual-sync').addEventListener('click', doSync);

// Settlement — delegate clicks on settle buttons
let pendingSettle = null;
document.getElementById('settlement-section').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-settle');
    if (!btn) return;
    pendingSettle = {
        groupId: btn.dataset.group,
        toUserId: btn.dataset.to,
        toUserName: btn.dataset.toName,
        amount: parseFloat(btn.dataset.amt),
    };
    document.getElementById('settle-msg').textContent =
        `Pay ₹${pendingSettle.amount.toFixed(2)} to ${pendingSettle.toUserName}?`;
    UI.showModal('modal-settle');
});

document.getElementById('btn-settle-confirm').addEventListener('click', async () => {
    if (!pendingSettle || !currentSession) return;
    try {
        await Sync.settleDebt({
            groupId: pendingSettle.groupId,
            fromUserId: currentSession.user.id,
            toUserId: pendingSettle.toUserId,
            toUserName: pendingSettle.toUserName,
            amount: pendingSettle.amount,
        });
        UI.hideModal('modal-settle');
        pendingSettle = null;
        await UI.renderGroupDetail(currentGroup, currentSession);
        await UI.updateSyncIndicator();
        if (navigator.onLine) doSync();
    } catch (ex) {
        alert('Settlement failed: ' + ex.message);
    }
});

// Close modals
document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
    });
});

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
    });
});

// Boot
init();
