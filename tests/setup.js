/**
 * tests/setup.js — Shared test bootstrap
 * Uses mongodb-memory-server for zero-dependency test runs.
 * Falls back to a local/test MongoDB URI if available.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

let mongoServer;
let userSeed = 0;

const app = require('../server/app');

/** Register a test user and return { id, token, profile } */
async function registerUser(label) {
    userSeed += 1;
    const payload = {
        name: `${label}-${userSeed}`,
        email: `${label}${userSeed}@test.dev`,
        password: 'Password1',
        upiId: `${label}${userSeed}@upi`,
    };

    const res = await request(app)
        .post('/api/auth/register')
        .send(payload);

    expect(res.statusCode).toBe(201);
    return {
        id: String(res.body.user.id),
        token: res.body.token,
        profile: payload,
    };
}

/** Create a group as admin */
async function createGroup(adminToken, name = 'Test Group') {
    const res = await request(app)
        .post('/api/sync/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'create', name });

    expect(res.statusCode).toBe(201);
    return res.body.group;
}

/** Request join + admin approval */
async function requestAndApproveJoin({ adminToken, memberToken, groupId, inviteCode }) {
    const joinRes = await request(app)
        .post('/api/sync/groups')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ action: 'join', inviteCode });

    expect(joinRes.statusCode).toBe(200);
    expect(joinRes.body.pending).toBe(true);

    const pendingRes = await request(app)
        .get(`/api/groups/${groupId}/join-requests`)
        .set('Authorization', `Bearer ${adminToken}`);

    expect(pendingRes.statusCode).toBe(200);
    expect(pendingRes.body.requests.length).toBeGreaterThan(0);

    const approveRes = await request(app)
        .post(`/api/groups/${groupId}/join-requests/${pendingRes.body.requests[0].requestId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send();

    expect(approveRes.statusCode).toBe(200);
    return approveRes.body.group;
}

/** Add an expense to a group */
async function addExpense(token, { groupId, description, amount, paidBy, splits, splitType = 'CUSTOM', type = 'EXPENSE' }) {
    const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${token}`)
        .send({ groupId, description, amount, paidBy, splits, splitType, type });

    return res;
}

function setupDatabase() {
    beforeAll(async () => {
        const externalUri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/esplitter_test';
        try {
            await mongoose.connect(externalUri, { serverSelectionTimeoutMS: 3000 });
        } catch (_) {
            mongoServer = await MongoMemoryServer.create();
            await mongoose.connect(mongoServer.getUri());
        }
    });

    afterEach(async () => {
        const collections = mongoose.connection.collections;
        await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
        userSeed = 0;
    });

    afterAll(async () => {
        await mongoose.disconnect();
        if (mongoServer) await mongoServer.stop();
    });
}

module.exports = {
    app,
    request,
    registerUser,
    createGroup,
    requestAndApproveJoin,
    addExpense,
    setupDatabase,
};
