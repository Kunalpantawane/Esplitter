/**
 * tests/integration/groups.test.js — Group CRUD regression tests
 * Covers: create, join, list, update, archive, leave, transfer-admin, delete, invite rotation
 */

const { app, request, registerUser, createGroup, requestAndApproveJoin, addExpense, setupDatabase } = require('../setup');

jest.setTimeout(120000);
setupDatabase();

describe('Group CRUD', () => {
    test('create group returns group with invite code', async () => {
        const admin = await registerUser('admin');
        const group = await createGroup(admin.token, 'My Group');

        expect(group.name).toBe('My Group');
        expect(group.inviteCode).toBeTruthy();
        expect(group.settlementMode).toBe('smart');
        expect(group.inviteCode.length).toBe(6);
        expect(group.members).toContainEqual(expect.objectContaining({ _id: admin.id }));
    });

    test('admin can update shared settlement mode', async () => {
        const admin = await registerUser('admin');
        const group = await createGroup(admin.token, 'Mode Test');

        const res = await request(app)
            .patch(`/api/groups/${group._id}/settlement-mode`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ settlementMode: 'normal' });

        expect(res.statusCode).toBe(200);
        expect(res.body.group.settlementMode).toBe('normal');
    });

    test('non-admin cannot update shared settlement mode', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');
        const group = await createGroup(admin.token, 'Mode Guard');

        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });

        const res = await request(app)
            .patch(`/api/groups/${group._id}/settlement-mode`)
            .set('Authorization', `Bearer ${member.token}`)
            .send({ settlementMode: 'normal' });

        expect(res.statusCode).toBe(403);
    });

    test('sync groups includes settlementMode field', async () => {
        const admin = await registerUser('admin');
        const group = await createGroup(admin.token, 'Sync Mode');

        await request(app)
            .patch(`/api/groups/${group._id}/settlement-mode`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ settlementMode: 'normal' });

        const res = await request(app)
            .get('/api/sync/groups')
            .set('Authorization', `Bearer ${admin.token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.groups.length).toBe(1);
        expect(res.body.groups[0].settlementMode).toBe('normal');
    });

    test('join via invite code creates pending request', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');
        const group = await createGroup(admin.token, 'Join Test');

        const joinRes = await request(app)
            .post('/api/sync/groups')
            .set('Authorization', `Bearer ${member.token}`)
            .send({ action: 'join', inviteCode: group.inviteCode });

        expect(joinRes.statusCode).toBe(200);
        expect(joinRes.body.pending).toBe(true);
    });

    test('admin can approve join request', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');
        const group = await createGroup(admin.token, 'Approve Test');

        const updatedGroup = await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });

        const memberIds = updatedGroup.members.map((m) => String(m._id || m));
        expect(memberIds).toContain(member.id);
    });

    test('list groups returns user groups', async () => {
        const admin = await registerUser('admin');
        await createGroup(admin.token, 'Group A');
        await createGroup(admin.token, 'Group B');

        const res = await request(app)
            .get('/api/sync/groups')
            .set('Authorization', `Bearer ${admin.token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.groups.length).toBe(2);
    });

    test('update group name (admin only)', async () => {
        const admin = await registerUser('admin');
        const group = await createGroup(admin.token, 'Old Name');

        const res = await request(app)
            .patch(`/api/groups/${group._id}`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ name: 'New Name', description: 'Updated' });

        expect(res.statusCode).toBe(200);
        expect(res.body.group.name).toBe('New Name');
    });

    test('non-admin cannot update group', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');
        const group = await createGroup(admin.token, 'No Edit');

        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });

        const res = await request(app)
            .patch(`/api/groups/${group._id}`)
            .set('Authorization', `Bearer ${member.token}`)
            .send({ name: 'Hacked Name' });

        expect(res.statusCode).toBe(403);
    });

    test('rotate invite code (admin only)', async () => {
        const admin = await registerUser('admin');
        const group = await createGroup(admin.token, 'Rotate Test');
        const oldCode = group.inviteCode;

        const res = await request(app)
            .post(`/api/groups/${group._id}/invite-code/rotate`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.inviteCode).not.toBe(oldCode);
    });

    test('admin can remove member', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');
        const group = await createGroup(admin.token, 'Remove Test');

        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });

        const res = await request(app)
            .delete(`/api/groups/${group._id}/members/${member.id}`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(res.statusCode).toBe(200);
        const memberIds = res.body.group.members.map((m) => String(m._id || m));
        expect(memberIds).not.toContain(member.id);
    });

    test('archive group (admin only)', async () => {
        const admin = await registerUser('admin');
        const group = await createGroup(admin.token, 'Archive Test');

        const res = await request(app)
            .patch(`/api/groups/${group._id}/archive`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.group.isArchived).toBe(true);
    });

    test('admin transfer then old admin can leave', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');
        const group = await createGroup(admin.token, 'Transfer Group');

        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });

        // Admin can't leave without transferring
        const leaveAsAdmin = await request(app)
            .post(`/api/groups/${group._id}/leave`)
            .set('Authorization', `Bearer ${admin.token}`);
        expect(leaveAsAdmin.statusCode).toBe(400);

        // Transfer admin
        const transferRes = await request(app)
            .post(`/api/groups/${group._id}/transfer-admin`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ newAdminUserId: member.id });
        expect(transferRes.statusCode).toBe(200);

        // Now old admin can leave
        const leaveRes = await request(app)
            .post(`/api/groups/${group._id}/leave`)
            .set('Authorization', `Bearer ${admin.token}`);
        expect(leaveRes.statusCode).toBe(200);
    });

    test('delete settled group succeeds', async () => {
        const admin = await registerUser('admin');
        const group = await createGroup(admin.token, 'Delete Me');

        const res = await request(app)
            .delete(`/api/groups/${group._id}`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(res.statusCode).toBe(200);
    });

    test('delete unsettled group is blocked', async () => {
        const admin = await registerUser('admin');
        const member = await registerUser('member');
        const group = await createGroup(admin.token, 'Unsettled');

        await requestAndApproveJoin({
            adminToken: admin.token,
            memberToken: member.token,
            groupId: String(group._id),
            inviteCode: group.inviteCode,
        });

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
            .delete(`/api/groups/${group._id}`)
            .set('Authorization', `Bearer ${admin.token}`);

        expect(res.statusCode).toBe(400);
    });
});
