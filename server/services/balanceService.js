const Group = require('../models/Group');
const Transaction = require('../models/Transaction');

function simplifyDebts(netByUserId) {
    const creditors = [];
    const debtors = [];

    Object.entries(netByUserId).forEach(([userId, amount]) => {
        if (amount > 0.01) creditors.push({ userId, amount });
        if (amount < -0.01) debtors.push({ userId, amount: Math.abs(amount) });
    });

    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const pairwiseDebts = [];
    let c = 0;
    let d = 0;

    while (c < creditors.length && d < debtors.length) {
        const settledAmount = Math.min(creditors[c].amount, debtors[d].amount);
        if (settledAmount > 0.01) {
            pairwiseDebts.push({
                from: debtors[d].userId,
                to: creditors[c].userId,
                amount: +settledAmount.toFixed(2),
            });
        }

        creditors[c].amount -= settledAmount;
        debtors[d].amount -= settledAmount;

        if (creditors[c].amount < 0.01) c += 1;
        if (debtors[d].amount < 0.01) d += 1;
    }

    return pairwiseDebts;
}

function buildBalanceMap(group) {
    const balances = {};
    const netByUserId = {};

    (group.members || []).forEach((member) => {
        const memberId = String(member._id);
        balances[memberId] = {
            name: member.name,
            moneyPaid: 0,
            moneyOwed: 0,
            balance: 0,
        };
        netByUserId[memberId] = 0;
    });

    return { balances, netByUserId };
}

function applyTransactionToBalances(tx, balances, netByUserId) {
    const amount = Number(tx.amount) || 0;
    const payerId = String(tx.paidBy);

    if (balances[payerId]) {
        balances[payerId].moneyPaid += amount;
        netByUserId[payerId] += amount;
    }

    if ((tx.type || 'EXPENSE') === 'PAYMENT') {
        const creditorId = tx.splits && tx.splits.length > 0
            ? String(tx.splits[0].userId)
            : (tx.receiverId ? String(tx.receiverId) : null);

        if (creditorId && balances[creditorId]) {
            balances[creditorId].moneyOwed += amount;
            netByUserId[creditorId] -= amount;
        }
        return;
    }

    for (const split of (tx.splits || [])) {
        const memberId = String(split.userId);
        const owed = Number(split.amount) || 0;
        if (!balances[memberId]) continue;
        balances[memberId].moneyOwed += owed;
        netByUserId[memberId] -= owed;
    }
}

function buildNormalPairwiseDebts(transactions, userIds = []) {
    const owes = {};

    const addDebt = (from, to, amount) => {
        if (!from || !to || amount <= 0.01) return;
        owes[from] = owes[from] || {};
        owes[from][to] = (owes[from][to] || 0) + amount;
    };

    for (const tx of transactions) {
        const amount = Number(tx.amount) || 0;
        const payerId = String(tx.paidBy);

        if ((tx.type || 'EXPENSE') === 'PAYMENT') {
            const creditorId = tx.splits && tx.splits.length > 0
                ? String(tx.splits[0].userId)
                : (tx.receiverId ? String(tx.receiverId) : null);
            if (creditorId && creditorId !== payerId) {
                addDebt(payerId, creditorId, amount);
            }
            continue;
        }

        for (const split of (tx.splits || [])) {
            const memberId = String(split.userId);
            const owed = Number(split.amount) || 0;
            if (!memberId || memberId === payerId || owed <= 0.01) continue;
            addDebt(memberId, payerId, owed);
        }
    }

    const allUserIds = Array.from(new Set([
        ...userIds.map(String),
        ...Object.keys(owes),
    ])).sort();
    const pairwiseDebts = [];
    const seen = new Set();

    for (let i = 0; i < allUserIds.length; i += 1) {
        for (let j = i + 1; j < allUserIds.length; j += 1) {
            const a = allUserIds[i];
            const b = allUserIds[j];
            const key = `${a}:${b}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const aToB = (owes[a] && owes[a][b]) || 0;
            const bToA = (owes[b] && owes[b][a]) || 0;
            const net = +(aToB - bToA).toFixed(2);

            if (net > 0.01) {
                pairwiseDebts.push({ from: a, to: b, amount: net });
            } else if (net < -0.01) {
                pairwiseDebts.push({ from: b, to: a, amount: +Math.abs(net).toFixed(2) });
            }
        }
    }

    return pairwiseDebts.sort((left, right) => right.amount - left.amount);
}

async function computeGroupBalances(groupId, options = {}) {
    const group = await Group.findById(groupId)
        .populate('members', 'name email')
        .lean();

    if (!group) return null;

    const mode = (options.mode === 'normal' || options.mode === 'smart')
        ? options.mode
        : (group.settlementMode || 'smart');

    const transactions = await Transaction.find({
        groupId: group._id,
        deleted: { $ne: true },
        $or: [
            { type: { $ne: 'PAYMENT' } },
            { status: { $ne: 'PENDING' } },
        ],
    })
        .select('paidBy amount splits type status receiverId')
        .lean();

    const { balances, netByUserId } = buildBalanceMap(group);

    for (const tx of transactions) {
        applyTransactionToBalances(tx, balances, netByUserId);
    }

    Object.keys(balances).forEach((memberId) => {
        const paid = balances[memberId].moneyPaid;
        const owed = balances[memberId].moneyOwed;
        balances[memberId].moneyPaid = +paid.toFixed(2);
        balances[memberId].moneyOwed = +owed.toFixed(2);
        balances[memberId].balance = +(paid - owed).toFixed(2);
    });

    const pairwiseDebts = mode === 'normal'
        ? buildNormalPairwiseDebts(transactions, Object.keys(balances))
        : simplifyDebts(netByUserId);
    const isSettled = Object.values(balances).every((entry) => Math.abs(entry.balance) < 0.01);

    return {
        group,
        balances,
        pairwiseDebts,
        memberCount: (group.members || []).length,
        isSettled,
        mode,
    };
}

module.exports = {
    computeGroupBalances,
};
