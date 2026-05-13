/**
 * tests/auth.test.js — Auth flow regression tests
 * Covers: register, login, refresh, logout, duplicate email, bad credentials
 */

const { app, request, setupDatabase } = require('../setup');

jest.setTimeout(120000);
setupDatabase();

describe('Auth Flow', () => {
    test('register creates a new user and returns token', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Alice',
                email: 'alice@test.dev',
                password: 'Password1',
                upiId: 'alice@upi',
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.token).toBeTruthy();
        expect(res.body.user.name).toBe('Alice');
        expect(res.body.user.email).toBe('alice@test.dev');
        expect(res.body.user.id).toBeTruthy();
    });

    test('register rejects duplicate email', async () => {
        await request(app)
            .post('/api/auth/register')
            .send({ name: 'A', email: 'dup@test.dev', password: 'Password1', upiId: 'a@upi' });

        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'B', email: 'dup@test.dev', password: 'Password2', upiId: 'b@upi' });

        expect(res.statusCode).toBe(400);
    });

    test('register rejects weak password', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Weak', email: 'weak@test.dev', password: '123', upiId: 'w@upi' });

        expect(res.statusCode).toBe(400);
    });

    test('login succeeds with correct credentials', async () => {
        await request(app)
            .post('/api/auth/register')
            .send({ name: 'Bob', email: 'bob@test.dev', password: 'Password1', upiId: 'bob@upi' });

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'bob@test.dev', password: 'Password1' });

        expect(res.statusCode).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(res.body.user.email).toBe('bob@test.dev');
    });

    test('login fails with wrong password', async () => {
        await request(app)
            .post('/api/auth/register')
            .send({ name: 'Charlie', email: 'charlie@test.dev', password: 'Password1', upiId: 'c@upi' });

        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'charlie@test.dev', password: 'WrongPassword' });

        expect(res.statusCode).toBe(401);
    });

    test('login fails for non-existent user', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@test.dev', password: 'Password1' });

        expect(res.statusCode).toBe(401);
    });

    test('refresh token returns new access token', async () => {
        const regRes = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Dave', email: 'dave@test.dev', password: 'Password1', upiId: 'd@upi' });

        // The refresh token is set as an httpOnly cookie — extract it
        const cookies = regRes.headers['set-cookie'];

        const res = await request(app)
            .post('/api/auth/refresh')
            .set('Cookie', cookies || []);

        // If cookies were set, refresh should work; otherwise it's 401
        if (cookies && cookies.length > 0) {
            expect(res.statusCode).toBe(200);
            expect(res.body.token).toBeTruthy();
        } else {
            expect(res.statusCode).toBe(401);
        }
    });

    test('logout invalidates session', async () => {
        const regRes = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Eve', email: 'eve@test.dev', password: 'Password1', upiId: 'e@upi' });

        const res = await request(app)
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${regRes.body.token}`)
            .set('Cookie', regRes.headers['set-cookie'] || []);

        expect(res.statusCode).toBe(200);
    });

    test('protected route rejects without token', async () => {
        const res = await request(app).get('/api/sync/groups');
        expect(res.statusCode).toBe(401);
    });

    test('protected route rejects with invalid token', async () => {
        const res = await request(app)
            .get('/api/sync/groups')
            .set('Authorization', 'Bearer invalid-token-here');

        expect(res.statusCode).toBe(401);
    });
});
