// sync.js - Robust offline-first sync logic (uses window.db, window.Auth, window.UI)

const Sync = (() => {
    const API = '/api/sync';
    const MAX_RETRIES = 6;
    const BACKOFF_BASE = 1000; // 1 second
    const BACKOFF_MAX = 32000; // 32 seconds

    // ---- Sync State ----
    let _syncing = false;
    let _lastSyncAt = localStorage.getItem('lastSyncAt') || null;
    let _retryTimer = null;

    // ---- Sync Guard ----
    function isSyncInProgress() { return _syncing; }
    function getLastSyncTime() { return _lastSyncAt; }

    // ---- Actual Connectivity Check ----
    async function checkActualConnectivity() {
        if (!navigator.onLine) return false;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const res = await fetch('/api/health', {
                method: 'HEAD',
                signal: controller.signal,
                cache: 'no-store',
            });
            clearTimeout(timeout);
            return res.ok;
        } catch {
            return false;
        }
    }

    // ---- Exponential Backoff ----
    function _getBackoffDelay(retryCount) {
        return Math.min(BACKOFF_BASE * Math.pow(2, retryCount), BACKOFF_MAX);
    }

    // ---- Main Sync Function ----
    async function syncWithServer() {
        // Guard: prevent concurrent syncs
        if (_syncing) {
            console.log('[Sync] Already in progress, skipping.');
            return null;
        }

        const session = await Auth.getSession();
        if (!session) return null;

        const isConnected = await checkActualConnectivity();
        if (!isConnected) {
            console.log('[Sync] No actual connectivity, skipping.');
            return null;
        }

        _syncing = true;
        UI.updateSyncIndicator('syncing');

        try {
            // Get pending items (exclude FAILED items that haven't reached retry time)
            const now = Date.now();
            const allPending = await db.transactions
                .where('syncStatus').anyOf('PENDING', 'FAILED')
                .toArray();

            const pending = allPending.filter(tx => {
                if (tx.syncStatus === 'FAILED') {
                    const retryCount = tx.retryCount || 0;
                    if (retryCount >= MAX_RETRIES) return false; // Give up
                    const nextRetryAt = tx.nextRetryAt || 0;
                    return now >= nextRetryAt;
                }
                return true;
            });

            const pendingPayload = pending.map(tx => ({
                clientId: tx.clientId,
                groupId: tx.groupId,
                description: tx.description,
                amount: tx.amount,
                paidBy: tx.paidBy,
                receiverId: tx.receiverId,
                splits: tx.splits,
                type: tx.type || 'EXPENSE',
                splitType: tx.splitType || 'EQUAL',
                status: tx.status || (tx.type === 'PAYMENT' ? 'PENDING' : 'PAID'),
            }));

            const res = await fetch(API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...Auth.authHeader(session.token),
                },
                body: JSON.stringify({ lastSyncAt: _lastSyncAt, pending: pendingPayload }),
            });

            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`);
            }

            const { synced, errors, serverAdds, serverGroups, allServerGroupIds, syncTime } = await res.json();

            // ---- Process synced items ----
            for (const clientId of (synced || [])) {
                await db.transactions.where('clientId').equals(clientId).modify({
                    syncStatus: 'SYNCED',
                    retryCount: 0,
                    lastError: null,
                    nextRetryAt: null,
                });
            }

            // ---- Process server errors ----
            for (const err of (errors || [])) {
                const tx = await db.transactions.get(err.clientId);
                if (!tx) continue;
                const retryCount = (tx.retryCount || 0) + 1;
                if (retryCount >= MAX_RETRIES) {
                    // Give up — mark permanently FAILED
                    await db.transactions.where('clientId').equals(err.clientId).modify({
                        syncStatus: 'FAILED',
                        retryCount,
                        lastError: err.error || 'Server rejected',
                    });
                } else {
                    // Will retry later
                    await db.transactions.where('clientId').equals(err.clientId).modify({
                        syncStatus: 'FAILED',
                        retryCount,
                        lastError: err.error || 'Sync error',
                        nextRetryAt: Date.now() + _getBackoffDelay(retryCount),
                    });
                }
            }

            // ---- Merge server transactions ----
            for (const tx of (serverAdds || [])) {
                // If it was deleted on the server, remove it locally
                if (tx.deleted) {
                    await db.transactions.delete(tx.clientId);
                    continue;
                }
                
                const existing = await db.transactions.get(tx.clientId);
                if (!existing) {
                    await db.transactions.put({
                        clientId: tx.clientId,
                        groupId: String(tx.groupId?._id || tx.groupId),
                        description: tx.description,
                        amount: tx.amount,
                        paidBy: String(tx.paidBy?._id || tx.paidBy),
                        receiverId: tx.receiverId ? String(tx.receiverId?._id || tx.receiverId) : undefined,
                        splits: tx.splits,
                        type: tx.type || 'EXPENSE',
                        splitType: tx.splitType || 'EQUAL',
                        status: tx.status || (tx.type === 'PAYMENT' ? 'PENDING' : 'PAID'),
                        syncStatus: 'SYNCED',
                        createdAt: tx.createdAt || new Date().toISOString(),
                    });
                } else if (existing.syncStatus === 'SYNCED') {
                    // Update existing synced records in case details changed
                    await db.transactions.update(tx.clientId, {
                        description: tx.description,
                        amount: tx.amount,
                        splits: tx.splits,
                        splitType: tx.splitType || 'EQUAL',
                        status: tx.status || (tx.type === 'PAYMENT' ? 'PENDING' : 'PAID')
                    });
                }
            }

            // ---- Merge server groups ----
            const serverGroupIds = [];
            for (const g of (serverGroups || [])) {
                const gId = String(g._id || g.id);
                serverGroupIds.push(gId);
                await db.groups.put({
                    id: gId,
                    name: g.name,
                    inviteCode: g.inviteCode || '',
                    adminId: g.adminId ? String(g.adminId) : '',
                    members: g.members || [],
                    description: g.description || '',
                    isArchived: g.isArchived || false,
                    lastActivityAt: g.lastActivityAt,
                });
            }

            // ---- Cleanup local groups not in the user's server-side group list ----
            // Use allServerGroupIds (all groups user belongs to) rather than serverGroupIds (only changed ones)
            const validGroupIds = (allServerGroupIds || []).map(String);
            if (validGroupIds.length > 0) {
                const localGroups = await db.groups.toArray();
                for (const lg of localGroups) {
                    if (!validGroupIds.includes(lg.id)) {
                        await db.groups.delete(lg.id);
                        // Cascade delete transactions locally
                        await db.transactions.where('groupId').equals(lg.id).delete();
                    }
                }
            }

            // ---- Update state ----
            _lastSyncAt = syncTime;
            localStorage.setItem('lastSyncAt', syncTime);
            UI.invalidateBalanceCache();

            const result = {
                synced: (synced || []).length,
                pulled: (serverAdds || []).length,
                failed: (errors || []).length,
                groups: (serverGroups || []).length,
            };

            console.log('[Sync] Complete:', result);
            UI.updateSyncIndicator('success', result);
            return result;

        } catch (err) {
            console.warn('[Sync] Failed:', err.message);

            // Mark all pending items for retry
            const pendingItems = await db.transactions
                .where('syncStatus').equals('PENDING')
                .toArray();

            for (const tx of pendingItems) {
                const retryCount = (tx.retryCount || 0) + 1;
                if (retryCount >= MAX_RETRIES) {
                    await db.transactions.where('clientId').equals(tx.clientId).modify({
                        syncStatus: 'FAILED',
                        retryCount,
                        lastError: err.message,
                    });
                } else {
                    await db.transactions.where('clientId').equals(tx.clientId).modify({
                        retryCount,
                        lastError: err.message,
                        nextRetryAt: Date.now() + _getBackoffDelay(retryCount),
                    });
                }
            }

            // Schedule retry with backoff
            _scheduleRetry();

            UI.updateSyncIndicator('error', { error: err.message });
            return null;
        } finally {
            _syncing = false;
        }
    }

    // ---- Retry Scheduler ----
    function _scheduleRetry() {
        if (_retryTimer) return; // Already scheduled
        _retryTimer = setTimeout(async () => {
            _retryTimer = null;
            const hasRetryable = await db.transactions
                .where('syncStatus').equals('FAILED')
                .filter(tx => (tx.retryCount || 0) < MAX_RETRIES)
                .count();
            if (hasRetryable > 0) {
                console.log('[Sync] Retrying failed items...');
                await syncWithServer();
            }
        }, BACKOFF_BASE * 4); // Base retry after 4 seconds
    }

    // ---- Retry all failed items (manual) ----
    async function retryFailed() {
        await db.transactions.where('syncStatus').equals('FAILED').modify({
            syncStatus: 'PENDING',
            retryCount: 0,
            lastError: null,
            nextRetryAt: null,
        });
        return syncWithServer();
    }

    // ---- Group Operations ----

    async function syncGroups() {
        const session = await Auth.getSession();
        if (!session) return [];

        try {
            const res = await fetch(`${API}/groups`, {
                headers: Auth.authHeader(session.token),
                cache: 'no-store'
            });
            if (!res.ok) return db.groups.toArray();

            const { groups } = await res.json();
            for (const g of groups) {
                const gId = String(g._id || g.id);
                await db.groups.put({
                    id: gId,
                    name: g.name,
                    inviteCode: g.inviteCode || '',
                    adminId: g.adminId ? String(g.adminId) : '',
                    members: g.members || [],
                    description: g.description || '',
                    isArchived: g.isArchived || false,
                    lastActivityAt: g.lastActivityAt,
                });
            }
            return groups.map((g) => ({
                ...g,
                id: String(g._id || g.id),
            }));
        } catch {
            return db.groups.toArray();
        }
    }

    async function createGroup(name) {
        const session = await Auth.getSession();
        if (!session) throw new Error('Not logged in.');

        const res = await fetch(`${API}/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...Auth.authHeader(session.token) },
            body: JSON.stringify({ action: 'create', name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const g = data.group;
        const gId = String(g._id || g.id);
        await db.groups.put({
            id: gId,
            name: g.name,
            inviteCode: g.inviteCode || '',
            adminId: g.adminId ? String(g.adminId) : '',
            members: g.members || [{ _id: session.user.id, name: session.user.name }],
            description: g.description || '',
            isArchived: g.isArchived || false,
            lastActivityAt: g.lastActivityAt,
        });
        return { ...g, id: gId };
    }

    async function joinGroup(inviteCode) {
        const session = await Auth.getSession();
        if (!session) throw new Error('Not logged in.');

        const res = await fetch(`${API}/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...Auth.authHeader(session.token) },
            body: JSON.stringify({ action: 'join', inviteCode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (data.pending) {
            return {
                pending: true,
                groupId: data.groupId,
                message: data.message || 'Join request sent. Waiting for admin approval.',
            };
        }

        const g = data.group;
        const gId = String(g._id || g.id);
        await db.groups.put({
            id: gId,
            name: g.name,
            inviteCode: g.inviteCode || '',
            adminId: g.adminId ? String(g.adminId) : '',
            members: g.members || [],
            description: g.description || '',
            isArchived: g.isArchived || false,
            lastActivityAt: g.lastActivityAt,
        });
        return { ...g, id: gId, pending: false };
    }

    async function addExpense({ groupId, description, amount, paidBy, splits, type, splitType, status }) {
        const clientId = crypto.randomUUID();
        const expense = {
            clientId,
            groupId,
            description,
            amount,
            paidBy,
            splits,
            type: type || 'EXPENSE',
            splitType: splitType || 'EQUAL',
            status: type === 'PAYMENT' ? 'PENDING' : 'PAID', // Defaults
            syncStatus: 'PENDING',
            retryCount: 0,
            createdAt: new Date().toISOString(),
        };
        await db.transactions.add(expense);
        UI.invalidateBalanceCache(groupId);
        return expense;
    }

    async function deleteExpense(clientId) {
        // Delete locally first
        await db.transactions.delete(clientId);
        UI.invalidateBalanceCache();

        // Push deletion to server using unique clientId
        if (navigator.onLine) {
            try {
                const session = await Auth.getSession();
                if (!session) return;
                await fetch(`/api/expenses/client/${clientId}`, {
                    method: 'DELETE',
                    headers: Auth.authHeader(session.token),
                });
            } catch (err) {
                console.warn('Failed to delete from server:', err.message);
            }
        }
    }

    async function updateSettlementStatus(clientId, serverId, status) {
        // Update locally
        await db.transactions.update(clientId, { status });
        UI.invalidateBalanceCache();

        // Push to server if online and we have serverId
        if (navigator.onLine && serverId) {
            try {
                const session = await Auth.getSession();
                if (!session) return;
                await fetch(`/api/expenses/${serverId}/settle-status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', ...Auth.authHeader(session.token) },
                    body: JSON.stringify({ status })
                });
            } catch (err) {
                console.warn('Failed to update status on server:', err.message);
                // In a perfect offline-first world, we would queue this state change.
                // For simplicity, we just rely on the next full sync or a manual retry if it was critical.
            }
        }
    }

    async function getGroupTransactions(groupId) {
        const all = await db.transactions.where('groupId').equals(groupId).toArray();
        return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    async function getPendingCount() {
        return db.transactions.where('syncStatus').equals('PENDING').count();
    }

    async function getFailedCount() {
        return db.transactions.where('syncStatus').equals('FAILED').count();
    }

    // ---- Group Management ----
    const GROUP_API = '/api/groups';

    async function getGroupDetail(groupId) {
        const session = await Auth.getSession();
        if (!session) throw new Error('Not logged in.');
        const res = await fetch(`${GROUP_API}/${groupId}`, {
            headers: Auth.authHeader(session.token),
            credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch group.');
        return data.group;
    }

    async function updateGroup(groupId, name, description) {
        const session = await Auth.getSession();
        if (!session) throw new Error('Not logged in.');
        const res = await fetch(`${GROUP_API}/${groupId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...Auth.authHeader(session.token) },
            credentials: 'include',
            body: JSON.stringify({ name, description }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update group.');
        return data.group;
    }

    async function archiveGroup(groupId) {
        const session = await Auth.getSession();
        if (!session) throw new Error('Not logged in.');
        const res = await fetch(`${GROUP_API}/${groupId}/archive`, {
            method: 'PATCH',
            headers: Auth.authHeader(session.token),
            credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to archive group.');
        await db.groups.update(groupId, { isArchived: true, lastActivityAt: new Date() });
        return data;
    }

    async function removeMember(groupId, userId) {
        const session = await Auth.getSession();
        if (!session) throw new Error('Not logged in.');
        const res = await fetch(`${GROUP_API}/${groupId}/members/${userId}`, {
            method: 'DELETE',
            headers: Auth.authHeader(session.token),
            credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to remove member.');
        return data.group;
    }

    async function leaveGroup(groupId) {
        const session = await Auth.getSession();
        if (!session) throw new Error('Not logged in.');
        const res = await fetch(`${GROUP_API}/${groupId}/leave`, {
            method: 'POST',
            headers: Auth.authHeader(session.token),
            credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to leave group.');
        await db.groups.delete(groupId);
        return data;
    }

    async function getJoinRequests(groupId) {
        const session = await Auth.getSession();
        if (!session) throw new Error('Not logged in.');
        const res = await fetch(`${GROUP_API}/${groupId}/join-requests`, {
            headers: Auth.authHeader(session.token),
            credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch join requests.');
        return data.requests || [];
    }

    async function approveJoinRequest(groupId, requestId) {
        const session = await Auth.getSession();
        if (!session) throw new Error('Not logged in.');
        const res = await fetch(`${GROUP_API}/${groupId}/join-requests/${requestId}/approve`, {
            method: 'POST',
            headers: Auth.authHeader(session.token),
            credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to approve join request.');
        return data.group;
    }

    async function rejectJoinRequest(groupId, requestId) {
        const session = await Auth.getSession();
        if (!session) throw new Error('Not logged in.');
        const res = await fetch(`${GROUP_API}/${groupId}/join-requests/${requestId}/reject`, {
            method: 'POST',
            headers: Auth.authHeader(session.token),
            credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to reject join request.');
        return data;
    }

    async function rotateInviteCode(groupId) {
        const session = await Auth.getSession();
        if (!session) throw new Error('Not logged in.');
        const res = await fetch(`${GROUP_API}/${groupId}/invite-code/rotate`, {
            method: 'POST',
            headers: Auth.authHeader(session.token),
            credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to regenerate invite code.');
        await db.groups.update(groupId, { inviteCode: data.inviteCode, lastActivityAt: new Date() });
        return data.inviteCode;
    }

    async function transferAdmin(groupId, newAdminUserId) {
        const session = await Auth.getSession();
        if (!session) throw new Error('Not logged in.');
        const res = await fetch(`${GROUP_API}/${groupId}/transfer-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...Auth.authHeader(session.token) },
            credentials: 'include',
            body: JSON.stringify({ newAdminUserId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to transfer admin role.');
        await db.groups.update(groupId, {
            adminId: String(data.group.adminId),
            members: data.group.members,
            lastActivityAt: data.group.lastActivityAt,
        });
        return data.group;
    }

    return {
        syncWithServer, syncGroups, createGroup, joinGroup,
        addExpense, updateSettlementStatus, deleteExpense, getGroupTransactions,
        getPendingCount, getFailedCount, retryFailed,
        isSyncInProgress, getLastSyncTime, checkActualConnectivity,
        getGroupDetail, updateGroup, archiveGroup, removeMember, leaveGroup,
        getJoinRequests, approveJoinRequest, rejectJoinRequest, rotateInviteCode,
        transferAdmin,
    };
})();

window.Sync = Sync;
