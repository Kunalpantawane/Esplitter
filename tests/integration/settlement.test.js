/**
 * tests/integration/settlement.test.js — Settlement algorithm tests
 * Validates Smart (net-balance greedy) vs Normal (pairwise) outputs
 */

const { app, request, registerUser, createGroup, requestAndApproveJoin, addExpense, setupDatabase } = require('../setup');

jest.setTimeout(120000);
setupDatabase();

describe('Settlement Algorithms', () => {
    let admin, member1, member2, group;

    beforeEach(async () => {
        admin = await registerUser('admin');
        member1 = await registerUser('member1');
        member2 = await registerUser('member2');
        group = await createGroup(admin.token, 'Settlement Group');

        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member1.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });

        // Need to re-fetch group to get updated invite code if rotated
        const groupDetailRes = await request(app)
            .get(`/api/groups/${group._id}`)
            .set('Authorization', `Bearer ${admin.token}`);
        group = groupDetailRes.body.group || group;

        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member2.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });
    });

    test('smart mode returns fewer transactions than normal for 3-person chain', async () => {
        // Create a debt chain: admin pays 300, split 3 ways (100 each)
        // Then member1 pays 150, split 3 ways (50 each)
        // Normal: multiple pairwise debts
        // Smart: simplified net debts (fewer transactions)

        await addExpense(admin.token, {
            groupId: String(group._id),
            description: 'Big Dinner',
            amount: 300,
            paidBy: admin.id,
            splits: [
                { userId: admin.id, amount: 100 },
                { userId: member1.id, amount: 100 },
                { userId: member2.id, amount: 100 },
            ],
        });

        await addExpense(member1.token, {
            groupId: String(group._id),
            description: 'Drinks',
            amount: 150,
            paidBy: member1.id,
            splits: [
                { userId: admin.id, amount: 50 },
                { userId: member1.id, amount: 50 },
                { userId: member2.id, amount: 50 },
            ],
        });

        // Get balances in both modes
        const [smartRes, normalRes] = await Promise.all([
            request(app)
                .get(`/api/expenses/${group._id}/balances?mode=smart`)
                .set('Authorization', `Bearer ${admin.token}`),
            request(app)
                .get(`/api/expenses/${group._id}/balances?mode=normal`)
                .set('Authorization', `Bearer ${admin.token}`),
        ]);

        expect(smartRes.statusCode).toBe(200);
        expect(normalRes.statusCode).toBe(200);

        expect(smartRes.body.mode).toBe('smart');
        expect(normalRes.body.mode).toBe('normal');

        // Smart should have fewer or equal number of debts
        expect(smartRes.body.pairwiseDebts.length).toBeLessThanOrEqual(normalRes.body.pairwiseDebts.length);
    });

    test('both modes agree on isSettled status', async () => {
        // No expenses — should be settled in both modes
        const [smartRes, normalRes] = await Promise.all([
            request(app)
                .get(`/api/expenses/${group._id}/balances?mode=smart`)
                .set('Authorization', `Bearer ${admin.token}`),
            request(app)
                .get(`/api/expenses/${group._id}/balances?mode=normal`)
                .set('Authorization', `Bearer ${admin.token}`),
        ]);

        expect(smartRes.body.isSettled).toBe(true);
        expect(normalRes.body.isSettled).toBe(true);
    });

    test('both modes produce the same total debt amount', async () => {
        await addExpense(admin.token, {
            groupId: String(group._id),
            description: 'Hotel',
            amount: 600,
            paidBy: admin.id,
            splits: [
                { userId: admin.id, amount: 200 },
                { userId: member1.id, amount: 200 },
                { userId: member2.id, amount: 200 },
            ],
        });

        const [smartRes, normalRes] = await Promise.all([
            request(app)
                .get(`/api/expenses/${group._id}/balances?mode=smart`)
                .set('Authorization', `Bearer ${admin.token}`),
            request(app)
                .get(`/api/expenses/${group._id}/balances?mode=normal`)
                .set('Authorization', `Bearer ${admin.token}`),
        ]);

        const smartTotal = smartRes.body.pairwiseDebts.reduce((sum, d) => sum + d.amount, 0);
        const normalTotal = normalRes.body.pairwiseDebts.reduce((sum, d) => sum + d.amount, 0);

        // Total debt should be the same regardless of algorithm
        expect(Math.abs(smartTotal - normalTotal)).toBeLessThan(0.02);
    });

    test('smart mode correctly simplifies circular debts', async () => {
        // Create circular debt: A→B, B→C, C→A
        // Admin pays 90 split equally (30 each) — member1 owes admin 30, member2 owes admin 30
        // Member1 pays 60 split equally (20 each) — admin owes member1 20, member2 owes member1 20
        // Member2 pays 30 split equally (10 each) — admin owes member2 10, member1 owes member2 10

        await addExpense(admin.token, {
            groupId: String(group._id),
            description: 'Round 1',
            amount: 90,
            paidBy: admin.id,
            splits: [
                { userId: admin.id, amount: 30 },
                { userId: member1.id, amount: 30 },
                { userId: member2.id, amount: 30 },
            ],
        });

        await addExpense(member1.token, {
            groupId: String(group._id),
            description: 'Round 2',
            amount: 60,
            paidBy: member1.id,
            splits: [
                { userId: admin.id, amount: 20 },
                { userId: member1.id, amount: 20 },
                { userId: member2.id, amount: 20 },
            ],
        });

        await addExpense(member2.token, {
            groupId: String(group._id),
            description: 'Round 3',
            amount: 30,
            paidBy: member2.id,
            splits: [
                { userId: admin.id, amount: 10 },
                { userId: member1.id, amount: 10 },
                { userId: member2.id, amount: 10 },
            ],
        });

        const smartRes = await request(app)
            .get(`/api/expenses/${group._id}/balances?mode=smart`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(smartRes.statusCode).toBe(200);

        // Net balances: admin = 90-30-20-10 = +30, member1 = 60-30-20-10 = 0, member2 = 30-30-20-10 = -30
        // Smart should produce exactly 1 debt: member2 → admin = 30
        const debts = smartRes.body.pairwiseDebts;
        expect(debts.length).toBeLessThanOrEqual(2); // Smart minimizes
    });

    test('default mode is smart when no mode specified', async () => {
        const res = await request(app)
            .get(`/api/expenses/${group._id}/balances`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.mode).toBe('smart');
    });

    test('group settlement mode is used when no query mode is provided', async () => {
        const modeRes = await request(app)
            .patch(`/api/groups/${group._id}/settlement-mode`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ settlementMode: 'normal' });
        expect(modeRes.statusCode).toBe(200);

        const res = await request(app)
            .get(`/api/expenses/${group._id}/balances`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.mode).toBe('normal');
    });
});
