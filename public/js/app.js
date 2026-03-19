// app.js - Main application (uses window.db, window.Auth, window.Sync, window.UI)

// ---- App State ----
let currentSession = null;
let currentGroup = null;
let groups = [];
let currentSplitType = 'EQUAL';

// ---- Greeting Helper ----
function getGreeting(name) {
    const hour = new Date().getHours();
    let timeGreeting;
    if (hour < 12) timeGreeting = 'Good morning';
    else if (hour < 17) timeGreeting = 'Good afternoon';
    else timeGreeting = 'Good evening';
    return `${timeGreeting}, ${name}! 👋`;
}

// ---- Init ----
async function init() {
    currentSession = await Auth.getSession();
    if (currentSession) {
        Auth.startAutoRefresh();
        await goToDashboard();
    } else {
        UI.showScreen('screen-auth');
    }
    registerServiceWorker();
    setupNetworkListeners();
    setupPasswordToggles();
    setupPasswordStrength();
    setupSplitTypeTabs();
    setupSplitInputListeners();
}

async function goToDashboard() {
    UI.showScreen('screen-dashboard');
    document.getElementById('bottom-nav').classList.remove('hidden');
    
    // Update active nav state
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const dashBtn = document.querySelector('.nav-item[data-target="screen-dashboard"]');
    if(dashBtn) dashBtn.classList.add('active');

    document.getElementById('user-name-badge').textContent = currentSession.user.name;
    
    // Update greeting
    const greetingEl = document.getElementById('greeting-text');
    const greetingSub = document.getElementById('greeting-sub');
    if (greetingEl) greetingEl.textContent = getGreeting(currentSession.user.name);
    if (greetingSub) greetingSub.textContent = "Here's what's happening with your groups";
    
    await loadGroups();
    await UI.updateSyncIndicator();
    if (navigator.onLine) doSync();
}

async function loadGroups() {
    UI.renderGroupSkeletons();
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
let _syncIntervalId = null;

async function doSync() {
    if (!currentSession) return;
    if (Sync.isSyncInProgress()) return;

    // Check actual connectivity, not just the navigator flag
    const isConnected = await Sync.checkActualConnectivity();
    if (!isConnected) {
        UI.setNetworkBanner(false);
        return;
    }
    
    UI.setNetworkBanner(true);

    const result = await Sync.syncWithServer();
    if (result) {
        await loadGroups();
        if (currentGroup) await UI.renderGroupDetail(currentGroup, currentSession);
    }
    
    // Reschedule smarter interval
    scheduleSmarterSync();
}

async function handleManualSync() {
    const failedCount = await Sync.getFailedCount();
    if (failedCount > 0) {
        await Sync.retryFailed();
        await loadGroups();
        if (currentGroup) await UI.renderGroupDetail(currentGroup, currentSession);
    } else {
        await doSync();
    }
}

// ---- Network ----
function setupNetworkListeners() {
    window.addEventListener('online', async () => { 
        UI.setNetworkBanner(true); 
        await doSync(); 
    });
    window.addEventListener('offline', () => {
        UI.setNetworkBanner(false);
    });
    if (!navigator.onLine) UI.setNetworkBanner(false);

    // Initial scheduler start
    scheduleSmarterSync();
}

async function scheduleSmarterSync() {
    if (_syncIntervalId) clearInterval(_syncIntervalId);
    
    // 30 seconds if pending items, 120 seconds if idle
    const pendingCount = await Sync.getPendingCount();
    const intervalMs = pendingCount > 0 ? 30 * 1000 : 120 * 1000;
    
    _syncIntervalId = setInterval(doSync, intervalMs);
}

// ---- Service Worker ----
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => { });
    }
}

// ---- Password Toggle ----
function setupPasswordToggles() {
    document.querySelectorAll('.btn-toggle-pw').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.dataset.target);
            if (input.type === 'password') {
                input.type = 'text';
                btn.textContent = '🙈';
            } else {
                input.type = 'password';
                btn.textContent = '👁️';
            }
        });
    });
}

