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

function createClientId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
    return name ? `Hi, ${name}` : 'Hey there!';
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

        const userNameBadge = document.getElementById('user-name-badge');
        if (userNameBadge) userNameBadge.textContent = currentSession.user.name || 'Member';
    
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
    // Use cached group data initially for fast display
    currentGroup = groups.find((g) => (g.id || String(g._id)) === groupId);
    if (!currentGroup) return;
    UI.showScreen('screen-group');

    // Fetch full group detail from server (with populated members) for accurate data
    try {
        if (navigator.onLine) {
            const fullGroup = await Sync.getGroupDetail(groupId);
            if (fullGroup) {
                currentGroup = { ...fullGroup, id: String(fullGroup._id || fullGroup.id || groupId) };
                // Also update in our groups array
                const idx = groups.findIndex(g => (g.id || String(g._id)) === groupId);
                if (idx !== -1) groups[idx] = currentGroup;
            }
        }
    } catch (err) {
        // If fetch fails (offline/error), continue with cached data
        console.warn('[openGroup] Failed to fetch full group detail:', err.message);
    }

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

// ---- Network & Visibility ----
function setupNetworkListeners() {
    window.addEventListener('online', async () => { 
        UI.setNetworkBanner(true); 
        await doSync(); 
    });
    window.addEventListener('offline', () => {
        UI.setNetworkBanner(false);
    });
    if (!navigator.onLine) UI.setNetworkBanner(false);

    // Sync when user tabs back into the app
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
            await doSync();
        }
    });
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
        UI.renderSplitPreview([], members, 0);
        return;
    }

    const splits = calculateCurrentSplits(amount);
    UI.renderSplitPreview(splits, members, amount);
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

async function openRazorpaySettlement(btn) {
    if (!currentGroup || !currentSession) return;

    const debtorId = currentSession.user.id;
    const creditorId = btn.dataset.to;
    const amount = parseFloat(btn.dataset.amt);
    const groupId = btn.dataset.group || currentGroup.id || String(currentGroup._id);
    const clientId = btn.dataset.clientId || createClientId();
    const originalText = btn.textContent;

    if (!creditorId || !amount || amount <= 0) {
        UI.showToast('Invalid settlement details.', 'error');
        return;
    }

    if (typeof Razorpay === 'undefined') {
        UI.showToast('Payment checkout is unavailable.', 'error');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Opening...';

    const restoreButton = () => {
        btn.disabled = false;
        btn.textContent = originalText;
    };

    try {
        const res = await fetch('/api/expenses/razorpay/order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...Auth.authHeader(currentSession.token),
            },
            body: JSON.stringify({
                groupId,
                amount,
                debtorId,
                creditorId,
                clientId,
                description: `Settlement with ${btn.dataset.toName || 'member'}`,
            }),
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Failed to create checkout order.');
        }

        const checkout = new Razorpay({
            key: data.keyId,
            amount: data.amount,
            currency: data.currency || 'INR',
            name: 'Esplitter',
            description: `Settlement with ${btn.dataset.toName || 'member'}`,
            order_id: data.order_id,
            prefill: {
                name: currentSession.user.name || '',
                email: currentSession.user.email || '',
            },
            notes: {
                groupId,
                debtorId,
                creditorId,
                clientId,
            },
            theme: {
                color: '#0f8f6f',
            },
            handler: async () => {
                UI.showToast('Payment successful. Waiting for confirmation...', 'success');
                await doSync();
                if (currentGroup && currentSession) {
                    await UI.renderGroupDetail(currentGroup, currentSession);
                }
                setTimeout(() => {
                    if (navigator.onLine) doSync();
                }, 1500);
                restoreButton();
            },
            modal: {
                ondismiss: () => {
                    UI.showToast('Payment cancelled.', 'info');
                    restoreButton();
                },
            },
        });

        checkout.on('payment.failed', () => {
            UI.showToast('Payment failed.', 'error');
            restoreButton();
        });
        checkout.open();
    } catch (ex) {
        UI.showToast('Failed to start payment: ' + ex.message, 'error');
        restoreButton();
    }
}

