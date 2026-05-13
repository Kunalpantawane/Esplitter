// db.js - IndexedDB via Dexie.js (loaded from CDN, available as window.Dexie)

const db = new Dexie('esplitterDB');

db.version(1).stores({
    // Local user session
    session: 'id',
    // Groups the user belongs to
    groups: 'id, name, inviteCode',
    // All transactions (synced and pending)
    transactions: 'clientId, groupId, syncStatus, createdAt',
});

// v2: Add retryCount + lastError for sync retry tracking
db.version(2).stores({
    session: 'id',
    groups: 'id, name, inviteCode',
    transactions: 'clientId, groupId, syncStatus, createdAt, retryCount',
});

// v3: Personal expense tracker stores
db.version(3).stores({
    session: 'id',
    groups: 'id, name, inviteCode',
    transactions: 'clientId, groupId, syncStatus, createdAt, retryCount',
    personalExpenses: 'clientId, category, date, syncStatus, paymentMethod',
    categories: 'id, name, isDefault',
    budgets: 'id, category, month',
});

// v4: Add group settlement mode to support shared smart/normal configuration
db.version(4).stores({
    session: 'id',
    groups: 'id, name, inviteCode, settlementMode',
    transactions: 'clientId, groupId, syncStatus, createdAt, retryCount',
    personalExpenses: 'clientId, category, date, syncStatus, paymentMethod',
    categories: 'id, name, isDefault',
    budgets: 'id, category, month',
});

// Expose globally
window.db = db;
