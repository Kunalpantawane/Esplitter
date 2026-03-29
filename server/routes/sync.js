const express = require('express');
const authenticate = require('../middleware/auth');
const {
    syncTransactions,
    syncGroupAction,
    getUserGroups,
} = require('../controllers/syncController');

const router = express.Router();
router.use(authenticate);

// POST /api/sync - Push pending transactions & pull new updates (paginated)
router.post('/', (req, res) => syncTransactions(req, res));

// POST /api/sync/groups - Create or join a group
router.post('/groups', (req, res) => syncGroupAction(req, res));

// GET /api/sync/groups - Get user's groups (minimal)
router.get('/groups', (req, res) => getUserGroups(req, res));

module.exports = router;
