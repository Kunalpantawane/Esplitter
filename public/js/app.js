// app.js - Main application (uses window.db, window.Auth, window.Sync, window.UI)

// ---- Utils ----
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const retryWithBackoff = async (fn, retries = 3) => {
    let delay = 1000;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (err.status === 429 && i < retries - 1) {
                await new Promise(res => setTimeout(res, delay));
                delay *= 2; // exponential
            } else {
                throw err;
            }
        }
    }
};

function normalizeUpiId(upiId) {
    return String(upiId || '').trim().toLowerCase();
}

function isLikelyValidUpiId(upiId) {
    const normalized = normalizeUpiId(upiId);
    if (!normalized || /\s/.test(normalized)) return false;
    return /^[a-z0-9._-]{2,}@[a-z][a-z0-9.-]{2,}$/.test(normalized);
}

// ---- App State ----
let currentSession = null;
let currentGroup = null;
let groups = [];
let currentSplitType = 'EQUAL';
let currentJoinRequests = [];

function setActiveNav(targetScreenId) {
    document.querySelectorAll('.nav-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.target === targetScreenId);
    });
}

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
    document.getElementById('bottom-nav')?.classList.remove('hidden');
    setActiveNav('screen-dashboard');

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

    // Ensure the active group reference is updated with fresh data
    if (currentGroup) {
        const freshGroup = groups.find(g => (g.id || String(g._id)) === (currentGroup.id || String(currentGroup._id)));
        if (freshGroup) currentGroup = freshGroup;
    }
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

const handleManualSync = debounce(async () => {
    const failedCount = await Sync.getFailedCount();
    if (failedCount > 0) {
        await Sync.retryFailed();
        await loadGroups();
        if (currentGroup) await UI.renderGroupDetail(currentGroup, currentSession);
    } else {
        await doSync();
    }
}, 1000);

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
    
    // Poll every 10 seconds (controlled real-time feel)
    const intervalMs = 10 * 1000;
    
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

// Login
document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('login-error');
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Logging in...';
    err.textContent = '';
    try {
        await retryWithBackoff(() => Auth.login(
            document.getElementById('login-email').value.trim(),
            document.getElementById('login-password').value
        ));
        currentSession = await Auth.getSession();
        Auth.startAutoRefresh();
        await goToDashboard();
    } catch (ex) {
        if (ex.status === 429) {
            UI.showToast("Too many attempts. Wait a few seconds.", "warning");
        }
        err.textContent = ex.message;
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// Register
document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('register-error');
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Registering...';
    err.textContent = '';
    try {
        const regUpi = normalizeUpiId(document.getElementById('reg-upi').value);
        if (!isLikelyValidUpiId(regUpi)) {
            throw new Error('Enter a valid UPI ID (example: yourname@bank).');
        }

        await retryWithBackoff(() => Auth.register(
            document.getElementById('reg-name').value.trim(),
            document.getElementById('reg-email').value.trim(),
            document.getElementById('reg-password').value,
            regUpi
        ));
        currentSession = await Auth.getSession();
        Auth.startAutoRefresh();
        await goToDashboard();
    } catch (ex) {
        if (ex.status === 429) {
            UI.showToast("Too many attempts. Wait a few seconds.", "warning");
        }
        err.textContent = ex.message;
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
});

// Logout (header button)
document.getElementById('btn-logout').addEventListener('click', async () => {
    Auth.stopAutoRefresh();
    await Auth.logout();
    currentSession = null; currentGroup = null; groups = [];
    document.getElementById('bottom-nav')?.classList.add('hidden');
    UI.showScreen('screen-auth');
});

