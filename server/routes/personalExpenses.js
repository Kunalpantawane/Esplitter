const express = require('express');
const authenticate = require('../middleware/auth');
const {
    syncPersonalExpenses,
    listPersonalExpenses,
    deletePersonalExpense,
} = require('../controllers/personalExpenseController');

const router = express.Router();
router.use(authenticate);

// POST /api/personal-expenses/sync — Idempotent sync (offline-first)
router.post('/sync', (req, res) => syncPersonalExpenses(req, res));

// GET /api/personal-expenses — List with filters
router.get('/', (req, res) => listPersonalExpenses(req, res));

// DELETE /api/personal-expenses/:clientId — Soft delete
router.delete('/:clientId', (req, res) => deletePersonalExpense(req, res));

module.exports = router;
