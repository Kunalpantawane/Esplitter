/**
 * tests/integration/user.test.js — User profile route regression tests
 */

const { app, request, registerUser, setupDatabase } = require('../setup');

jest.setTimeout(120000);
setupDatabase();

describe('User Routes', () => {
    test('get profile returns authenticated user', async () => {
        const user = await registerUser('user');

        const res = await request(app)
            .get('/api/user/profile')
            .set('Authorization', `Bearer ${user.token}`);

        expect(res.statusCode).toBe(200);
        expect(String(res.body.id)).toBe(user.id);
        expect(res.body.email).toBe(user.profile.email);
        expect(res.body.upiId).toBe(user.profile.upiId);
    });

    test('update profile accepts name and phone', async () => {
        const user = await registerUser('profile');

        const res = await request(app)
            .put('/api/user/profile')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ name: 'Updated Name', phone: 9876543210 });

        expect(res.statusCode).toBe(200);
        expect(res.body.name).toBe('Updated Name');
        expect(res.body.phone).toBe('9876543210');
    });

    test('update profile rejects empty payload', async () => {
        const user = await registerUser('empty');

        const res = await request(app)
            .put('/api/user/profile')
            .set('Authorization', `Bearer ${user.token}`)
            .send({});

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/No fields to update/i);
    });

    test('update upi id normalizes lowercase and validates', async () => {
        const user = await registerUser('upi');

        const okRes = await request(app)
            .put('/api/user/upi-id')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ upiId: 'New.UPI@Bank' });

        expect(okRes.statusCode).toBe(200);
        expect(okRes.body.upiId).toBe('new.upi@bank');

        const badRes = await request(app)
            .put('/api/user/upi-id')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ upiId: 'invalid upi' });

        expect(badRes.statusCode).toBe(400);
    });
});
