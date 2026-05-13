const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        name: { type: String, required: true, trim: true },
        color: { type: String, required: true, default: '#6366f1' },
        icon: { type: String, default: '📁' },
        isDefault: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// Ensure unique category names per user (null userId = system defaults)
categorySchema.index({ userId: 1, name: 1 }, { unique: true });

// System-wide default categories
categorySchema.statics.DEFAULT_CATEGORIES = [
    { name: 'Food', color: '#f97316', icon: '🍔', isDefault: true },
    { name: 'Travel', color: '#3b82f6', icon: '🚗', isDefault: true },
    { name: 'Shopping', color: '#ec4899', icon: '🛍️', isDefault: true },
    { name: 'Bills', color: '#eab308', icon: '📄', isDefault: true },
    { name: 'Entertainment', color: '#8b5cf6', icon: '🎬', isDefault: true },
    { name: 'Health', color: '#22c55e', icon: '💊', isDefault: true },
    { name: 'Others', color: '#6b7280', icon: '📦', isDefault: true },
];

// Seed defaults if they don't exist
categorySchema.statics.seedDefaults = async function () {
    const existing = await this.countDocuments({ isDefault: true, userId: null });
    if (existing === 0) {
        await this.insertMany(
            this.DEFAULT_CATEGORIES.map((c) => ({ ...c, userId: null }))
        );
    }
};

module.exports = mongoose.model('Category', categorySchema);
