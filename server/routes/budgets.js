const express = require('express');
const authenticate = require('../middleware/auth');
const {
    listBudgets,
    setBudget,
    deleteBudget,
} = require('../controllers/budgetController');

const router = express.Router();
router.use(authenticate);

// GET /api/budgets — List budgets for a month
router.get('/', (req, res) => listBudgets(req, res));

// POST /api/budgets — Set/update budget
router.post('/', (req, res) => setBudget(req, res));

// DELETE /api/budgets/:id — Remove a budget
router.delete('/:id', (req, res) => deleteBudget(req, res));

module.exports = router;
