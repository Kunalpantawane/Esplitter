/**
 * tests/integration/personal-budget-category.test.js — coverage for personal tracker routes
 */

const { app, request, registerUser, setupDatabase } = require('../setup');

jest.setTimeout(120000);
setupDatabase();

describe('Personal Expense + Category + Budget Routes', () => {
    test('category create/list/delete flow works', async () => {
        const user = await registerUser('cat');

        const createRes = await request(app)
            .post('/api/categories')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ name: 'Books', color: '#123456', icon: 'B' });

        expect(createRes.statusCode).toBe(201);
        const categoryId = createRes.body.category._id;

        const duplicateRes = await request(app)
            .post('/api/categories')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ name: 'books' });

        expect(duplicateRes.statusCode).toBe(409);

        const listRes = await request(app)
            .get('/api/categories')
            .set('Authorization', `Bearer ${user.token}`);

        expect(listRes.statusCode).toBe(200);
        expect(listRes.body.categories.some((c) => c.name === 'Books')).toBe(true);

        const deleteRes = await request(app)
            .delete(`/api/categories/${categoryId}`)
            .set('Authorization', `Bearer ${user.token}`);

        expect(deleteRes.statusCode).toBe(200);
        expect(deleteRes.body.success).toBe(true);
    });

    test('budget set/list/delete flow works', async () => {
        const user = await registerUser('budget');
        const month = '2026-04';

        const setRes = await request(app)
            .post('/api/budgets')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ category: 'Food', amount: 5000, month });

        expect(setRes.statusCode).toBe(200);
        const budgetId = setRes.body.budget._id;

        const listRes = await request(app)
            .get(`/api/budgets?month=${month}`)
            .set('Authorization', `Bearer ${user.token}`);

        expect(listRes.statusCode).toBe(200);
        expect(listRes.body.budgets.length).toBe(1);
        expect(listRes.body.budgets[0].category).toBe('Food');

        const deleteRes = await request(app)
            .delete(`/api/budgets/${budgetId}`)
            .set('Authorization', `Bearer ${user.token}`);

        expect(deleteRes.statusCode).toBe(200);
        expect(deleteRes.body.success).toBe(true);
    });

    test('personal expense sync/list/delete flow works', async () => {
        const user = await registerUser('personal');
        const clientId = `pe-${Date.now()}`;

        const syncRes = await request(app)
            .post('/api/personal-expenses/sync')
            .set('Authorization', `Bearer ${user.token}`)
            .send({
                pending: [
                    {
                        clientId,
                        amount: 199,
                        category: 'Food',
                        description: 'Lunch',
                        date: new Date().toISOString(),
                        paymentMethod: 'cash',
                        notes: 'test',
                    },
                ],
            });

        expect(syncRes.statusCode).toBe(200);
        expect(syncRes.body.synced).toContain(clientId);

        const listRes = await request(app)
            .get('/api/personal-expenses')
            .set('Authorization', `Bearer ${user.token}`);

        expect(listRes.statusCode).toBe(200);
        expect(listRes.body.expenses.length).toBe(1);
        expect(listRes.body.expenses[0].clientId).toBe(clientId);

        const deleteRes = await request(app)
            .delete(`/api/personal-expenses/${clientId}`)
            .set('Authorization', `Bearer ${user.token}`);

        expect(deleteRes.statusCode).toBe(200);

        const listAfterDeleteRes = await request(app)
            .get('/api/personal-expenses')
            .set('Authorization', `Bearer ${user.token}`);

        expect(listAfterDeleteRes.statusCode).toBe(200);
        expect(listAfterDeleteRes.body.expenses.length).toBe(0);
    });
});
