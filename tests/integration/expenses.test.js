/**
 * tests/integration/expenses.test.js — Expense CRUD regression tests
 * Covers: create expense, list, delete, balance derivation, sync idempotency
 */

const { app, request, registerUser, createGroup, requestAndApproveJoin, addExpense, setupDatabase } = require('../setup');

jest.setTimeout(120000);
setupDatabase();

describe('Expense CRUD', () => {
    let admin, member, group;

    beforeEach(async () => {
        admin = await registerUser('admin');
        member = await registerUser('member');
        group = await createGroup(admin.token, 'Expense Group');
        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });
    });

    test('create expense with equal split', async () => {
        const res = await addExpense(admin.token, {
            groupId: String(group._id),
            description: 'Lunch',
            amount: 100,
            paidBy: admin.id,
            splits: [
                { userId: admin.id, amount: 50 },
                { userId: member.id, amount: 50 },
            ],
        });

        expect(res.statusCode).toBe(201);
        expect(res.body.transaction.amount).toBe(100);
        expect(res.body.transaction.splits.length).toBe(2);
    });

    test('create expense validates splits sum', async () => {
        const res = await addExpense(admin.token, {
            groupId: String(group._id),
            description: 'Bad Split',
            amount: 100,
            paidBy: admin.id,
            splits: [
                { userId: admin.id, amount: 30 },
                { userId: member.id, amount: 30 },
            ],
        });

        // Should reject — splits don't sum to amount
        expect(res.statusCode).toBe(400);
    });

    test('list expenses returns group transactions', async () => {
        await addExpense(admin.token, {
            groupId: String(group._id),
            description: 'Item 1',
            amount: 50,
            paidBy: admin.id,
            splits: [
                { userId: admin.id, amount: 25 },
                { userId: member.id, amount: 25 },
            ],
        });

        await addExpense(admin.token, {
            groupId: String(group._id),
            description: 'Item 2',
            amount: 80,
            paidBy: member.id,
            splits: [
                { userId: admin.id, amount: 40 },
                { userId: member.id, amount: 40 },
            ],
        });

        const res = await request(app)
            .get(`/api/expenses/${group._id}`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.transactions.length).toBe(2);
    });

    test('delete expense removes it and resets balances', async () => {
        const createRes = await addExpense(admin.token, {
            groupId: String(group._id),
            description: 'To Delete',
            amount: 60,
            paidBy: admin.id,
            splits: [
                { userId: admin.id, amount: 30 },
                { userId: member.id, amount: 30 },
            ],
        });

        const txId = createRes.body.transaction._id;

        const delRes = await request(app)
            .delete(`/api/expenses/${txId}`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(delRes.statusCode).toBe(200);

        // Balances should be zero
        const balRes = await request(app)
            .get(`/api/expenses/${group._id}/balances`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(balRes.statusCode).toBe(200);
        expect(balRes.body.balances[admin.id].amount).toBe(0);
        expect(balRes.body.balances[member.id].amount).toBe(0);
    });

    test('balances are correctly derived after expenses', async () => {
        await addExpense(admin.token, {
            groupId: String(group._id),
            description: 'Dinner',
            amount: 100,
            paidBy: admin.id,
            splits: [
                { userId: admin.id, amount: 50 },
                { userId: member.id, amount: 50 },
            ],
        });

        const res = await request(app)
            .get(`/api/expenses/${group._id}/balances`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.balances[admin.id].amount).toBe(50);
        expect(res.body.balances[member.id].amount).toBe(-50);
        expect(res.body.isSettled).toBe(false);
    });

    test('sync push creates transaction idempotently', async () => {
        const clientId = 'test-sync-' + Date.now();

        const syncRes1 = await request(app)
            .post('/api/sync')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                pending: [{
                    clientId,
                    groupId: String(group._id),
                    description: 'Synced Expense',
                    amount: 40,
                    paidBy: admin.id,
                    splits: [
                        { userId: admin.id, amount: 20 },
                        { userId: member.id, amount: 20 },
                    ],
                    splitType: 'CUSTOM',
                    type: 'EXPENSE',
                }],
            });

        expect(syncRes1.statusCode).toBe(200);
        expect(syncRes1.body.synced).toContain(clientId);

        // Second push with same clientId — should still succeed (idempotent)
        const syncRes2 = await request(app)
            .post('/api/sync')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                pending: [{
                    clientId,
                    groupId: String(group._id),
                    description: 'Synced Expense',
                    amount: 40,
                    paidBy: admin.id,
                    splits: [
                        { userId: admin.id, amount: 20 },
                        { userId: member.id, amount: 20 },
                    ],
                    splitType: 'CUSTOM',
                    type: 'EXPENSE',
                }],
            });

        expect(syncRes2.statusCode).toBe(200);
        expect(syncRes2.body.synced).toContain(clientId);
    });

    test('non-member cannot add expense to group', async () => {
        const outsider = await registerUser('outsider');

        const res = await addExpense(outsider.token, {
            groupId: String(group._id),
            description: 'Sneaky',
            amount: 50,
            paidBy: outsider.id,
            splits: [{ userId: outsider.id, amount: 50 }],
        });

        expect(res.statusCode).toBe(403);
    });
});
