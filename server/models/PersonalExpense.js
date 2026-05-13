const mongoose = require('mongoose');

const personalExpenseSchema = new mongoose.Schema(
    {
        clientId: { type: String, required: true, unique: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        amount: { type: Number, required: true, min: [0.01, 'Amount must be greater than zero'] },
        category: { type: String, required: true, trim: true, default: 'Others' },
        description: { type: String, trim: true, default: '' },
        date: { type: Date, required: true, default: Date.now },
        paymentMethod: {
            type: String,
            enum: ['cash', 'upi', 'card', 'other'],
            default: 'cash',
        },
        notes: { type: String, trim: true, default: '' },
        isRecurring: { type: Boolean, default: false },
        recurringFrequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', null],
            default: null,
        },
        deleted: { type: Boolean, default: false },
        syncedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Performance indexes
personalExpenseSchema.index({ userId: 1, date: -1 });
personalExpenseSchema.index({ userId: 1, category: 1, date: -1 });
personalExpenseSchema.index({ userId: 1, syncedAt: 1 });
personalExpenseSchema.index({ userId: 1, deleted: 1, date: -1 });

module.exports = mongoose.model('PersonalExpense', personalExpenseSchema);
