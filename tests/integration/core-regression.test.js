const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.setTimeout(120000);

const app = require('../../server/app');

let mongoServer;
let userSeed = 0;

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

async function createGroup(adminToken, name = 'Test Group') {
    const res = await request(app)
        .post('/api/sync/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'create', name });

    expect(res.statusCode).toBe(201);
    return res.body.group;
}

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

beforeAll(async () => {
    const externalUri = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/esplitter_test';

    try {
        await mongoose.connect(externalUri, {
            serverSelectionTimeoutMS: 3000,
        });
    } catch (_) {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);
    }
});

afterEach(async () => {
    const collections = mongoose.connection.collections;
    await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
});

describe('Core Regression Suite', () => {
    test('balances are derived correctly after adding an expense', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');

        const group = await createGroup(admin.token, 'Balances Group');
        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });

        const addExpenseRes = await request(app)
            .post('/api/expenses')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                groupId: String(group._id),
                description: 'Dinner',
                amount: 100,
                paidBy: admin.id,
                splits: [
                    { userId: admin.id, amount: 50 },
                    { userId: member.id, amount: 50 },
                ],
                splitType: 'CUSTOM',
                type: 'EXPENSE',
            });

        expect(addExpenseRes.statusCode).toBe(201);

        const balancesRes = await request(app)
            .get(`/api/expenses/${group._id}/balances`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(balancesRes.statusCode).toBe(200);
        expect(balancesRes.body.balances[admin.id].amount).toBe(50);
        expect(balancesRes.body.balances[member.id].amount).toBe(-50);
    });

    test('deleting expense keeps balances consistent and no orphan financial impact remains', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');

        const group = await createGroup(admin.token, 'Delete Expense Group');
        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });

        const txRes = await request(app)
            .post('/api/expenses')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                groupId: String(group._id),
                description: 'Cab',
                amount: 60,
                paidBy: admin.id,
                splits: [
                    { userId: admin.id, amount: 30 },
                    { userId: member.id, amount: 30 },
                ],
                splitType: 'CUSTOM',
                type: 'EXPENSE',
            });

        expect(txRes.statusCode).toBe(201);
        const txId = txRes.body.transaction._id;

        const delRes = await request(app)
            .delete(`/api/expenses/${txId}`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(delRes.statusCode).toBe(200);

        const balancesRes = await request(app)
            .get(`/api/expenses/${group._id}/balances`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(balancesRes.statusCode).toBe(200);
        expect(balancesRes.body.balances[admin.id].amount).toBe(0);
        expect(balancesRes.body.balances[member.id].amount).toBe(0);
    });

    test('unauthorized member actions return 403 for admin-only operations', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');

        const group = await createGroup(admin.token, 'Authz Group');
        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });

        const rotateRes = await request(app)
            .post(`/api/groups/${group._id}/invite-code/rotate`)
            .set('Authorization', `Bearer ${member.token}`)
            .send();

        expect(rotateRes.statusCode).toBe(403);
    });

    test('member cannot leave group when unsettled balance exists', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');

        const group = await createGroup(admin.token, 'Leave Guard Group');
        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });

        await request(app)
            .post('/api/expenses')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                groupId: String(group._id),
                description: 'Lunch',
                amount: 100,
                paidBy: admin.id,
                splits: [
                    { userId: admin.id, amount: 50 },
                    { userId: member.id, amount: 50 },
                ],
                splitType: 'CUSTOM',
                type: 'EXPENSE',
            });

        const leaveRes = await request(app)
            .post(`/api/groups/${group._id}/leave`)
            .set('Authorization', `Bearer ${member.token}`)
            .send();

        expect(leaveRes.statusCode).toBe(400);
    });

    test('admin can transfer role then old admin can leave', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');

        const group = await createGroup(admin.token, 'Transfer Admin Group');
        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });

        const leaveAsAdmin = await request(app)
            .post(`/api/groups/${group._id}/leave`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send();

        expect(leaveAsAdmin.statusCode).toBe(400);

        const transferRes = await request(app)
            .post(`/api/groups/${group._id}/transfer-admin`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ newAdminUserId: member.id });

        expect(transferRes.statusCode).toBe(200);

        const leaveOldAdminRes = await request(app)
            .post(`/api/groups/${group._id}/leave`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send();

        expect(leaveOldAdminRes.statusCode).toBe(200);
    });

    test('group delete is blocked when unsettled and allowed when settled', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');

        const unsettledGroup = await createGroup(admin.token, 'Unsettled Delete Group');
        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(unsettledGroup._id),
            inviteCode: unsettledGroup.inviteCode,
        });

        await request(app)
            .post('/api/expenses')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                groupId: String(unsettledGroup._id),
                description: 'Trip',
                amount: 200,
                paidBy: admin.id,
                splits: [
                    { userId: admin.id, amount: 100 },
                    { userId: member.id, amount: 100 },
                ],
                splitType: 'CUSTOM',
                type: 'EXPENSE',
            });

        const blockedDelete = await request(app)
            .delete(`/api/groups/${unsettledGroup._id}`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send();

        expect(blockedDelete.statusCode).toBe(400);

        const settledGroup = await createGroup(admin.token, 'Settled Delete Group');
        const deleteOk = await request(app)
            .delete(`/api/groups/${settledGroup._id}`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send();

        expect(deleteOk.statusCode).toBe(200);
    });
});
