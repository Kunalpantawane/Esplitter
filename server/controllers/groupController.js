const Group = require('../models/Group');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { computeGroupBalances } = require('../services/balanceService');
const runAtomic = require('../lib/runAtomic');
const { isGroupMember, getMemberRole, isGroupAdmin } = require('../lib/groupAccess');

function generateInviteCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// GET /api/groups/:id - Group detail
async function getGroupDetail(req, res) {
    try {
        const group = await Group.findById(req.params.id)
            .populate('members', 'name email upiId')
            .lean();
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!group.members.some(m => String(m._id) === String(req.userId))) {
            return res.status(403).json({ error: 'Not a member of this group.' });
        }
        res.json({ group: { ...group, id: String(group._id) } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch group.' });
    }
}

// GET /api/groups/:id/join-requests - Pending join requests (admin only)
async function getJoinRequests(req, res) {
    try {
        const group = await Group.findById(req.params.id).lean();
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!isGroupAdmin(group, req.userId)) {
            return res.status(403).json({ error: 'Only admin can view join requests.' });
        }

        const pending = (group.joinRequests || []).filter((request) => request.status === 'pending');
        const requesterIds = pending.map((request) => request.userId);
        const users = await User.find({ _id: { $in: requesterIds } })
            .select('name email upiId')
            .lean();

        const userById = new Map(users.map((user) => [String(user._id), user]));
        const requests = pending.map((request) => {
            const user = userById.get(String(request.userId));
            return {
                requestId: String(request._id),
                userId: String(request.userId),
                name: user ? user.name : 'Member',
                email: user ? user.email : '',
                upiId: user ? user.upiId : '',
                requestedAt: request.requestedAt,
            };
        });

        res.json({ requests });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch join requests.' });
    }
}

// POST /api/groups/:id/join-requests/:requestId/approve - Approve join request (admin only)
async function approveJoinRequest(req, res) {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!isGroupAdmin(group, req.userId)) {
            return res.status(403).json({ error: 'Only admin can approve join requests.' });
        }

        const request = (group.joinRequests || []).find((item) => String(item._id) === String(req.params.requestId));
        if (!request) return res.status(404).json({ error: 'Join request not found.' });
        if (request.status !== 'pending') {
            return res.status(400).json({ error: 'Join request is already reviewed.' });
        }

        const userId = String(request.userId);
        if (!group.members.map(String).includes(userId)) {
            group.members.push(request.userId);
        }
        if (!group.memberRoles) group.memberRoles = new Map();
        if (!group.memberRoles.get(userId)) group.memberRoles.set(userId, 'member');

        request.status = 'approved';
        request.reviewedAt = new Date();
        request.reviewedBy = req.userId;
        group.lastActivityAt = new Date();
        
        // Wrap member addition in atomic transaction
        await runAtomic(async (session) => {
            const options = session ? { session } : {};
            await Group.findByIdAndUpdate(group._id, {
                members: group.members,
                memberRoles: group.memberRoles,
                joinRequests: group.joinRequests,
                lastActivityAt: group.lastActivityAt,
            }, options);
        });

        const updated = await Group.findById(group._id)
            .populate('members', 'name email upiId')
            .lean();
        res.json({ group: { ...updated, id: String(updated._id) } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to approve join request.' });
    }
}

// POST /api/groups/:id/join-requests/:requestId/reject - Reject join request (admin only)
async function rejectJoinRequest(req, res) {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!isGroupAdmin(group, req.userId)) {
            return res.status(403).json({ error: 'Only admin can reject join requests.' });
        }

        const request = (group.joinRequests || []).find((item) => String(item._id) === String(req.params.requestId));
        if (!request) return res.status(404).json({ error: 'Join request not found.' });
        if (request.status !== 'pending') {
            return res.status(400).json({ error: 'Join request is already reviewed.' });
        }

        request.status = 'rejected';
        request.reviewedAt = new Date();
        request.reviewedBy = req.userId;
        group.lastActivityAt = new Date();
        await group.save();

        res.json({ message: 'Join request rejected.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reject join request.' });
    }
}