// ---- Password Strength Indicator ----
function setupPasswordStrength() {
    const regPw = document.getElementById('reg-password');
    const bar = document.getElementById('pw-strength-bar');
    const label = document.getElementById('pw-strength-label');
    if (!regPw || !bar || !label) return;

    regPw.addEventListener('input', () => {
        const strength = Auth.checkPasswordStrength(regPw.value);
        bar.className = 'pw-strength-bar ' + strength.cls;
        label.className = 'pw-strength-label ' + strength.cls;
        label.textContent = strength.label;
    });
}

// ---- Split Type Tabs ----
function setupSplitTypeTabs() {
    document.querySelectorAll('.split-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            document.querySelectorAll('.split-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentSplitType = tab.dataset.split;

            // Show/hide sections
            document.getElementById('exp-participants-section').classList.toggle('hidden', currentSplitType !== 'EQUAL');
            document.getElementById('exp-custom-section').classList.toggle('hidden', currentSplitType !== 'CUSTOM');
            document.getElementById('exp-percentage-section').classList.toggle('hidden', currentSplitType !== 'PERCENTAGE');

            // Update preview
            updateSplitPreview();
        });
    });
}

// ---- Split Input Listeners ----
function setupSplitInputListeners() {
    // Listen for changes on custom and percentage inputs (delegated)
    document.getElementById('exp-custom-inputs').addEventListener('input', () => {
        const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
        UI.updateSplitTotal('exp-custom-total', amount, false);
        updateSplitPreview();
    });

    document.getElementById('exp-percentage-inputs').addEventListener('input', () => {
        const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
        UI.updateSplitTotal('exp-percentage-total', amount, true);
        updateSplitPreview();
    });

    // Update preview when amount changes
    document.getElementById('exp-amount').addEventListener('input', () => {
        if (currentSplitType === 'CUSTOM') {
            const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
            UI.updateSplitTotal('exp-custom-total', amount, false);
        } else if (currentSplitType === 'PERCENTAGE') {
            const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
            UI.updateSplitTotal('exp-percentage-total', amount, true);
        }
        updateSplitPreview();
    });

    // Update preview when checkboxes change
    document.getElementById('exp-members-checkboxes').addEventListener('change', () => {
        updateSplitPreview();
    });
}

function updateSplitPreview() {
    if (!currentGroup) return;
    const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
    const members = currentGroup.members || [];
    if (!amount) {
        UI.renderSplitPreview([], members);
        return;
    }

    const splits = calculateCurrentSplits(amount);
    UI.renderSplitPreview(splits, members);
}

function calculateCurrentSplits(amount) {
    if (currentSplitType === 'EQUAL') {
        const checkedBoxes = document.querySelectorAll('#exp-members-checkboxes input:checked');
        const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);
        if (!selectedIds.length) return [];
        const shareAmount = +(amount / selectedIds.length).toFixed(2);
        // Handle rounding — give remainder to first person
        let remaining = +(amount - shareAmount * selectedIds.length).toFixed(2);
        return selectedIds.map((userId, i) => ({
            userId,
            amount: i === 0 ? +(shareAmount + remaining).toFixed(2) : shareAmount,
        }));
    }

    if (currentSplitType === 'CUSTOM') {
        const inputs = document.querySelectorAll('#exp-custom-inputs .split-val');
        return Array.from(inputs)
            .map(inp => ({ userId: inp.dataset.user, amount: parseFloat(inp.value) || 0 }))
            .filter(s => s.amount > 0);
    }

    if (currentSplitType === 'PERCENTAGE') {
        const inputs = document.querySelectorAll('#exp-percentage-inputs .split-val');
        return Array.from(inputs)
            .map(inp => ({
                userId: inp.dataset.user,
                amount: +((parseFloat(inp.value) || 0) / 100 * amount).toFixed(2),
            }))
            .filter(s => s.amount > 0);
    }

    return [];
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

// Bottom Nav
document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const target = btn.dataset.target;
        if (target === 'screen-dashboard') {
            await goToDashboard();
        } else if (target === 'screen-profile') {
            // Trigger the existing profile button logic to fetch session
            document.getElementById('btn-profile').click();
        } else {
            UI.showScreen(target);
        }
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
        Auth.startAutoRefresh();
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
        Auth.startAutoRefresh();
        await goToDashboard();
    } catch (ex) {
        err.textContent = ex.message;
    }
});

// Logout (header button)
document.getElementById('btn-logout').addEventListener('click', async () => {
    Auth.stopAutoRefresh();
    await Auth.logout();
    currentSession = null; currentGroup = null; groups = [];
    document.getElementById('bottom-nav').classList.add('hidden');
    UI.showScreen('screen-auth');
});