// ============ Event Listeners ============

// Auth Tabs
function setActiveAuthTab(tabName) {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const authTabIndicator = document.getElementById('auth-tab-indicator');

    tabButtons.forEach((button) => {
        const isActive = button.dataset.tab === tabName;
        button.classList.toggle('active', isActive);
        button.classList.toggle('text-on-primary', isActive);
        button.classList.toggle('text-on-surface-variant', !isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });

    if (authTabIndicator) {
        authTabIndicator.style.transform = tabName === 'register'
            ? 'translateX(calc(100% + 6px))'
            : 'translateX(0)';
    }

    document.querySelectorAll('.auth-form').forEach((form) => {
        const isActive = form.id === `form-${tabName}`;
        form.classList.toggle('active', isActive);
        form.classList.toggle('hidden', !isActive);
    });
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        setActiveAuthTab(btn.dataset.tab);
    });
});

setActiveAuthTab('login');

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
        // Terms & Conditions must be accepted
        if (!document.getElementById('reg-terms').checked) {
            throw new Error('You must accept the Terms & Conditions to create an account.');
        }

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

// ---- Terms & Conditions Modal ----
(function setupTermsModal() {
    const modal = document.getElementById('modal-terms');
    const checkbox = document.getElementById('reg-terms');

    function openTerms() {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    function closeTerms() {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    // "Terms & Conditions" link in the register form
    document.getElementById('btn-show-terms').addEventListener('click', openTerms);

    // "I Agree" button — checks the box and closes
    document.getElementById('btn-terms-accept').addEventListener('click', () => {
        checkbox.checked = true;
        // Manually trigger visual update since input is sr-only
        const label = document.querySelector('label[for="reg-terms"]');
        if (label) label.classList.add('bg-primary', 'border-primary');
        closeTerms();
    });

    // "Close" button — just closes (leaves checkbox state as-is)
    document.getElementById('btn-terms-close').addEventListener('click', closeTerms);

    // Click outside modal card to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeTerms();
    });

    // Sync label styling with checkbox state when clicked directly
    if (checkbox) {
        checkbox.addEventListener('change', () => {
            const label = document.querySelector('label[for="reg-terms"]');
            if (!label) return;
            if (checkbox.checked) {
                label.classList.add('bg-primary', 'border-primary');
            } else {
                label.classList.remove('bg-primary', 'border-primary');
            }
        });
    }
})();

// Logout (header button)
document.getElementById('btn-logout').addEventListener('click', async () => {
    Auth.stopAutoRefresh();
    await Auth.logout();
    currentSession = null; currentGroup = null; groups = [];
    document.getElementById('bottom-nav')?.classList.add('hidden');
    UI.showScreen('screen-auth');
});

// ---- Profile ----
async function goToProfile() {
    UI.showScreen('screen-profile');
    setActiveNav('screen-profile');
    const session = await Auth.getSession();
    if (!session) return;
    document.getElementById('profile-email').textContent = session.user.email;
    const profileDisplayName = document.getElementById('profile-display-name');
    if (profileDisplayName) profileDisplayName.textContent = session.user.name || 'User Name';
    document.getElementById('profile-name').value = session.user.name || '';
    document.getElementById('profile-phone').value = session.user.phone || '';
    document.getElementById('profile-upi').value = session.user.upiId || '';
    // Clear messages
    document.getElementById('profile-msg').textContent = '';
    document.getElementById('profile-error').textContent = '';
    document.getElementById('upi-msg').textContent = '';
    document.getElementById('upi-error').textContent = '';
}

