const mongoose = require('mongoose');

const splitSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Fix 10: Reject negative split amounts at the schema level
    amount: { type: Number, required: true, min: [0, 'Split amount cannot be negative'] },
});

const transactionSchema = new mongoose.Schema(
    {
        clientId: { type: String, required: true, unique: true }, // UUID from client (for deduplication)
        groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
        description: { type: String, required: true, trim: true },
        // Fix 10: Reject zero or negative amounts at the schema level
        amount: { type: Number, required: true, min: [0.01, 'Amount must be greater than zero'] },
        paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For PAYMENT type
        splits: [splitSchema],
        splitType: { type: String, enum: ['EQUAL', 'CUSTOM', 'PERCENTAGE'], default: 'EQUAL' },
        type: { type: String, enum: ['EXPENSE', 'PAYMENT'], default: 'EXPENSE' },
        status: { type: String, enum: ['PENDING', 'PAID', 'CONFIRMED'], default: 'PAID' }, // default PAID for backward compatibility and expenses
        deleted: { type: Boolean, default: false },
        syncedAt: { type: Date, default: Date.now },
        paymentRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentRecord', sparse: true },
        paymentVerifiedAt: { type: Date, sparse: true },
    },
    { timestamps: true }
);

// Performance indexes
transactionSchema.index({ groupId: 1, createdAt: -1 });
transactionSchema.index({ groupId: 1, type: 1 });
transactionSchema.index({ groupId: 1, deleted: 1, createdAt: -1 });
transactionSchema.index({ groupId: 1, syncedAt: 1 });
transactionSchema.index({ groupId: 1, deleted: 1, type: 1, status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
