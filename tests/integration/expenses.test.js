/**
 * tests/integration/expenses.test.js — Expense CRUD regression tests
 * Covers: create expense, list, delete, balance derivation, sync idempotency
 */

const { app, request, registerUser, createGroup, requestAndApproveJoin, addExpense, setupDatabase } = require('../setup');
const Transaction = require('../../server/models/Transaction');

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

    test('sync push validates splits before creating an expense', async () => {
        const clientId = 'bad-sync-split-' + Date.now();

        const res = await request(app)
            .post('/api/sync')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                pending: [{
                    clientId,
                    groupId: String(group._id),
                    description: 'Bad Offline Split',
                    amount: 100,
                    paidBy: admin.id,
                    splits: [
                        { userId: admin.id, amount: 30 },
                        { userId: member.id, amount: 30 },
                    ],
                    type: 'EXPENSE',
                }],
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ clientId }),
        ]));
        expect(await Transaction.findOne({ clientId })).toBeNull();
    });

    test('sync cannot delete an expense paid by another group member', async () => {
        const createRes = await addExpense(admin.token, {
            groupId: String(group._id),
            description: 'Protected Expense',
            amount: 40,
            paidBy: admin.id,
            splits: [
                { userId: admin.id, amount: 20 },
                { userId: member.id, amount: 20 },
            ],
        });
        const clientId = createRes.body.transaction.clientId;

        const res = await request(app)
            .post('/api/sync')
            .set('Authorization', `Bearer ${member.token}`)
            .send({
                pending: [{ clientId, groupId: String(group._id), deleted: true }],
            });

        expect(res.body.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ clientId }),
        ]));
        const stored = await Transaction.findOne({ clientId });
        expect(stored.deleted).toBe(false);
    });

    test('sync cannot create a payment that is already confirmed', async () => {
        const clientId = 'forged-confirmed-payment-' + Date.now();

        const res = await request(app)
            .post('/api/sync')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                pending: [{
                    clientId,
                    groupId: String(group._id),
                    description: 'Forged Confirmation',
                    amount: 20,
                    paidBy: member.id,
                    splits: [{ userId: admin.id, amount: 20 }],
                    type: 'PAYMENT',
                    status: 'CONFIRMED',
                }],
            });

        expect(res.body.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ clientId }),
        ]));
        expect(await Transaction.findOne({ clientId })).toBeNull();
    });

    test('online payment creation cannot skip the confirmation flow', async () => {
        const res = await request(app)
            .post('/api/expenses')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                clientId: 'online-forged-payment-' + Date.now(),
                groupId: String(group._id),
                description: 'Forged Online Confirmation',
                amount: 20,
                paidBy: member.id,
                splits: [{ userId: admin.id, amount: 20 }],
                type: 'PAYMENT',
                status: 'CONFIRMED',
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/start as PENDING/);
    });

    test('sync requires debtor payment before creditor confirmation', async () => {
        const clientId = 'protected-payment-' + Date.now();
        const payment = {
            clientId,
            groupId: String(group._id),
            description: 'Offline Repayment',
            amount: 20,
            paidBy: member.id,
            splits: [{ userId: admin.id, amount: 20 }],
            type: 'PAYMENT',
            status: 'PENDING',
        };

        const createRes = await request(app)
            .post('/api/sync')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ pending: [payment] });
        expect(createRes.body.synced).toContain(clientId);

        const forgedRes = await request(app)
            .post('/api/sync')
            .set('Authorization', `Bearer ${member.token}`)
            .send({ pending: [{ ...payment, status: 'CONFIRMED' }] });
        expect(forgedRes.body.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ clientId }),
        ]));
        expect((await Transaction.findOne({ clientId })).status).toBe('PENDING');

        const paidRes = await request(app)
            .post('/api/sync')
            .set('Authorization', `Bearer ${member.token}`)
            .send({ pending: [{ ...payment, status: 'PAID' }] });
        expect(paidRes.body.synced).toContain(clientId);
        expect((await Transaction.findOne({ clientId })).status).toBe('PAID');

        const validRes = await request(app)
            .post('/api/sync')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ pending: [{ ...payment, status: 'CONFIRMED' }] });
        expect(validRes.body.synced).toContain(clientId);
        expect((await Transaction.findOne({ clientId })).status).toBe('CONFIRMED');
    });

    test('sync pull cursor returns every transaction before advancing its window', async () => {
        const clientIds = [];
        for (let i = 0; i < 3; i += 1) {
            const created = await addExpense(admin.token, {
                groupId: String(group._id),
                description: `Paged ${i}`,
                amount: 10,
                paidBy: admin.id,
                splits: [
                    { userId: admin.id, amount: 5 },
                    { userId: member.id, amount: 5 },
                ],
            });
            clientIds.push(created.body.transaction.clientId);
        }

        const first = await request(app)
            .post('/api/sync')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ pending: [], limit: 2 });

        expect(first.body.serverAdds).toHaveLength(2);
        expect(first.body.hasMore).toBe(true);
        expect(first.body.nextCursor).toBeTruthy();

        const second = await request(app)
            .post('/api/sync')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                pending: [],
                limit: 2,
                cursor: first.body.nextCursor,
                syncWindowEnd: first.body.syncTime,
            });

        expect(second.body.hasMore).toBe(false);
        const receivedIds = first.body.serverAdds.concat(second.body.serverAdds)
            .map((tx) => tx.clientId);
        expect(receivedIds.sort()).toEqual(clientIds.sort());
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
