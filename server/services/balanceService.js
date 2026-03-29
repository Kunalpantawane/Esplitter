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

async function computeGroupBalances(groupId) {
    const group = await Group.findById(groupId)
        .populate('members', 'name email')
        .lean();

    if (!group) return null;

    const [aggregation] = await Transaction.aggregate([
        {
            $match: {
                groupId: group._id,
                deleted: { $ne: true },
                $or: [
                    { type: { $ne: 'PAYMENT' } },
                    { status: { $ne: 'PENDING' } },
                ],
            },
        },
        {
            $facet: {
                paid: [
                    {
                        $group: {
                            _id: '$paidBy',
                            moneyPaid: { $sum: '$amount' },
                        },
                    },
                ],
                owed: [
                    { $unwind: '$splits' },
                    {
                        $group: {
                            _id: '$splits.userId',
                            moneyOwed: { $sum: '$splits.amount' },
                        },
                    },
                ],
            },
        },
    ]);

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

    (aggregation?.paid || []).forEach((row) => {
        const memberId = String(row._id);
        if (!balances[memberId]) return;
        const paid = Number(row.moneyPaid) || 0;
        balances[memberId].moneyPaid += paid;
        netByUserId[memberId] += paid;
    });

    (aggregation?.owed || []).forEach((row) => {
        const memberId = String(row._id);
        if (!balances[memberId]) return;
        const owed = Number(row.moneyOwed) || 0;
        balances[memberId].moneyOwed += owed;
        netByUserId[memberId] -= owed;
    });

    Object.keys(balances).forEach((memberId) => {
        const paid = balances[memberId].moneyPaid;
        const owed = balances[memberId].moneyOwed;
        balances[memberId].moneyPaid = +paid.toFixed(2);
        balances[memberId].moneyOwed = +owed.toFixed(2);
        balances[memberId].balance = +(paid - owed).toFixed(2);
    });

    const pairwiseDebts = simplifyDebts(netByUserId);
    const isSettled = Object.values(balances).every((entry) => Math.abs(entry.balance) < 0.01);

    return {
        group,
        balances,
        pairwiseDebts,
        memberCount: (group.members || []).length,
        isSettled,
    };
}

module.exports = {
    computeGroupBalances,
};
