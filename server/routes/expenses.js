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
    createRazorpayOrder,
    handleRazorpayWebhook,
    getPaymentStatus,
    verifyPayment,
} = require('../controllers/expenseController');

const router = express.Router();

// Razorpay webhook must bypass auth and uses the raw request body for signature verification.
router.post('/razorpay/webhook', (req, res) => handleRazorpayWebhook(req, res));

router.use(authenticate);

// --- Specific-path routes MUST come before parameterized :groupId/:id routes ---

// GET /api/expenses/detail/:id - Get a single expense with full details
router.get('/detail/:id', (req, res) => getExpenseDetail(req, res));

// DELETE /api/expenses/client/:clientId - Delete an expense by clientId (UUID)
router.delete('/client/:clientId', (req, res) => deleteExpense(req, res));

// POST /api/expenses - Add a new expense (with validation)
router.post('/', (req, res) => createExpense(req, res));

// POST /api/expenses/razorpay/order - Create a secure Razorpay checkout order
router.post('/razorpay/order', (req, res) => createRazorpayOrder(req, res));

// GET /api/expenses/razorpay/status/:clientId - Get payment status (auth required)
router.get('/razorpay/status/:clientId', (req, res) => getPaymentStatus(req, res));

// POST /api/expenses/razorpay/verify/:clientId - Trigger manual verification (auth required)
router.post('/razorpay/verify/:clientId', (req, res) => verifyPayment(req, res));

// --- Parameterized routes ---

// GET /api/expenses/:groupId/balances - Compute pairwise balances (before :groupId catch-all)
router.get('/:groupId/balances', (req, res) => getGroupBalances(req, res));

// GET /api/expenses/:groupId - Get expenses for a group (paginated + search/filter)
router.get('/:groupId', (req, res) => listExpenses(req, res));

// PUT /api/expenses/:id - Update expense metadata (description only, admin/creator only)
router.put('/:id', (req, res) => updateExpense(req, res));

// PATCH /api/expenses/:id/settle-status - Update settlement status (role-based)
router.patch('/:id/settle-status', (req, res) => updateSettlementStatus(req, res));

// DELETE /api/expenses/:id - Delete an expense by MongoDB _id
router.delete('/:id', (req, res) => deleteExpense(req, res));

module.exports = router;
