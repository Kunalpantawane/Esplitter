const express = require('express');
const authenticate = require('../middleware/auth');
const {
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
} = require('../controllers/groupController');

const router = express.Router();
router.use(authenticate);

// GET /api/groups/:id — Group detail
router.get('/:id', (req, res) => getGroupDetail(req, res));

// GET /api/groups/:id/join-requests — Pending join requests (admin only)
router.get('/:id/join-requests', (req, res) => getJoinRequests(req, res));

// POST /api/groups/:id/join-requests/:requestId/approve — Approve join request (admin only)
router.post('/:id/join-requests/:requestId/approve', (req, res) => approveJoinRequest(req, res));

// POST /api/groups/:id/join-requests/:requestId/reject — Reject join request (admin only)
router.post('/:id/join-requests/:requestId/reject', (req, res) => rejectJoinRequest(req, res));

// POST /api/groups/:id/invite-code/rotate — Regenerate invite code (admin only)
router.post('/:id/invite-code/rotate', (req, res) => rotateInviteCode(req, res));

// PATCH /api/groups/:id — Update group (admin only)
router.patch('/:id', (req, res) => updateGroup(req, res));

// PATCH /api/groups/:id/settlement-mode — Update shared settlement mode (admin only)
router.patch('/:id/settlement-mode', (req, res) => updateSettlementMode(req, res));

// POST /api/groups/:id/transfer-admin — Transfer admin role to another member
router.post('/:id/transfer-admin', (req, res) => transferAdmin(req, res));

// DELETE /api/groups/:id — Delete group & cascade (admin only)
router.delete('/:id', (req, res) => deleteGroup(req, res));

// PATCH /api/groups/:id/archive — Archive group (admin only)
router.patch('/:id/archive', (req, res) => archiveGroup(req, res));

// DELETE /api/groups/:id/members/:userId — Remove member (admin only)
router.delete('/:id/members/:userId', (req, res) => removeMember(req, res));

// POST /api/groups/:id/leave — Leave group (any member, not admin)
router.post('/:id/leave', (req, res) => leaveGroup(req, res));

module.exports = router;