// ---- Profile ----
document.getElementById('btn-profile').addEventListener('click', async () => {
    UI.showScreen('screen-profile');
    const session = await Auth.getSession();
    if (!session) return;
    document.getElementById('profile-email').textContent = session.user.email;
    document.getElementById('profile-name').value = session.user.name || '';
    document.getElementById('profile-phone').value = session.user.phone || '';
    document.getElementById('profile-upi').value = session.user.upiId || '';
    // Clear messages
    document.getElementById('profile-msg').textContent = '';
    document.getElementById('profile-error').textContent = '';
    document.getElementById('upi-msg').textContent = '';
    document.getElementById('upi-error').textContent = '';
});

document.getElementById('btn-profile-back').addEventListener('click', () => {
    UI.showScreen('screen-dashboard');
});

// Profile form — Save name & phone
document.getElementById('form-profile').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('profile-msg');
    const err = document.getElementById('profile-error');
    msg.textContent = ''; err.textContent = '';
    try {
        const data = await Auth.updateProfile(
            document.getElementById('profile-name').value.trim(),
            document.getElementById('profile-phone').value.trim()
        );
        currentSession = await Auth.getSession();
        document.getElementById('user-name-badge').textContent = data.name;
        msg.textContent = '✅ Profile updated!';
    } catch (ex) {
        err.textContent = ex.message;
    }
});

// UPI form — Save UPI ID
document.getElementById('form-upi').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('upi-msg');
    const err = document.getElementById('upi-error');
    msg.textContent = ''; err.textContent = '';
    try {
        await Auth.updateUpiId(document.getElementById('profile-upi').value.trim());
        currentSession = await Auth.getSession();
        msg.textContent = '✅ UPI ID saved!';
    } catch (ex) {
        err.textContent = ex.message;
    }
});

// Profile logout button
document.getElementById('btn-profile-logout').addEventListener('click', async () => {
    Auth.stopAutoRefresh();
    await Auth.logout();
    currentSession = null; currentGroup = null; groups = [];
    UI.showScreen('screen-auth');
});

// ---- Group Settings ----
document.getElementById('btn-group-settings').addEventListener('click', async () => {
    if (!currentGroup || !currentSession) return;
    UI.showScreen('screen-group-settings');
    const groupId = currentGroup.id || String(currentGroup._id);
    const isAdmin = String(currentGroup.adminId) === currentSession.user.id;

    // Populate fields
    document.getElementById('gs-name').value = currentGroup.name || '';
    document.getElementById('gs-desc').value = currentGroup.description || '';
    document.getElementById('gs-invite-code').textContent = currentGroup.inviteCode || '';
    document.getElementById('gs-msg').textContent = '';
    document.getElementById('gs-error').textContent = '';

    // Edit form — only admin can edit
    const editForm = document.getElementById('form-edit-group');
    editForm.querySelectorAll('input, button[type="submit"]').forEach(el => {
        el.disabled = !isAdmin;
    });

    // Show archive button only for admin
    const archiveBtn = document.getElementById('btn-archive-group');
    archiveBtn.style.display = isAdmin ? 'block' : 'none';

    // Leave button text
    const leaveBtn = document.getElementById('btn-leave-group');
    leaveBtn.textContent = isAdmin ? 'Archive Group (Admin)' : 'Leave Group';
    leaveBtn.style.display = isAdmin ? 'none' : 'block';

    // Render members
    const members = currentGroup.members || [];
    const membersList = document.getElementById('gs-members-list');
    membersList.innerHTML = members.map(m => {
        const mid = String(m._id || m.id || m);
        const name = m.name || 'Member';
        const email = m.email || '';
        const isAdminMember = mid === String(currentGroup.adminId);
        const canRemove = isAdmin && !isAdminMember;
        return `<div class="gs-member-row">
            <div class="gs-member-info">
                <span class="gs-member-name">${UI.escapeHtml(name)}</span>
                ${isAdminMember ? '<span class="gs-member-role">Admin</span>' : ''}
                ${email ? `<span class="gs-member-email">${UI.escapeHtml(email)}</span>` : ''}
            </div>
            ${canRemove ? `<button class="btn btn-ghost btn-xs btn-remove-member" data-user="${mid}" data-name="${UI.escapeHtml(name)}">Remove</button>` : ''}
        </div>`;
    }).join('');
});

