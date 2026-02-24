// sync.js - Offline-first sync logic (uses window.db, window.Auth)

const Sync = (() => {
    const API = '/api/sync';

    // Push pending + pull new from server
    async function syncWithServer() {
        const session = await Auth.getSession();
        if (!session) return;

        const pending = await db.transactions.where('syncStatus').equals('PENDING').toArray();
        const pendingPayload = pending.map((tx) => ({
            clientId: tx.clientId,
            groupId: tx.groupId,
            description: tx.description,
            amount: tx.amount,
            paidBy: tx.paidBy,
            splits: tx.splits,
            type: tx.type || 'EXPENSE',
        }));

        const lastSyncAt = localStorage.getItem('lastSyncAt') || null;

        try {
            const res = await fetch(API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...Auth.authHeader(session.token),
                },
                body: JSON.stringify({ lastSyncAt, pending: pendingPayload }),
            });

            if (!res.ok) return null;
            const { synced, serverAdds, syncTime } = await res.json();

            // Mark synced as SYNCED
            for (const clientId of synced) {
                await db.transactions.where('clientId').equals(clientId).modify({ syncStatus: 'SYNCED' });
            }

            // Save new server records locally
            for (const tx of serverAdds) {
                const existing = await db.transactions.get(tx.clientId);
                if (!existing) {
                    await db.transactions.put({
                        clientId: tx.clientId,
                        groupId: String(tx.groupId?._id || tx.groupId),
                        description: tx.description,
                        amount: tx.amount,
                        paidBy: String(tx.paidBy?._id || tx.paidBy),
                        splits: tx.splits,
                        type: tx.type || 'EXPENSE',
                        syncStatus: 'SYNCED',
                        createdAt: tx.createdAt || new Date().toISOString(),
                    });
                }
            }

            localStorage.setItem('lastSyncAt', syncTime);
            return { synced: synced.length, pulled: serverAdds.length };
        } catch (err) {
            console.warn('Sync failed (offline?):', err.message);
            return null;
        }
    }

    // Fetch groups from server, cache locally
    async function syncGroups() {
        const session = await Auth.getSession();
        if (!session) return [];

        try {
            const res = await fetch(`${API}/groups`, {
                headers: Auth.authHeader(session.token),
            });
            if (!res.ok) return db.groups.toArray();

            const { groups } = await res.json();
            for (const g of groups) {
                await db.groups.put({
                    id: String(g._id),
                    name: g.name,
                    inviteCode: g.inviteCode,
                    adminId: String(g.adminId),
                    members: g.members,
                    lastActivityAt: g.lastActivityAt,
                });
            }
            return groups.map((g) => ({ ...g, id: String(g._id) }));
        } catch {
            return db.groups.toArray();
        }
    }

    // Create group on server
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
        await db.groups.put({
            id: String(g._id),
            name: g.name,
            inviteCode: g.inviteCode,
            adminId: String(g.adminId),
            members: g.members || [{ _id: session.user.id, name: session.user.name }],
            lastActivityAt: g.lastActivityAt,
        });
        return { ...g, id: String(g._id) };
    }

    // Join group via invite code
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

        const g = data.group;
        await db.groups.put({
            id: String(g._id),
            name: g.name,
            inviteCode: g.inviteCode,
            adminId: String(g.adminId),
            members: g.members,
            lastActivityAt: g.lastActivityAt,
        });
        return { ...g, id: String(g._id) };
    }

    // Add expense offline-first
    async function addExpense({ groupId, description, amount, paidBy, splits, type }) {
        const clientId = crypto.randomUUID();
        const expense = {
            clientId,
            groupId,
            description,
            amount,
            paidBy,
            splits,
            type: type || 'EXPENSE',
            syncStatus: 'PENDING',
            createdAt: new Date().toISOString(),
        };
        await db.transactions.add(expense);
        return expense;
    }

    // Settle a debt — creates a PAYMENT type transaction
    async function settleDebt({ groupId, fromUserId, toUserId, toUserName, amount }) {
        return addExpense({
            groupId,
            description: `💸 Settlement to ${toUserName}`,
            amount,
            paidBy: fromUserId,
            splits: [{ userId: toUserId, amount }],
            type: 'PAYMENT',
        });
    }

    async function getGroupTransactions(groupId) {
        const all = await db.transactions.where('groupId').equals(groupId).toArray();
        return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    async function getPendingCount() {
        return db.transactions.where('syncStatus').equals('PENDING').count();
    }

    return { syncWithServer, syncGroups, createGroup, joinGroup, addExpense, settleDebt, getGroupTransactions, getPendingCount };
})();

window.Sync = Sync;