document.getElementById('btn-profile')?.addEventListener('click', goToProfile);

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
            const userNameBadge = document.getElementById('user-name-badge');
            if (userNameBadge) userNameBadge.textContent = data.name || 'Member';
            const profileDisplayName = document.getElementById('profile-display-name');
            if (profileDisplayName) profileDisplayName.textContent = data.name || 'User Name';
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
const settlementSection = document.getElementById('settlement-section');
settlementSection.addEventListener('change', async (e) => {
    const toggle = e.target.closest('input[data-settlement-mode]');
    if (!toggle || !currentGroup || !currentSession) return;
    const newMode = toggle.checked ? 'smart' : 'normal';
    try {
        const groupId = currentGroup.id || String(currentGroup._id);
        await Sync.updateSettlementMode(groupId, newMode);
        currentGroup.settlementMode = newMode;
        UI.setSettlementMode(newMode);
        await UI.renderGroupDetail(currentGroup, currentSession);
        UI.showToast(`Settlement mode changed to ${newMode}.`, 'success');
    } catch (ex) {
        // Revert toggle on failure
        toggle.checked = !toggle.checked;
        UI.showToast('Failed to update settlement mode: ' + ex.message, 'error');
    }
});

settlementSection.addEventListener('click', async (e) => {
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

    // 1b. Copy recipient UPI for manual payment or external app payment
    if (e.target.closest('.btn-copy-upi')) {
        const btn = e.target.closest('.btn-copy-upi');
        const upiId = String(btn.dataset.upi || '').trim();
        if (!upiId) {
            UI.showToast('UPI ID is not available for this user.', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(upiId);
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            UI.showToast('UPI ID copied.', 'success');
            setTimeout(() => {
                btn.textContent = originalText;
            }, 1200);
        } catch (ex) {
            UI.showToast('Could not copy UPI ID.', 'error');
        }
        return;
    }

    // 2. Pay Now via Razorpay (Debtor pays)
    if (e.target.closest('.btn-pay-now')) {
        const btn = e.target.closest('.btn-pay-now');
        await openRazorpaySettlement(btn);
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

// Close modals
document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
    });
});

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.add('hidden');
        }
    });
});

// ---- Bottom Navigation ----
document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', async () => {
        document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
        const target = item.dataset.target;

        if (target === 'screen-dashboard') {
            await goToDashboard();
        } else if (target === 'screen-tracker') {
            UI.showScreen('screen-tracker');
            await Tracker.syncCategories();
            await TrackerUI.renderDashboard();
            if (navigator.onLine) Tracker.syncPersonalExpenses();
        } else if (target === 'screen-profile') {
            await goToProfile();
        }
    });
});

// ---- Tracker: Quick Add FAB ----
document.getElementById('btn-quick-add')?.addEventListener('click', async () => {
    document.getElementById('pe-amount').value = '';
    document.getElementById('pe-description').value = '';
    const notesInput = document.getElementById('pe-notes');
    if (notesInput) notesInput.value = '';
    document.getElementById('pe-payment').value = 'cash';
    await TrackerUI.populateAddForm();
    UI.showModal('modal-add-personal-expense');
    // Focus amount input
    setTimeout(() => document.getElementById('pe-amount')?.focus(), 300);
});

// ---- Tracker: Add Personal Expense ----
document.getElementById('btn-add-personal-expense-confirm')?.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('pe-amount').value);
    if (!amount || amount <= 0) {
        UI.showToast('Enter a valid amount.', 'warning');
        return;
    }

    const selectedCat = document.querySelector('#pe-category-grid .category-pill.selected');
    const category = selectedCat ? selectedCat.dataset.cat : 'Others';
    const description = document.getElementById('pe-description').value.trim();
    const date = document.getElementById('pe-date').value
        ? new Date(document.getElementById('pe-date').value).toISOString()
        : new Date().toISOString();
    const paymentMethod = document.getElementById('pe-payment').value;
    const notesInput = document.getElementById('pe-notes');
    const notes = notesInput ? notesInput.value.trim() : '';

    const btn = document.getElementById('btn-add-personal-expense-confirm');
    btn.disabled = true;
    btn.textContent = 'Adding...';

    try {
        await Tracker.addExpense({ amount, category, description, date, paymentMethod, notes });
        UI.hideModal('modal-add-personal-expense');
        UI.showToast('Expense added! ✅', 'success');
        await TrackerUI.renderDashboard();
        if (navigator.onLine) Tracker.syncPersonalExpenses();
    } catch (ex) {
        UI.showToast(ex.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add Expense';
    }
});