// Group settings back
document.getElementById('btn-gsettings-back').addEventListener('click', async () => {
    if (currentGroup) {
        UI.showScreen('screen-group');
        await UI.renderGroupDetail(currentGroup, currentSession);
    } else {
        UI.showScreen('screen-dashboard');
    }
});

// Edit group form
document.getElementById('form-edit-group').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('gs-msg');
    const err = document.getElementById('gs-error');
    msg.textContent = ''; err.textContent = '';
    try {
        const groupId = currentGroup.id || String(currentGroup._id);
        const updated = await Sync.updateGroup(
            groupId,
            document.getElementById('gs-name').value.trim(),
            document.getElementById('gs-desc').value.trim()
        );
        // Update local state
        currentGroup.name = updated.name;
        currentGroup.description = updated.description;
        msg.textContent = '✅ Group updated!';
    } catch (ex) {
        err.textContent = ex.message;
    }
});

// Copy invite code
document.getElementById('btn-copy-invite').addEventListener('click', () => {
    const code = document.getElementById('gs-invite-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
        document.getElementById('btn-copy-invite').textContent = '✅ Copied!';
        setTimeout(() => {
            document.getElementById('btn-copy-invite').textContent = '📋 Copy';
        }, 2000);
    });
});

// Remove member (delegated)
document.getElementById('gs-members-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-remove-member');
    if (!btn) return;
    const userId = btn.dataset.user;
    const name = btn.dataset.name;
    if (!confirm(`Remove ${name} from the group?`)) return;
    try {
        const groupId = currentGroup.id || String(currentGroup._id);
        const updated = await Sync.removeMember(groupId, userId);
        currentGroup = { ...currentGroup, ...updated };
        // Re-trigger settings screen to refresh members
        document.getElementById('btn-group-settings').click();
    } catch (ex) {
        UI.showToast('Failed: ' + ex.message, 'error');
    }
});

// Leave group
document.getElementById('btn-leave-group').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to leave this group?')) return;
    try {
        const groupId = currentGroup.id || String(currentGroup._id);
        await Sync.leaveGroup(groupId);
        currentGroup = null;
        await loadGroups();
        UI.showScreen('screen-dashboard');
    } catch (ex) {
        UI.showToast('Failed: ' + ex.message, 'error');
    }
});

// Archive group (admin only)
document.getElementById('btn-archive-group').addEventListener('click', async () => {
    if (!confirm('Archive this group? Members won\'t be able to add new expenses.')) return;
    try {
        const groupId = currentGroup.id || String(currentGroup._id);
        await Sync.archiveGroup(groupId);
        currentGroup = null;
        await loadGroups();
        UI.showScreen('screen-dashboard');
    } catch (ex) {
        UI.showToast('Failed: ' + ex.message, 'error');
    }
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
        UI.showToast('Group created successfully!', 'success');
    } catch (ex) { UI.showToast(ex.message, 'error'); }
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
        UI.showToast('Joined group successfully!', 'success');
    } catch (ex) { UI.showToast(ex.message, 'error'); }
});

// ---- Add Expense ----
document.getElementById('btn-add-expense').addEventListener('click', () => {
    if (!currentGroup) return;
    document.getElementById('exp-desc').value = '';
    document.getElementById('exp-amount').value = '';
    currentSplitType = 'EQUAL';
    UI.populateExpenseForm(currentGroup, currentSession);
    UI.showModal('modal-add-expense');
});

document.getElementById('btn-add-expense-confirm').addEventListener('click', async () => {
    const description = document.getElementById('exp-desc').value.trim();
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const paidBy = document.getElementById('exp-payer').value;
    if (!description || !amount || !paidBy) { UI.showToast('Please fill all fields.', 'warning'); return; }
    if (amount <= 0) { UI.showToast('Amount must be greater than 0.', 'warning'); return; }

    // Calculate splits based on current split type
    const splits = calculateCurrentSplits(amount);

    if (!splits.length) {
        UI.showToast('Select at least one member to split with.', 'warning');
        return;
    }

    // Validate splits total
    const splitsTotal = splits.reduce((sum, s) => sum + s.amount, 0);
    if (Math.abs(splitsTotal - amount) > 0.02) {
        UI.showToast(`Splits total (₹${splitsTotal.toFixed(2)}) doesn't match amount (₹${amount.toFixed(2)}). Please adjust.`, 'warning');
        return;
    }

    await Sync.addExpense({
        groupId: currentGroup.id || String(currentGroup._id),
        description, amount, paidBy, splits,
        splitType: currentSplitType,
    });

    UI.hideModal('modal-add-expense');
    await UI.renderGroupDetail(currentGroup, currentSession);
    await UI.updateSyncIndicator();
    if (navigator.onLine) doSync();
});

