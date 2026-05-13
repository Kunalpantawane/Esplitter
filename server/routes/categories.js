const express = require('express');
const authenticate = require('../middleware/auth');
const {
    listCategories,
    createCategory,
    deleteCategory,
} = require('../controllers/categoryController');

const router = express.Router();
router.use(authenticate);

// GET /api/categories — List defaults + custom
router.get('/', (req, res) => listCategories(req, res));

// POST /api/categories — Create custom category
router.post('/', (req, res) => createCategory(req, res));

// DELETE /api/categories/:id — Delete custom category
router.delete('/:id', (req, res) => deleteCategory(req, res));

module.exports = router;