// ---- Profile ----
document.getElementById('btn-profile').addEventListener('click', async () => {
    UI.showScreen('screen-profile');
    setActiveNav('screen-profile');
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
    goToDashboard();
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
        const upiId = normalizeUpiId(document.getElementById('profile-upi').value);
        if (!isLikelyValidUpiId(upiId)) {
            throw new Error('Enter a valid UPI ID (example: yourname@bank).');
        }

        await Auth.updateUpiId(upiId);
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
    document.getElementById('bottom-nav')?.classList.add('hidden');
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

    const regenInviteBtn = document.getElementById('btn-regen-invite');
    regenInviteBtn.style.display = isAdmin ? 'inline-flex' : 'none';

    // Leave button text
    const leaveBtn = document.getElementById('btn-leave-group');
    leaveBtn.textContent = isAdmin ? 'Archive Group (Admin)' : 'Leave Group';
    leaveBtn.style.display = isAdmin ? 'none' : 'block';

    // Render members
    const members = currentGroup.members || [];
    const membersList = document.getElementById('gs-members-list');
    let memberHtml = members.map(m => {
        const mid = String(m._id || m.id || m);
        const name = m.name || 'Member';
        const email = m.email || '';
        const isAdminMember = mid === String(currentGroup.adminId);
        const canRemove = isAdmin && !isAdminMember;
        const canPromote = isAdmin && !isAdminMember;
        return `<div class="gs-member-row">
            <div class="gs-member-info">
                <span class="gs-member-name">${UI.escapeHtml(name)}</span>
                ${isAdminMember ? '<span class="gs-member-role">Admin</span>' : ''}
                ${email ? `<span class="gs-member-email">${UI.escapeHtml(email)}</span>` : ''}
            </div>
            <div style="display:flex;gap:8px;">
                ${canPromote ? `<button class="btn btn-secondary btn-xs btn-transfer-admin" data-user="${mid}" data-name="${UI.escapeHtml(name)}">Make Admin</button>` : ''}
                ${canRemove ? `<button class="btn btn-ghost btn-xs btn-remove-member" data-user="${mid}" data-name="${UI.escapeHtml(name)}">Remove</button>` : ''}
            </div>
        </div>`;
    }).join('');

    if (isAdmin) {
        try {
            const requests = await Sync.getJoinRequests(groupId);
            currentJoinRequests = requests;
            memberHtml += `<div class="gs-requests-section" style="margin-top:12px;">
                    <div class="gs-requests-head">
                        <label class="form-group-label">Pending Join Requests</label>
                        <span class="gs-request-count" id="gs-request-count">${requests.length}</span>
                    </div>
                    ${requests.length ? requests.map((request) => `
                        <div class="gs-member-row" data-request-row="${request.requestId}">
                            <div class="gs-member-info">
                                <span class="gs-member-name">${UI.escapeHtml(request.name || 'Member')}</span>
                                ${request.email ? `<span class="gs-member-email">${UI.escapeHtml(request.email)}</span>` : ''}
                            </div>
                            <div style="display:flex;gap:8px;">
                                <button class="btn btn-primary btn-xs btn-approve-request" data-request-id="${request.requestId}">Approve</button>
                                <button class="btn btn-ghost btn-xs btn-reject-request" data-request-id="${request.requestId}">Reject</button>
                            </div>
                        </div>
                    `).join('') : '<div class="gs-requests-empty">No pending requests.</div>'}
                </div>`;
        } catch (ex) {
            UI.showToast(ex.message, 'warning');
        }
    } else {
        currentJoinRequests = [];
    }

    membersList.innerHTML = memberHtml;
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

document.getElementById('btn-regen-invite').addEventListener('click', async () => {
    if (!currentGroup) return;
    try {
        const groupId = currentGroup.id || String(currentGroup._id);
        const newCode = await Sync.rotateInviteCode(groupId);
        currentGroup.inviteCode = newCode;
        document.getElementById('gs-invite-code').textContent = newCode;
        UI.showToast('Invite code regenerated.', 'success');
    } catch (ex) {
        UI.showToast(ex.message, 'error');
    }
});

// Remove member (delegated)
document.getElementById('gs-members-list').addEventListener('click', async (e) => {
    const list = document.getElementById('gs-members-list');

    const approveBtn = e.target.closest('.btn-approve-request');
    if (approveBtn) {
        const requestId = approveBtn.dataset.requestId;
        const row = list.querySelector(`[data-request-row="${requestId}"]`);
        const snapshot = list.innerHTML;
        if (row) row.remove();
        try {
            const groupId = currentGroup.id || String(currentGroup._id);
            const updated = await Sync.approveJoinRequest(groupId, requestId);
            currentGroup = { ...currentGroup, ...updated };
            currentJoinRequests = currentJoinRequests.filter((r) => r.requestId !== requestId);
            document.getElementById('btn-group-settings').click();
            UI.showToast('Join request approved.', 'success');
        } catch (ex) {
            list.innerHTML = snapshot;
            UI.showToast('Failed: ' + ex.message, 'error');
        }
        return;
    }

    const rejectBtn = e.target.closest('.btn-reject-request');
    if (rejectBtn) {
        const requestId = rejectBtn.dataset.requestId;
        const row = list.querySelector(`[data-request-row="${requestId}"]`);
        const snapshot = list.innerHTML;
        if (row) row.remove();
        try {
            const groupId = currentGroup.id || String(currentGroup._id);
            await Sync.rejectJoinRequest(groupId, requestId);
            currentJoinRequests = currentJoinRequests.filter((r) => r.requestId !== requestId);
            document.getElementById('btn-group-settings').click();
            UI.showToast('Join request rejected.', 'info');
        } catch (ex) {
            list.innerHTML = snapshot;
            UI.showToast('Failed: ' + ex.message, 'error');
        }
        return;
    }

    const transferBtn = e.target.closest('.btn-transfer-admin');
    if (transferBtn) {
        const userId = transferBtn.dataset.user;
        const name = transferBtn.dataset.name;
        if (!confirm(`Transfer admin role to ${name}?`)) return;
        try {
            const groupId = currentGroup.id || String(currentGroup._id);
            const updated = await Sync.transferAdmin(groupId, userId);
            currentGroup = { ...currentGroup, ...updated };
            document.getElementById('btn-group-settings').click();
            UI.showToast(`${name} is now admin.`, 'success');
        } catch (ex) {
            UI.showToast('Failed: ' + ex.message, 'error');
        }
        return;
    }

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
        const result = await Sync.joinGroup(code);
        UI.hideModal('modal-join-group');
        if (result && result.pending) {
            UI.showToast(result.message || 'Join request sent.', 'info');
        } else {
            await loadGroups();
            UI.showToast('Joined group successfully!', 'success');
        }
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

    const btn = document.getElementById('btn-add-expense-confirm');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
        await Sync.addExpense({
            groupId: currentGroup.id || String(currentGroup._id),
            description, amount, paidBy, splits,
            splitType: currentSplitType,
        });

        UI.hideModal('modal-add-expense');
        await UI.renderGroupDetail(currentGroup, currentSession);
        await UI.updateSyncIndicator();
        if (navigator.onLine) doSync();
    } catch (ex) {
        UI.showToast(ex.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
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
document.getElementById('settlement-section').addEventListener('click', async (e) => {
    // 1. Request Payment (Creditor creates a PENDING payment)
    if (e.target.closest('.btn-request-payment')) {
        const btn = e.target.closest('.btn-request-payment');
        try {
            await Sync.addExpense({
                groupId: btn.dataset.group,
                description: `Requesting Payment`,
                amount: parseFloat(btn.dataset.amt),
                paidBy: btn.dataset.from, // The one who pays is the debtor
                splits: [{ userId: currentSession.user.id, amount: parseFloat(btn.dataset.amt) }], // The one receiving is the creditor
                type: 'PAYMENT'
            });
            UI.showToast('Payment requested!', 'success');
            await UI.renderGroupDetail(currentGroup, currentSession);
            if (navigator.onLine) doSync();
        } catch (ex) {
            UI.showToast('Failed to request payment: ' + ex.message, 'error');
        }
        return;
    }

    // 2. Pay Now via UPI (Debtor pays)
    if (e.target.closest('.btn-pay-now')) {
        const btn = e.target.closest('.btn-pay-now');
        pendingSettle = {
            groupId: btn.dataset.group,
            toUserId: btn.dataset.to,
            toUserName: btn.dataset.toName,
            amount: parseFloat(btn.dataset.amt),
            upiId: btn.dataset.upi,
            clientId: btn.dataset.clientId || null,
            serverId: btn.dataset.txId || null
        };
        
        if (pendingSettle.upiId) {
            const payload = {
                upiId: pendingSettle.upiId,
                name: pendingSettle.toUserName,
                amount: pendingSettle.amount,
                note: 'Group Settlement',
                settleContext: {
                    groupId: pendingSettle.groupId,
                    toUserId: pendingSettle.toUserId,
                    clientId: pendingSettle.clientId,
                    serverId: pendingSettle.serverId
                }
            };
            QRPay.showPaymentForm(payload);
        } else {
            UI.showToast("This user hasn't set up their UPI ID.", 'warning');
        }
        return;
    }

    // 3. Mark Paid Manual (Debtor marks as PAID without UPI)
    if (e.target.closest('.btn-mark-paid-manual')) {
        const btn = e.target.closest('.btn-mark-paid-manual');
        try {
            await Sync.updateSettlementStatus(btn.dataset.clientId, btn.dataset.txId, 'PAID');
            UI.showToast('Marked as paid!', 'success');
            await UI.renderGroupDetail(currentGroup, currentSession);
            if (navigator.onLine) doSync();
        } catch (ex) {
            UI.showToast('Failed to update status: ' + ex.message, 'error');
        }
        return;
    }

    // 4. Confirm Receipt (Creditor confirms)
    if (e.target.closest('.btn-confirm-receipt')) {
        const btn = e.target.closest('.btn-confirm-receipt');
        try {
            await Sync.updateSettlementStatus(btn.dataset.clientId, btn.dataset.txId, 'CONFIRMED');
            UI.showToast('Receipt confirmed!', 'success');
            await UI.renderGroupDetail(currentGroup, currentSession);
            if (navigator.onLine) doSync();
        } catch (ex) {
            UI.showToast('Failed to confirm receipt: ' + ex.message, 'error');
        }
        return;
    }
});

// We don't need a single btn-settle-confirm modal anymore because the actions are immediate.
// However, if the old modal HTML is still there, we leave this no-op or handle it.
document.getElementById('btn-settle-confirm')?.addEventListener('click', async () => {
    // Legacy fallback or customized offline-settle if we restore the manual modal
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