// ---- Delete Expense ----
document.getElementById('btn-delete-expense').addEventListener('click', async () => {
    const clientId = document.getElementById('btn-delete-expense').dataset.clientId;
    const serverId = document.getElementById('btn-delete-expense').dataset.txId;
    if (!clientId) return;
    if (!confirm('Delete this expense? This cannot be undone.')) return;

    try {
        await Sync.deleteExpense(clientId, serverId);
        UI.hideModal('modal-expense-detail');
        if (currentGroup && currentSession) {
            await UI.renderGroupDetail(currentGroup, currentSession);
            await UI.updateSyncIndicator();
            if (navigator.onLine) doSync();
        }
    } catch (ex) {
        UI.showToast('Failed to delete: ' + ex.message, 'error');
    }
});

// Manual Sync
document.getElementById('btn-manual-sync').addEventListener('click', handleManualSync);

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
        upiId: btn.dataset.upi
    };
    
    // Phase 8 UPI Settlement Logic
    if (pendingSettle.upiId) {
        // Build payload for QRPay module
        const payload = {
            upiId: pendingSettle.upiId,
            name: pendingSettle.toUserName,
            amount: pendingSettle.amount,
            note: 'Group Settlement',
            settleContext: {
                groupId: pendingSettle.groupId,
                toUserId: pendingSettle.toUserId
            }
        };
        QRPay.showPaymentForm(payload);
    } else {
        // Fallback or Strict Error per Phase 8 requirements
        UI.showToast("This user hasn't set up their UPI ID. Settlements requiring UPI cannot proceed.", 'warning');
    }
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
        UI.showToast('Settlement failed: ' + ex.message, 'error');
    }
});

// Close modals (also stop scanner if open)
document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
        QRPay.stopScanner();
        document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
    });
});

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            QRPay.stopScanner();
            overlay.classList.add('hidden');
        }
    });
});

// ---- QR Scan & Pay ----
document.getElementById('btn-scan-pay').addEventListener('click', () => {
    QRPay.startScanner();
});

// File upload fallback
document.getElementById('qr-upload-input').addEventListener('change', (e) => {
    QRPay.handleFileUpload(e);
});

// Close scanner button
document.getElementById('btn-close-scanner').addEventListener('click', () => {
    QRPay.stopScanner();
});

// Update UPI app buttons when amount or note changes
document.getElementById('pay-amount').addEventListener('input', () => QRPay.renderAppButtons());
document.getElementById('pay-note').addEventListener('input', () => QRPay.renderAppButtons());

// Auto-render UPI apps when payment modal opens (observe class change)
const payModal = document.getElementById('modal-qr-payment');
const payObserver = new MutationObserver(() => {
    if (!payModal.classList.contains('hidden')) {
        QRPay.renderAppButtons();
    }
});
payObserver.observe(payModal, { attributes: true, attributeFilter: ['class'] });

// UPI app grid — delegate clicks
document.getElementById('upi-app-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.upi-app-btn');
    if (!btn) return;
    QRPay.openUPIApp(btn.dataset.url);
});

// Copy UPI link
document.getElementById('btn-copy-upi').addEventListener('click', () => QRPay.copyUPILink());

// Mark as paid
document.getElementById('btn-mark-paid').addEventListener('click', async () => {
    // If in a group context, record the payment; otherwise just close
    const groupId = currentGroup?.id || currentGroup?._id || null;
    await QRPay.recordPayment(groupId);
    // Refresh if in group view
    if (currentGroup && currentSession) {
        await UI.renderGroupDetail(currentGroup, currentSession);
        await UI.updateSyncIndicator();
        if (navigator.onLine) doSync();
    }
});

// Boot
init();
