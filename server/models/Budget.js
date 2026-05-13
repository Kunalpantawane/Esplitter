const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        category: { type: String, trim: true, default: null }, // null = overall budget
        amount: { type: Number, required: true, min: [1, 'Budget must be at least ₹1'] },
        month: { type: String, required: true }, // Format: 'YYYY-MM'
    },
    { timestamps: true }
);

// One budget per user per category per month
budgetSchema.index({ userId: 1, category: 1, month: 1 }, { unique: true });
budgetSchema.index({ userId: 1, month: 1 });

module.exports = mongoose.model('Budget', budgetSchema);