// POST /api/groups/:id/invite-code/rotate - Regenerate invite code (admin only)
async function rotateInviteCode(req, res) {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!isGroupAdmin(group, req.userId)) {
            return res.status(403).json({ error: 'Only admin can regenerate invite code.' });
        }

        let nextCode = generateInviteCode();
        let codeTaken = await Group.findOne({ inviteCode: nextCode });
        while (codeTaken) {
            nextCode = generateInviteCode();
            codeTaken = await Group.findOne({ inviteCode: nextCode });
        }

        group.inviteCode = nextCode;
        group.lastActivityAt = new Date();
        await group.save();

        res.json({ inviteCode: nextCode });
    } catch (err) {
        res.status(500).json({ error: 'Failed to regenerate invite code.' });
    }
}

// PATCH /api/groups/:id - Update group (admin only)
async function updateGroup(req, res) {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!isGroupAdmin(group, req.userId)) {
            return res.status(403).json({ error: 'Only the admin can update this group.' });
        }

        const { name, description } = req.body;
        if (name && name.trim()) group.name = name.trim();
        // Fix 8: Coerce to string before trim to avoid 500 on non-string inputs
        if (description !== undefined) group.description = String(description || '').trim();
        group.lastActivityAt = new Date();
        await group.save();

        const updated = await Group.findById(group._id)
            .populate('members', 'name email upiId')
            .lean();
        res.json({ group: { ...updated, id: String(updated._id) } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update group.' });
    }
}

// PATCH /api/groups/:id/settlement-mode - Update group settlement mode (admin only)
async function updateSettlementMode(req, res) {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!isGroupAdmin(group, req.userId)) {
            return res.status(403).json({ error: 'Only the admin can update settlement mode.' });
        }

        const settlementMode = req.body && req.body.settlementMode;
        if (settlementMode !== 'smart' && settlementMode !== 'normal') {
            return res.status(400).json({ error: 'settlementMode must be either "smart" or "normal".' });
        }

        group.settlementMode = settlementMode;
        group.lastActivityAt = new Date();
        await group.save();

        const updated = await Group.findById(group._id)
            .populate('members', 'name email upiId')
            .lean();
        res.json({ group: { ...updated, id: String(updated._id) } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update settlement mode.' });
    }
}

// POST /api/groups/:id/transfer-admin - Transfer admin role (atomic)
async function transferAdmin(req, res) {
    try {
        const { newAdminUserId } = req.body;
        if (!newAdminUserId) {
            return res.status(400).json({ error: 'newAdminUserId is required.' });
        }

        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!isGroupAdmin(group, req.userId)) {
            return res.status(403).json({ error: 'Only the current admin can transfer admin role.' });
        }

        const currentAdminId = String(group.adminId);
        const targetAdminId = String(newAdminUserId);

        if (currentAdminId === targetAdminId) {
            return res.status(400).json({ error: 'Target user is already admin.' });
        }

        if (!isGroupMember(group, targetAdminId)) {
            return res.status(400).json({ error: 'Target user must be an existing group member.' });
        }

        if (!group.memberRoles) group.memberRoles = new Map();
        group.memberRoles.set(currentAdminId, 'member');
        group.memberRoles.set(targetAdminId, 'admin');
        group.adminId = targetAdminId;
        group.lastActivityAt = new Date();
        
        // Wrap admin and role change in atomic transaction
        await runAtomic(async (session) => {
            const options = session ? { session } : {};
            await Group.findByIdAndUpdate(group._id, {
                adminId: group.adminId,
                memberRoles: group.memberRoles,
                lastActivityAt: group.lastActivityAt,
            }, options);
        });

        const updated = await Group.findById(group._id)
            .populate('members', 'name email upiId')
            .lean();

        res.json({ group: { ...updated, id: String(updated._id) } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to transfer admin role.' });
    }
}

// DELETE /api/groups/:id - Delete group & cascade (admin only, atomic)
async function deleteGroup(req, res) {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!isGroupAdmin(group, req.userId)) {
            return res.status(403).json({ error: 'Only the admin can delete this group.' });
        }

        const derived = await computeGroupBalances(group._id);
        if (!derived || !derived.isSettled) {
            return res.status(400).json({
                error: 'Group can be deleted only after all balances are settled to zero.',
            });
        }

        await runAtomic(async (session) => {
            const options = session ? { session } : {};
            await Transaction.deleteMany({ groupId: group._id }, options);
            await Group.deleteOne({ _id: group._id }, options);
        });

        res.json({ message: 'Group deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete group.' });
    }
}