// ---- Tracker: Delete Personal Expense ----
document.getElementById('btn-delete-personal-expense')?.addEventListener('click', async () => {
    const clientId = document.getElementById('btn-delete-personal-expense').dataset.clientId;
    if (!clientId) return;
    if (!confirm('Delete this expense?')) return;

    try {
        await Tracker.deleteExpense(clientId);
        UI.hideModal('modal-personal-expense-detail');
        UI.showToast('Expense deleted.', 'success');
        await TrackerUI.renderDashboard();
        if (navigator.onLine) Tracker.syncPersonalExpenses();
    } catch (ex) {
        UI.showToast('Failed: ' + ex.message, 'error');
    }
});

// ---- Tracker: Back from all expenses ----
document.getElementById('btn-tracker-all-back')?.addEventListener('click', () => {
    UI.showScreen('screen-tracker');
    setActiveNav('screen-tracker');
});

// ---- Tracker: Budgets ----
document.getElementById('btn-tracker-budgets')?.addEventListener('click', async () => {
    UI.showScreen('screen-tracker-budgets');
    await TrackerUI.renderBudgets();
});

document.getElementById('btn-tracker-budgets-back')?.addEventListener('click', () => {
    UI.showScreen('screen-tracker');
    setActiveNav('screen-tracker');
});

document.getElementById('btn-set-budget-confirm')?.addEventListener('click', async () => {
    const category = document.getElementById('budget-category').value || null;
    const amount = parseFloat(document.getElementById('budget-amount').value);
    if (!amount || amount < 1) {
        UI.showToast('Enter a valid budget amount.', 'warning');
        return;
    }
    try {
        await Tracker.setBudget(category, amount);
        UI.hideModal('modal-set-budget');
        UI.showToast('Budget saved! ✅', 'success');
        await TrackerUI.renderBudgets();
    } catch (ex) {
        UI.showToast(ex.message, 'error');
    }
});

// ---- Tracker: Categories ----
document.getElementById('btn-tracker-categories')?.addEventListener('click', async () => {
    const categories = await Tracker.getCategories();
    const list = document.getElementById('manage-cat-list');
    list.innerHTML = categories.map((c) => `
        <div class="manage-cat-item">
            <span class="manage-cat-dot" style="background:${c.color}"></span>
            <span class="manage-cat-icon">${c.icon}</span>
            <span class="manage-cat-name">${UI.escapeHtml(c.name)}</span>
            ${c.isDefault ? '<span class="manage-cat-badge">Default</span>' : `<button class="btn btn-ghost btn-xs btn-delete-cat" data-cat-id="${c.id}">×</button>`}
        </div>
    `).join('');

    // Delete handlers
    list.querySelectorAll('.btn-delete-cat').forEach((btn) => {
        btn.addEventListener('click', async () => {
            try {
                await Tracker.deleteCategory(btn.dataset.catId);
                UI.showToast('Category removed.', 'success');
                document.getElementById('btn-tracker-categories').click(); // refresh
            } catch (ex) {
                UI.showToast(ex.message, 'error');
            }
        });
    });

    UI.showModal('modal-manage-categories');
});

document.getElementById('btn-add-category')?.addEventListener('click', async () => {
    const name = document.getElementById('new-cat-name').value.trim();
    const color = document.getElementById('new-cat-color').value;
    if (!name) { UI.showToast('Enter a category name.', 'warning'); return; }
    try {
        await Tracker.addCategory(name, color, '📁');
        document.getElementById('new-cat-name').value = '';
        UI.showToast('Category added!', 'success');
        document.getElementById('btn-tracker-categories').click(); // refresh
    } catch (ex) {
        UI.showToast(ex.message, 'error');
    }
});

// Boot
init();
