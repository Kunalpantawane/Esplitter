const express = require('express');
const authenticate = require('../middleware/auth');
const {
    listExpenses,
    getExpenseDetail,
    createExpense,
    updateExpense,
    updateSettlementStatus,
    deleteExpense,
    getGroupBalances,
} = require('../controllers/expenseController');

const router = express.Router();
router.use(authenticate);

// GET /api/expenses/:groupId - Get expenses for a group (paginated + search/filter)
router.get('/:groupId', (req, res) => listExpenses(req, res));

// GET /api/expenses/detail/:id - Get a single expense with full details
router.get('/detail/:id', (req, res) => getExpenseDetail(req, res));

// POST /api/expenses - Add a new expense (with validation)
router.post('/', (req, res) => createExpense(req, res));

// PUT /api/expenses/:id - Update expense metadata (description only, admin/creator only)
router.put('/:id', (req, res) => updateExpense(req, res));

// PATCH /api/expenses/:id/settle-status - Update settlement status (role-based)
router.patch('/:id/settle-status', (req, res) => updateSettlementStatus(req, res));

// DELETE /api/expenses/:id - Delete an expense by MongoDB _id
router.delete('/:id', (req, res) => deleteExpense(req, res));

// DELETE /api/expenses/client/:clientId - Delete an expense by clientId (UUID)
router.delete('/client/:clientId', (req, res) => deleteExpense(req, res));

// GET /api/expenses/:groupId/balances - Compute pairwise balances
router.get('/:groupId/balances', (req, res) => getGroupBalances(req, res));

module.exports = router;