// PATCH /api/groups/:id/archive - Archive (hide) group (admin only)
async function archiveGroup(req, res) {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!isGroupAdmin(group, req.userId)) {
            return res.status(403).json({ error: 'Only the admin can archive this group.' });
        }

        group.isArchived = true;
        group.lastActivityAt = new Date();
        await group.save();

        res.json({ message: 'Group archived.', group });
    } catch (err) {
        res.status(500).json({ error: 'Failed to archive group.' });
    }
}

// DELETE /api/groups/:id/members/:userId - Remove member from group (admin only, atomic)
async function removeMember(req, res) {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });
        if (!isGroupAdmin(group, req.userId)) {
            return res.status(403).json({ error: 'Only the admin can remove members.' });
        }
        if (String(req.params.userId) === String(group.adminId)) {
            return res.status(400).json({ error: 'Admin cannot remove themselves. Archive the group instead.' });
        }

        const derived = await computeGroupBalances(group._id);
        const memberBalance = derived && derived.balances ? derived.balances[String(req.params.userId)] : null;
        if (memberBalance && Math.abs(memberBalance.balance) >= 0.01) {
            return res.status(400).json({ error: 'Member has unsettled balance. Settle balances first.' });
        }

        group.members = group.members.filter(m => String(m) !== String(req.params.userId));
        if (group.memberRoles && typeof group.memberRoles.delete === 'function') {
            group.memberRoles.delete(String(req.params.userId));
        }
        group.lastActivityAt = new Date();
        
        // Wrap member removal in atomic transaction
        await runAtomic(async (session) => {
            const options = session ? { session } : {};
            await Group.findByIdAndUpdate(group._id, {
                members: group.members,
                memberRoles: group.memberRoles,
                lastActivityAt: group.lastActivityAt,
            }, options);
        });

        const updated = await Group.findById(group._id)
            .populate('members', 'name email upiId')
            .lean();
        res.json({ group: { ...updated, id: String(updated._id) } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove member.' });
    }
}

// POST /api/groups/:id/leave - Leave group (atomic)
async function leaveGroup(req, res) {
    try {
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found.' });

        if (isGroupAdmin(group, req.userId)) {
            return res.status(400).json({ error: 'Admin cannot leave. Archive the group or transfer admin first.' });
        }

        if (!isGroupMember(group, req.userId)) {
            return res.status(400).json({ error: 'You are not a member of this group.' });
        }

        const derived = await computeGroupBalances(group._id);
        const myBalance = derived && derived.balances ? derived.balances[String(req.userId)] : null;
        if (myBalance && Math.abs(myBalance.balance) >= 0.01) {
            return res.status(400).json({ error: 'You have unsettled balances. Please settle up before leaving.' });
        }

        group.members = group.members.filter(m => String(m) !== String(req.userId));
        if (group.memberRoles && typeof group.memberRoles.delete === 'function') {
            group.memberRoles.delete(String(req.userId));
        }
        group.lastActivityAt = new Date();
        
        // Wrap member removal in atomic transaction
        await runAtomic(async (session) => {
            const options = session ? { session } : {};
            await Group.findByIdAndUpdate(group._id, {
                members: group.members,
                memberRoles: group.memberRoles,
                lastActivityAt: group.lastActivityAt,
            }, options);
        });

        res.json({ message: 'You have left the group.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to leave group.' });
    }
}

module.exports = {
    getGroupDetail,
    getJoinRequests,
    approveJoinRequest,
    rejectJoinRequest,
    rotateInviteCode,
    updateGroup,
    updateSettlementMode,
    transferAdmin,
    deleteGroup,
    archiveGroup,
    removeMember,
    leaveGroup,
};
