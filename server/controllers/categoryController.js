const Category = require('../models/Category');

// GET /api/categories — List defaults + user's custom categories
async function listCategories(req, res) {
    try {
        const userId = req.userId;
        const categories = await Category.find({
            $or: [{ isDefault: true, userId: null }, { userId }],
        })
            .sort({ isDefault: -1, name: 1 })
            .lean();

        res.json({ categories });
    } catch (err) {
        console.error('[Category List Error]', err.message);
        res.status(500).json({ error: 'Failed to fetch categories.' });
    }
}

// POST /api/categories — Create custom category
async function createCategory(req, res) {
    try {
        const userId = req.userId;
        const { name, color, icon } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Category name is required.' });
        }

        // Check for duplicate (escape regex metacharacters to prevent injection)
        const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existing = await Category.findOne({
            userId,
            name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
        });
        if (existing) {
            return res.status(409).json({ error: 'Category already exists.' });
        }

        const category = await Category.create({
            userId,
            name: name.trim(),
            color: color || '#6366f1',
            icon: icon || '📁',
            isDefault: false,
        });

        res.status(201).json({ category });
    } catch (err) {
        console.error('[Category Create Error]', err.message);
        res.status(500).json({ error: 'Failed to create category.' });
    }
}

// DELETE /api/categories/:id — Delete custom category (cannot delete defaults)
async function deleteCategory(req, res) {
    try {
        const userId = req.userId;
        const { id } = req.params;

        const category = await Category.findById(id);
        if (!category) return res.status(404).json({ error: 'Category not found.' });
        if (category.isDefault) return res.status(403).json({ error: 'Cannot delete default categories.' });
        if (String(category.userId) !== userId) return res.status(403).json({ error: 'Not your category.' });

        await Category.findByIdAndDelete(id);
        res.json({ success: true });
    } catch (err) {
        console.error('[Category Delete Error]', err.message);
        res.status(500).json({ error: 'Failed to delete category.' });
    }
}

module.exports = { listCategories, createCategory, deleteCategory };
